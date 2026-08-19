import { useEffect, useMemo, useState } from "react";
import { ComposerPrimitive, ErrorPrimitive, MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { createComposerSubmitHandler } from "../runtime/composerSubmit.js";
import { ThreadReadiness, type ThreadReadinessStatus } from "../runtime/threadReadiness.js";
import { MarkdownText } from "./MarkdownText.js";

const CANT_REACH_SOL = "Sol can't be reached right now. Your message is still in the box — try sending again in a moment.";

let nextNoticeId = 0;

interface SendNotice {
  id: number;
  text: string;
}

/**
 * Middle column: the one ongoing conversation, streamed. All state comes
 * from the runtime built in runtime/useBackendRuntime.ts — this component
 * only arranges assistant-ui's Thread/Message/Composer primitives, plus a
 * thin readiness guard (see runtime/threadReadiness.ts and
 * runtime/composerSubmit.ts) around the one thing assistant-ui itself gets
 * wrong here: it silently discards a message — and any error — if the
 * thread's lazy session/thread creation fails on send. Typing itself was
 * never blocked by assistant-ui (LocalRuntime never disables the composer,
 * confirmed by reading its source and by live-testing this app against a
 * stub Gateway with session creation made to fail); the guard below closes
 * the actual gap: a send is only ever handed to assistant-ui's own
 * `composer.send()` once the thread is confirmed ready, so a not-ready
 * thread never touches — and can never clear — the typed text.
 *
 * The readiness check is lazy on purpose — it only runs from the submit
 * path below, never on mount/thread-switch. An earlier version ran it
 * eagerly on load to surface a broken backend as early as possible, but
 * `initialize()` is a real, persisted `sessions.create` — running it on
 * every page load created a fresh empty session every time, which spammed
 * the sidebar with "New chat" entries that never went away (see Sidebar.tsx
 * for the matching filter on the read side). Lazy-but-never-silent is the
 * balance: nothing is created until the user actually sends, and once they
 * do, `status` becomes visible (via the banner below) immediately and stays
 * bounded — see threadReadiness.ts's doc comment for why a naive
 * "wait for the promise to settle" check isn't enough against the real
 * Gateway, whose own request timeout is far longer than anyone would wait.
 */
export function ChatPane() {
  const aui = useAui();
  // Read from the list, not from `threadListItem` — that entry only exists
  // inside a ThreadListItem context and throws "Entry not available in the
  // store" out here. Used purely to rebuild readiness when the thread changes.
  const threadListItemId = useAuiState((s) => s.threads.mainThreadId);

  const readiness = useMemo(
    () => new ThreadReadiness(() => aui.threadListItem.initialize()),
    [aui, threadListItemId],
  );
  const [status, setStatus] = useState<ThreadReadinessStatus>(readiness.getStatus());
  const [sendErrors, setSendErrors] = useState<SendNotice[]>([]);

  useEffect(() => {
    setStatus(readiness.getStatus());
    return readiness.subscribe(setStatus);
  }, [readiness]);

  // No eager readiness call here. `initialize()` is a real, persisted
  // `sessions.create`, so running it on mount created and stored a session on
  // every page load — that is where 62 empty "New chat" rows came from. The
  // only caller is the submit path below, so a session now exists exactly
  // when the user has actually said something.
  //
  // The comment this replaces argued the eager call was load-bearing: that an
  // active main thread has no entry in RemoteThreadListRuntime's store until
  // `initialize()` runs, so resolving its list item throws "Entry not
  // available in the store" on every render. That is not true of the pinned
  // @assistant-ui/react 0.15.14. Its runtime constructor calls
  // switchToNewThread(), and _switchToNewThread() mints a local
  // `__LOCALID_<id>` thread with its own threadIdMap and threadData entries
  // (status "new", remoteId undefined) before any adapter call — so the entry
  // exists from the first render, unpersisted. classifyThreads() only ever
  // files "regular" and "archived" into threadIds, so that local thread is
  // also not a sidebar row while it is empty.

  // Shared by both the form's onSubmit (Enter key, ComposerPrimitive.Root)
  // and the Send button's own onClick below (ComposerPrimitive.Send) — see
  // createComposerSubmitHandler's doc comment for why using the same
  // handler at both call sites is what keeps a send from ever reaching
  // assistant-ui's own unguarded composer.send(). EmptyState's suggestion
  // chips below close the same class of bug a different way (no `send`
  // prop, so nothing to guard).
  const handleSubmit = createComposerSubmitHandler(
    {
      getText: () => aui.composer.getState().text,
      ensureReady: () => readiness.ensureReady(),
      send: () => aui.composer.send(),
    },
    (outcome) => {
      if (outcome.sent || outcome.reason === "empty") return;
      setSendErrors((prev) => [...prev, { id: nextNoticeId++, text: CANT_REACH_SOL }]);
    },
  );

  return (
    <section className="chat-pane">
      <header className="chat-header">
        <span className="chat-header-title">Sol</span>
        <ThreadPrimitive.If running>
          <span className="chat-status" data-busy="true">
            <span className="status-dot" aria-hidden="true" />
            Working
          </span>
        </ThreadPrimitive.If>
      </header>
      <ThreadPrimitive.Root className="thread-root">
        <ThreadPrimitive.Viewport className="thread-viewport">
          <div className="thread-column">
            <ThreadPrimitive.Empty>
              <EmptyState />
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages>{({ message }) => <MessageBubble role={message.role} />}</ThreadPrimitive.Messages>
            {sendErrors.map((notice) => (
              <div key={notice.id} className="message-error" role="alert">
                {notice.text}
              </div>
            ))}
          </div>
        </ThreadPrimitive.Viewport>
        <div className="composer-dock">
          <div className="composer-dock-inner">
            <ComposerPrimitive.Root className="composer" onSubmit={handleSubmit}>
              <ComposerPrimitive.Input className="composer-input" placeholder="Message Sol…" rows={1} />
              <div className="composer-actions">
                <ThreadPrimitive.If running={false}>
                  <ComposerPrimitive.Send className="composer-send" aria-label="Send message" onClick={handleSubmit}>
                    <SendIcon />
                  </ComposerPrimitive.Send>
                </ThreadPrimitive.If>
                <ThreadPrimitive.If running>
                  <ComposerPrimitive.Cancel className="composer-cancel" aria-label="Stop Sol">
                    <StopIcon />
                  </ComposerPrimitive.Cancel>
                </ThreadPrimitive.If>
              </div>
            </ComposerPrimitive.Root>
            {status === "unavailable" ? (
              <p className="composer-notice" role="status">
                Sol can't be reached right now. You can keep typing — sending will work again once it's back.
              </p>
            ) : status === "checking" ? (
              <p className="composer-notice" role="status">
                Connecting to Sol…
              </p>
            ) : (
              <p className="composer-hint">Enter to send, Shift + Enter for a new line</p>
            )}
          </div>
        </div>
      </ThreadPrimitive.Root>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="chat-empty">
      <span className="chat-empty-mark" aria-hidden="true">
        S
      </span>
      <h2 className="chat-empty-heading">What should we work on?</h2>
      <p className="chat-empty-subtext">
        Describe a change in plain English and Sol will draft it on the site. Nothing goes live until you say so.
      </p>
      <div className="chat-suggestions">
        {/* Fills the composer rather than sending immediately (no `send`
            prop) — assistant-ui's own suggestion-send path calls
            aui.thread.append() directly, bypassing the readiness guard
            above entirely, which is the same class of silent-failure bug
            this file exists to close. Funneling every send through one
            guarded path (Enter/Send) is worth the one extra keystroke. */}
        <ThreadPrimitive.Suggestion className="chat-suggestion" prompt="Update the homepage headline.">
          Update the homepage headline
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion className="chat-suggestion" prompt="Add a new FAQ entry.">
          Add a new FAQ entry
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion className="chat-suggestion" prompt="Rewrite the About page.">
          Rewrite the About page
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion className="chat-suggestion" prompt="Change the site's accent color.">
          Change the accent color
        </ThreadPrimitive.Suggestion>
      </div>
    </div>
  );
}

/**
 * One message row. Speakers are told apart by label, alignment, and weight —
 * not by colored chat bubbles. The trailing indicator on the last assistant
 * message doubles as two states: a "thinking" pulse before any text has
 * arrived, and a blinking cursor once it's streaming in.
 */
function MessageBubble({ role }: { role: "user" | "assistant" | "system" }) {
  const isAssistant = role === "assistant";
  return (
    <MessagePrimitive.Root className={`message message-${role}`}>
      <div className="message-meta">
        <span className="message-avatar" aria-hidden="true">
          {isAssistant ? "S" : "Y"}
        </span>
        <span className="message-name">{isAssistant ? "Sol" : "You"}</span>
      </div>
      <div className="message-body">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        {isAssistant && (
          <MessagePrimitive.If last>
            <ThreadPrimitive.If running>
              <MessagePrimitive.If hasContent={false}>
                <span className="message-thinking" role="status" aria-label="Sol is thinking">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </span>
              </MessagePrimitive.If>
              <MessagePrimitive.If hasContent>
                <span className="message-cursor" aria-hidden="true" />
              </MessagePrimitive.If>
            </ThreadPrimitive.If>
          </MessagePrimitive.If>
        )}
      </div>
      {isAssistant && (
        <MessagePrimitive.Error>
          {/* Show the reason, not just "something went wrong". The backend
              already forwards the Gateway's own message (server's
              assistant.error frame), and the failures that actually happen
              here are things a generic retry prompt is wrong about — an
              expired model credential doesn't resolve by sending again. The
              lead line stays plain English for a non-technical reader; the
              detail underneath is what makes the problem diagnosable. */}
          <ErrorPrimitive.Root className="message-error" role="alert">
            <span className="message-error-lead">Sol couldn't finish that.</span>
            <ErrorPrimitive.Message className="message-error-detail" />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
      )}
    </MessagePrimitive.Root>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 12.5V3.5M8 3.5 3.75 7.75M8 3.5l4.25 4.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="currentColor" />
    </svg>
  );
}
