import { describe, expect, it, vi } from "vitest";
import { GatewayAdapter, type GatewayClientFactoryOptions, type GatewayClientLike, type GatewayEvent } from "../src/gateway/gatewayAdapter.js";

/**
 * A fake transport that stands in for the real @openclaw/gateway-client.
 * GatewayAdapter only ever talks to the GatewayClientLike interface, so this
 * exercises the adapter's own logic (event routing, request shaping,
 * subscriber bookkeeping) without a running Gateway — see
 * gateway/openclawGatewayFactory.ts for where the real client is wired up
 * in production.
 */
function createFakeGateway() {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const responses = new Map<string, unknown>();
  let emit: (event: GatewayEvent) => void = () => {};
  let helloCallback: (() => void) | undefined;

  const factory = (options: GatewayClientFactoryOptions): GatewayClientLike => {
    emit = options.onEvent;
    helloCallback = options.onHelloOk;
    return {
      start: () => helloCallback?.(),
      stop: () => {},
      request: async (method, params) => {
        requests.push({ method, params });
        if (responses.has(method)) return responses.get(method);
        return {};
      },
    };
  };

  return {
    factory,
    requests,
    setResponse: (method: string, value: unknown) => responses.set(method, value),
    emit: (event: GatewayEvent) => emit(event),
  };
}

describe("GatewayAdapter.connect", () => {
  it("resolves once the fake client's onHelloOk fires", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await expect(adapter.connect()).resolves.toBeUndefined();
  });

  it("rejects if the client reports a connect error before hello-ok", async () => {
    let onConnectError: (error: unknown) => void = () => {};
    const factory = (options: GatewayClientFactoryOptions): GatewayClientLike => {
      onConnectError = options.onConnectError;
      return { start: () => onConnectError(new Error("boom")), stop: () => {}, request: vi.fn() };
    };
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: factory });
    await expect(adapter.connect()).rejects.toThrow("boom");
  });
});

describe("GatewayAdapter.listSessions", () => {
  it("maps raw Gateway sessions to SessionSummary, agent-scoped", async () => {
    const fake = createFakeGateway();
    // Real shape: `key` (not sessionKey), `label` (not title), and an
    // epoch-millisecond updatedAt.
    fake.setResponse("sessions.list", {
      sessions: [
        { key: "s1", label: "Onderhoud", updatedAt: 1785542400000, archived: false },
        { key: "s2", updatedAt: 1785628800000 },
      ],
    });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const sessions = await adapter.listSessions();

    expect(fake.requests).toContainEqual({ method: "sessions.list", params: { agentId: "sol" } });
    expect(sessions).toEqual([
      { sessionKey: "s1", title: "Onderhoud", updatedAt: "2026-08-01T00:00:00.000Z", hasTitle: true, archived: false },
      expect.objectContaining({ sessionKey: "s2", title: "New chat", hasTitle: false, archived: false }),
    ]);
  });
});

describe("GatewayAdapter.subscribeSessions", () => {
  it("delivers sessions.changed events to subscribers, merged by sessionKey", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const seen: string[] = [];
    const unsubscribe = adapter.subscribeSessions((session) => seen.push(`${session.sessionKey}:${session.title}`));

    // sessions.changed is the one place the Gateway spells the key
    // `sessionKey`, and the title always arrives as `label`.
    fake.emit({ event: "sessions.changed", payload: { sessionKey: "s1", label: "Besparing pagina" } });
    fake.emit({ event: "sessions.changed", payload: { sessionKey: "s2", label: "Onderhoud" } });

    expect(seen).toEqual(["s1:Besparing pagina", "s2:Onderhoud"]);
    expect(fake.requests).toContainEqual({ method: "sessions.subscribe", params: { agentId: "sol" } });

    unsubscribe();
  });

  it("only issues one sessions.subscribe RPC for multiple local subscribers", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    adapter.subscribeSessions(() => {});
    adapter.subscribeSessions(() => {});

    const subscribeCalls = fake.requests.filter((r) => r.method === "sessions.subscribe");
    expect(subscribeCalls).toHaveLength(1);
  });

  it("ignores sessions.changed payloads without a sessionKey", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const seen: unknown[] = [];
    adapter.subscribeSessions((s) => seen.push(s));
    fake.emit({ event: "sessions.changed", payload: {} });

    expect(seen).toHaveLength(0);
  });
});

describe("GatewayAdapter.sendMessage", () => {
  it("starts a turn with agent, streams assistant deltas, and resolves via agent.wait", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const deltas: string[] = [];
    let done = false;

    adapter.sendMessage("s1", "Verander de titel van Besparingen", {
      onDelta: (d) => deltas.push(d.text),
      onToolEvent: () => {},
      onDone: () => {
        done = true;
      },
      onError: () => {
        throw new Error("should not error");
      },
    });

    // The fake's `agent` / `agent.wait` requests resolve on the microtask
    // queue with nothing to wait on, so assistant deltas must be emitted
    // synchronously right after sendMessage() returns — before any await —
    // while "s1" is still registered as the active session. This mirrors
    // the real Gateway less exactly (there, agent.wait genuinely blocks
    // until the turn finishes), but it's what makes the fake's timing
    // deterministic rather than racing agent.wait's resolution.
    // Deltas arrive on the `agent` event under stream "assistant"; there is
    // no `assistant` event on this Gateway.
    fake.emit({ event: "agent", payload: { sessionKey: "s1", stream: "assistant", data: { text: "Ik pas de titel aan..." } } });
    fake.emit({
      event: "agent",
      payload: { sessionKey: "s1", stream: "assistant", data: { text: "Ik pas de titel aan... klaar." } },
    });

    // Flush the pending agent / agent.wait resolutions.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.requests[0]).toEqual({
      method: "agent",
      params: {
        agentId: "sol",
        sessionKey: "s1",
        message: "Verander de titel van Besparingen",
        idempotencyKey: expect.any(String),
      },
    });
    expect(deltas).toEqual(["Ik pas de titel aan...", "Ik pas de titel aan... klaar."]);
    expect(done).toBe(true);
  });

  it("sends a non-empty idempotencyKey, fresh for each turn", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const noop = { onDelta: () => {}, onToolEvent: () => {}, onDone: () => {}, onError: () => {} };
    adapter.sendMessage("s1", "eerste", noop);
    adapter.sendMessage("s1", "tweede", noop);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const keys = fake.requests.filter((r) => r.method === "agent").map((r) => r.params.idempotencyKey);
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(typeof key === "string" && key.length > 0).toBe(true);
    // Reusing one key across turns would make the Gateway discard the
    // second message as a duplicate of the first.
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("waits on runId alone, without agentId or sessionKey", async () => {
    const fake = createFakeGateway();
    fake.setResponse("agent", { runId: "run-7", status: "accepted" });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    adapter.sendMessage("s1", "hoi", { onDelta: () => {}, onToolEvent: () => {}, onDone: () => {}, onError: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The Gateway rejects agent.wait outright if any other property is present.
    expect(fake.requests).toContainEqual({ method: "agent.wait", params: { runId: "run-7" } });
  });

  it("treats an agent.wait status of error as a failed turn, not a completed one", async () => {
    const fake = createFakeGateway();
    fake.setResponse("agent", { runId: "run-8", status: "accepted" });
    // A failed run resolves agent.wait successfully — the failure is in the
    // body. Reading only "the promise resolved" reports a broken turn as done.
    fake.setResponse("agent.wait", { runId: "run-8", status: "error", error: "OAuth session expired" });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    let error: Error | undefined;
    let done = false;
    adapter.sendMessage("s1", "hoi", {
      onDelta: () => {},
      onToolEvent: () => {},
      onDone: () => {
        done = true;
      },
      onError: (e) => {
        error = e;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(error?.message).toBe("OAuth session expired");
    expect(done).toBe(false);
  });

  it("reports a lifecycle error phase on the agent event as a failed turn", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    let error: Error | undefined;
    adapter.sendMessage("s1", "hoi", {
      onDelta: () => {},
      onToolEvent: () => {},
      onDone: () => {},
      onError: (e) => {
        error = e;
      },
    });

    fake.emit({
      event: "agent",
      payload: { sessionKey: "s1", stream: "lifecycle", data: { phase: "error", error: "model unavailable" } },
    });

    expect(error?.message).toBe("model unavailable");
  });

  it("routes tool events only to the session that triggered them", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const toolEventsForS1: string[] = [];
    adapter.sendMessage("s1", "hoi", {
      onDelta: () => {},
      onToolEvent: (e) => toolEventsForS1.push(e.tool),
      onDone: () => {},
      onError: () => {},
    });
    await Promise.resolve();

    fake.emit({ event: "agent", payload: { sessionKey: "s1", stream: "tool", data: { tool: "wordpress.editDraft" } } });
    fake.emit({ event: "agent", payload: { sessionKey: "s2", stream: "tool", data: { tool: "wordpress.editDraft" } } });

    expect(toolEventsForS1).toEqual(["wordpress.editDraft"]);
  });

  it("calls onError when the agent RPC rejects", async () => {
    let rejectAgent: (error: unknown) => void = () => {};
    const factory = (options: GatewayClientFactoryOptions): GatewayClientLike => ({
      start: () => options.onHelloOk(),
      stop: () => {},
      request: (method) => {
        if (method === "agent") return new Promise((_, reject) => (rejectAgent = reject));
        return Promise.resolve({});
      },
    });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: factory });
    await adapter.connect();

    let error: Error | undefined;
    adapter.sendMessage("s1", "hoi", {
      onDelta: () => {},
      onToolEvent: () => {},
      onDone: () => {
        throw new Error("should not complete");
      },
      onError: (e) => {
        error = e;
      },
    });

    rejectAgent(new Error("gateway unreachable"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(error?.message).toBe("gateway unreachable");
  });

  it("cancel() stops further delivery and requests sessions.abort", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    let doneCalled = false;
    const handle = adapter.sendMessage("s1", "hoi", {
      onDelta: () => {},
      onToolEvent: () => {},
      onDone: () => {
        doneCalled = true;
      },
      onError: () => {},
    });

    handle.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.requests).toContainEqual({ method: "sessions.abort", params: { key: "s1" } });
    expect(doneCalled).toBe(false);
  });
});

describe("GatewayAdapter session CRUD wrappers", () => {
  it("createSession and deleteSession call the expected RPCs", async () => {
    const fake = createFakeGateway();
    // sessions.create answers with the key at the top level and the
    // timestamp nested under `entry` — not with a session summary.
    fake.setResponse("sessions.create", { ok: true, key: "new1", entry: { updatedAt: 1786000000000 } });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const created = await adapter.createSession();
    expect(created.sessionKey).toBe("new1");
    expect(created.hasTitle).toBe(false);

    await adapter.deleteSession("new1");

    expect(fake.requests).toContainEqual({ method: "sessions.create", params: { agentId: "sol" } });
    // The sessions.* family keys on `key`; `sessionKey` is rejected.
    expect(fake.requests).toContainEqual({ method: "sessions.delete", params: { key: "new1" } });
  });

  it("renames through the label field and archives through a patch", async () => {
    const fake = createFakeGateway();
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    await adapter.renameSession("s1", "Homepage headline");
    await adapter.archiveSession("s1");
    await adapter.unarchiveSession("s1");

    // `title` is rejected by the Gateway, and sessions.catalog.archive does
    // not exist on it at all.
    expect(fake.requests).toContainEqual({ method: "sessions.patch", params: { key: "s1", label: "Homepage headline" } });
    expect(fake.requests).toContainEqual({ method: "sessions.patch", params: { key: "s1", archived: true } });
    expect(fake.requests).toContainEqual({ method: "sessions.patch", params: { key: "s1", archived: false } });
    expect(fake.requests.some((r) => r.method === "sessions.catalog.archive")).toBe(false);
  });

  it("reads a session summary through sessions.describe, not sessions.get", async () => {
    const fake = createFakeGateway();
    // sessions.get returns message history on this Gateway, so using it for
    // a summary yields an object with no key and no label.
    fake.setResponse("sessions.describe", { session: { key: "s1", label: "About us", updatedAt: 1786000000000 } });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const summary = await adapter.getSession("s1");

    expect(summary).toEqual(expect.objectContaining({ sessionKey: "s1", title: "About us", hasTitle: true }));
    expect(fake.requests).toContainEqual({ method: "sessions.describe", params: { key: "s1" } });
    expect(fake.requests.some((r) => r.method === "sessions.get")).toBe(false);
  });
});
