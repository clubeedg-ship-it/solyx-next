import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthChecker } from "../auth/types.js";
import type { Config } from "../config.js";
import { LOGIN_PATH, LOGOUT_PATH, handleLoginRoute, handleLogoutRoute } from "./loginRoutes.js";
import { LoginRateLimiter } from "./loginRateLimiter.js";
import { DraftFetchError, InvalidPostIdError, fetchDraftHtml } from "../proxy/draftProxy.js";
import { serveStaticFile } from "./staticFiles.js";

export interface RouterOptions {
  config: Config;
  auth: AuthChecker;
}

const DRAFT_PATH = /^\/api\/draft\/([^/]+)$/;

export function createRequestListener(options: RouterOptions) {
  // One process-lifetime rate limiter, shared across every login attempt —
  // see loginRateLimiter.ts. Only ever consulted when authMode is
  // "password"; harmless (an empty Map) otherwise.
  const rateLimiter = new LoginRateLimiter();

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
