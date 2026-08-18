// A session gets a title the moment its first message is sent — see
// wsServer.ts's chat.send handler, which calls this before/alongside
// forwarding the turn to the Gateway (gateway/gatewayAdapter.ts's
// renameSession -> sessions.patch {label}). OpenClaw itself never generates
// one (confirmed live: agent `solyx` had 42 sessions, 0 labels), so this is
// the only place a title is ever produced, and it has to be deterministic
// and server-side — every browser watching the same session must land on
// the same title, which rules out anything that depends on client state or
// a model call.

/** What every genuinely untitled session shows until it has one. Exported
 *  so callers (wsServer.ts) can recognize this exact fallback and avoid
 *  persisting it as if it were a real title — see that file's comment on
 *  why a "New chat" label must never be written back through renameSession. */
export const FALLBACK_TITLE = "New chat";

// Titles are meant to read as a short label in the sidebar (Sidebar.tsx),
// not a preview of the whole message — 40 keeps a row from wrapping or
// dominating the list the way the raw first line of a long request would.
const MAX_LENGTH = 40;
const ELLIPSIS = "…";

/**
 * Pure, synchronous, and side-effect free by design (see the module doc
 * comment above for why): given the user's first message in a session,
 * produce a short title for it.
 *
 * Steps: trim outer whitespace, collapse all internal whitespace (including
 * newlines — a multi-line request would otherwise render as literal line
 * breaks in a one-line sidebar row) to single spaces, then cut at the last
 * word boundary at or before MAX_LENGTH and append an ellipsis. A single
 * "word" longer than MAX_LENGTH (no boundary to cut at) is hard-cut instead
 * of left untruncated. Empty or whitespace-only input has nothing to derive
 * a title from, so it falls back to FALLBACK_TITLE.
 */
export function deriveTitle(rawText: string): string {
  const collapsed = rawText.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return FALLBACK_TITLE;
  if (collapsed.length <= MAX_LENGTH) return collapsed;

  const truncated = collapsed.slice(0, MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  // lastSpace === 0 would cut to an empty string before the ellipsis — treat
  // that the same as "no boundary found" and hard-cut instead.
  const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut}${ELLIPSIS}`;
}
