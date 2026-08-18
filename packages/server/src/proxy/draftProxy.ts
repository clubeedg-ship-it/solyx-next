import type { Config } from "../config.js";
import { injectBaseTag } from "./htmlRewrite.js";

// Only digits: a WordPress post ID. This endpoint is reachable from the
// authenticated browser session, so it's worth rejecting anything
// path-traversal- or SSRF-shaped before it ever reaches a URL template,
// even though the value is only ever interpolated into a query string.
const VALID_POST_ID = /^[0-9]+$/;

export class InvalidPostIdError extends Error {
  constructor(postId: string) {
    super(`Invalid draft post id: ${postId}`);
    this.name = "InvalidPostIdError";
  }
}

export class DraftFetchError extends Error {
  constructor(
    message: string,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "DraftFetchError";
  }
}

export interface DraftRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Build the outbound request to WordPress for a draft preview. Pure and
 * synchronous so the URL/header shape can be asserted in tests without a
 * network call.
 *
 * WordPress Application Passwords authenticate over plain HTTP Basic auth
 * (RFC 7617) — this is the documented mechanism, not a custom scheme.
 */
export function buildDraftRequest(postId: string, config: Pick<Config, "wordpressOrigin" | "wordpressUser" | "wordpressAppPassword">): DraftRequest {
  if (!VALID_POST_ID.test(postId)) {
    throw new InvalidPostIdError(postId);
  }

  const origin = config.wordpressOrigin.replace(/\/+$/, "");
  const url = `${origin}/?p=${encodeURIComponent(postId)}&preview=true`;
  const credentials = Buffer.from(`${config.wordpressUser}:${config.wordpressAppPassword}`).toString("base64");

  return {
    url,
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "text/html",
    },
  };
}

export type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/**
 * Fetch a draft's preview HTML from WordPress, authenticated as the agent's
 * account, and rewrite it to be embeddable under the UI's own origin.
 *
 * The fetch implementation is injected (defaults to the global `fetch`) so
 * this can be tested against a fixture response without touching a real
 * WordPress instance — and, per the hard constraint on this project, never
 * against 2026.solyxenergy.nl or www.solyxenergy.nl from this codebase's
 * tests or dev tooling.
 */
export async function fetchDraftHtml(
  postId: string,
  config: Pick<Config, "wordpressOrigin" | "wordpressUser" | "wordpressAppPassword">,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const request = buildDraftRequest(postId, config);
  const response = await fetchImpl(request.url, { headers: request.headers });

  if (!response.ok) {
    throw new DraftFetchError(`WordPress returned ${response.status} for draft ${postId}`, response.status);
  }

  const html = await response.text();
  return injectBaseTag(html, { baseHref: config.wordpressOrigin });
}

/** One draft that exists in WordPress right now, ready for the Drafts selector. */
export interface DraftListEntry {
  /** The draft post's own id — this is what /api/draft/:id previews. */
  draftId: string;
  /** The published page the draft was cloned from. */
  pageId: number;
  title: string;
  slug: string;
}

type WpConfig = Pick<Config, "wordpressOrigin" | "wordpressUser" | "wordpressAppPassword">;

function apiHeaders(config: WpConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.wordpressUser}:${config.wordpressAppPassword}`).toString("base64");
  return { Authorization: `Basic ${credentials}`, Accept: "application/json" };
}

/**
 * List every draft that exists in WordPress.
 *
 * Why it walks two endpoints: the plugin's page list reports `hasDraft` but not
 * the draft's id, and the draft id is what the preview route needs. The agent
 * account is deliberately not allowed to query core REST with `status=draft`
 * (`rest_forbidden_status`), so this is the only route to the list — but only
 * the handful of pages that claim a draft get a second call.
 *
 * A single page whose detail call fails is skipped rather than thrown, so one
 * bad page cannot empty the client's Drafts selector.
 */
export async function fetchDraftList(config: WpConfig, fetchImpl: FetchLike = fetch): Promise<DraftListEntry[]> {
  const origin = config.wordpressOrigin.replace(/\/+$/, "");
  const headers = apiHeaders(config);

  const listResponse = await fetchImpl(`${origin}/wp-json/solyx-agent/v1/pages`, { headers });
  if (!listResponse.ok) {
    throw new DraftFetchError(`WordPress returned ${listResponse.status} listing pages`, listResponse.status);
  }

  let pages: unknown;
  try {
    pages = JSON.parse(await listResponse.text());
  } catch {
    throw new DraftFetchError("WordPress returned a non-JSON page list", listResponse.status);
  }
  // The endpoint answers with an envelope, {"pages":[...]}, not a bare array.
  // Verified against the live API on 2026-08-18 — an earlier version of this
  // function assumed the array and silently returned no drafts at all.
  const listed = Array.isArray(pages) ? pages : (pages as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(listed)) return [];

  const drafts: DraftListEntry[] = [];
  for (const page of listed) {
    if (!page || typeof page !== "object") continue;
    const record = page as Record<string, unknown>;
    if (record.hasDraft !== true) continue;
    const pageId = typeof record.id === "number" ? record.id : Number(record.id);
    if (!Number.isInteger(pageId)) continue;

    const detail = await fetchImpl(`${origin}/wp-json/solyx-agent/v1/pages/${pageId}`, { headers });
    if (!detail.ok) continue;

    let body: unknown;
    try {
      body = JSON.parse(await detail.text());
    } catch {
      continue;
    }
    const draftId = (body as Record<string, unknown> | null)?.draftId;
    if (draftId === undefined || draftId === null || String(draftId).trim() === "") continue;

    drafts.push({
      draftId: String(draftId),
      pageId,
      title: typeof record.title === "string" ? record.title : "",
      slug: typeof record.slug === "string" ? record.slug : "",
    });
  }

  return drafts;
}
