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
