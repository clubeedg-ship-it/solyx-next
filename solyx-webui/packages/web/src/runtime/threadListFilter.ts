/**
 * A session with no messages is not a conversation. This used to be a
 * string match against the literal placeholder "New chat" (protocol.ts's
 * SessionWire only ever carried a `title`, never the fact of whether it was
 * real) — fragile in both directions: it would hide a genuine title that
 * happened to equal the placeholder, and had no way to tell "really
 * untitled" apart from "server hasn't gotten to it yet". SessionWire now
 * carries hasTitle directly (see gatewayAdapter.ts's toSessionSummary,
 * which computes it, and threadListAdapter.ts's toThreadMetadata, which
 * forwards it into RemoteThreadMetadata.custom.hasTitle since that type has
 * no dedicated field for it), so this is the real signal instead of a
 * guess.
 *
 * This never deletes anything server-side — it only decides what the
 * sidebar lists. An untitled session that happens to be the one currently
 * open is a separate case Sidebar.tsx handles itself (never hide the
 * conversation someone is actively looking at).
 */
export function isUntitledThread(hasTitle: boolean | undefined): boolean {
  return hasTitle !== true;
}
