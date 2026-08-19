import { ExportedMessageRepository, type ThreadHistoryAdapter } from "@assistant-ui/react";
import type { BackendSocket } from "./backendSocket.js";
import type { HistoryMessageWire } from "./protocol.js";

/**
 * assistant-ui's documented seam for restoring a thread that already has a
 * past (LocalRuntimeOptions.adapters.history). LocalRuntime calls `load()`
 * when a thread mounts, which is what turns a page reload from an empty
 * window back into the conversation.
 *
 * Before this existed the UI had no transport for a transcript at all: the
 * only thing a reopened thread ever received was whatever turn happened to
 * still be in the backend's in-memory TurnStore, so anything older — and
 * everything at all after a backend restart — read as a brand new chat. The
 * messages were never lost; OpenClaw's per-agent store had them the whole
 * time and nothing ever asked for them.
 *
 * One adapter instance is bound to one session, like the ChatModelAdapter
 * beside it (see chatModelAdapter.ts).
 */
export function createThreadHistoryAdapter(
  socket: Pick<BackendSocket, "request">,
  resolveSessionKey: () => string,
): ThreadHistoryAdapter {
  return {
    async load() {
      // Resolved per load, for the same reason chatModelAdapter resolves per
      // turn: before initialize() there is only a local `__LOCALID_` id, and
      // asking the backend for its transcript is meaningless.
      const sessionKey = resolveSessionKey();
      if (sessionKey.startsWith("__LOCALID_")) return ExportedMessageRepository.fromArray([]);
      const messages = await socket.request<HistoryMessageWire[]>({
        type: "sessions.history",
        sessionKey,
      });
      // fromArray builds the linear parent chain and head id that
      // ExportedMessageRepository wants; these threads have no branches, so a
      // flat oldest-first list is the whole shape.
      return ExportedMessageRepository.fromArray(
        messages.map((message) => ({ role: message.role, content: message.text })),
      );
    },

    // OpenClaw persists every turn itself, the moment it happens — this UI is
    // a viewport onto that store, not a second copy of it (PLAN.md §6).
    // Writing here would either duplicate a message that is already saved or
    // invent a second source of truth for the transcript, so appending is
    // deliberately a no-op. `append` is required by the adapter type; `load`
    // is the half of it this backend can honestly implement.
    async append() {
      // intentionally empty — see above
    },
  };
}
