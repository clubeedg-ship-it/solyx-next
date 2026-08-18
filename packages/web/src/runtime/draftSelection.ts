import type { BackendSocket } from "./backendSocket.js";

export interface DraftInfo {
  postId: string;
  label: string;
  updatedAt: string;
}

export interface DraftSelectionState {
  currentPostId: string | null;
  /** Drafts seen so far this session, most-recently-touched first — not a
   *  full catalog of every WordPress page (there is no endpoint for that
   *  here; see README "What is stubbed / incomplete"). */
  drafts: DraftInfo[];
}

const EMPTY: DraftSelectionState = { currentPostId: null, drafts: [] };

/**
 * Pull the DRAFT post id out of a tool event.
 *
 * The payload shape here is no longer a guess. Captured verbatim off the live
 * Gateway on 2026-08-18 (throwaway GatewayClient probe, agent solyx):
 *
 *   session.tool -> { stream: "tool", data: {
 *       phase: "start" | "result",
 *       name: "mcp__solyx-wp__open_draft",
 *       toolCallId: "toolu_...",
 *       args:   { page_id: 626 },                 // phase "start"
 *       result: [{ type: "text", text: "...draft 1405 ..." }],  // phase "result"
 *   } }
 *
 * Two things the old guess got wrong, both fatal to the Drafts selector:
 *   1. the tool arguments are NESTED under `args`, never at the top level, so
 *      a flat key scan found nothing and the panel stayed empty forever;
 *   2. `page_id` is NOT a draft id. /api/draft/:id proxies to WordPress as
 *      `?p=<id>&preview=true`, so returning 626 would render the PUBLISHED
 *      Home page and present it to the client as their draft. open_draft only
 *      names the draft it resolved to (1405) in its result body, so that is
 *      where the id has to come from on the opening call.
 */
const DRAFT_ID_KEYS = ["draft_id", "draftId", "postId", "post_id"];
const DRAFT_FROM_PREVIEW_URL = /\/drafts\/([0-9]+)\//;
const DRAFT_FROM_RESULT_TEXT = /\bdraft\s+([0-9]+)\b/i;

function numericId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  return null;
}

/** Concatenate the text blocks of a tool result, whatever arity it came in. */
function resultText(payload: Record<string, unknown>): string | null {
  const result = payload.result;
  if (typeof result === "string") return result;
  if (!Array.isArray(result)) return null;
  const parts: string[] = [];
  for (const block of result) {
    if (block && typeof block === "object") {
      const text = (block as Record<string, unknown>).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

export function extractPostId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  // An unambiguous draft id, top level or one level down under `args`.
  const scopes: Record<string, unknown>[] = [obj];
  const args = obj.args;
  if (args && typeof args === "object") scopes.push(args as Record<string, unknown>);
  for (const scope of scopes) {
    for (const key of DRAFT_ID_KEYS) {
      const id = numericId(scope[key]);
      if (id !== null) return id;
    }
  }

  // open_draft goes in with only a page_id, so recover the draft it opened
  // from the result body rather than mislabelling the published page.
  const text = resultText(obj);
  if (text !== null) {
    const match = DRAFT_FROM_PREVIEW_URL.exec(text) ?? DRAFT_FROM_RESULT_TEXT.exec(text);
    if (match && match[1] !== undefined) return match[1];
  }

  return null;
}

/**
 * Tracks which draft the "Drafts ▾" selector shows: whatever the agent's
 * tool-events say it last touched, or whatever the owner manually picked
 * from the dropdown (an explicit pick wins until the next tool event).
 */
export class DraftSelectionStore {
  private state: DraftSelectionState = EMPTY;
  private readonly listeners = new Set<(state: DraftSelectionState) => void>();

  constructor(socket: Pick<BackendSocket, "on">) {
    socket.on("tool.event", (frame) => {
      const postId = extractPostId(frame.args);
      if (!postId) return;
      this.upsert(postId, frame.tool, frame.at);
      this.state = { ...this.state, currentPostId: postId };
      this.emit();
    });
  }

  get(): DraftSelectionState {
    return this.state;
  }

  subscribe(listener: (state: DraftSelectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Manual pick from the Drafts ▾ dropdown. */

  /**
   * Replace-or-extend the selector from the server's list of drafts that
   * actually exist in WordPress (GET /api/drafts).
   *
   * Tool events only ever reveal drafts the agent touched while this page was
   * open, so on a fresh load the selector would otherwise sit empty even
   * though the client has drafts saved. Drafts already seen this session keep
   * their position and are not duplicated.
   *
   * A failed request leaves the current list untouched: a blip must never
   * blank a panel that is already showing something real.
   */
  async loadFromServer(fetchImpl: typeof fetch = fetch): Promise<void> {
    let payload: unknown;
    try {
      const response = await fetchImpl("/api/drafts");
      if (!response.ok) return;
      payload = await response.json();
    } catch {
      return;
    }

    const listed = (payload as { drafts?: unknown } | null)?.drafts;
    if (!Array.isArray(listed)) return;

    const known = new Set(this.state.drafts.map((draft) => draft.postId));
    const discovered: DraftInfo[] = [];
    for (const entry of listed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const postId = String(record.draftId ?? "");
      if (!/^[0-9]+$/.test(postId) || known.has(postId)) continue;
      known.add(postId);
      const title = typeof record.title === "string" ? record.title.trim() : "";
      discovered.push({ postId, label: title !== "" ? title : `Draft ${postId}`, updatedAt: "" });
    }

    if (discovered.length === 0) return;
    const drafts = [...this.state.drafts, ...discovered];
    this.state = { drafts, currentPostId: this.state.currentPostId ?? drafts[0]?.postId ?? null };
    this.emit();
  }

  select(postId: string): void {
    if (!this.state.drafts.some((d) => d.postId === postId)) return;
    this.state = { ...this.state, currentPostId: postId };
    this.emit();
  }

  private upsert(postId: string, label: string, updatedAt: string): void {
    const rest = this.state.drafts.filter((d) => d.postId !== postId);
    this.state = { ...this.state, drafts: [{ postId, label, updatedAt }, ...rest] };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
