import type { GatewayClientFactory, GatewayClientLike, GatewayEvent } from "./gatewayAdapter.js";

// A local, in-process stand-in for the real OpenClaw Gateway connection —
// NOT a fake of the Gateway wire transport (that involves challenge-based
// device auth; see openclawGatewayFactory.ts). This implements
// GatewayAdapter's own GatewayClientFactory seam directly, so the rest of
// the app (WS bridge, frontend, draft proxy) can be built, run, and clicked
// through end to end without a real Gateway. Selected via
// OPENCLAW_GATEWAY_MODE=stub — see README "Run locally against the stubs".
//
// It MUST stay strict about params and faithful about shapes. An earlier
// version was permissive — it accepted whatever the adapter sent and
// answered with whatever the adapter expected. Both sides agreed on a
// protocol the real Gateway does not implement, the whole suite passed, and
// every send failed in production with INVALID_REQUEST. A stub that only
// ever agrees with its caller tests nothing. The contract mirrored here is
// the one documented and verified at the top of gatewayAdapter.ts; when that
// contract is re-verified against a new Gateway, this file moves with it.

interface StubSession {
  key: string;
  label?: string;
  updatedAt: number;
  archived: boolean;
}

/** Mirrors the Gateway's own INVALID_REQUEST rejections. */
function invalid(method: string, detail: string): Error {
  return new Error(`invalid ${method} params: ${detail}`);
}

function requireKey(method: string, params: Record<string, unknown>): string {
  if ("sessionKey" in params) {
    throw invalid(method, "at root: unexpected property 'sessionKey'");
  }
  const key = params.key;
  if (typeof key !== "string" || key.length === 0) {
    throw invalid(method, "must have required property 'key'");
  }
  return key;
}

export function createStubGatewayFactory(): GatewayClientFactory {
  const now = Date.now();
  const sessions = new Map<string, StubSession>([
    ["s-savings", { key: "s-savings", label: "Savings page", updatedAt: now, archived: false }],
    ["s-about", { key: "s-about", label: "About us", updatedAt: now, archived: false }],
  ]);
  let nextId = 1;

  return (options) => {
    let emit: (event: GatewayEvent) => void = () => {};

    const client: GatewayClientLike = {
      start: () => {
        emit = options.onEvent;
        setTimeout(() => options.onHelloOk(), 0);
      },
      stop: () => {},
      request: async <T,>(method: string, params: Record<string, unknown>) => {
        return handleRequest(method, params, sessions, () => `s-${nextId++}`, emit) as Promise<T>;
      },
    };

    return client;
  };
}

async function handleRequest(
  method: string,
  params: Record<string, unknown>,
  sessions: Map<string, StubSession>,
  makeId: () => string,
  emit: (event: GatewayEvent) => void,
): Promise<unknown> {
  switch (method) {
    case "sessions.list":
      return { sessions: [...sessions.values()] };

    case "sessions.create": {
      const session: StubSession = { key: makeId(), updatedAt: Date.now(), archived: false };
      sessions.set(session.key, session);
      // The real method returns the key at the top level and the timestamp
      // nested under `entry`, rather than a session summary.
      return { ok: true, key: session.key, sessionId: session.key, entry: { updatedAt: session.updatedAt } };
    }

    case "sessions.describe": {
      const key = requireKey(method, params);
      const existing = sessions.get(key);
      return { session: existing ?? { key, updatedAt: Date.now(), archived: false } };
    }

    case "sessions.get": {
      // Returns message history, not a summary.
      requireKey(method, params);
      return { messages: [] };
    }

    case "chat.history": {
      // Keys on sessionKey, not key — see the trap list in gatewayAdapter.ts.
      // The stub keeps no transcript, so an empty history is the honest answer.
      return { messages: [] };
    }

    case "sessions.patch": {
      const key = requireKey(method, params);
      if ("title" in params) throw invalid(method, "at root: unexpected property 'title'");
      const existing = sessions.get(key);
      if (existing) {
        if (typeof params.label === "string") existing.label = params.label;
        if (typeof params.archived === "boolean") existing.archived = params.archived;
        existing.updatedAt = Date.now();
      }
      return { ok: true, key, entry: { updatedAt: existing?.updatedAt ?? Date.now(), label: existing?.label } };
    }

    case "sessions.delete": {
      const key = requireKey(method, params);
      sessions.delete(key);
      return { ok: true, key, deleted: true };
    }

    case "sessions.abort": {
      requireKey(method, params);
      return { ok: true };
    }

    case "sessions.subscribe":
      return { subscribed: true };

    case "agent": {
      if (typeof params.idempotencyKey !== "string" || params.idempotencyKey.length === 0) {
        throw invalid(method, "must have required property 'idempotencyKey'");
      }
      const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey : undefined;
      if (!sessionKey) throw invalid(method, "must have required property 'sessionKey'");
      const message = typeof params.message === "string" ? params.message : "";
      const runId = `run-${params.idempotencyKey}`;
      simulateReply(sessionKey, message, emit);
      return { runId, sessionKey, status: "accepted", acceptedAt: Date.now() };
    }

    case "agent.wait": {
      // Takes runId and nothing else.
      for (const extra of ["agentId", "sessionKey"]) {
        if (extra in params) throw invalid(method, `at root: unexpected property '${extra}'`);
      }
      const runId = params.runId;
      if (typeof runId !== "string" || runId.length === 0) {
        throw invalid(method, "must have required property 'runId'");
      }
      // The simulated reply above resolves synchronously-ish (queued
      // microtasks); give it a beat before declaring the turn done.
      await new Promise((resolve) => setTimeout(resolve, 250));
      // Note: a failed turn resolves here with status "error" rather than
      // rejecting — see gatewayAdapter.ts.
      return { runId, status: "ok", endedAt: Date.now() };
    }

    default:
      return {};
  }
}

function simulateReply(sessionKey: string, userText: string, emit: (event: GatewayEvent) => void): void {
  const reply = `(stub) Received "${userText}" and updated the draft page.`;
  let cumulative = "";
  const words = reply.split(" ");

  words.forEach((word, index) => {
    setTimeout(() => {
      cumulative = index === 0 ? word : `${cumulative} ${word}`;
      // Streamed on the single `agent` event with a `stream` discriminator,
      // matching the real Gateway — there is no `assistant` event.
      emit({
        event: "agent",
        payload: { sessionKey, stream: "assistant", data: { text: cumulative, delta: word }, seq: index },
      });
    }, index * 20);
  });
}
