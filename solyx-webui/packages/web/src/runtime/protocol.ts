// Mirror of packages/server/src/ws/protocol.ts — see that file for the
// rationale. Kept duplicated on purpose; if you change one, change the
// other.

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
  | { type: "tool.event"; sessionKey: string; tool: string; at: string; args: unknown }
  | { type: "sessions.changed"; session: SessionWire };
