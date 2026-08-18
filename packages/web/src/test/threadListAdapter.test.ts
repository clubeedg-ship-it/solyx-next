import { describe, expect, it, vi } from "vitest";
import { createThreadListAdapter } from "../runtime/threadListAdapter.js";
import type { BackendSocket } from "../runtime/backendSocket.js";
import type { ClientFrame } from "../runtime/protocol.js";

function createFakeSocket(responses: Partial<Record<ClientFrame["type"], unknown>>) {
  const calls: ClientFrame[] = [];
  const socket: Pick<BackendSocket, "request"> = {
    request: vi.fn(async (frame) => {
      calls.push({ ...frame, id: "test" } as ClientFrame);
      return responses[frame.type as ClientFrame["type"]];
    }) as BackendSocket["request"],
  };
  return { socket, calls };
}

describe("createThreadListAdapter", () => {
  it("list() maps SessionWire[] to RemoteThreadMetadata, archived mapped to status", async () => {
    const fake = createFakeSocket({
      "sessions.list": [
        { sessionKey: "s1", title: "Besparingen", updatedAt: "2026-08-14T09:12:00.000Z", archived: false },
        { sessionKey: "s2", title: "Oud", updatedAt: "2026-08-14T09:12:00.000Z", archived: true },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    const result = await adapter.list();

    expect(result.threads).toEqual([
      {
        remoteId: "s1",
        externalId: "s1",
        title: "Besparingen",
        status: "regular",
        lastMessageAt: new Date("2026-08-14T09:12:00.000Z"),
      },
      {
        remoteId: "s2",
        externalId: "s2",
        title: "Oud",
        status: "archived",
        lastMessageAt: new Date("2026-08-14T09:12:00.000Z"),
      },
    ]);
  });

  it("list() returns one thread per session, including placeholder-titled ones", async () => {
    // The adapter has never been the thing that filtered the list — the sidebar
    // was. Guard against a filter creeping back in here.
    const fake = createFakeSocket({
      "sessions.list": [
        { sessionKey: "s1", title: "New chat", updatedAt: "2026-08-14T09:12:00.000Z", archived: false },
        { sessionKey: "s2", title: "New chat", updatedAt: "2026-08-15T09:12:00.000Z", archived: false },
        { sessionKey: "s3", title: "New chat", updatedAt: "2026-08-16T09:12:00.000Z", archived: false },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    const result = await adapter.list();

    expect(result.threads.length).toBe(3);
  });

  it("initialize() creates a session and returns its key as remoteId", async () => {
    const fake = createFakeSocket({
      "sessions.create": { sessionKey: "s9", title: "", updatedAt: "t9", archived: false },
    });
    const adapter = createThreadListAdapter(fake.socket);

    const result = await adapter.initialize("local-1");

    expect(result).toEqual({ remoteId: "s9", externalId: "s9" });
  });

  it("rename/archive/unarchive/delete forward to the matching backend frame", async () => {
    const fake = createFakeSocket({});
    const adapter = createThreadListAdapter(fake.socket);

    await adapter.rename("s1", "Nieuwe titel");
    await adapter.archive("s1");
    await adapter.unarchive("s1");
    await adapter.delete("s1");

    expect(fake.calls).toEqual([
      { id: "test", type: "sessions.rename", sessionKey: "s1", title: "Nieuwe titel" },
      { id: "test", type: "sessions.archive", sessionKey: "s1" },
      { id: "test", type: "sessions.unarchive", sessionKey: "s1" },
      { id: "test", type: "sessions.delete", sessionKey: "s1" },
    ]);
  });

  it("fetch() maps a single session to RemoteThreadMetadata", async () => {
    const fake = createFakeSocket({
      "sessions.get": { sessionKey: "s1", title: "Onderhoud", updatedAt: "t1", archived: false },
    });
    const adapter = createThreadListAdapter(fake.socket);

    await expect(adapter.fetch("s1")).resolves.toEqual({
      remoteId: "s1",
      externalId: "s1",
      title: "Onderhoud",
      status: "regular",
    });
  });

  it("fetch() carries updatedAt through as lastMessageAt", async () => {
    // Same mapper as list(), so this proves the metadata is not dropped on the
    // single-session path either.
    const fake = createFakeSocket({
      "sessions.get": {
        sessionKey: "s1",
        title: "Onderhoud",
        updatedAt: "2026-08-14T09:12:00.000Z",
        archived: false,
      },
    });
    const adapter = createThreadListAdapter(fake.socket);

    await expect(adapter.fetch("s1")).resolves.toEqual({
      remoteId: "s1",
      externalId: "s1",
      title: "Onderhoud",
      status: "regular",
      lastMessageAt: new Date("2026-08-14T09:12:00.000Z"),
    });
  });

  it("an unusable updatedAt yields lastMessageAt undefined, never an Invalid Date", async () => {
    const fake = createFakeSocket({
      "sessions.list": [
        { sessionKey: "s1", title: "Besparingen", updatedAt: "t1", archived: false },
        { sessionKey: "s2", title: "Oud", updatedAt: "", archived: false },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    const result = await adapter.list();

    for (const thread of result.threads) {
      expect(thread).toHaveProperty("lastMessageAt");
      expect((thread as { lastMessageAt?: Date }).lastMessageAt).toBeUndefined();
    }
  });

  it("generateTitle() returns an immediately-closed stream (OpenClaw titles sessions itself)", async () => {
    const fake = createFakeSocket({});
    const adapter = createThreadListAdapter(fake.socket);

    const stream = await adapter.generateTitle("s1", []);
    const reader = stream.getReader();
    const { done } = await reader.read();

    expect(done).toBe(true);
  });
});

describe("createThreadListAdapter · messageCount", () => {
  // Shared wire contract for this round: SessionWire gains one optional
  // `messageCount`. RemoteThreadMetadata has no field for it, so it rides in
  // `custom`, which assistant-ui copies verbatim into ThreadListItemState.custom
  // and hands to the row renderer.
  it("list() carries messageCount through as custom.messageCount", async () => {
    const fake = createFakeSocket({
      "sessions.list": [
        {
          sessionKey: "s1",
          title: "Besparingen",
          updatedAt: "2026-08-14T09:12:00.000Z",
          archived: false,
          messageCount: 7,
        },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    const result = await adapter.list();

    expect(result.threads[0]).toMatchObject({ custom: { messageCount: 7 } });
  });

  it("list() distinguishes messageCount 0 from a missing messageCount", async () => {
    const fake = createFakeSocket({
      "sessions.list": [
        { sessionKey: "s1", title: "New chat", updatedAt: "2026-08-14T09:12:00.000Z", archived: false, messageCount: 0 },
        { sessionKey: "s2", title: "New chat", updatedAt: "2026-08-14T09:12:00.000Z", archived: false },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    const [empty, unknown] = (await adapter.list()).threads;

    expect(empty).toMatchObject({ custom: { messageCount: 0 } });
    expect(unknown).not.toHaveProperty("custom");
  });

  it("fetch() carries messageCount through as custom.messageCount", async () => {
    const fake = createFakeSocket({
      "sessions.get": {
        sessionKey: "s1",
        title: "Onderhoud",
        updatedAt: "2026-08-14T09:12:00.000Z",
        archived: false,
        messageCount: 2,
      },
    });
    const adapter = createThreadListAdapter(fake.socket);

    await expect(adapter.fetch("s1")).resolves.toMatchObject({ custom: { messageCount: 2 } });
  });

  it("list() omits custom entirely when the wire has no messageCount (unknown, never 0)", async () => {
    // A server that predates the field must not make every session look empty
    // and therefore bulk-deletable.
    const fake = createFakeSocket({
      "sessions.list": [
        { sessionKey: "s1", title: "Besparingen", updatedAt: "2026-08-14T09:12:00.000Z", archived: false },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    expect((await adapter.list()).threads[0]).not.toHaveProperty("custom");
  });

  it("list() treats a non-numeric, negative or fractional messageCount as unknown rather than 0", async () => {
    const fake = createFakeSocket({
      "sessions.list": [
        { sessionKey: "s1", title: "a", updatedAt: "2026-08-14T09:12:00.000Z", archived: false, messageCount: "0" },
        { sessionKey: "s2", title: "b", updatedAt: "2026-08-14T09:12:00.000Z", archived: false, messageCount: -1 },
        { sessionKey: "s3", title: "c", updatedAt: "2026-08-14T09:12:00.000Z", archived: false, messageCount: 1.5 },
        { sessionKey: "s4", title: "d", updatedAt: "2026-08-14T09:12:00.000Z", archived: false, messageCount: Number.NaN },
      ],
    });
    const adapter = createThreadListAdapter(fake.socket);

    for (const thread of (await adapter.list()).threads) {
      expect(thread).not.toHaveProperty("custom");
    }
  });
});
