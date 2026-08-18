import { describe, expect, it } from "vitest";
import { DraftSelectionStore, extractPostId } from "../runtime/draftSelection.js";
import type { BackendSocket } from "../runtime/backendSocket.js";
import type { ServerFrame } from "../runtime/protocol.js";

describe("extractPostId", () => {
  it("reads postId, post_id, pageId, page_id, or id, in that order", () => {
    expect(extractPostId({ postId: 42 })).toBe("42");
    expect(extractPostId({ post_id: "7" })).toBe("7");
    expect(extractPostId({ pageId: 3 })).toBe("3");
    expect(extractPostId({ id: "9" })).toBe("9");
  });

  it("returns null for non-numeric ids and non-object args", () => {
    expect(extractPostId({ id: "not-a-number" })).toBeNull();
    expect(extractPostId("just a string")).toBeNull();
    expect(extractPostId(null)).toBeNull();
    expect(extractPostId(undefined)).toBeNull();
  });
});

/** A fake with just the `.on` method DraftSelectionStore depends on. */
function createFakeSocket() {
  const handlers: ((frame: Extract<ServerFrame, { type: "tool.event" }>) => void)[] = [];
  return {
    on: ((_type: "tool.event", handler: (frame: Extract<ServerFrame, { type: "tool.event" }>) => void) => {
      handlers.push(handler);
      return () => {};
    }) as BackendSocket["on"],
    fireToolEvent: (frame: Extract<ServerFrame, { type: "tool.event" }>) => {
      for (const handler of handlers) handler(frame);
    },
  };
}

describe("DraftSelectionStore", () => {
  it("starts empty", () => {
    const fake = createFakeSocket();
    const store = new DraftSelectionStore(fake);
    expect(store.get()).toEqual({ currentPostId: null, drafts: [] });
  });

  it("selects the draft a tool.event points at and notifies subscribers", () => {
    const fake = createFakeSocket();
    const store = new DraftSelectionStore(fake);
    const seen: string[] = [];
    store.subscribe((state) => seen.push(String(state.currentPostId)));

    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "wordpress.editDraft", at: "t1", args: { postId: 1 } });

    expect(store.get().currentPostId).toBe("1");
    expect(seen).toEqual(["1"]);
  });

  it("ignores tool.events with no extractable post id", () => {
    const fake = createFakeSocket();
    const store = new DraftSelectionStore(fake);
    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "unrelated.tool", at: "t1", args: {} });
    expect(store.get()).toEqual({ currentPostId: null, drafts: [] });
  });

  it("moves a re-touched draft to the front instead of duplicating it", () => {
    const fake = createFakeSocket();
    const store = new DraftSelectionStore(fake);

    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "a", at: "t1", args: { postId: 1 } });
    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "b", at: "t2", args: { postId: 2 } });
    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "c", at: "t3", args: { postId: 1 } });

    const { drafts } = store.get();
    expect(drafts.map((d) => d.postId)).toEqual(["1", "2"]);
    expect(drafts[0]).toMatchObject({ postId: "1", label: "c", updatedAt: "t3" });
  });

  it("select() only accepts a postId already present in drafts", () => {
    const fake = createFakeSocket();
    const store = new DraftSelectionStore(fake);
    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "a", at: "t1", args: { postId: 1 } });
    fake.fireToolEvent({ type: "tool.event", sessionKey: "s1", tool: "b", at: "t2", args: { postId: 2 } });

    store.select("1");
    expect(store.get().currentPostId).toBe("1");

    store.select("999");
    expect(store.get().currentPostId).toBe("1");
  });
});
