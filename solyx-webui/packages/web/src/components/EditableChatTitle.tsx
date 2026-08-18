import { useEffect, useRef, useState } from "react";
import { commitTitleEdit } from "../runtime/titleEdit.js";

export interface EditableChatTitleProps {
  /** The active thread's current title (already resolved to a display
   *  fallback like "New chat" by the caller — see ChatPane.tsx). */
  title: string;
  /** In practice `(t) => aui.threadListItem.rename(t)` — kept as a plain
   *  prop rather than reaching for assistant-ui itself so this component
   *  can be rendered and interacted with in a test without a live runtime
   *  (see EditableChatTitle.test.tsx). */
  onRename: (title: string) => Promise<void>;
  /** Called with the failure reason when a rename fails, and with
   *  `undefined` whenever that error should be cleared (a fresh edit
   *  starting, or a save succeeding). The caller owns where/how this is
   *  displayed — ChatPane.tsx renders it as a `.message-error` banner
   *  below the header, matching this file's existing error style. */
  onErrorChange: (message: string | undefined) => void;
}

/**
 * The chat header's title, editable in place. Chosen interaction shape:
 * click (or Enter/Space, since the trigger is a real `<button>`) to start
 * editing; Enter or blur commits; Escape cancels. All of that is just DOM
 * wiring — the actual commit decision (empty cancels, unchanged is a no-op,
 * trim before saving) lives in titleEdit.ts's commitTitleEdit, tested on
 * its own.
 *
 * Optimistic UI + rollback is NOT reimplemented here: assistant-ui's own
 * RemoteThreadListRuntime already applies the new title to its store the
 * moment `rename()` is called and automatically reverts that store update
 * if the underlying adapter call rejects (see
 * RemoteThreadListThreadListRuntimeCore's `rename` -> `optimisticUpdate`,
 * whose `finally` drops a failed transform before recomputing state). So
 * the `title` prop this component receives already reflects that rollback
 * by the time `onRename` rejects — this component's own job on failure is
 * just to leave edit mode and surface *why*, via `onErrorChange`.
 */
export function EditableChatTitle({ title, onRename, onErrorChange }: EditableChatTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter commits and then, in a real browser, the input is about to lose
  // focus anyway (either it unmounts or the user tabs away) — without this
  // guard that follow-on blur would fire handleBlur and attempt a second
  // commit of whatever `draft` was left holding.
  const skipNextBlurRef = useRef(false);

  // The title can change while this component is NOT mid-edit — the active
  // thread switched, or another browser renamed this session first. Stay in
  // sync in that case. While editing, the user's draft is authoritative
  // right up until they commit or cancel it, so it's deliberately left
  // alone here even if `title` changes underneath (e.g. a rollback from a
  // failed save elsewhere, however unlikely for the very session being
  // edited).
  useEffect(() => {
    if (!isEditing) setDraft(title);
  }, [title, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  function startEditing() {
    onErrorChange(undefined);
    setDraft(title);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(title);
    setIsEditing(false);
  }

  async function commit() {
    setIsEditing(false);
    try {
      const outcome = await commitTitleEdit({ currentTitle: title, draft, rename: onRename });
      if (outcome.action !== "cancelled") onErrorChange(undefined);
      // "unchanged"/"cancelled" leave `title` as-is; "renamed" is picked up
      // from the `title` prop once the caller's runtime state updates.
    } catch (error) {
      onErrorChange(error instanceof Error ? error.message : String(error));
      setDraft(title);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      skipNextBlurRef.current = true;
      void commit().finally(() => {
        skipNextBlurRef.current = false;
      });
    } else if (event.key === "Escape") {
      event.preventDefault();
      skipNextBlurRef.current = true;
      cancelEditing();
      skipNextBlurRef.current = false;
    }
  }

  function handleBlur() {
    if (skipNextBlurRef.current) return;
    void commit();
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="chat-header-title chat-header-title-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        aria-label="Chat title"
      />
    );
  }

  return (
    <button type="button" className="chat-header-title chat-header-title-button" onClick={startEditing}>
      {title}
    </button>
  );
}
