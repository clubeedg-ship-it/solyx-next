import { useAui, useLocalRuntime, useRemoteThreadListRuntime } from "@assistant-ui/react";
import { createChatModelAdapter, LOCAL_ID_PREFIX } from "./chatModelAdapter.js";

/** How long a send waits for the thread to be persisted before giving up. */
const RESOLVE_TIMEOUT_MS = 8000;
const RESOLVE_POLL_MS = 50;
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
      // Awaited, and it waits.
      //
      // `remoteId` is undefined until the thread is persisted, and it is
      // persisted lazily by the very send that needs the key. Capturing the
      // value froze both adapters to `__LOCALID_...`; reading it fresh per turn
      // was still too early, because the submit path awaits initialize() while
      // the runtime applies its result to the store afterwards, so the first
      // read can land in the gap between the two. That gap is why every first
      // message came back as `invalid agent params: agent "solyx" does not
      // match session key agent "main"` — the Gateway cannot parse a local id
      // as `agent:<id>:<session>` and falls back to the default agent.
      //
      // So: poll briefly for the id to appear, and if it never does, fail with
      // something a person can read instead of sending a key the Gateway will
      // reject. Sending a known-bad key is the one option that must not remain.
      const resolveSessionKey = async () => {
        const read = () => {
          const state = aui.threadListItem.getState();
          return state.remoteId ?? state.id;
        };
        let key = read();
        const deadline = Date.now() + RESOLVE_TIMEOUT_MS;
        while (key.startsWith(LOCAL_ID_PREFIX) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, RESOLVE_POLL_MS));
          key = read();
        }
        if (key.startsWith(LOCAL_ID_PREFIX)) {
          throw new Error("Sol kon dit gesprek niet openen.");
        }
        return key;
      };
      return useLocalRuntime(createChatModelAdapter(socket, resolveSessionKey), {
        adapters: { history: createThreadHistoryAdapter(socket, resolveSessionKey) },
      });
    },
    adapter: createThreadListAdapter(socket),
  });
}
