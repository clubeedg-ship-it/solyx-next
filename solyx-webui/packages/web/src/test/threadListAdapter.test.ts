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
        { sessionKey: "s1", title: "Besparingen", updatedAt: "2026-08-12T00:00:00.000Z", hasTitle: true, archived: false },
        { sessionKey: "s2", title: "Oud", updatedAt: "2026-08-10T00:00:00.000Z", hasTitle: true, archived: true },
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
        lastMessageAt: new Date("2026-08-12T00:00:00.000Z"),
      },
      {
        remoteId: "s2",
        externalId: "s2",
        title: "Oud",
        status: "archived",
        lastMessageAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ]);
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
      "sessions.get": {
        sessionKey: "s1",
        title: "Onderhoud",
        updatedAt: "2026-08-11T00:00:00.000Z",
        hasTitle: true,
        archived: false,
      },
    });
    const adapter = createThreadListAdapter(fake.socket);

    await expect(adapter.fetch("s1")).resolves.toEqual({
      remoteId: "s1",
      externalId: "s1",
      title: "Onderhoud",
      status: "regular",
      lastMessageAt: new Date("2026-08-11T00:00:00.000Z"),
    });
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
