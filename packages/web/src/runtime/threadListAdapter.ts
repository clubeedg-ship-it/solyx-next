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

    // No client-side title generation. This used to claim OpenClaw generates a
    // title server-side and pushes it through sessions.changed; that is false —
    // 0 of the 31 live sessions has ever carried a generated label, which is
    // exactly why rows are labelled from timestamp and messageCount instead
    // (runtime/threadListFilter.ts). The behaviour is unchanged: generating a
    // title here would cost a model call per session and still not be the
    // backend's truth. An immediately-closed stream is assistant-ui's own
    // documented no-op shape (mirrors InMemoryThreadListAdapter.generateTitle
    // in @assistant-ui/core).
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
  const messageCount = normalizeMessageCount(session.messageCount);

  return {
    remoteId: session.sessionKey,
    externalId: session.sessionKey,
    title: session.title,
    status: (session.archived ? "archived" : "regular") as "archived" | "regular",
    // `lastMessageAt` is a first-class field of assistant-ui's own
    // RemoteThreadMetadata and reaches the row renderer as
    // ThreadListItemState.lastMessageAt, so the wire needs nothing new: the
    // information was already on SessionWire.updatedAt and was simply being
    // dropped here. The sidebar needs it because every untitled session
    // carries the identical title "New chat".
    lastMessageAt: parseUpdatedAt(session.updatedAt),
    // messageCount has no first-class field, so it rides in `custom`, which
    // RemoteThreadMetadata declares and assistant-ui copies verbatim into
    // ThreadListItemState.custom (remote-thread-state.js:30). The key is
    // omitted entirely when the count is unknown: an empty-but-present bag
    // would still read as "known" to anything that only checks for `custom`.
    ...(messageCount === undefined ? {} : { custom: { messageCount } }),
  };
}

/**
 * `messageCount` is optional on the wire and, per the shared wire contract,
 * absent means UNKNOWN — never zero. Anything that is not a non-negative
 * integer is treated as absent, because the sidebar offers zero-count sessions
 * for bulk deletion and a garbled value must not put a live conversation in
 * that set.
 */
function normalizeMessageCount(messageCount: number | undefined): number | undefined {
  if (typeof messageCount !== "number" || !Number.isInteger(messageCount) || messageCount < 0) {
    return undefined;
  }
  return messageCount;
}

/**
 * `updatedAt` is an opaque string on the wire (protocol.ts) — the gateway is
 * the only thing that formats it, and nothing validates it. Return undefined
 * rather than an Invalid Date so a malformed value can never be rendered.
 */
function parseUpdatedAt(updatedAt: string | undefined): Date | undefined {
  if (!updatedAt) return undefined;
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
