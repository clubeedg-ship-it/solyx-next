import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket, { type WebSocketServer } from "ws";
import type { AuthChecker } from "../src/auth/types.js";
import type { GatewayAdapter } from "../src/gateway/gatewayAdapter.js";
import type { SendMessageHandlers, SessionSummary } from "../src/gateway/types.js";
import { attachWsBridge, type WsBridgeOptions } from "../src/ws/wsServer.js";
import type { ClientFrame, ServerFrame } from "../src/ws/protocol.js";

const alwaysAuthenticated: AuthChecker = { isAuthenticated: async () => ({ authenticated: true }) };

function startServer(
  gateway: Partial<GatewayAdapter>,
  extra: Omit<Partial<WsBridgeOptions>, "gateway" | "auth"> = {},
): { server: Server; wss: WebSocketServer; url: string } {
  const server = createServer((_req, res) => res.writeHead(404).end());
  const wss = attachWsBridge(server, { gateway: gateway as GatewayAdapter, auth: alwaysAuthenticated, ...extra });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, wss, url: `ws://127.0.0.1:${port}/ws` };
}

/** See wsServer.test.ts: frames can arrive batched in one synchronous turn. */
class FrameQueue {
  private readonly buffered: ServerFrame[] = [];
  private waiter: ((frame: ServerFrame) => void) | undefined;

  constructor(ws: WebSocket) {
    ws.on("message", (raw) => {
      const frame: ServerFrame = JSON.parse(raw.toString());
      if (this.waiter) {
        const waiter = this.waiter;
        this.waiter = undefined;
        waiter(frame);
      } else {
        this.buffered.push(frame);
      }
    });
  }

  next(): Promise<ServerFrame> {
    const buffered = this.buffered.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }
}

async function connect(url: string): Promise<{ ws: WebSocket; frames: FrameQueue }> {
  const ws = new WebSocket(url);
  const frames = new FrameQueue(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, frames };
}

function send(ws: WebSocket, frame: ClientFrame): void {
  ws.send(JSON.stringify(frame));
}

/** Fails with a named reason instead of vitest's generic test timeout, so a
 *  regression says which socket event never arrived. */
async function withDeadline(promise: Promise<void>, ms: number, reason: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(reason)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** withDeadline for a promise whose value the test needs. */
async function withDeadlineValue<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(reason)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Pulls frames until the result for `id` arrives, ignoring whatever the
 *  server pushed in between. */
async function resultFor(frames: FrameQueue, id: string): Promise<ServerFrame> {
  for (;;) {
    const frame = await frames.next();
    if (frame.type === "result" && frame.id === id) return frame;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summaryOf(sessionKey: string): SessionSummary {
  return { sessionKey, title: "New chat", updatedAt: "2026-08-01T00:00:00.000Z", hasTitle: false, archived: false };
}

/** One turn of the macrotask queue — enough for any synchronous follow-up work
 * the server does immediately after the marker we awaited. */
function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A gateway whose turn never finishes on its own: sendMessage() records the
 * handlers and returns a cancel spy, so a test can observe exactly who
 * cancels an in-flight turn and when.
 */
function neverFinishingGateway(): {
  gateway: Partial<GatewayAdapter>;
  cancel: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  unsubscribed: Promise<void>;
  handlersFor: (sessionKey: string) => SendMessageHandlers;
} {
  const cancel = vi.fn();
  const captured = new Map<string, SendMessageHandlers>();
  const unsubscribe = deferred();
  const sendMessage = vi.fn((sessionKey: string, _text: string, handlers: SendMessageHandlers) => {
    captured.set(sessionKey, handlers);
    return { cancel };
  });
  return {
    gateway: {
      subscribeSessions: () => () => unsubscribe.resolve(),
      sendMessage,
      // A reconnecting client binds itself to a session by opening it, so
      // the fake has to answer sessions.get (and sessions.list, used below
      // purely as an ordering marker).
      getSession: async (sessionKey: string) => summaryOf(sessionKey),
      listSessions: async () => [],
    } as Partial<GatewayAdapter>,
    cancel,
    sendMessage,
    unsubscribed: unsubscribe.promise,
    handlersFor: (sessionKey) => {
      const handlers = captured.get(sessionKey);
      if (!handlers) throw new Error(`no turn captured for ${sessionKey}`);
      return handlers;
    },
  };
}

describe("ws turn lifecycle", () => {
  let openServer: Server | undefined;
  let openWss: WebSocketServer | undefined;

  afterEach(() => {
    openWss?.close();
    openServer?.close();
    openWss = undefined;
    openServer = undefined;
  });

  it("a browser socket closing does not cancel an in-flight turn", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway);
    openServer = server;
    openWss = wss;

    const { ws, frames } = await connect(url);
    send(ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    const ack = await frames.next();
    expect(ack).toMatchObject({ type: "result", id: "r1", ok: true });
    expect(fake.sendMessage).toHaveBeenCalledTimes(1);

    ws.close();
    // unsubscribeSessions() runs first in the server close handler, so this
    // resolving proves the close handler ran; one macrotask covers anything
    // it does synchronously afterwards.
    await fake.unsubscribed;
    await macrotask();

    expect(fake.cancel).toHaveBeenCalledTimes(0);
  });

  it("the server sends a WebSocket ping to an idle client within the heartbeat interval", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway, { heartbeatIntervalMs: 50 });
    openServer = server;
    openWss = wss;

    const { ws } = await connect(url);
    await withDeadline(
      new Promise<void>((resolve) => ws.once("ping", () => resolve())),
      1000,
      "no WebSocket ping received within 1s",
    );
    ws.close();
  });

  it("a client that stops answering pings is terminated after the missed-pong threshold", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway, { heartbeatIntervalMs: 50, missedPongLimit: 2 });
    openServer = server;
    openWss = wss;

    const { ws } = await connect(url);
    // ws answers pings automatically inside receiverOnPing by calling
    // websocket.pong(...); overriding the instance method makes this client
    // look dead at the protocol level without touching the server.
    ws.pong = () => {};

    await withDeadline(
      new Promise<void>((resolve) => ws.once("close", () => resolve())),
      2000,
      "socket still open after the missed-pong threshold",
    );
  });

  it("chat.abort still cancels the turn", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway);
    openServer = server;
    openWss = wss;

    const { ws, frames } = await connect(url);
    send(ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    await frames.next();
    send(ws, { type: "chat.abort", id: "r2", sessionKey: "s1" });
    const result = await frames.next();

    expect(result).toMatchObject({ type: "result", id: "r2", ok: true });
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    ws.close();
  });

  it("frames emitted after the socket closed are dropped, not thrown", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway);
    openServer = server;
    openWss = wss;

    const { ws, frames } = await connect(url);
    send(ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    await frames.next();
    const handlers = fake.handlersFor("s1");

    ws.close();
    await fake.unsubscribed;
    await macrotask();

    expect(() => handlers.onDelta({ sessionKey: "s1", text: "late" })).not.toThrow();
    expect(() => handlers.onDone()).not.toThrow();
  });

  it("a turn that finishes after its socket closed is replayed when a client reconnects and opens the same session", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway);
    openServer = server;
    openWss = wss;

    const a = await connect(url);
    send(a.ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    await resultFor(a.frames, "r1");
    const handlers = fake.handlersFor("s1");

    a.ws.close();
    await fake.unsubscribed;
    await macrotask();

    // The turn finishes upstream while nobody is listening.
    handlers.onDelta({ sessionKey: "s1", text: "antwoord" });
    handlers.onDone();

    const b = await connect(url);
    send(b.ws, { type: "sessions.get", id: "r2", sessionKey: "s1" });
    await withDeadline(
      (async () => {
        expect(await b.frames.next()).toMatchObject({ type: "result", id: "r2", ok: true });
        expect(await b.frames.next()).toMatchObject({ type: "assistant.delta", sessionKey: "s1", text: "antwoord" });
        expect(await b.frames.next()).toMatchObject({ type: "assistant.done", sessionKey: "s1" });
      })(),
      1000,
      "no replayed assistant.done on the reconnected socket",
    );
    b.ws.close();
  });

  it("a reconnecting client can abort a turn started on a previous socket", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway);
    openServer = server;
    openWss = wss;

    const a = await connect(url);
    send(a.ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    await resultFor(a.frames, "r1");

    a.ws.close();
    await fake.unsubscribed;
    await macrotask();

    const b = await connect(url);
    send(b.ws, { type: "chat.abort", id: "r2", sessionKey: "s1" });
    expect(await resultFor(b.frames, "r2")).toMatchObject({ type: "result", id: "r2", ok: true });

    // Reporting ok while cancelling nothing is the silent-success defect.
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    b.ws.close();
  });

  it("live frames from a still-running turn follow the client to its new socket", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway);
    openServer = server;
    openWss = wss;

    const a = await connect(url);
    send(a.ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    await resultFor(a.frames, "r1");
    const handlers = fake.handlersFor("s1");

    a.ws.close();
    await fake.unsubscribed;
    await macrotask();

    const b = await connect(url);
    send(b.ws, { type: "sessions.get", id: "r2", sessionKey: "s1" });
    await resultFor(b.frames, "r2");
    await macrotask();

    handlers.onDelta({ sessionKey: "s1", text: "later" });
    await withDeadline(
      (async () => {
        expect(await b.frames.next()).toMatchObject({ type: "assistant.delta", sessionKey: "s1", text: "later" });
      })(),
      1000,
      "a live frame did not follow the client to its new socket",
    );
    b.ws.close();
  });

  it("retained turn state is capped: the newest finished turn replays, an evicted older one does not", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway, { turnRetention: { maxSessions: 1 } });
    openServer = server;
    openWss = wss;

    const a = await connect(url);
    send(a.ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "een" });
    await resultFor(a.frames, "r1");
    fake.handlersFor("s1").onDone();
    send(a.ws, { type: "chat.send", id: "r2", sessionKey: "s2", text: "twee" });
    await resultFor(a.frames, "r2");
    fake.handlersFor("s2").onDone();

    a.ws.close();
    await fake.unsubscribed;
    await macrotask();

    const b = await connect(url);
    send(b.ws, { type: "sessions.get", id: "r3", sessionKey: "s2" });
    await withDeadline(
      (async () => {
        expect(await b.frames.next()).toMatchObject({ type: "result", id: "r3", ok: true });
        expect(await b.frames.next()).toMatchObject({ type: "assistant.done", sessionKey: "s2" });
      })(),
      1000,
      "the newest finished turn was not replayed",
    );

    // s1 fell off the cap, so binding it must yield its result frame and
    // nothing else -- the sessions.list marker proves nothing came between.
    send(b.ws, { type: "sessions.get", id: "r4", sessionKey: "s1" });
    send(b.ws, { type: "sessions.list", id: "r5" });
    expect(await b.frames.next()).toMatchObject({ type: "result", id: "r4", ok: true });
    expect(await b.frames.next()).toMatchObject({ type: "result", id: "r5", ok: true });
    b.ws.close();
  });

  it("retained turn state expires: a fresh finished turn replays, one older than the TTL does not", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway, { turnRetention: { ttlMs: 20 } });
    openServer = server;
    openWss = wss;

    const a = await connect(url);
    send(a.ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "een" });
    await resultFor(a.frames, "r1");
    fake.handlersFor("s1").onDone();

    await sleep(60);

    send(a.ws, { type: "chat.send", id: "r2", sessionKey: "s2", text: "twee" });
    await resultFor(a.frames, "r2");
    fake.handlersFor("s2").onDone();

    a.ws.close();
    await fake.unsubscribed;
    await macrotask();

    const b = await connect(url);
    send(b.ws, { type: "sessions.get", id: "r3", sessionKey: "s2" });
    await withDeadline(
      (async () => {
        expect(await b.frames.next()).toMatchObject({ type: "result", id: "r3", ok: true });
        expect(await b.frames.next()).toMatchObject({ type: "assistant.done", sessionKey: "s2" });
      })(),
      1000,
      "the fresh finished turn was not replayed",
    );

    send(b.ws, { type: "sessions.get", id: "r4", sessionKey: "s1" });
    send(b.ws, { type: "sessions.list", id: "r5" });
    expect(await b.frames.next()).toMatchObject({ type: "result", id: "r4", ok: true });
    expect(await b.frames.next()).toMatchObject({ type: "result", id: "r5", ok: true });
    b.ws.close();
  });

  it("a replayed reply is truncated to the retention cap rather than buffered whole", async () => {
    const fake = neverFinishingGateway();
    const { server, wss, url } = startServer(fake.gateway, { turnRetention: { maxTextChars: 32 } });
    openServer = server;
    openWss = wss;

    const long = "abcdefghij".repeat(50);
    const a = await connect(url);
    send(a.ws, { type: "chat.send", id: "r1", sessionKey: "s1", text: "hallo" });
    await resultFor(a.frames, "r1");
    const handlers = fake.handlersFor("s1");

    a.ws.close();
    await fake.unsubscribed;
    await macrotask();

    handlers.onDelta({ sessionKey: "s1", text: long });
    handlers.onDone();

    const b = await connect(url);
    send(b.ws, { type: "sessions.get", id: "r2", sessionKey: "s1" });
    await resultFor(b.frames, "r2");

    const replayed = await withDeadlineValue(b.frames.next(), 1000, "no replayed assistant.delta");
    if (replayed.type !== "assistant.delta") throw new Error(`expected assistant.delta, got ${replayed.type}`);
    expect(replayed.text.startsWith(long.slice(0, 32))).toBe(true);
    // The cap plus room for a truncation marker -- never the whole 500 chars.
    expect(replayed.text.length).toBeLessThanOrEqual(32 + 24);
    b.ws.close();
  });
});
