// Draft-panel HTML rewriting.
//
// The right column embeds a WordPress draft preview under the UI's own
// origin (the owner's decision — proxy, not screenshots; see
// work/client-agent/webui/PLAN.md §3 for the tradeoffs this accepts).
//
// What this rewrite does and does not do, spelled out because it matters:
//   - Inserts a <base> tag so browser-relative asset URLs (css/js/img) that
//     WordPress emits resolve against the real WordPress origin. Most such
//     URLs are already absolute, so this mainly covers the few that aren't.
//   - Does NOT make the page fully interactive. Any script that calls back
//     to WordPress (admin-ajax, REST, cart fragments, Gravity Forms AJAX)
//     issues a genuine cross-origin request from the browser's point of
//     view once a <base> is present, and most WordPress installs don't send
//     permissive CORS headers for those endpoints — such calls will fail
//     quietly. Forms with absolute `action` URLs will navigate the client's
//     browser to the real WP origin on submit. This is an accepted,
//     documented limitation (PLAN.md §3): the product only needs "what does
//     it look like," never "let me click around it," and there is no
//     publish button anywhere in this UI.
//
// A regex-based tag insertion is used deliberately instead of pulling in an
// HTML parsing library: the only structural edit made is "put one tag right
// after <head>," which a full DOM parse would be a lot of dependency weight
// to express.

const HEAD_OPEN_RE = /<head(\s[^>]*)?>/i;
const EXISTING_BASE_RE = /<base\b[^>]*>/gi;
const HTML_OPEN_RE = /<html(\s[^>]*)?>/i;

export interface InjectBaseOptions {
  /** Origin (scheme + host, no trailing slash) assets/links should resolve against. */
  baseHref: string;
}

/**
 * Insert (or replace) a <base> tag so the draft's relative URLs resolve
 * against the real WordPress origin when served from the UI's own origin.
 *
 * Pure function — no network, no DOM — so it is fully unit-testable against
 * fixture HTML strings without a live WordPress instance.
 */
export function injectBaseTag(html: string, options: InjectBaseOptions): string {
  const baseHref = normalizeBaseHref(options.baseHref);
  const baseTag = `<base href="${escapeAttribute(baseHref)}">`;

  // Drop any base tag the draft's own theme/plugins already emit — ours must
  // win, since it is the one pointing back at the real origin from inside
  // our proxied, same-origin-served copy.
  const withoutExistingBase = html.replace(EXISTING_BASE_RE, "");

  if (HEAD_OPEN_RE.test(withoutExistingBase)) {
    return withoutExistingBase.replace(HEAD_OPEN_RE, (match) => `${match}${baseTag}`);
  }

  // No <head> at all (malformed or a fragment) — fall back to right after
  // <html>, or as a last resort prepend to the document entirely.
  if (HTML_OPEN_RE.test(withoutExistingBase)) {
    return withoutExistingBase.replace(HTML_OPEN_RE, (match) => `${match}<head>${baseTag}</head>`);
  }

  return `<head>${baseTag}</head>${withoutExistingBase}`;
}

function normalizeBaseHref(origin: string): string {
  // <base href> needs a trailing slash to behave as a directory-style base
  // for relative (non-absolute) paths; without it, sibling-relative URLs
  // resolve incorrectly against the last path segment.
  return origin.endsWith("/") ? origin : `${origin}/`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
