import type { AssistantStream, AssistantStreamChunk } from "assistant-stream";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import type { BackendSocket } from "./backendSocket.js";
import type { SessionWire } from "./protocol.js";

/**
 * assistant-ui's documented seam for a backend-owned session list
 * (RemoteThreadListRuntime, PLAN.md §2/§6). Every method is a thin
 * pass-through to this project's own backend over BackendSocket, which in
 * turn maps to OpenClaw's `sessions.*` RPCs (see
 * server/src/gateway/gatewayAdapter.ts) — OpenClaw's per-agent SQLite
 * remains the actual source of truth; this UI keeps no session store of
 * its own (PLAN.md §6).
 */
export function createThreadListAdapter(socket: Pick<BackendSocket, "request">): RemoteThreadListAdapter {
  return {
    async list() {
      const sessions = await socket.request<SessionWire[]>({ type: "sessions.list" });
      return { threads: sessions.map(toThreadMetadata) };
    },

    async initialize() {
      const session = await socket.request<SessionWire>({ type: "sessions.create" });
      return { remoteId: session.sessionKey, externalId: session.sessionKey };
    },

    async rename(remoteId, title) {
      await socket.request({ type: "sessions.rename", sessionKey: remoteId, title });
    },

    async archive(remoteId) {
      await socket.request({ type: "sessions.archive", sessionKey: remoteId });
    },

    async unarchive(remoteId) {
      await socket.request({ type: "sessions.unarchive", sessionKey: remoteId });
    },

    async delete(remoteId) {
      await socket.request({ type: "sessions.delete", sessionKey: remoteId });
    },

    async fetch(threadId) {
      const session = await socket.request<SessionWire>({ type: "sessions.get", sessionKey: threadId });
      return toThreadMetadata(session);
    },

    // OpenClaw already generates a title for each session server-side
    // (PLAN.md §1.1) and pushes it through sessions.changed — there's
    // nothing for this UI to generate. An immediately-closed stream is
    // assistant-ui's own documented no-op shape (mirrors
    // InMemoryThreadListAdapter.generateTitle in @assistant-ui/core).
    async generateTitle(): Promise<AssistantStream> {
      return new ReadableStream<AssistantStreamChunk>({
        start(controller) {
          controller.close();
        },
      });
    },
  };
}

function toThreadMetadata(session: SessionWire) {
  return {
    remoteId: session.sessionKey,
    externalId: session.sessionKey,
    title: session.title,
    status: (session.archived ? "archived" : "regular") as "archived" | "regular",
  };
}
