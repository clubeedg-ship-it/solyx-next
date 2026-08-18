import { describe, expect, it, vi } from "vitest";
import { BackendSocket, type MinimalSocket } from "../runtime/backendSocket.js";
import type { ServerFrame } from "../runtime/protocol.js";

/** A fake transport satisfying MinimalSocket, with test hooks to simulate server behavior. */
function createFakeSocket() {
  const sent: string[] = [];
  const handlers: Record<string, ((event: unknown) => void)[]> = {};
  const socket: MinimalSocket = {
    readyState: 1,
    send: (data: string) => sent.push(data),
    close: () => emit("close", undefined),
    addEventListener: ((type: string, listener: (event: unknown) => void) => {
      (handlers[type] ??= []).push(listener);
    }) as MinimalSocket["addEventListener"],
  };

  function emit(type: string, event: unknown) {
    for (const handler of handlers[type] ?? []) handler(event);
  }

  return {
    socket,
    sent,
    open: () => emit("open", undefined),
    message: (frame: ServerFrame) => emit("message", { data: JSON.stringify(frame) }),
    close: () => emit("close", undefined),
    error: (event: unknown) => emit("error", event),
  };
}

describe("BackendSocket.connect", () => {
  it("resolves once the underlying socket opens", async () => {
    const fake = createFakeSocket();
    const backend = new BackendSocket(() => fake.socket);
    const connected = backend.connect();
    fake.open();
    await expect(connected).resolves.toBeUndefined();
  });
});

describe("BackendSocket.request", () => {
  it("sends a frame with a generated id and resolves on the matching result frame", async () => {
    const fake = createFakeSocket();
    const backend = new BackendSocket(() => fake.socket);
    const connected = backend.connect();
    fake.open();
    await connected;

    const requestPromise = backend.request<{ ok: boolean }>({ type: "sessions.list" });
    const sentFrame = JSON.parse(fake.sent[0] ?? "{}");
    expect(sentFrame).toMatchObject({ type: "sessions.list" });
    expect(typeof sentFrame.id).toBe("string");

    fake.message({ type: "result", id: sentFrame.id, ok: true, result: { ok: true } });
    await expect(requestPromise).resolves.toEqual({ ok: true });
  });

  it("rejects with the server's error message on an ok:false result", async () => {
    const fake = createFakeSocket();
    const backend = new BackendSocket(() => fake.socket);
    backend.connect();
    fake.open();

    const requestPromise = backend.request({ type: "sessions.list" });
    const sentFrame = JSON.parse(fake.sent[0] ?? "{}");
    fake.message({ type: "result", id: sentFrame.id, ok: false, error: "gateway offline" });

    await expect(requestPromise).rejects.toThrow("gateway offline");
  });

  it("rejects immediately if the socket is not open", async () => {
    const fake = createFakeSocket();
    fake.socket = { ...fake.socket, readyState: 0 };
    const backend = new BackendSocket(() => fake.socket);
    backend.connect();

    await expect(backend.request({ type: "sessions.list" })).rejects.toThrow("not open");
  });

  it("rejects pending requests when the socket closes", async () => {
    const fake = createFakeSocket();
    const backend = new BackendSocket(() => fake.socket);
    backend.connect();
    fake.open();

    const requestPromise = backend.request({ type: "sessions.list" });
    fake.close();

    await expect(requestPromise).rejects.toThrow("closed");
  });
});

describe("BackendSocket.on", () => {
  it("dispatches pushed frames by type to subscribers", async () => {
    const fake = createFakeSocket();
    const backend = new BackendSocket(() => fake.socket);
    backend.connect();
    fake.open();

    const deltas: string[] = [];
    const unsubscribe = backend.on("assistant.delta", (frame) => deltas.push(frame.text));

    fake.message({ type: "assistant.delta", sessionKey: "s1", text: "hoi" });
    fake.message({ type: "assistant.delta", sessionKey: "s1", text: "hoi daar" });
    unsubscribe();
    fake.message({ type: "assistant.delta", sessionKey: "s1", text: "gemist" });

    expect(deltas).toEqual(["hoi", "hoi daar"]);
  });

  it("does not resolve pending requests for push-type frames", async () => {
    const fake = createFakeSocket();
    const backend = new BackendSocket(() => fake.socket);
    backend.connect();
    fake.open();

    const handler = vi.fn();
    backend.on("sessions.changed", handler);
    fake.message({
      type: "sessions.changed",
      session: { sessionKey: "s1", title: "x", updatedAt: "now", archived: false },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
