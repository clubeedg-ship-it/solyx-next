import { describe, expect, it, vi } from "vitest";
import { BackendSocket, type MinimalSocket } from "../runtime/backendSocket.js";
import type { ServerFrame } from "../runtime/protocol.js";

/**
 * A fake transport that actually models readyState transitions. The simpler
 * fake in backendSocket.test.ts pins readyState to OPEN forever, which cannot
 * express "the socket is down" — and it was that blind spot that let a broken
 * reconnect implementation pass a green suite.
 */
function createLifecycleSocket() {
  const sent: string[] = [];
  const handlers: Record<string, ((event: unknown) => void)[]> = {};
  let readyState = 0;

  const socket: MinimalSocket = {
    get readyState() {
      return readyState;
    },
    send: (data: string) => sent.push(data),
    close: () => {
      readyState = 3;
      emit("close", undefined);
    },
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
    open: () => {
      readyState = 1;
      emit("open", undefined);
    },
    drop: () => {
      readyState = 3;
      emit("close", undefined);
    },
    message: (frame: ServerFrame) => emit("message", { data: JSON.stringify(frame) }),
  };
}

/** Indexed access under strict TS, with a failure message worth reading. */
function socketAt(made: ReturnType<typeof createLifecycleSocket>[], index: number) {
  const fake = made[index];
  if (!fake) throw new Error(`expected a socket #${index} to have been created, but only ${made.length} were`);
  return fake;
}

describe("BackendSocket reconnection", () => {
  // The first reconnect implementation left no handle on the in-flight
  // attempt, so a request arriving mid-outage started a second socket of its
  // own alongside the scheduled retry. Measured against the live backend, that
  // showed up as sockets opening off the backoff schedule.
  it("does not open a competing socket when a request arrives mid-reconnect", async () => {
    vi.useFakeTimers();
    try {
      const made: ReturnType<typeof createLifecycleSocket>[] = [];
      const backend = new BackendSocket(() => {
        const fake = createLifecycleSocket();
        made.push(fake);
        return fake.socket;
      });

      backend.connect();
      socketAt(made, 0).open();
      expect(made).toHaveLength(1);

      socketAt(made, 0).drop();
      void backend.request({ type: "sessions.list" }).catch(() => undefined);

      await vi.advanceTimersByTimeAsync(100);
      expect(made).toHaveLength(1); // the request must join the pending attempt

      await vi.advanceTimersByTimeAsync(500);
      expect(made).toHaveLength(2); // exactly one reconnect, on schedule
    } finally {
      vi.useRealTimers();
    }
  });

  // A dead socket's listeners stay attached. Without a generation guard, a late
  // close from the socket we already replaced rejected the *live* socket's
  // in-flight requests — a message failing for no reason the user could see.
  it("ignores a late close from a socket that has already been replaced", async () => {
    vi.useFakeTimers();
    try {
      const made: ReturnType<typeof createLifecycleSocket>[] = [];
      const backend = new BackendSocket(() => {
        const fake = createLifecycleSocket();
        made.push(fake);
        return fake.socket;
      });

      backend.connect();
      socketAt(made, 0).open();
      socketAt(made, 0).drop();
      await vi.advanceTimersByTimeAsync(600);
      socketAt(made, 1).open();

      const inFlight = backend.request<{ fine: boolean }>({ type: "sessions.list" });
      socketAt(made, 0).drop(); // late event from the socket that is already gone

      const frame = JSON.parse(socketAt(made, 1).sent[0] ?? "{}");
      socketAt(made, 1).message({ type: "result", id: frame.id, ok: true, result: { fine: true } });

      await expect(inFlight).resolves.toEqual({ fine: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers and serves requests once the backend comes back", async () => {
    vi.useFakeTimers();
    try {
      const made: ReturnType<typeof createLifecycleSocket>[] = [];
      const backend = new BackendSocket(() => {
        const fake = createLifecycleSocket();
        made.push(fake);
        return fake.socket;
      });

      backend.connect();
      socketAt(made, 0).open();
      socketAt(made, 0).drop();

      const inFlight = backend.request<{ ok: boolean }>({ type: "sessions.list" });
      await vi.advanceTimersByTimeAsync(600);
      socketAt(made, 1).open();
      await vi.advanceTimersByTimeAsync(0);

      const frame = JSON.parse(socketAt(made, 1).sent[0] ?? "{}");
      socketAt(made, 1).message({ type: "result", id: frame.id, ok: true, result: { ok: true } });
      await expect(inFlight).resolves.toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
