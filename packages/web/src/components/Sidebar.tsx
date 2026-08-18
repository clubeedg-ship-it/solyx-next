import { useCallback, useState } from "react";
import { ThreadListItemPrimitive, ThreadListPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { authMode } from "../env.js";
import {
  nextThreadAfterDelete,
  readMessageCount,
  selectEmptyThreadIds,
  threadRowLabel,
} from "../runtime/threadListFilter.js";

/**
 * Left column: session list + "new chat". Backed entirely by
 * RemoteThreadListRuntime (runtime/threadListAdapter.ts) — this component
 * holds no session state of its own beyond the two delete confirmations, and
 * makes no decisions: what a row says, which sessions count as empty, and
 * where the user lands after a delete all come from
 * runtime/threadListFilter.ts. That split is deliberate — packages/web runs
 * vitest with environment "node" and no jsdom, so logic that lives here cannot
 * be tested at all.
 */
export function Sidebar() {
  const aui = useAui();
  const threadItems = useAuiState((s) => s.threads.threadItems);
  const regularIds = useAuiState((s) => s.threads.threadIds);
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
  const [confirmingBulk, setConfirmingBulk] = useState(false);

  const emptyThreadIds = selectEmptyThreadIds(threadItems);

  /**
   * The one place a session is deleted, per row and in bulk alike.
   * assistant-ui's own delete drops the thread from the store but leaves
   * mainThreadId pointing at it (@assistant-ui/core remote-thread-state.js:69-71),
   * so without the follow-up switch the user is left staring at a thread that
   * no longer exists. That is the common case here, not the edge case: the
   * open thread is usually the eagerly created empty one the bulk action
   * removes.
   */
  const deleteThreads = useCallback(
    (ids: readonly string[]) => {
      const deleted: string[] = [];
      for (const id of ids) {
        try {
          aui.threads.item({ id }).delete();
          deleted.push(id);
        } catch (error) {
          // One unknown or already-removed id must not abandon the rest of a
          // bulk delete. The thread stays in the list, which is the visible,
          // recoverable failure.
          console.error(`Kon gesprek ${id} niet verwijderen`, error);
        }
      }
      if (deleted.length === 0) return;

      const next = nextThreadAfterDelete({ mainThreadId, deletedIds: deleted, regularIds });
      if (next.kind === "switch") aui.threads.switchToThread(next.threadId);
      else if (next.kind === "new") aui.threads.switchToNewThread();
    },
    [aui, mainThreadId, regularIds],
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Solyx</span>
      </div>
      <ThreadListPrimitive.Root className="thread-list">
        <ThreadListPrimitive.New className="new-chat-button">
          <PlusIcon />
          New chat
        </ThreadListPrimitive.New>
        {/* Opening the app creates a session whether or not anything is typed
            in it (ChatPane's eager readiness check), so empty sessions pile up
            on their own. Bulk removal is offered only when there is something
            known-empty to remove — a session whose count never arrived is
            UNKNOWN and is never in this set. */}
        {emptyThreadIds.length > 0 && (
          <div className="thread-bulk-delete">
            {confirmingBulk ? (
              <>
                <button
                  type="button"
                  className="thread-item-delete thread-item-delete-confirm"
                  aria-label={`${emptyThreadIds.length} lege gesprekken definitief verwijderen`}
                  onClick={() => {
                    setConfirmingBulk(false);
                    deleteThreads(emptyThreadIds);
                  }}
                >
                  Zeker weten?
                </button>
                <button
                  type="button"
                  className="thread-item-delete-cancel"
                  aria-label="Verwijderen annuleren"
                  onClick={() => setConfirmingBulk(false)}
                >
                  Annuleren
                </button>
              </>
            ) : (
              <button
                type="button"
                className="thread-item-delete"
                onClick={() => setConfirmingBulk(true)}
              >
                {`${emptyThreadIds.length} lege gesprekken verwijderen`}
              </button>
            )}
          </div>
        )}
        <div className="thread-items">
          {/* Every session is listed. There used to be a filter here that hid
              untitled sessions; because the gateway titles every untitled
              session "New chat", it hid all of them (see
              runtime/threadListFilter.ts). Rows are told apart by
              threadRowLabel, not by hiding them. */}
          <ThreadListPrimitive.Items>
            {({ threadListItem }) => (
              <ThreadRow key={threadListItem.id} threadListItem={threadListItem} onDelete={deleteThreads} />
            )}
          </ThreadListPrimitive.Items>
          {/* Archiving must not make a session unreachable: archived items are
              a separate list in the runtime and are invisible without their
              own Items block. */}
          <div className="thread-archived">
            <span className="thread-archived-label">Gearchiveerd</span>
            <ThreadListPrimitive.Items archived>
              {({ threadListItem }) => (
                <ThreadRow key={threadListItem.id} threadListItem={threadListItem} onDelete={deleteThreads} />
              )}
            </ThreadListPrimitive.Items>
          </div>
        </div>
      </ThreadListPrimitive.Root>
      {/* Only password mode has a session to log out of — Access mode has
          no client-visible login state, Clerk has its own account UI. A
          plain link, not a fetch()-driven button: /logout is a normal GET
          route (server/src/http/loginRoutes.ts) that clears the cookie and
          redirects, so it works even if the WS connection is down. */}
      {authMode === "password" && (
        <a className="sidebar-footer" href="/logout">
          <SignOutIcon />
          Sign out
        </a>
      )}
    </aside>
  );
}

/**
 * Only the fields the row actually renders. Not ThreadListItemState: the
 * package exports two different types under that name (the store scope and the
 * runtime binding) and the Items render callback hands over the store one, so
 * naming the type imports the wrong one.
 */
type ThreadRowItem = {
  readonly id: string;
  readonly title?: string | undefined;
  readonly lastMessageAt?: Date | undefined;
  readonly custom?: Record<string, unknown> | undefined;
};

/**
 * One session row. Split out of the Items render callback because it owns
 * state: deleting is immediate and irreversible, and these are real client
 * conversations, so a single stray click must not be enough. The confirmation
 * lives in component state only — it is deliberately forgotten on re-render or
 * unmount, which is the safe direction.
 */
function ThreadRow({
  threadListItem,
  onDelete,
}: {
  threadListItem: ThreadRowItem;
  onDelete: (ids: readonly string[]) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const messageCount = readMessageCount(threadListItem.custom);
  const label = threadRowLabel({
    title: threadListItem.title,
    lastMessageAt: threadListItem.lastMessageAt,
    messageCount,
  });

  return (
    // data-empty is presentational only — the label already says "leeg", so the
    // row stays readable without a stylesheet rule for it. packages/web/src/styles.css
    // is owned elsewhere this round.
    <ThreadListItemPrimitive.Root className="thread-item" data-empty={messageCount === 0 ? "" : undefined}>
      <ThreadListItemPrimitive.Trigger className="thread-item-trigger">
        {/* Plain text, not ThreadListItemPrimitive.Title: Title renders the
            store's own title verbatim and cannot show a derived label. */}
        {label}
      </ThreadListItemPrimitive.Trigger>
      {confirmingDelete ? (
        <>
          {/* A plain button rather than ThreadListItemPrimitive.Delete: that
              primitive deletes without moving the user off the dead thread. */}
          <button
            type="button"
            className="thread-item-delete thread-item-delete-confirm"
            aria-label={`Gesprek "${label}" definitief verwijderen`}
            onClick={() => {
              setConfirmingDelete(false);
              onDelete([threadListItem.id]);
            }}
          >
            Zeker weten?
          </button>
          <button
            type="button"
            className="thread-item-delete-cancel"
            aria-label="Verwijderen annuleren"
            onClick={() => setConfirmingDelete(false)}
          >
            Annuleren
          </button>
        </>
      ) : (
        <button
          type="button"
          className="thread-item-delete"
          aria-label={`Gesprek "${label}" verwijderen`}
          onClick={() => setConfirmingDelete(true)}
        >
          Verwijderen
        </button>
      )}
    </ThreadListItemPrimitive.Root>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5.5 1.75H2.75a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H5.5M9.5 10.25 12.75 7 9.5 3.75M4.5 7h8.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
