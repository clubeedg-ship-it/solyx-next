import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadReadiness } from "../runtime/threadReadiness.js";

describe("ThreadReadiness", () => {
  it("starts as 'idle' and never calls initialize on its own — nothing is created just because a thread became active", async () => {
    const initialize = vi.fn(() => new Promise(() => {}));
    const readiness = new ThreadReadiness(initialize);

    expect(readiness.getStatus()).toBe("idle");
    // Give any stray microtask/effect a chance to run.
    await Promise.resolve();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("only calls initialize once an actual send happens (ensureReady is called)", async () => {
    const initialize = vi.fn().mockResolvedValue({ remoteId: "s1" });
    const readiness = new ThreadReadiness(initialize);

    const result = await readiness.ensureReady();

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
    expect(readiness.getStatus()).toBe("ready");
  });

  it("reports failure instead of throwing or silently discarding it, and flips to 'unavailable'", async () => {
    const readiness = new ThreadReadiness(async () => {
      throw new Error("no model credentials configured for this agent");
    });

    const result = await readiness.ensureReady();

    expect(result.ok).toBe(false);
    expect(readiness.getStatus()).toBe("unavailable");
  });

  it("de-dupes concurrent callers onto a single underlying initialize attempt", async () => {
    let calls = 0;
    let resolve!: (value: unknown) => void;
    const readiness = new ThreadReadiness(() => {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    });

    const first = readiness.ensureReady();
    const second = readiness.ensureReady();
    expect(calls).toBe(1);

    resolve({});
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
  });

  it("retries for real after a failure — a Gateway that recovers becomes usable without a reload", async () => {
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error("no model credentials configured for this agent"))
      .mockResolvedValueOnce({ remoteId: "s1" });
    const readiness = new ThreadReadiness(initialize);

    const first = await readiness.ensureReady();
    expect(first.ok).toBe(false);
    expect(readiness.getStatus()).toBe("unavailable");

    const second = await readiness.ensureReady();
    expect(second.ok).toBe(true);
    expect(readiness.getStatus()).toBe("ready");
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it("does not re-attempt once ready — a healthy thread's later sends are free", async () => {
    const initialize = vi.fn().mockResolvedValue({ remoteId: "s1" });
    const readiness = new ThreadReadiness(initialize);

    await readiness.ensureReady();
    await readiness.ensureReady();
    await readiness.ensureReady();

    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers of status transitions", async () => {
    const initialize = vi.fn().mockRejectedValue(new Error("offline"));
    const readiness = new ThreadReadiness(initialize);
    const seen: string[] = [];
    readiness.subscribe((status) => seen.push(status));

    await readiness.ensureReady();
    expect(seen).toEqual(["checking", "unavailable"]);

    // A later recovery is a real transition too, not just a resolved value —
    // this is what lets ChatPane clear its "can't reach Sol" banner.
    initialize.mockResolvedValueOnce({ remoteId: "s1" });
    await readiness.ensureReady();
    expect(seen).toEqual(["checking", "unavailable", "checking", "ready"]);
  });
});

// The real Gateway client's own request timeout defaults to ~30s
// (@openclaw/gateway-client DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS) — against
// the real "no model credentials" failure, sessions.create doesn't reject
// quickly the way the local stub's thrown Error does, it just sits pending.
// This is exactly what made the banner never render on the deployed app:
// status stayed "checking" — a state nothing was rendered for — for far
// longer than anyone would wait. These tests prove ensureReady() never
// waits anywhere near that long.
describe("ThreadReadiness — bounded wait against a slow/hanging Gateway", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports unavailable well before a real attempt that never settles in time", async () => {
    const initialize = vi.fn(() => new Promise(() => {})); // never settles, like a hung Gateway request
    const readiness = new ThreadReadiness(initialize, 6000);

    const resultPromise = readiness.ensureReady();
    await vi.advanceTimersByTimeAsync(6000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(readiness.getStatus()).toBe("unavailable");
  });

  it("does not wait anywhere near the real Gateway client's ~30s default request timeout", async () => {
    const initialize = vi.fn(() => new Promise(() => {}));
    const readiness = new ThreadReadiness(initialize, 6000);

    const resultPromise = readiness.ensureReady();
    // 16s: the exact window the deployed-app probe waited and still saw
    // nothing — proves this resolves comfortably inside it, not near 30s.
    await vi.advanceTimersByTimeAsync(16000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
  });

  it("self-heals: a real attempt that succeeds after the report timeout still flips status to ready", async () => {
    let resolveInitialize!: (value: unknown) => void;
    const initialize = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveInitialize = resolve;
        }),
    );
    const readiness = new ThreadReadiness(initialize, 6000);
    const seen: string[] = [];
    readiness.subscribe((status) => seen.push(status));

    const first = await (async () => {
      const p = readiness.ensureReady();
      await vi.advanceTimersByTimeAsync(6000);
      return p;
    })();
    expect(first.ok).toBe(false);
    expect(readiness.getStatus()).toBe("unavailable");

    // The real request the timeout gave up on finally answers.
    resolveInitialize({ remoteId: "s1" });
    await vi.advanceTimersByTimeAsync(0);

    expect(readiness.getStatus()).toBe("ready");
    expect(seen).toEqual(["checking", "unavailable", "ready"]);

    // A later send goes straight through — no redundant sessions.create.
    await expect(readiness.ensureReady()).resolves.toEqual({ ok: true });
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
