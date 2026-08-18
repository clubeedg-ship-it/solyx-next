/**
 * The decision logic behind committing an in-place edit of the chat title
 * (ChatPane.tsx's EditableChatTitle), factored out so it's testable without
 * a DOM or a live assistant-ui runtime — the same reasoning as
 * composerSubmit.ts's split between "what should happen" and "how the DOM
 * triggers it".
 *
 * `rename` is the only side effect here, and it's the caller's job to
 * supply it (in practice, `aui.threadListItem.rename`) — this module knows
 * nothing about assistant-ui.
 */

export type TitleCommitOutcome = { action: "renamed"; title: string } | { action: "unchanged" } | { action: "cancelled" };

export interface TitleCommitDeps {
  /** The title as it currently stands, before this edit. */
  currentTitle: string;
  /** Whatever the user has typed so far. */
  draft: string;
  rename: (title: string) => Promise<void>;
}

/**
 * Empty or whitespace-only input cancels the edit rather than saving a
 * blank title — a chat with no title is exactly the "New chat" placeholder
 * state this whole feature exists to move sessions out of, so committing an
 * empty edit is never useful and would just recreate that problem by hand.
 * A draft that's unchanged (after trimming) is left alone too, so a plain
 * click-to-edit-then-click-away never fires an unnecessary rename call.
 *
 * A failed `rename` rejects out of this function rather than being caught
 * here — the caller (EditableChatTitle) is the one with UI state to roll
 * back and an error to surface, so it needs to see the failure itself.
 */
export async function commitTitleEdit(deps: TitleCommitDeps): Promise<TitleCommitOutcome> {
  const trimmed = deps.draft.trim();
  if (trimmed.length === 0) return { action: "cancelled" };
  if (trimmed === deps.currentTitle.trim()) return { action: "unchanged" };

  await deps.rename(trimmed);
  return { action: "renamed", title: trimmed };
}
