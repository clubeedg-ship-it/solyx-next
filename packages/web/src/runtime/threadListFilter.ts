/**
 * A session with no messages is not a conversation. The wire protocol
 * (protocol.ts) only ever gives the client a `title` — never a message
 * count — and the server already normalizes an empty/untitled session's
 * title to the literal string "New chat" (see gatewayAdapter.ts's
 * toSessionSummary). That string is therefore the only signal the client
 * has for "this session has never actually been used" without changing the
 * wire protocol, so it's what Sidebar.tsx filters the thread list on.
 *
 * This never deletes anything server-side — it only decides what the
 * sidebar lists. An untitled session that happens to be the one currently
 * open is a separate case Sidebar.tsx handles itself (never hide the
 * conversation someone is actively looking at).
 */
export function isUntitledThread(title: string | undefined): boolean {
  return !title || title.trim().length === 0 || title === "New chat";
}
