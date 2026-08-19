import type { Config } from "../config.js";
import { DraftFetchError, type FetchLike } from "../proxy/draftProxy.js";

/**
 * The site's published content, as one list.
 *
 * WordPress files this as three separate post types — `page`, `post` and
 * `product` — and answers for each on its own route, so "everything on the
 * site" is three requests, not one. That split is WordPress's, not the
 * client's: the panel shows one grid of cards and nobody browsing it should
 * have to know that a blog entry and a product page are different kinds of
 * object underneath.
 *
 * These come from core WordPress (`/wp/v2/...`), not from the agent plugin.
 * The plugin's own `/solyx-agent/v1/pages` route answers for pages only, and
 * would need a release to answer for anything else — this needs no WordPress
 * change at all.
 */
export interface ContentItem {
  id: number;
  type: ContentType;
  title: string;
  slug: string;
  /** Absolute URL of the published page, as WordPress reports it. */
  link: string;
}

export type ContentType = "page" | "post" | "product";

type WpConfig = Pick<Config, "wordpressOrigin" | "wordpressUser" | "wordpressAppPassword">;

/**
 * Order matters: it is the order the cards appear in. Pages first because
 * that is the marketing site, products next because there are three of them
 * and they matter, blog last because there are forty-three and they mostly
 * do not.
 */
const TYPES: ReadonlyArray<{ type: ContentType; path: string }> = [
  { type: "page", path: "pages" },
  { type: "product", path: "product" },
  { type: "post", path: "posts" },
];

const PER_PAGE = 100;

export async function fetchContentList(config: WpConfig, fetchImpl: FetchLike = fetch): Promise<ContentItem[]> {
  const origin = config.wordpressOrigin.replace(/\/+$/, "");
  const headers = apiHeaders(config);
  const items: ContentItem[] = [];

  for (const { type, path } of TYPES) {
    // `_fields` keeps the response to what the cards render. Without it each
    // page carries its full rendered content, which for this site is tens of
    // kilobytes each and nothing here reads a byte of it.
    const url = `${origin}/wp-json/wp/v2/${path}?per_page=${PER_PAGE}&status=publish&_fields=id,title,link,slug`;
    const response = await fetchImpl(url, { headers });

    // A missing type is not a failure. WooCommerce may not be installed, and
    // a site with no products should still show its pages rather than an
    // error — but anything other than "this type does not exist here" is a
    // real fault and must not be swallowed into a half-empty grid.
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new DraftFetchError(`WordPress returned ${response.status} listing ${path}`, response.status);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await response.text());
    } catch {
      throw new DraftFetchError(`WordPress returned a non-JSON ${path} list`, response.status);
    }
    if (!Array.isArray(parsed)) {
      throw new DraftFetchError(`WordPress returned a non-array ${path} list`, response.status);
    }

    for (const entry of parsed) {
      const item = toContentItem(entry, type);
      if (item) items.push(item);
    }
  }

  return items;
}

function toContentItem(entry: unknown, type: ContentType): ContentItem | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;

  const id = typeof record.id === "number" ? record.id : Number(record.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const link = typeof record.link === "string" ? record.link : "";
  if (link === "") return null;

  return {
    id,
    type,
    title: decodeEntities(readRendered(record.title)) || `#${id}`,
    slug: typeof record.slug === "string" ? record.slug : "",
    link,
  };
}

/** `title` arrives as `{ rendered: "..." }`, not a string. */
function readRendered(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const rendered = (value as { rendered?: unknown }).rendered;
    if (typeof rendered === "string") return rendered;
  }
  return "";
}

/**
 * WordPress renders titles through wptexturize, so they arrive HTML-encoded:
 * "Blog &#038; Nieuws", not "Blog & Nieuws". These are rendered as React text,
 * never as markup, so decoding here is the only place it can happen — and it
 * must stay a decode of the five XML entities plus numerics, not a general
 * HTML parse, because the result is displayed as a label and must never be
 * able to become an element.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => safeCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function safeCodePoint(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

function apiHeaders(config: WpConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.wordpressUser}:${config.wordpressAppPassword}`).toString("base64");
  return { Authorization: `Basic ${credentials}`, Accept: "application/json" };
}
