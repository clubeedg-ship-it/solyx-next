import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AuthChecker } from "../auth/types.js";
import type { GatewayAdapter } from "../gateway/gatewayAdapter.js";
import type { SessionSummary } from "../gateway/types.js";
import type { ClientFrame, ServerFrame, SessionWire } from "./protocol.js";

/**
 * Bounds on the turn state this bridge keeps for a client that is not
 * currently connected. This is the only long-lived state the process holds,
 * and it runs on a small box, so every dimension is capped.
 */
export interface TurnRetentionOptions {
  /** How many sessions may retain a *finished* turn. Running turns are never evicted. */
  maxSessions?: number;
  /** How long a finished turn stays replayable. */
  ttlMs?: number;
  /** Cap on the retained (not the live) assistant text of one turn. */
  maxTextChars?: number;
  /** Cap on the retained tool events of one turn; the newest ones win. */
  maxToolEvents?: number;
}

export interface WsBridgeOptions {
  gateway: GatewayAdapter;
  auth: AuthChecker;
  /** How often the server pings each connected client. Defaults to 30s. */
  heartbeatIntervalMs?: number;
  /**
   * How many consecutive pings may go unanswered before the socket is
   * terminated. Kept at >= 2: a backgrounded browser tab can be throttled
   * hard enough to miss a single ping while still being perfectly healthy,
   * and terminating it would re-create exactly the dropped-connection
   * problem the heartbeat exists to detect.
   */
  missedPongLimit?: number;
  turnRetention?: TurnRetentionOptions;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_MISSED_PONG_LIMIT = 2;

const DEFAULT_TURN_RETENTION: Required<TurnRetentionOptions> = {
  maxSessions: 32,
  ttlMs: 10 * 60_000,
  maxTextChars: 64_000,
  maxToolEvents: 50,
};

/** Appended to retained text that hit maxTextChars, so a replayed reply is
 *  visibly incomplete rather than silently ending mid-sentence. */
const RETENTION_TRUNCATION_MARKER = "… [truncated]";

/**
 * The browser-facing bridge: one WebSocket connection per browser tab,
 * translating the small protocol in ./protocol.ts into GatewayAdapter calls.
 * This is the only place browser input reaches the Gateway adapter — the
 * browser itself never sees a Gateway credential (see README "Architecture").
 *
 * Turn state is keyed by session, not by connection: a tab that reloads or a
 * phone that drops off Wi-Fi gets a new socket, and it must still be able to
 * see — and abort — the turn it started on the old one.
 */
export function attachWsBridge(server: import("node:http").Server, options: WsBridgeOptions): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const missedPongLimit = Math.max(2, options.missedPongLimit ?? DEFAULT_MISSED_PONG_LIMIT);
  // One store per bridge, shared by every connection it serves.
  const turns = new TurnStore(options.turnRetention);
  // Keyed by socket rather than stamped onto it, so no state survives a
  // terminated connection. WebSocket ping/pong is a protocol-level control
  // frame that browsers answer automatically, so keepalive needs no new
  // client frame type and no change in packages/web.
  const missedPongs = new WeakMap<WebSocket, number>();

  // Why keepalive at all: this socket reaches the browser through a reverse
  // proxy, which reaps a connection that has been idle for its own timeout —
  // an agent turn can easily out-wait that with nothing to send. And a
  // half-open socket (peer gone without a FIN) otherwise sits in wss.clients
  // forever holding a session binding, so late frames would be written into
  // a socket that can never deliver them instead of being retained.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const missed = missedPongs.get(ws) ?? 0;
      if (missed >= missedPongLimit) {
        // Dead at the protocol level. terminate() must never cancel the
        // turn: the turn survives upstream, its socket binding is released
        // by the close handler, and its frames are retained for replay.
        ws.terminate();
        continue;
      }
      missedPongs.set(ws, missed + 1);
      try {
        ws.ping();
      } catch {
        // ping() throws on a socket that died between the clients snapshot
        // and here; there is nothing left to keep alive.
        ws.terminate();
      }
    }
  }, heartbeatIntervalMs);
  // Exactly one timer per bridge, and it must not hold the process (or a
  // vitest run) open by itself.
  heartbeat.unref?.();
  wss.on("close", () => {
    clearInterval(heartbeat);
    turns.clear();
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }

    void options.auth
      .isAuthenticated(request)
      .then((auth) => {
        if (!auth.authenticated) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      })
      // AuthChecker.isAuthenticated already fails closed internally, but an
      // upgrade request must never be left hanging or crash the process on
      // any other unexpected error either.
      .catch((error: unknown) => {
        console.error("WS upgrade auth check failed, denying:", error);
        socket.destroy();
      });
  });

  // Heartbeat state is attached only here, after the upgrade handler above
  // has already authenticated the request: an unauthenticated socket is
  // destroyed before it can ever appear in wss.clients.
  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    missedPongs.set(ws, 0);
    ws.on("pong", () => missedPongs.set(ws, 0));
    handleConnection(ws, options.gateway, request, turns);
  });

  return wss;
}

/** What we keep for one session's most recent turn. */
interface TurnRecord {
  sessionKey: string;
  /** Best-effort upstream cancellation; a no-op until sendMessage() returns. */
  cancel: () => void;
  /** The socket currently receiving this turn's frames, or undefined while
   *  the client is between connections. */
  socket: WebSocket | undefined;
  /** Latest *cumulative* assistant text (see AssistantDelta), capped. */
  text: string | undefined;
  toolEvents: ServerFrame[];
  /** assistant.done / assistant.error once the turn ended, else undefined. */
  terminal: ServerFrame | undefined;
  /** Epoch ms the turn ended; undefined while it is still running. */
  finishedAt: number | undefined;
}

/**
 * Session-keyed turn state, bounded on purpose.
 *
 * A record exists from chat.send until either the client aborts it, a
 * reconnecting client has been handed its terminal frame, or retention
 * expires it. Records for *running* turns are exempt from cap eviction —
 * they hold the only handle that can still cancel the turn — but their
 * payload is capped just like a finished one's.
 */
class TurnStore {
  private readonly records = new Map<string, TurnRecord>();
  private readonly limits: Required<TurnRetentionOptions>;

  constructor(options: TurnRetentionOptions | undefined) {
    this.limits = {
      maxSessions: Math.max(1, options?.maxSessions ?? DEFAULT_TURN_RETENTION.maxSessions),
      ttlMs: Math.max(0, options?.ttlMs ?? DEFAULT_TURN_RETENTION.ttlMs),
      maxTextChars: Math.max(1, options?.maxTextChars ?? DEFAULT_TURN_RETENTION.maxTextChars),
      maxToolEvents: Math.max(1, options?.maxToolEvents ?? DEFAULT_TURN_RETENTION.maxToolEvents),
    };
  }

  /** Replaces any earlier turn for this session — one turn per session at a time. */
  start(sessionKey: string, socket: WebSocket): TurnRecord {
    const record: TurnRecord = {
      sessionKey,
      cancel: () => {},
      socket,
      text: undefined,
      toolEvents: [],
      terminal: undefined,
      finishedAt: undefined,
    };
    this.records.set(sessionKey, record);
    this.sweep();
    return record;
  }

  get(sessionKey: string): TurnRecord | undefined {
    return this.records.get(sessionKey);
  }

  drop(sessionKey: string): void {
    this.records.delete(sessionKey);
  }

  clear(): void {
    this.records.clear();
  }

  recordDelta(record: TurnRecord, text: string): void {
    record.text = capText(text, this.limits.maxTextChars);
    this.sweep();
  }

  recordToolEvent(record: TurnRecord, frame: ServerFrame): void {
    record.toolEvents.push(frame);
    const overflow = record.toolEvents.length - this.limits.maxToolEvents;
    if (overflow > 0) record.toolEvents.splice(0, overflow);
    this.sweep();
  }

  finish(record: TurnRecord, terminal: ServerFrame): void {
    record.terminal = terminal;
    record.finishedAt = Date.now();
    this.sweep();
  }

  /**
   * Points this session's turn at `socket` and returns whatever the socket
   * has not already seen. A socket that received the frames live gets
   * nothing back, so re-opening a thread never duplicates them.
   */
  bind(sessionKey: string, socket: WebSocket): ServerFrame[] {
    this.sweep();
    const record = this.records.get(sessionKey);
    if (!record || record.socket === socket) return [];

    record.socket = socket;
    const replay: ServerFrame[] = [];
    // The text is cumulative, so one delta restores the whole reply so far.
    if (record.text !== undefined) replay.push({ type: "assistant.delta", sessionKey, text: record.text });
    replay.push(...record.toolEvents);
    if (record.terminal) {
      replay.push(record.terminal);
      // Handed over; there is nothing left that a later client could need.
      this.records.delete(sessionKey);
    }
    return replay;
  }

  /** Releases every binding held by a dying socket. Returns how many of them
   *  were still-running turns, for the disconnect log line. */
  unbind(socket: WebSocket): number {
    let running = 0;
    for (const record of this.records.values()) {
      if (record.socket !== socket) continue;
      record.socket = undefined;
      if (record.finishedAt === undefined) running += 1;
    }
    return running;
  }

  /** Lazy retention pass, run on every write and every bind rather than on a
   *  timer: the store only ever grows in response to those. */
  private sweep(): void {
    const now = Date.now();
    for (const [sessionKey, record] of this.records) {
      if (record.finishedAt !== undefined && now - record.finishedAt > this.limits.ttlMs) {
        this.records.delete(sessionKey);
      }
    }
    if (this.records.size <= this.limits.maxSessions) return;

    const evictable = [...this.records.entries()]
      .filter((entry): entry is [string, TurnRecord & { finishedAt: number }] => entry[1].finishedAt !== undefined)
      .sort((a, b) => a[1].finishedAt - b[1].finishedAt);
    for (const [sessionKey] of evictable) {
      if (this.records.size <= this.limits.maxSessions) return;
      this.records.delete(sessionKey);
    }
    // Over the cap with nothing evictable means that many turns are genuinely
    // running at once; dropping one would strand it with no way to cancel.
  }
}

function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Keep the head: the opening of a reply is what lets a returning user
  // recognise it. The tail is what we can afford to lose.
  return text.slice(0, maxChars) + RETENTION_TRUNCATION_MARKER;
}

function handleConnection(
  ws: WebSocket,
  gateway: GatewayAdapter,
  _request: IncomingMessage,
  turns: TurnStore,
): void {
  const unsubscribeSessions = gateway.subscribeSessions((session) => {
    send(ws, { type: "sessions.changed", session: toWire(session) });
  });

  console.log("WS client connected");

  // A closing socket deliberately does NOT cancel in-flight turns. A tab
  // reload or a flaky network used to kill the agent turn the client had
  // just started; chat.abort is now the only client-reachable cancellation
  // path, and it is session-keyed, so a reconnected client can still use it.
  // Unbinding issues no upstream sessions.abort — it only stops frames being
  // written into a dead socket, so they are retained for the next one.
  ws.on("close", (code: number) => {
    unsubscribeSessions();
    const running = turns.unbind(ws);
    // Attribution for the next time a connection dies mid-turn. Close code
    // and a count only: no session text, no frame bodies, no headers.
    console.log(`WS client disconnected: code=${code} turnsInFlight=${running}`);
  });

  ws.on("message", (raw) => {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    void handleFrame(frame, ws, gateway, turns);
  });
}

async function handleFrame(
  frame: ClientFrame,
  ws: WebSocket,
  gateway: GatewayAdapter,
  turns: TurnStore,
): Promise<void> {
  try {
    switch (frame.type) {
      case "sessions.list": {
        const sessions = await gateway.listSessions();
        respond(ws, frame.id, sessions.map(toWire));
        return;
      }
      case "sessions.create": {
        const session = await gateway.createSession();
        respond(ws, frame.id, toWire(session));
        return;
      }
      case "sessions.get": {
        const session = await gateway.getSession(frame.sessionKey);
        respond(ws, frame.id, toWire(session));
        // Opening a thread is what binds a client to that session's turn:
        // threadListAdapter.ts already sends this frame when a thread is
        // opened, so picking a turn back up after a reconnect needs no new
        // frame type on either side of the duplicated protocol. Two tabs on
        // one session: last binder wins, the earlier tab stops receiving.
        for (const replayed of turns.bind(frame.sessionKey, ws)) send(ws, replayed);
        return;
      }
      case "sessions.rename": {
        await gateway.renameSession(frame.sessionKey, frame.title);
        respond(ws, frame.id, null);
        return;
      }
      case "sessions.archive": {
        await gateway.archiveSession(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
      case "sessions.unarchive": {
        await gateway.unarchiveSession(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
      case "sessions.delete": {
        await gateway.deleteSession(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
      case "chat.send": {
        respond(ws, frame.id, null);
        const sessionKey = frame.sessionKey;
        const record = turns.start(sessionKey, ws);
        // Every callback first re-checks that it is still this session's
        // current turn: a second chat.send replaces the record, and the
        // superseded turn's late frames must not be written into it.
        const stillCurrent = (): boolean => turns.get(sessionKey) === record;
        const handle = gateway.sendMessage(sessionKey, frame.text, {
          onDelta: (delta) => {
            if (!stillCurrent()) return;
            turns.recordDelta(record, delta.text);
            // Live delivery carries the full text; only the retained copy is
            // capped. The socket is re-read here, never captured: it changes
            // when the client reconnects.
            send(record.socket, { type: "assistant.delta", sessionKey: delta.sessionKey, text: delta.text });
          },
          onToolEvent: (event) => {
            if (!stillCurrent()) return;
            const wire: ServerFrame = {
              type: "tool.event",
              sessionKey: event.sessionKey,
              tool: event.tool,
              at: event.at,
              args: event.payload,
            };
            turns.recordToolEvent(record, wire);
            send(record.socket, wire);
          },
          onDone: () => {
            if (!stillCurrent()) return;
            const terminal: ServerFrame = { type: "assistant.done", sessionKey };
            turns.finish(record, terminal);
            send(record.socket, terminal);
          },
          onError: (error) => {
            if (!stillCurrent()) return;
            const terminal: ServerFrame = { type: "assistant.error", sessionKey, error: error.message };
            turns.finish(record, terminal);
            send(record.socket, terminal);
          },
        });
        // sendMessage() is free to invoke a handler synchronously, so the
        // record exists first and gets its real cancel handle the moment
        // there is one.
        record.cancel = handle.cancel;
        return;
      }
      case "chat.abort": {
        // Session-keyed: a client that reconnected on a new socket still
        // finds — and can genuinely cancel — the turn it started earlier.
        // Aborting an already-finished or unknown turn is a successful no-op.
        const record = turns.get(frame.sessionKey);
        record?.cancel();
        turns.drop(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ("id" in frame) {
      respondError(ws, frame.id, message);
    }
  }
}

function toWire(session: SessionSummary): SessionWire {
  const wire: SessionWire = {
    sessionKey: session.sessionKey,
    title: session.title,
    updatedAt: session.updatedAt,
    archived: session.archived,
  };
  // 0 means "empty", undefined means "unknown" — so this is an explicit
  // presence check, never a falsy one, and never defaults to 0.
  if (session.messageCount !== undefined) wire.messageCount = session.messageCount;
  return wire;
}

function respond(ws: WebSocket, id: string, result: unknown): void {
  send(ws, { type: "result", id, ok: true, result });
}

function respondError(ws: WebSocket, id: string, error: string): void {
  send(ws, { type: "result", id, ok: false, error });
}

/** Accepts an unbound socket so callers can emit to a turn whose client is
 *  currently away without branching at every call site. */
function send(ws: WebSocket | undefined, frame: ServerFrame): void {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}
