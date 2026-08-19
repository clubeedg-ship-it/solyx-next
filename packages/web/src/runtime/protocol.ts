// Mirror of packages/server/src/ws/protocol.ts — see that file for the
// rationale. Kept duplicated on purpose; if you change one, change the
// other.

export type ClientFrame =
  | { id: string; type: "sessions.list" }
  | { id: string; type: "sessions.create" }
  | { id: string; type: "sessions.get"; sessionKey: string }
  | { id: string; type: "sessions.history"; sessionKey: string }
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
  archived: boolean;
  // Count of user+assistant messages in the session. Optional on purpose:
  // omitted means UNKNOWN, never zero. A server that does not send it must
  // not make every session look empty.
  messageCount?: number;
}

// One message replayed into a thread on load. Mirrors the server's
// HistoryMessageWire field-for-field. `at` omitted means the Gateway did not
// timestamp it — unknown, never "now". A sessions.history request answers
// with an array of these, oldest first.
export interface HistoryMessageWire {
  role: "user" | "assistant";
  text: string;
  at?: string;
}

export type ServerFrame =
  | { type: "result"; id: string; ok: true; result: unknown }
  | { type: "result"; id: string; ok: false; error: string }
  | { type: "assistant.delta"; sessionKey: string; text: string }
  | { type: "assistant.done"; sessionKey: string }
  | { type: "assistant.error"; sessionKey: string; error: string }
  | { type: "tool.event"; sessionKey: string; tool: string; at: string; args: unknown }
  | { type: "sessions.changed"; session: SessionWire };
