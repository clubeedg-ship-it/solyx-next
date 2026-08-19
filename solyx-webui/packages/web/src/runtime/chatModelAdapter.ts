import type { ChatModelAdapter, ChatModelRunOptions, ThreadMessage } from "@assistant-ui/react";
import { AsyncQueue } from "./asyncQueue.js";
import type { BackendSocket } from "./backendSocket.js";

/**
 * assistant-ui's documented extension point for a custom backend
 * (ChatModelAdapter.run(), see PLAN.md §2/§6). It never talks to OpenClaw
 * directly — it sends `chat.send` over the BackendSocket and streams back
 * whatever the backend forwards from the Gateway's `assistant` events. The
 * Gateway credential lives only in the backend process (see server/src/gateway).
 *
 * The session key is resolved per turn, not captured at construction, and that
 * is load-bearing. A thread exists locally before it is persisted: until
 * `initialize()` runs, assistant-ui's own `__LOCALID_<id>` is all there is, and
 * sessions are created lazily on first send so that a page load does not write
 * an empty one. Binding the key at construction therefore froze the adapter to
 * `__LOCALID_...`, which the Gateway cannot parse as `agent:<id>:<session>` —
 * it fell back to agent "main" and rejected every send with `invalid agent
 * params`. Resolving inside run() reads the key after the submit path has
 * awaited readiness, so it is the real one by then.
 */
export function createChatModelAdapter(
  socket: Pick<BackendSocket, "on" | "request">,
  resolveSessionKey: () => string,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions) {
      const sessionKey = resolveSessionKey();
      const text = extractLatestUserText(messages);
      const queue = new AsyncQueue<string>();

      const offDelta = socket.on("assistant.delta", (frame) => {
        if (frame.sessionKey === sessionKey) queue.push(frame.text);
      });
      const offDone = socket.on("assistant.done", (frame) => {
        if (frame.sessionKey === sessionKey) queue.end();
      });
      const offError = socket.on("assistant.error", (frame) => {
        if (frame.sessionKey === sessionKey) queue.fail(new Error(frame.error));
      });
      const onAbort = () => {
        void socket.request({ type: "chat.abort", sessionKey }).catch(() => {});
        queue.end();
      };
      abortSignal.addEventListener("abort", onAbort);

      try {
        await socket.request({ type: "chat.send", sessionKey, text });
        for await (const cumulativeText of queue) {
          // assistant-ui's contract: yield the full state each time, not a
          // delta — our backend already sends cumulative text per frame
          // (see server/src/gateway/types.ts AssistantDelta), so this is a
          // direct pass-through.
          yield { content: [{ type: "text" as const, text: cumulativeText }] };
        }
      } finally {
        offDelta();
        offDone();
        offError();
        abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

function extractLatestUserText(messages: readonly ThreadMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return "";
  return last.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}
