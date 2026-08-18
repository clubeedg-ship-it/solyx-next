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

    // OpenClaw does NOT generate a title for a session server-side — a live
    // check against the Gateway found 42 sessions on the `solyx` agent, all
    // with zero labels. Titling instead happens on this project's own
    // backend, from the first chat message, the moment it's sent — see
    // wsServer.ts's chat.send handler and its deriveTitle.ts helper — and
    // is pushed to every client through sessions.changed. That's still
    // nothing for *this* adapter method to do: assistant-ui only calls
    // generateTitle from its own generate-on-demand flow, which this app
    // never triggers, so an immediately-closed stream is correct here
    // regardless of where titling happens (mirrors
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
    // assistant-ui's own field for "when was this last touched" — Sidebar.tsx
    // reads it (via relativeTime.ts) to show "3h", "2d", etc. next to each
    // row. The wire only ever carries updatedAt as an ISO string (see
    // protocol.ts); this is the one place that turns it into the Date
    // RemoteThreadMetadata expects.
    lastMessageAt: new Date(session.updatedAt),
    // RemoteThreadMetadata has no dedicated field for "is this a real,
    // server-assigned title" — `custom` is the documented free-form bag for
    // exactly this kind of extra per-thread data, and it's what
    // threadListFilter.ts's isUntitledThread reads to decide what
    // Sidebar.tsx lists (replacing an earlier, fragile string match against
    // the literal "New chat" placeholder).
    custom: { hasTitle: session.hasTitle },
  };
}
