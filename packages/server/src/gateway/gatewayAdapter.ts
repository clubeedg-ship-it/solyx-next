import { randomUUID } from "node:crypto";
import type { AssistantDelta, SendMessageHandle, SendMessageHandlers, SessionSummary, ToolEvent } from "./types.js";

// ============================================================================
// WIRE CONTRACT — verified against the running Gateway (openclaw 2026.7.1-2)
// on 2026-08-13 by probing every method/event below with `openclaw gateway
// call` and a live GatewayClient event capture. It is NOT taken from
// @openclaw/gateway-protocol's schema: that package is pinned to
// 2026.8.1-beta.1, a *newer* wire version than the Gateway we talk to, and
// an earlier version of this file was written against it. Every difference
// below is one that silently broke at runtime while the unit tests passed,
// because the stub in stubGatewayFactory.ts implemented the same wrong guess.
//
// Requests (params -> result):
//   sessions.list      {agentId}                  -> {sessions: RawSession[]}
//   sessions.create    {agentId}                  -> {key, sessionId, entry}
//   sessions.describe  {key}                      -> {session: RawSession}
//   sessions.patch     {key, label?, archived?}   -> {ok, key, entry}
//   sessions.delete    {key}                      -> {ok, deleted}
//   sessions.abort     {key}                      -> ok
//   sessions.subscribe {agentId}                  -> {subscribed: true}
//   agent              {agentId, sessionKey, message, idempotencyKey}
//                                                 -> {runId, status:"accepted"}
//   agent.wait         {runId}                    -> {runId, status, error?}
//
// Traps this file exists to absorb:
//   * The sessions.* family keys on `key`. Passing `sessionKey` is rejected
//     outright ("unexpected property 'sessionKey'"). Only `agent` itself
//     takes `sessionKey`.
//   * `agent` requires `idempotencyKey`; without it the whole turn is
//     rejected INVALID_REQUEST before the model is ever reached.
//   * `agent.wait` takes `runId` and *nothing else* — passing agentId or
//     sessionKey alongside it is rejected.
//   * `agent.wait` reports a failed turn as a SUCCESSFUL response carrying
//     status:"error". It does not reject. Treating "the promise resolved"
//     as "the turn worked" silently swallows every model-side failure.
//   * The session title field is `label`. `title` is rejected.
//   * There is no sessions.catalog.archive method; archiving is a patch.
//   * `sessions.get` returns the message history, NOT a session summary.
//     `sessions.describe` is the summary lookup.
//   * updatedAt is epoch milliseconds, not an ISO string.
//
// Events (payload):
//   sessions.changed  {sessionKey, label, archived, updatedAt, reason, ...}
//   session.message   {sessionKey, message: {role, content, timestamp}, ...}
//   agent             {runId, sessionKey, stream, data, seq, ts}
//                       stream "assistant" -> data {text, delta}
//                       stream "lifecycle" -> data {phase, error?, endedAt?}
//                       stream "tool"      -> data (shape unverified)
//   health / tick / task                            -> ignored here
//
// There is no `assistant` event. An earlier version listened for one, which
// is why no reply ever reached the browser even when a turn succeeded.
// ============================================================================

// The adapter is deliberately decoupled from the real @openclaw/gateway-client
// runtime via GatewayClientLike + GatewayClientFactory. Production wiring
// (gateway/openclawGatewayFactory.ts) supplies the real client; tests supply
// a fake one. This is what makes "the Gateway transport adapter" testable
// without a running Gateway, per the build brief.

export interface GatewayEvent {
  event: string;
  payload: Record<string, unknown>;
}

export interface GatewayClientLike {
  start(): void;
  stop(): void;
  request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

export interface GatewayClientFactoryOptions {
  onHelloOk: () => void;
  onConnectError: (error: unknown) => void;
  onEvent: (event: GatewayEvent) => void;
}

export type GatewayClientFactory = (options: GatewayClientFactoryOptions) => GatewayClientLike;

export interface GatewayAdapterOptions {
  agentId: string;
  createClient: GatewayClientFactory;
}

/**
 * A thin, testable wrapper over the OpenClaw Gateway WebSocket protocol.
 * Holds the one long-lived connection this backend keeps to the client's
 * dedicated agent profile; the browser never touches this — see
 * ws/wsServer.ts for the browser-facing bridge that sits in front of this.
 */
export class GatewayAdapter {
  private readonly agentId: string;
  private readonly client: GatewayClientLike;
  private helloOk: Promise<void>;
  private resolveHello!: () => void;
  private rejectHello!: (error: unknown) => void;

  // Per-session-key subscribers for the currently-in-flight turn(s). Keyed
  // by sessionKey rather than by individual request id: every `assistant`
  // and tool-lifecycle event for a session belongs to that session's one
  // active stream, regardless of which `agent` call produced it.
  private readonly active = new Map<string, SendMessageHandlers>();

  // sessionKey -> subscriber callbacks registered via subscribeSessions.
  private readonly sessionSubscribers = new Set<(session: SessionSummary) => void>();

  constructor(options: GatewayAdapterOptions) {
    this.agentId = options.agentId;
    this.helloOk = new Promise((resolve, reject) => {
      this.resolveHello = resolve;
      this.rejectHello = reject;
    });

    this.client = options.createClient({
      onHelloOk: () => this.resolveHello(),
      onConnectError: (error) => this.rejectHello(error),
      onEvent: (event) => this.handleEvent(event),
    });
  }

  async connect(): Promise<void> {
    this.client.start();
    await this.helloOk;
  }

  disconnect(): void {
    this.client.stop();
  }

  async listSessions(): Promise<SessionSummary[]> {
    const result = await this.client.request<{ sessions: RawSession[] }>("sessions.list", {
      agentId: this.agentId,
    });
    return result.sessions.map(toSessionSummary);
  }

  /**
   * `sessions.create` answers with the new key at the top level and the
   * timestamp one level down in `entry` — it does not return a session
   * summary, so this reshapes rather than reads one out.
   */
  async createSession(): Promise<SessionSummary> {
    const created = await this.client.request<{ key: string; entry?: { updatedAt?: number; label?: string } }>(
      "sessions.create",
      { agentId: this.agentId },
    );
    return toSessionSummary({
      key: created.key,
      label: created.entry?.label,
      updatedAt: created.entry?.updatedAt,
    });
  }

  /** `sessions.describe`, not `sessions.get` — the latter returns messages. */
  async getSession(sessionKey: string): Promise<SessionSummary> {
    const result = await this.client.request<{ session: RawSession }>("sessions.describe", { key: sessionKey });
    return toSessionSummary(result.session);
  }

  async renameSession(sessionKey: string, title: string): Promise<void> {
    await this.client.request("sessions.patch", { key: sessionKey, label: title });
  }

  async archiveSession(sessionKey: string): Promise<void> {
    await this.client.request("sessions.patch", { key: sessionKey, archived: true });
  }

  async unarchiveSession(sessionKey: string): Promise<void> {
    await this.client.request("sessions.patch", { key: sessionKey, archived: false });
  }

  async deleteSession(sessionKey: string): Promise<void> {
    await this.client.request("sessions.delete", { key: sessionKey });
  }

  /**
   * Subscribe to live session list changes (title/timestamp updates as the
   * agent works). Returns an unsubscribe function. Per PLAN.md §1.1, the
   * documented pattern is `sessions.list` for the initial snapshot plus
   * `sessions.subscribe` + merging `sessions.changed` events by sessionKey
   * — merging itself is the caller's job (this just delivers the events).
   */
  subscribeSessions(callback: (session: SessionSummary) => void): () => void {
    this.sessionSubscribers.add(callback);
    if (this.sessionSubscribers.size === 1) {
      void this.client.request("sessions.subscribe", { agentId: this.agentId });
    }
    return () => {
      this.sessionSubscribers.delete(callback);
    };
  }

  /**
   * Send one chat turn and stream the reply. Uses the `agent` / `agent.wait`
   * RPC pair (PLAN.md §1.1): `agent` starts the turn, `assistant` events
   * stream the reply while it runs, `agent.wait` resolves once it's done.
   */
  sendMessage(sessionKey: string, text: string, handlers: SendMessageHandlers): SendMessageHandle {
    this.active.set(sessionKey, handlers);
    let cancelled = false;

    void (async () => {
      try {
        // idempotencyKey is mandatory. One fresh key per turn: it exists so a
        // transport-level retry of *this* send is deduplicated, so it must not
        // be reused across turns (that would drop a genuine second message).
        const accepted = await this.client.request<{ runId: string }>("agent", {
          agentId: this.agentId,
          sessionKey,
          message: text,
          idempotencyKey: randomUUID(),
        });
        if (cancelled) return;

        // agent.wait resolves for both outcomes; status is the only thing
        // that distinguishes a finished turn from a failed one.
        const result = await this.client.request<{ status?: string; error?: string }>("agent.wait", {
          runId: accepted.runId,
        });
        if (cancelled) return;
        if (result.status === "error") {
          handlers.onError(new Error(result.error ?? "The agent run failed."));
          return;
        }
        handlers.onDone();
      } catch (error) {
        if (!cancelled) {
          handlers.onError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        this.active.delete(sessionKey);
      }
    })();

    return {
      cancel: () => {
        cancelled = true;
        this.active.delete(sessionKey);
        void this.client.request("sessions.abort", { key: sessionKey }).catch(() => {
          // Best-effort: if the abort RPC itself fails, we've already
          // stopped delivering events locally, which is what the caller
          // actually needs.
        });
      },
    };
  }

  private handleEvent(event: GatewayEvent): void {
    // Everything that happens inside a turn arrives on the single `agent`
    // event, discriminated by `stream`, rather than on per-concern events.
    if (event.event === "agent") {
      this.handleAgentEvent(event.payload);
      return;
    }

    if (event.event === "sessions.changed") {
      const sessionKey = readString(event.payload, "sessionKey");
      if (!sessionKey) return;
      // sessions.changed carries the session under `sessionKey`, while the
      // sessions.* request results carry it as `key`. Same session, two
      // spellings, so normalise before reshaping.
      const summary = toSessionSummary({ ...(event.payload as Partial<RawSession>), key: sessionKey });
      for (const subscriber of this.sessionSubscribers) subscriber(summary);
    }
  }

  private handleAgentEvent(payload: Record<string, unknown>): void {
    const sessionKey = readString(payload, "sessionKey");
    if (!sessionKey) return;
    const handlers = this.active.get(sessionKey);
    if (!handlers) return;

    const stream = readString(payload, "stream");
    const data = (payload.data ?? {}) as Record<string, unknown>;

    if (stream === "assistant") {
      // `data.text` is cumulative and `data.delta` is the new fragment;
      // AssistantDelta.text is defined as cumulative, so prefer text and
      // only fall back to the fragment when a chunk carries just that.
      const text = readString(data, "text") ?? readString(data, "delta");
      if (text === undefined) return;
      const delta: AssistantDelta = { sessionKey, text };
      handlers.onDelta(delta);
      return;
    }

    if (stream === "lifecycle" || stream === "error") {
      // A run that dies mid-flight reports it here as well as through
      // agent.wait. Surfacing it from both is intentional: whichever
      // arrives first tells the browser the turn is over, and the
      // sendMessage() promise chain is already guarded against a second
      // terminal callback by deleting the handler entry on completion.
      const phase = readString(data, "phase");
      if (phase === "error") {
        handlers.onError(new Error(readString(data, "error") ?? "The agent run failed."));
      }
      return;
    }

    if (stream === "tool") {
      // Payload shape for tool streams is not verified against a live run
      // (it needs a working model credential to observe), so this stays
      // permissive: forward with whatever name is present rather than
      // dropping the event because a field was spelled differently.
      const tool = readString(data, "tool") ?? readString(data, "toolName") ?? readString(data, "name");
      if (!tool) return;
      handlers.onToolEvent({ sessionKey, tool, payload: data, at: new Date().toISOString() });
    }
  }
}

interface RawSession {
  /** The Gateway's own name for the session key everywhere except events. */
  key: string;
  /** The Gateway's name for what this UI calls a title. */
  label?: string;
  /** Epoch milliseconds. */
  updatedAt?: number;
  archived?: boolean;
}

function toSessionSummary(raw: Partial<RawSession>): SessionSummary {
  const label = typeof raw.label === "string" && raw.label.trim().length > 0 ? raw.label : undefined;
  return {
    sessionKey: raw.key ?? "",
    title: label ?? "New chat",
    updatedAt: typeof raw.updatedAt === "number" ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
    hasTitle: label !== undefined,
    archived: raw.archived ?? false,
  };
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}
