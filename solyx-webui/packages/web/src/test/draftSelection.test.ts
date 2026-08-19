import { describe, expect, it } from "vitest";
import { DraftSelectionStore, extractPostId } from "../runtime/draftSelection.js";
import type { BackendSocket } from "../runtime/backendSocket.js";
import type { ServerFrame } from "../runtime/protocol.js";

// Fixtures below are VERBATIM payloads captured off the live Gateway on
// 2026-08-18 with a throwaway GatewayClient probe. Until then the shape here
// was a guess (see the old key list: postId/post_id/pageId/page_id/id) and
// every one of those guesses was wrong: the real tool payload nests the tool
// arguments one level down under `args`.
const OPEN_DRAFT_START = {
  phase: "start",
  name: "mcp__solyx-wp__open_draft",
  toolCallId: "toolu_01WUxcgycLmqDHpPD1tSSru9",
  args: { page_id: 626 },
};

const OPEN_DRAFT_RESULT = {
  phase: "result",
  name: "mcp__solyx-wp__open_draft",
  toolCallId: "toolu_01WUxcgycLmqDHpPD1tSSru9",
  isError: false,
  result: [
    {
      type: "text",
      text:
        "(existing draft reopened)\n\ndraft 1405 \"Home\"   rev: d78f4e   " +
        "preview: https://2026.solyxenergy.nl/wp-json/solyx-agent/v1/drafts/1405/preview\n",
    },
  ],
};

const EDIT_SLOT_START = {
  phase: "start",
  name: "mcp__solyx-wp__edit_slot",
  toolCallId: "toolu_01abc",
  args: { draft_id: 1405, rev: "d78f4e", slot_id: 5, text: "Stop met het verspillen van jouw zonne-energie." },
};

describe("extractPostId", () => {
  it("reads draft_id out of the nested args of an edit_slot event", () => {
    expect(extractPostId(EDIT_SLOT_START)).toBe("1405");
  });

  it("recovers the draft id from an open_draft result body", () => {
    expect(extractPostId(OPEN_DRAFT_RESULT)).toBe("1405");
  });

  it("refuses to treat page_id as a draft id", () => {
    // /api/draft/:id proxies to WordPress as `?p=<id>&preview=true`, so
    // answering 626 here would render the PUBLISHED Home page and label it
    // the draft — worse than showing nothing. open_draft start carries only
    // the page id, so the panel must wait for the result that names 1405.
    expect(extractPostId(OPEN_DRAFT_START)).toBeNull();
  });

  it("still reads an unambiguous top-level draft identifier", () => {
    expect(extractPostId({ postId: 42 })).toBe("42");
    expect(extractPostId({ draft_id: "7" })).toBe("7");
  });

  it("returns null for non-numeric ids and non-object payloads", () => {
    expect(extractPostId({ postId: "not-a-number" })).toBeNull();
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

// The panel must reflect what is actually saved in WordPress, not only what it
// happened to watch the agent touch. GET /api/drafts is the server's list of
// every existing draft (see server/src/proxy/draftProxy.ts fetchDraftList).
describe("DraftSelectionStore.loadFromServer", () => {
  function fetchReturning(body: unknown, ok = true) {
    return async () => ({ ok, json: async () => body }) as unknown as Response;
  }

  it("fills the selector from the drafts that exist in WordPress", async () => {
    const store = new DraftSelectionStore(createFakeSocket());
    await store.loadFromServer(fetchReturning({
      drafts: [
        { draftId: "1405", pageId: 626, title: "Home", slug: "gs-home-fse" },
        { draftId: "1403", pageId: 784, title: "Besparen", slug: "besparen" },
      ],
    }));
    expect(store.get().drafts.map((d) => [d.postId, d.label])).toEqual([
      ["1405", "Home"],
      ["1403", "Besparen"],
    ]);
  });

  it("selects the first draft so the panel is never blank when drafts exist", async () => {
    const store = new DraftSelectionStore(createFakeSocket());
    await store.loadFromServer(fetchReturning({ drafts: [{ draftId: "1405", title: "Home" }] }));
    expect(store.get().currentPostId).toBe("1405");
  });

  it("does not duplicate a draft the agent already touched this session", async () => {
    const fake = createFakeSocket();
    const store = new DraftSelectionStore(fake);
    fake.fireToolEvent({
      type: "tool.event", sessionKey: "s1", tool: "mcp__solyx-wp__edit_slot", at: "t1",
      args: { phase: "start", name: "mcp__solyx-wp__edit_slot", args: { draft_id: 1405 } },
    } as never);
    await store.loadFromServer(fetchReturning({ drafts: [{ draftId: "1405", title: "Home" }] }));
    expect(store.get().drafts.filter((d) => d.postId === "1405")).toHaveLength(1);
  });

  it("leaves the current list alone when the request fails", async () => {
    const store = new DraftSelectionStore(createFakeSocket());
    await store.loadFromServer(fetchReturning({}, false));
    expect(store.get()).toEqual({ currentPostId: null, drafts: [] });
  });
});
