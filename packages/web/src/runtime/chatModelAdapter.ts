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
 * One adapter instance is bound to one session (sessionKey) — assistant-ui's
 * RemoteThreadListRuntime creates a fresh per-thread runtime via its
 * `runtimeHook`, which is where this factory is called (see threadListAdapter.ts).
 */
export function createChatModelAdapter(socket: Pick<BackendSocket, "on" | "request">, sessionKey: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions) {
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
