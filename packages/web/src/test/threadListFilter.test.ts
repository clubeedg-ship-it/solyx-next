import { describe, expect, it } from "vitest";
import * as threadListFilter from "../runtime/threadListFilter.js";

// Namespace import on purpose: one of the assertions below is that a former
// export is gone, and a named import of a missing symbol would fail the whole
// file at link time instead of failing that one case.
const { threadRowLabel } = threadListFilter;

describe("threadListFilter", () => {
  it("the rule that hides threads is gone", () => {
    // isUntitledThread returned true for 100% of live sessions (0 of 31 have
    // ever carried a generated label), so Sidebar.tsx rendered an empty list.
    // The module decides display text now, never visibility.
    expect(Object.keys(threadListFilter)).not.toContain("isUntitledThread");
  });
});

describe("threadRowLabel", () => {
  it("a real title is used verbatim", () => {
    expect(
      threadRowLabel({ title: "Besparingen", lastMessageAt: new Date("2026-08-14T09:12:00Z") }),
    ).toBe("Besparingen");
  });

  it("the server placeholder is disambiguated by its timestamp", () => {
    // gatewayAdapter.ts normalizes every untitled session to exactly "New chat",
    // so the string alone cannot tell 31 sessions apart. Locale and time zone are
    // pinned inside threadRowLabel, so this string is host-independent.
    const label = threadRowLabel({
      title: "New chat",
      lastMessageAt: new Date("2026-08-14T09:12:00Z"),
    });

    expect(label).not.toBe("New chat");
    expect(label).toBe("New chat · 14 aug, 11:12");
  });

  it("two placeholder sessions with different timestamps get different labels", () => {
    const first = threadRowLabel({
      title: "New chat",
      lastMessageAt: new Date("2026-08-14T09:12:00Z"),
    });
    const second = threadRowLabel({
      title: "New chat",
      lastMessageAt: new Date("2026-08-15T16:40:00Z"),
    });

    expect(first).not.toBe(second);
  });

  it("a missing or unusable timestamp still yields a stable, non-empty label", () => {
    const missing = threadRowLabel({ title: undefined, lastMessageAt: undefined });
    const unusable = threadRowLabel({ title: "", lastMessageAt: new Date(NaN) });

    expect(missing).toBe("New chat");
    expect(unusable).toBe("New chat");
    for (const label of [missing, unusable]) {
      expect(label).not.toBe("");
      expect(label).not.toContain("undefined");
      expect(label).not.toContain("Invalid Date");
      expect(label.endsWith("· ")).toBe(false);
      expect(label.trim()).toBe(label);
    }
  });
});

describe("threadRowLabel · empty sessions", () => {
  // ChatPane mounts with an eager readiness.ensureReady(), so a session is
  // created on every page load and most of them never receive a message
  // (23 of 37 session files on core are header-only). A row has to say so,
  // otherwise the list is dozens of indistinguishable "New chat" entries.
  it("marks a session with messageCount 0 as empty", () => {
    const label = threadRowLabel({
      title: "New chat",
      lastMessageAt: new Date("2026-08-14T09:12:00Z"),
      messageCount: 0,
    });

    expect(label).toContain("leeg");
    // The timestamp still has to be there: two empty sessions must not collapse
    // into the same string.
    expect(label).toContain("14 aug, 11:12");
  });

  it("marks an already-titled empty session as empty too", () => {
    const label = threadRowLabel({
      title: "Besparingen",
      lastMessageAt: new Date("2026-08-14T09:12:00Z"),
      messageCount: 0,
    });

    expect(label).toContain("Besparingen");
    expect(label).toContain("leeg");
  });

  it("never marks a session empty when messageCount is undefined", () => {
    // Shared wire contract: the field is optional and undefined means UNKNOWN.
    // A live client conversation on an older server must never be labelled — or
    // bulk-deleted — as empty.
    const unknown = threadRowLabel({
      title: "New chat",
      lastMessageAt: new Date("2026-08-14T09:12:00Z"),
    });

    expect(unknown).not.toContain("leeg");
    expect(unknown).toBe("New chat · 14 aug, 11:12");
  });

  it("does not mark a session with messages as empty", () => {
    expect(
      threadRowLabel({
        title: "New chat",
        lastMessageAt: new Date("2026-08-14T09:12:00Z"),
        messageCount: 4,
      }),
    ).not.toContain("leeg");
  });
});

describe("readMessageCount", () => {
  it("reads a numeric count out of the custom bag", () => {
    expect(threadListFilter.readMessageCount({ messageCount: 0 })).toBe(0);
    expect(threadListFilter.readMessageCount({ messageCount: 7 })).toBe(7);
  });

  it("returns undefined for a missing, non-numeric, negative or fractional count", () => {
    // The custom bag is untyped (Record<string, unknown>) and comes off the
    // wire, so anything can be in it. Everything unrecognised has to read as
    // UNKNOWN — never as 0, which would offer a live session for bulk deletion.
    expect(threadListFilter.readMessageCount(undefined)).toBeUndefined();
    expect(threadListFilter.readMessageCount({})).toBeUndefined();
    expect(threadListFilter.readMessageCount({ messageCount: "0" })).toBeUndefined();
    expect(threadListFilter.readMessageCount({ messageCount: null })).toBeUndefined();
    expect(threadListFilter.readMessageCount({ messageCount: Number.NaN })).toBeUndefined();
    expect(threadListFilter.readMessageCount({ messageCount: -1 })).toBeUndefined();
    expect(threadListFilter.readMessageCount({ messageCount: 1.5 })).toBeUndefined();
  });
});

describe("selectEmptyThreadIds", () => {
  it("returns exactly the zero-count threads, archived ones included", () => {
    const ids = threadListFilter.selectEmptyThreadIds([
      { id: "t1", custom: { messageCount: 0 } },
      { id: "t2", custom: { messageCount: 3 } },
      { id: "t3", custom: undefined },
      { id: "t4", custom: { messageCount: 0 } },
    ]);

    expect(ids).toEqual(["t1", "t4"]);
  });

  it("returns no ids when every count is unknown", () => {
    expect(
      threadListFilter.selectEmptyThreadIds([{ id: "t1" }, { id: "t2", custom: {} }]),
    ).toEqual([]);
  });
});

describe("nextThreadAfterDelete", () => {
  it("keeps the open thread when someone else was deleted", () => {
    expect(
      threadListFilter.nextThreadAfterDelete({
        mainThreadId: "t1",
        deletedIds: ["t2"],
        regularIds: ["t1", "t3"],
      }),
    ).toEqual({ kind: "keep" });
  });

  it("switches to a surviving regular thread when the open one was deleted", () => {
    expect(
      threadListFilter.nextThreadAfterDelete({
        mainThreadId: "t1",
        deletedIds: ["t1"],
        regularIds: ["t1", "t3"],
      }),
    ).toEqual({ kind: "switch", threadId: "t3" });
  });

  it("asks for a new thread when nothing regular survives", () => {
    expect(
      threadListFilter.nextThreadAfterDelete({
        mainThreadId: "t1",
        deletedIds: ["t1", "t3"],
        regularIds: ["t1", "t3"],
      }),
    ).toEqual({ kind: "new" });
  });

  it("never returns an id that was just deleted", () => {
    // assistant-ui drops a deleted thread from its store but leaves
    // mainThreadId pointing at it (remote-thread-state.js:69-71), so the
    // sidebar has to move the user itself — onto something that still exists.
    const result = threadListFilter.nextThreadAfterDelete({
      mainThreadId: "t1",
      deletedIds: ["t1", "t2", "t3"],
      regularIds: ["t1", "t2", "t3", "t4"],
    });

    expect(result).toEqual({ kind: "switch", threadId: "t4" });
    if (result.kind === "switch") {
      expect(["t1", "t2", "t3"]).not.toContain(result.threadId);
    }
  });
});
