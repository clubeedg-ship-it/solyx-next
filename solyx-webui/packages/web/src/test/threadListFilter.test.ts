import { describe, expect, it } from "vitest";
import { isUntitledThread } from "../runtime/threadListFilter.js";

describe("isUntitledThread", () => {
  it("treats undefined as untitled", () => {
    expect(isUntitledThread(undefined)).toBe(true);
  });

  it("treats an empty or whitespace-only title as untitled", () => {
    expect(isUntitledThread("")).toBe(true);
    expect(isUntitledThread("   ")).toBe(true);
  });

  it("treats the server's own placeholder title as untitled", () => {
    // gatewayAdapter.ts's toSessionSummary normalizes an empty raw title to
    // exactly this string before it ever reaches the wire.
    expect(isUntitledThread("New chat")).toBe(true);
  });

  it("does not hide a real, generated title", () => {
    expect(isUntitledThread("Savings page")).toBe(false);
    expect(isUntitledThread("About us")).toBe(false);
  });
});
