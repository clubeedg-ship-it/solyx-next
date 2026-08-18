/**
 * Display text and pure list decisions for the session sidebar. This module
 * decides what a row *says*, which rows count as empty, and where the user
 * lands after a delete — never whether a row is shown.
 *
 * It used to export isUntitledThread, on the premise that the title "New chat"
 * marked a session nobody had used. That premise is false: gatewayAdapter.ts
 * (toSessionSummary) normalizes every session without a generated label to
 * exactly "New chat", and no live session has ever carried a generated label —
 * so the predicate matched all of them and the sidebar rendered an empty list.
 *
 * "New chat" therefore means only "this session has no server-generated
 * title", which is the normal state, not a disposable one. Because that string
 * alone cannot tell dozens of sessions apart, the placeholder is disambiguated
 * with the session's own timestamp. Locale and time zone are pinned here rather
 * than taken from the host, so the label is identical for every client and for
 * the tests — this is a single-tenant Dutch UI.
 *
 * Sidebar.tsx is deliberately a thin shell over this module: packages/web runs
 * vitest with environment "node" and has no jsdom, so anything left inside the
 * component cannot be asserted at all.
 */
const PLACEHOLDER_TITLE = "New chat";

/**
 * Marker appended to a session that exists but holds no messages. ChatPane
 * mounts with an eager readiness.ensureReady(), which creates a session on
 * every page load, so most session files on core are header-only; without a
 * marker the sidebar is a wall of indistinguishable rows.
 */
const EMPTY_MARKER = "leeg";

const STAMP_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

export function threadRowLabel({
  title,
  lastMessageAt,
  messageCount,
}: {
  title?: string;
  lastMessageAt?: Date;
  /** Omitted means UNKNOWN. Only an explicit 0 marks a session empty. */
  messageCount?: number;
}): string {
  const base = baseRowLabel(title, lastMessageAt);
  return messageCount === 0 ? `${base} · ${EMPTY_MARKER}` : base;
}

function baseRowLabel(title: string | undefined, lastMessageAt: Date | undefined): string {
  const named = title?.trim();
  if (named && named !== PLACEHOLDER_TITLE) return named;

  const stamp = formatStamp(lastMessageAt);
  // A missing timestamp is survivable: a bare "New chat" row is worse than the
  // others but still better than "New chat · Invalid Date" or a dangling
  // separator.
  return stamp ? `${PLACEHOLDER_TITLE} · ${stamp}` : PLACEHOLDER_TITLE;
}

function formatStamp(lastMessageAt: Date | undefined): string | undefined {
  if (!lastMessageAt || Number.isNaN(lastMessageAt.getTime())) return undefined;
  return STAMP_FORMAT.format(lastMessageAt);
}

/**
 * The single defensive reader of assistant-ui's untyped `custom` bag
 * (ThreadListItemState.custom: Record<string, unknown>). Everything it cannot
 * recognise reads as UNKNOWN rather than 0 — a stray `?? 0` here would hand
 * live client conversations to the bulk-delete button.
 */
export function readMessageCount(custom: Record<string, unknown> | undefined): number | undefined {
  const raw = custom?.["messageCount"];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return undefined;
  return raw;
}

/** Only the fields the selectors read; usable without importing the store type. */
export type ThreadRowSelection = {
  readonly id: string;
  readonly custom?: Record<string, unknown> | undefined;
};

/**
 * Ids of the sessions known to hold no messages — the only ones the bulk action
 * may delete. Archived items are included on purpose: an archived empty session
 * is exactly as worthless as a regular one, and skipping it would leave the
 * user hunting for it. Unknown counts are never included.
 */
export function selectEmptyThreadIds(items: readonly ThreadRowSelection[]): string[] {
  return items.filter((item) => readMessageCount(item.custom) === 0).map((item) => item.id);
}

/**
 * Where the user should be after a delete. assistant-ui removes the deleted
 * thread from its store but leaves mainThreadId pointing at it
 * (@assistant-ui/core remote-thread-state.js:69-71), so the caller has to move
 * the user or strand them on a thread that no longer exists. The bulk action
 * makes that near-certain rather than rare, because the currently open thread
 * is usually the eagerly created empty one.
 */
export type NextThread =
  | { kind: "keep" }
  | { kind: "switch"; threadId: string }
  | { kind: "new" };

export function nextThreadAfterDelete({
  mainThreadId,
  deletedIds,
  regularIds,
}: {
  mainThreadId: string | undefined;
  deletedIds: readonly string[];
  /**
   * Regular (non-archived) thread ids only. Switching to an archived thread
   * would need `unarchive: true`, i.e. a state change nobody asked for.
   */
  regularIds: readonly string[];
}): NextThread {
  const deleted = new Set(deletedIds);
  if (!mainThreadId || !deleted.has(mainThreadId)) return { kind: "keep" };

  const survivor = regularIds.find((id) => !deleted.has(id));
  return survivor ? { kind: "switch", threadId: survivor } : { kind: "new" };
}
