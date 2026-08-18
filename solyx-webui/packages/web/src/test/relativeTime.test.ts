import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../runtime/relativeTime.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe("formatRelativeTime", () => {
  it("reads as 'just now' for anything under a minute old", () => {
    expect(formatRelativeTime(secondsAgo(0), NOW)).toBe("just now");
    expect(formatRelativeTime(secondsAgo(59), NOW)).toBe("just now");
  });

  it("reads in minutes once at least a minute has passed", () => {
    expect(formatRelativeTime(secondsAgo(60), NOW)).toBe("1m");
    expect(formatRelativeTime(secondsAgo(5 * 60), NOW)).toBe("5m");
    expect(formatRelativeTime(secondsAgo(59 * 60), NOW)).toBe("59m");
  });

  it("reads in hours once at least an hour has passed", () => {
    expect(formatRelativeTime(secondsAgo(60 * 60), NOW)).toBe("1h");
    expect(formatRelativeTime(secondsAgo(3 * 60 * 60), NOW)).toBe("3h");
    expect(formatRelativeTime(secondsAgo(23 * 60 * 60), NOW)).toBe("23h");
  });

  it("reads in days once at least a day has passed", () => {
    expect(formatRelativeTime(secondsAgo(24 * 60 * 60), NOW)).toBe("1d");
    expect(formatRelativeTime(secondsAgo(2 * 24 * 60 * 60), NOW)).toBe("2d");
    expect(formatRelativeTime(secondsAgo(30 * 24 * 60 * 60), NOW)).toBe("30d");
  });

  it("treats a timestamp at or after 'now' as 'just now' rather than going negative", () => {
    // Clock skew between this backend and the Gateway, or a timestamp
    // captured a moment after `now` was read, must never render as "-3s".
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(new Date(NOW.getTime() + 5000), NOW)).toBe("just now");
  });

  it("defaults `now` to the current time when not supplied", () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });
});
