import { describe, expect, it } from "vitest";
import { isUntitledThread } from "../runtime/threadListFilter.js";

describe("isUntitledThread", () => {
  it("treats hasTitle:false as untitled", () => {
    expect(isUntitledThread(false)).toBe(true);
  });

  it("treats hasTitle:undefined (an older/unknown item) as untitled", () => {
    // custom is an untyped bag (RemoteThreadMetadata.custom), so a thread
    // item that somehow never got hasTitle set reads the same as false —
    // fail closed (hidden), not open (shown as a fake "New chat" row).
    expect(isUntitledThread(undefined)).toBe(true);
  });

  it("treats hasTitle:true as titled, regardless of what the title text happens to be", () => {
    // This is the whole point of switching off the old string match: a
    // session whose real, server-assigned title happens to equal the
    // literal placeholder text no longer gets hidden by mistake.
    expect(isUntitledThread(true)).toBe(false);
  });
});
