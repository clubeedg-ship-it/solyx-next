import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthChecker } from "../auth/types.js";
import type { Config } from "../config.js";
import { LOGIN_PATH, LOGOUT_PATH, handleLoginRoute, handleLogoutRoute } from "./loginRoutes.js";
import { LoginRateLimiter } from "./loginRateLimiter.js";
import { DraftFetchError, InvalidPostIdError, fetchDraftHtml, fetchDraftList } from "../proxy/draftProxy.js";
import { fetchContentList, type ContentItem } from "../content/contentList.js";
import { OffOriginError, ThumbnailStore } from "../content/thumbnails.js";
import { injectBaseTag } from "../proxy/htmlRewrite.js";
import { createReadStream } from "node:fs";
import { serveStaticFile } from "./staticFiles.js";

export interface RouterOptions {
  config: Config;
  auth: AuthChecker;
}

const DRAFT_PATH = /^\/api\/draft\/([^/]+)$/;
const THUMB_PATH = /^\/api\/thumb\/(page|post|product)\/([0-9]+)$/;
const PAGE_PATH = /^\/api\/page\/(page|post|product)\/([0-9]+)$/;

/** How long the content list is reused before WordPress is asked again. */
const CONTENT_TTL_MS = 60_000;

export function createRequestListener(options: RouterOptions) {
  // One process-lifetime rate limiter, shared across every login attempt —
  // see loginRateLimiter.ts. Only ever consulted when authMode is
  // "password"; harmless (an empty Map) otherwise.
  const rateLimiter = new LoginRateLimiter();

  // One store for the process: it serialises renders, and two of them would
  // defeat that by each running their own Chromium.
  const thumbnails = new ThumbnailStore({
    cacheDir: options.config.thumbnailCacheDir,
    allowedOrigin: options.config.wordpressOrigin,
    chromiumPath: options.config.chromiumPath || undefined,
  });

  // The thumbnail route resolves an id to a URL through this list rather than
  // taking a URL from the browser, so a card can only ever ask for a page
  // WordPress itself listed. Cached briefly because a grid mounting asks for
  // dozens of thumbnails at once and they would otherwise each re-list the
  // whole site.
  let contentCache: { at: number; items: ContentItem[] } | undefined;
  const contentList = async (): Promise<ContentItem[]> => {
    if (contentCache && Date.now() - contentCache.at < CONTENT_TTL_MS) return contentCache.items;
    const items = await fetchContentList(options.config);
    contentCache = { at: Date.now(), items };
    // Start filling the thumbnail cache the moment we know what exists, rather
    // than when a card is first looked at. A page takes ~30s to render here, so
    // on a cold cache this is the difference between images that arrive while
    // the user is still on the first screen and a grid of placeholders.
    thumbnails.warm(items.map((item) => item.link));
    return items;
  };

  return async function requestListener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://internal");

      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
        return;
      }

      if (options.config.authMode === "password") {
        if (url.pathname === LOGIN_PATH) {
          await handleLoginRoute(req, res, { config: options.config, auth: options.auth, rateLimiter });
          return;
        }
        if (url.pathname === LOGOUT_PATH) {
          handleLogoutRoute(req, res);
          return;
        }
      }

      // The Drafts selector asks for this on load, so the panel reflects what
      // actually exists in WordPress instead of only what it saw the agent
      // touch during this session.
      if (url.pathname === "/api/drafts") {
        await handleDraftList(req, res, options);
        return;
      }

      if (url.pathname === "/api/content") {
        await handleContentList(req, res, options, contentList);
        return;
      }

      const pageMatch = PAGE_PATH.exec(url.pathname);
      if (pageMatch) {
        await handlePublishedPage(req, res, options, contentList, {
          type: pageMatch[1] as ContentItem["type"],
          id: Number(pageMatch[2]),
        });
        return;
      }

      const thumbMatch = THUMB_PATH.exec(url.pathname);
      if (thumbMatch) {
        await handleThumbnail(req, res, options, thumbnails, contentList, {
          type: thumbMatch[1] ?? "",
          id: Number(thumbMatch[2]),
          force: url.searchParams.has("refresh"),
        });
        return;
      }

      const draftMatch = DRAFT_PATH.exec(url.pathname);
      if (draftMatch) {
        await handleDraft(req, res, options, draftMatch[1] ?? "");
        return;
      }

      // Every other route is the static SPA shell/assets. In "access" and
      // "clerk" modes these are deliberately left ungated here (the edge or
      // the client-side gate handles it — see App.tsx). In "password" mode
      // there is no edge and no client-side gate to fall back on, so this is
      // the only place left to fail closed: an unauthenticated request for
      // any asset, including "/", is redirected to /login rather than ever
      // being served.
      if (options.config.authMode === "password") {
        const auth = await options.auth.isAuthenticated(req);
        if (!auth.authenticated) {
          res.writeHead(302, { Location: LOGIN_PATH, "Cache-Control": "no-store" }).end();
          return;
        }
      }

      serveStaticFile(options.config.staticDir, url.pathname, res);
    } catch (error) {
      // Belt and suspenders on top of AuthChecker's own fail-closed handling
      // and handleDraft's try/catch: nothing reaching this listener should
      // ever be able to crash the process.
      console.error("Unhandled request error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" }).end("Internal error");
      } else {
        res.end();
      }
    }
  };
}

/**
 * Serve a published page through this origin so it can be shown in the panel.
 *
 * The site answers `x-frame-options: SAMEORIGIN`, so pointing an iframe
 * straight at 2026.solyxenergy.nl is refused by the browser. Fetching it here
 * and serving the HTML from our own origin is the same trick the draft preview
 * already uses, and it keeps one code path for "show me a page".
 *
 * The id is resolved to a URL through the content list rather than taken from
 * the browser, so this can only ever fetch something WordPress itself listed.
 */
async function handlePublishedPage(
  req: IncomingMessage,
  res: ServerResponse,
  options: RouterOptions,
  contentList: () => Promise<ContentItem[]>,
  want: { type: ContentItem["type"]; id: number },
): Promise<void> {
  const auth = await options.auth.isAuthenticated(req);
  if (!auth.authenticated) {
    res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
    return;
  }

  const item = (await contentList()).find((entry) => entry.type === want.type && entry.id === want.id);
  if (!item) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("No such page");
    return;
  }

  const origin = options.config.wordpressOrigin.replace(/\/+$/, "");
  if (!(item.link === origin || item.link.startsWith(`${origin}/`))) {
    res.writeHead(502, { "Content-Type": "text/plain" }).end("Page is not on the configured origin");
    return;
  }

  const upstream = await fetch(item.link, { headers: { Accept: "text/html" } });
  if (!upstream.ok) {
    res.writeHead(502, { "Content-Type": "text/plain" }).end(`WordPress returned ${upstream.status}`);
    return;
  }

  // Same base-tag injection as the draft preview: the page's own relative URLs
  // must keep resolving against WordPress, not against this origin.
  const html = injectBaseTag(await upstream.text(), { baseHref: options.config.wordpressOrigin });
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
}

async function handleDraftList(req: IncomingMessage, res: ServerResponse, options: RouterOptions): Promise<void> {
  const auth = await options.auth.isAuthenticated(req);
  if (!auth.authenticated) {
    res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
    return;
  }

  try {
    const drafts = await fetchDraftList(options.config);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ drafts }));
  } catch (error) {
    if (error instanceof DraftFetchError) {
      res.writeHead(502, { "Content-Type": "text/plain" }).end(error.message);
      return;
    }
    throw error;
  }
}

async function handleDraft(req: IncomingMessage, res: ServerResponse, options: RouterOptions, postId: string): Promise<void> {
  const auth = await options.auth.isAuthenticated(req);
  if (!auth.authenticated) {
    res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
    return;
  }

  try {
    const html = await fetchDraftHtml(postId, options.config);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      // The draft may reference the agent's authenticated preview session
      // implicitly; don't let intermediary caches store it.
      "Cache-Control": "no-store",
    });
    res.end(html);
  } catch (error) {
    if (error instanceof InvalidPostIdError) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("Invalid draft id");
      return;
    }
    if (error instanceof DraftFetchError) {
      res.writeHead(502, { "Content-Type": "text/plain" }).end(error.message);
      return;
    }
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Internal error");
  }
}
async function handleContentList(
  req: IncomingMessage,
  res: ServerResponse,
  options: RouterOptions,
  contentList: () => Promise<ContentItem[]>,
): Promise<void> {
  const auth = await options.auth.isAuthenticated(req);
  if (!auth.authenticated) {
    res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
    return;
  }

  try {
    const items = await contentList();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ items }));
  } catch (error) {
    if (error instanceof DraftFetchError) {
      res.writeHead(502, { "Content-Type": "text/plain" }).end(error.message);
      return;
    }
    throw error;
  }
}

async function handleThumbnail(
  req: IncomingMessage,
  res: ServerResponse,
  options: RouterOptions,
  thumbnails: ThumbnailStore,
  contentList: () => Promise<ContentItem[]>,
  want: { type: string; id: number; force: boolean },
): Promise<void> {
  const auth = await options.auth.isAuthenticated(req);
  if (!auth.authenticated) {
    res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
    return;
  }

  try {
    // The URL is looked up, never supplied. A browser can name an id and a
    // type; it can never name an address for this server to go and render.
    const item = (await contentList()).find((entry) => entry.type === want.type && entry.id === want.id);
    if (!item) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("No such page");
      return;
    }

    const file = await thumbnails.pathFor(item.link, { force: want.force });
    res.writeHead(200, {
      "Content-Type": "image/png",
      // Private: this sits behind the app's own login, so no shared cache
      // should ever hold a picture of the client's site.
      "Cache-Control": "private, max-age=600",
    });
    createReadStream(file).pipe(res);
  } catch (error) {
    if (error instanceof OffOriginError) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("Refused");
      return;
    }
    if (error instanceof DraftFetchError) {
      res.writeHead(502, { "Content-Type": "text/plain" }).end(error.message);
      return;
    }
    // A page that will not render is a missing picture, not a broken panel:
    // the card falls back to its title and the grid still works.
    res.writeHead(502, { "Content-Type": "text/plain" }).end("Could not render a thumbnail");
  }
}
