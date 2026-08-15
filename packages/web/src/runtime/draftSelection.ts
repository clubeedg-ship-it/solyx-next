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
 * Best-effort extraction of a page/post identifier from a tool-event's raw
 * args. The real payload shape was not confirmed against a live Gateway
 * (PLAN.md §1.1/§9) — this tries several plausible field names rather than
 * assuming one, so "Drafts ▾ follows the agent" degrades gracefully (stays
 * on the last known draft) instead of throwing when the shape doesn't match.
 */
export function extractPostId(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const obj = args as Record<string, unknown>;
  for (const key of ["postId", "post_id", "pageId", "page_id", "id"]) {
    const value = obj[key];
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
    if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
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
