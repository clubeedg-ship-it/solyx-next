import { useAui, useLocalRuntime, useRemoteThreadListRuntime } from "@assistant-ui/react";
import { createChatModelAdapter } from "./chatModelAdapter.js";
import { createThreadHistoryAdapter } from "./historyAdapter.js";
import { createThreadListAdapter } from "./threadListAdapter.js";
import type { BackendSocket } from "./backendSocket.js";

/**
 * Wires assistant-ui's two documented extension points together into one
 * runtime (PLAN.md §2/§6):
 *   - RemoteThreadListRuntime owns the session list, backed by this
 *     project's backend (createThreadListAdapter).
 *   - Each active thread gets its own useLocalRuntime + ChatModelAdapter,
 *     bound to that thread's session key (createChatModelAdapter), plus a
 *     ThreadHistoryAdapter that reloads that session's transcript so a page
 *     refresh reopens the conversation instead of an empty window
 *     (createThreadHistoryAdapter).
 *
 * `runtimeHook` is called by assistant-ui inside a
 * ThreadListItemRuntimeProvider for whichever thread is active, which is
 * what makes `useAui().threadListItem` resolve to the right thread here —
 * this is the same mechanism @assistant-ui/core's own cloud adapter uses
 * internally (see useCloudThreadListRuntime in the installed package).
 */
export function useBackendRuntime(socket: BackendSocket) {
  return useRemoteThreadListRuntime({
    runtimeHook: () => {
      const aui = useAui();
      const sessionKey = aui.threadListItem.getState().remoteId ?? aui.threadListItem.getState().id;
      return useLocalRuntime(createChatModelAdapter(socket, sessionKey), {
        adapters: { history: createThreadHistoryAdapter(socket, sessionKey) },
      });
    },
    adapter: createThreadListAdapter(socket),
  });
}
