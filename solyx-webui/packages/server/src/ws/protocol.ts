// The browser <-> backend WebSocket protocol. This is NOT the OpenClaw
// Gateway wire protocol — it's a small protocol of our own that the
// frontend's assistant-ui adapters (packages/web/src/runtime/*) speak to
// this backend, which is the only thing that ever holds the real Gateway
// credential (see gateway/gatewayAdapter.ts). Keeping this separate is what
// lets only this server track Gateway protocol version bumps (PLAN.md §5).
//
// Kept intentionally tiny and JSON-shaped so a browser needs nothing beyond
// the standard WebSocket API to speak it.
//
// NOTE: mirrored in packages/web/src/runtime/protocol.ts. The two files are
// duplicated on purpose (this project is two small packages, not a shared
// library) — if you change one, change the other.

export type ClientFrame =
  | { id: string; type: "sessions.list" }
  | { id: string; type: "sessions.create" }
  | { id: string; type: "sessions.get"; sessionKey: string }
  | { id: string; type: "sessions.rename"; sessionKey: string; title: string }
  | { id: string; type: "sessions.archive"; sessionKey: string }
  | { id: string; type: "sessions.unarchive"; sessionKey: string }
  | { id: string; type: "sessions.delete"; sessionKey: string }
  | { id: string; type: "chat.send"; sessionKey: string; text: string }
  | { id: string; type: "chat.abort"; sessionKey: string };

export interface SessionWire {
  sessionKey: string;
  title: string;
  updatedAt: string;
  /**
   * True once OpenClaw itself has a real label for this session (mirrors
   * gateway/types.ts's SessionSummary.hasTitle). OpenClaw never generates
   * this on its own — see wsServer.ts's chat.send handler, which is what
   * actually sets it, by deriving a title from the first message and
   * persisting it via sessions.rename. Without this field the client had
   * no way to tell "genuinely untitled" apart from "happens to be titled
   * the same as the placeholder", and fell back to string-matching the
   * literal "New chat" (see runtime/threadListFilter.ts) — this is the
   * real signal that replaces that guess.
   */
  hasTitle: boolean;
  archived: boolean;
}

export type ServerFrame =
  | { type: "result"; id: string; ok: true; result: unknown }
  | { type: "result"; id: string; ok: false; error: string }
  | { type: "assistant.delta"; sessionKey: string; text: string }
  | { type: "assistant.done"; sessionKey: string }
  | { type: "assistant.error"; sessionKey: string; error: string }
  // `args` is the raw, unconfirmed tool-event payload forwarded as-is (see
  // gateway/types.ts ToolEvent) — the frontend does best-effort extraction
  // of a page identifier from it; see PLAN.md §9 for why this is caveated.
  | { type: "tool.event"; sessionKey: string; tool: string; at: string; args: unknown }
  | { type: "sessions.changed"; session: SessionWire };
