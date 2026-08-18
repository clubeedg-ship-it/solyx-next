import { useEffect, useMemo, useState } from "react";
import { ComposerPrimitive, ErrorPrimitive, MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { createComposerSubmitHandler } from "../runtime/composerSubmit.js";
import { EditableChatTitle } from "./EditableChatTitle.js";
import { MarkdownText } from "./MarkdownText.js";
import { ThreadReadiness, type ThreadReadinessStatus } from "../runtime/threadReadiness.js";

// What every genuinely untitled session shows until it has one (see
// server/src/ws/deriveTitle.ts's FALLBACK_TITLE — kept as a separate literal
// here rather than imported, since this is the browser package and that
// module lives in the server one; the two are already duplicated across the
// wire boundary the same way protocol.ts is).
const UNTITLED_CHAT = "New chat";

const CANT_REACH_SOL = "Sol can't be reached right now. Your message is still in the box — try sending again in a moment.";

let nextNoticeId = 0;

/**
 * Assistant replies are markdown; assistant-ui's built-in Text part renders a
 * raw string, so without this override every heading, list and bold run
 * reached the screen as its source characters. Declared once at module scope
 * rather than inline at the call site: a fresh object on every render would
 * defeat the part-level memoization MarkdownText relies on while streaming.
 *
 * User messages deliberately do not get it — what she typed stays literal.
 */
const assistantMessageParts = { Text: MarkdownText };

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
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

  // The main thread's own title, not "Sol" — this used to be a hardcoded
  // assistant-name label; now the header shows (and lets you edit) the
  // actual session title. Read via `s.threads.threadItems`, not
  // `threadListItem` — see the comment on `threadListItemId` above for why
  // that context isn't available out here.
  const activeTitle = useAuiState((s) => s.threads.threadItems.find((item) => item.id === s.threads.mainThreadId)?.title);
  const displayTitle = activeTitle && activeTitle.trim().length > 0 ? activeTitle : UNTITLED_CHAT;

  useEffect(() => {
    setStatus(readiness.getStatus());
    return readiness.subscribe(setStatus);
  }, [readiness]);

  // Initialize the thread on mount, not only on send.
  //
  // This looks like the eager creation that was removed for spamming the
  // sidebar, and it is — but it is not optional. RemoteThreadListRuntime's
  // item store is populated from our `list()` adapter, which can only return
  // *persisted* sessions. Until `initialize()` runs there is an active main
  // thread with no matching item, so any resolution of that thread's list
  // item calls `getItemById` on an id the store has never seen and throws
  // "Entry not available in the store" (subscribable.ts) — on mount and on
  // every re-render, which is every keystroke. That crash is what made the
  // composer look dead.
  //
  // The sidebar clutter this used to cause is handled on the read side now:
  // runtime/threadListFilter.ts hides untitled/empty sessions from the list,
  // so an unused session is invisible rather than noise.
  useEffect(() => {
    void readiness.ensureReady();
  }, [readiness]);

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

  // @assistant-ui/core types ThreadListItemMethods.rename as returning
  // `void`, but thread-list-item-runtime-client.js assigns it directly
  // from ThreadListItemRuntime.rename, whose own signature — and actual
  // implementation — is `Promise<void>` (confirmed by reading the
  // installed package). The cast below corrects that upstream type gap;
  // it changes nothing about what actually runs. EditableChatTitle needs
  // the real promise to know whether the rename succeeded, so it can roll
  // back and show *why* on failure rather than silently doing nothing.
  const renameActiveThread = (newTitle: string): Promise<void> =>
    aui.threadListItem.rename(newTitle) as unknown as Promise<void>;

  return (
    <section className="chat-pane">
      <header className="chat-header">
        <EditableChatTitle title={displayTitle} onRename={renameActiveThread} onErrorChange={setTitleError} />
        <ThreadPrimitive.If running>
          <span className="chat-status" data-busy="true">
            <span className="status-dot" aria-hidden="true" />
            Working
          </span>
        </ThreadPrimitive.If>
      </header>
      {titleError && (
        // Same shape as the send-error banner below (lead + detail), just
        // scoped to the header instead of the message column — the Gateway's
        // own rename failure reason is what's actually useful here, same
        // reasoning as MessageBubble's ErrorPrimitive.Message below.
        <div className="message-error chat-header-error" role="alert">
          <span className="message-error-lead">Couldn't rename this chat.</span>
          <span className="message-error-detail">{titleError}</span>
        </div>
      )}
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
        <MessagePrimitive.Content components={isAssistant ? assistantMessageParts : undefined} />
        {isAssistant && (
          <MessagePrimitive.If last>
            <ThreadPrimitive.If running>
              {/* Only the pre-text "thinking" state lives here. Once text
                  starts arriving the blinking cursor is drawn by styles.css
                  from the markdown container's [data-status="running"], so it
                  sits at the end of the last line — an inline sibling placed
                  after block-level markdown lands on a line of its own. */}
              <MessagePrimitive.If hasContent={false}>
                <span className="message-thinking" role="status" aria-label="Sol is thinking">
                  <span className="thinking-orb" aria-hidden="true" />
                  <span className="thinking-label" aria-hidden="true">
                    Thinking
                  </span>
                </span>
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
