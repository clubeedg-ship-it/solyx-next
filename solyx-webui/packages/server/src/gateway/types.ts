// Shapes shared between the Gateway adapter and the rest of the backend.
//
// Field names below follow the method/event names actually present in
// @openclaw/gateway-protocol 2026.8.1-beta.1's protocol.schema.json
// (sessions.list, sessions.subscribe, agent, agent.wait, chat.history,
// operator.read / operator.write scopes) and the RPC/event pairing
// documented in work/client-agent/webui/PLAN.md §1.1. The exact payload
// shape of tool lifecycle events (tool.call / tool.result / tool.action.*)
// was not confirmed against a live Gateway — see ToolEvent below and the
// PLAN.md §9 risk it corresponds to.

export interface SessionSummary {
  sessionKey: string;
  title: string;
  updatedAt: string;
  /** True once OpenClaw itself has generated a title beyond a placeholder. */
  hasTitle: boolean;
  archived: boolean;
  /** User+assistant messages in the session. Absent when the Gateway did not
   *  report a count -- 0 means empty, undefined means unknown. */
  messageCount?: number;
}

/**
 * One message restored from a session's stored transcript, used to repopulate
 * a thread after a page reload. OpenClaw's per-agent store is the only place a
 * transcript lives — this UI keeps none of its own (PLAN.md §6) — so a reload
 * has to ask for it back rather than remember it.
 *
 * `at` is absent when the Gateway did not timestamp the message: absent means
 * unknown, never "now".
 */
export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  at?: string;
}

export interface AssistantDelta {
  sessionKey: string;
  /** Cumulative text so far for this turn, not just the new fragment — this
   *  mirrors assistant-ui's own ChatModelAdapter contract (yield full state,
   *  not deltas), so the adapter that consumes this can pass it straight
   *  through. */
  text: string;
}

export interface ToolEvent {
  sessionKey: string;
  /** Tool name as reported by the Gateway event, e.g. a WordPress-editing tool. */
  tool: string;
  /** Raw event args/result — shape not schema-verified, treat defensively. */
  payload: unknown;
  at: string;
}

export interface SendMessageHandlers {
  onDelta: (delta: AssistantDelta) => void;
  onToolEvent: (event: ToolEvent) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export interface SendMessageHandle {
  /** Best-effort cancellation of an in-flight turn. */
  cancel: () => void;
}
