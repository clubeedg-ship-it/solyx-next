import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginRateLimiter } from "../src/http/loginRateLimiter.js";

const IP = "203.0.113.7";

describe("LoginRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts immediately when there is no history", () => {
    const limiter = new LoginRateLimiter();
    expect(limiter.retryAfterMs(IP)).toBe(0);
  });

  it("keeps allowing a handful of failures before engaging a lockout", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.retryAfterMs(IP)).toBe(0);
      limiter.recordFailure(IP);
    }
    // Still not locked out after exactly the free-attempt budget.
    expect(limiter.retryAfterMs(IP)).toBe(0);
  });

  it("engages a lockout once failures exceed the free-attempt budget", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 6; i++) limiter.recordFailure(IP);
    expect(limiter.retryAfterMs(IP)).toBeGreaterThan(0);
  });

  it("does not extend an already-active lockout on further failures during its window", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 6; i++) limiter.recordFailure(IP);
    const scheduledUnlock = limiter.retryAfterMs(IP);
    expect(scheduledUnlock).toBeGreaterThan(0);

    // Sustained guessing *during* the window must not push the unlock time
    // further out — this is what makes "never permanent" a property of the
    // limiter itself, not just of well-behaved callers.
    for (let i = 0; i < 20; i++) limiter.recordFailure(IP);
    expect(limiter.retryAfterMs(IP)).toBe(scheduledUnlock);
  });

  it("a lockout expires on its own once its window elapses, with no recordSuccess needed", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 6; i++) limiter.recordFailure(IP);
    const delay = limiter.retryAfterMs(IP);
    expect(delay).toBeGreaterThan(0);

    vi.advanceTimersByTime(delay - 1);
    expect(limiter.retryAfterMs(IP)).toBeGreaterThan(0);

    vi.advanceTimersByTime(1);
    expect(limiter.retryAfterMs(IP)).toBe(0);
  });

  it("escalates the lockout window on a genuinely new failure after the previous window elapsed", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 6; i++) limiter.recordFailure(IP);
    const firstDelay = limiter.retryAfterMs(IP);
    expect(firstDelay).toBeGreaterThan(0);

    vi.advanceTimersByTime(firstDelay);
    expect(limiter.retryAfterMs(IP)).toBe(0);

    limiter.recordFailure(IP);
    const laterDelay = limiter.retryAfterMs(IP);
    expect(laterDelay).toBeGreaterThan(firstDelay);
  });

  it("caps the lockout window rather than escalating forever", () => {
    const MAX_DELAY_MS = 15 * 60 * 1000;
    const limiter = new LoginRateLimiter();
    const delays: number[] = [];
    // Comfortably enough cycles for 1s*2^n to clear the 15-minute cap
    // (reaches it around the 16th failure).
    for (let cycle = 0; cycle < 20; cycle++) {
      limiter.recordFailure(IP);
      const delay = limiter.retryAfterMs(IP);
      delays.push(delay);
      vi.advanceTimersByTime(delay);
    }
    const last = delays.at(-1)!;
    const secondToLast = delays.at(-2)!;
    expect(last).toBe(MAX_DELAY_MS);
    expect(secondToLast).toBe(MAX_DELAY_MS);
  });

  it("tracks failures per IP independently", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 6; i++) limiter.recordFailure(IP);
    expect(limiter.retryAfterMs(IP)).toBeGreaterThan(0);
    expect(limiter.retryAfterMs("198.51.100.9")).toBe(0);
  });

  it("clears the lockout and failure count on a recorded success", () => {
    const limiter = new LoginRateLimiter();
    for (let i = 0; i < 6; i++) limiter.recordFailure(IP);
    expect(limiter.retryAfterMs(IP)).toBeGreaterThan(0);

    limiter.recordSuccess(IP);
    expect(limiter.retryAfterMs(IP)).toBe(0);

    // And the free-attempt budget is available again from scratch.
    for (let i = 0; i < 5; i++) {
      expect(limiter.retryAfterMs(IP)).toBe(0);
      limiter.recordFailure(IP);
    }
  });
});
