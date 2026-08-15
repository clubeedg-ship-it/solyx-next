import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createSessionToken } from "../auth/session.js";
import { verifyPassword } from "../auth/passwordHash.js";
import { SESSION_COOKIE_NAME } from "../auth/passwordAuth.js";
import type { AuthChecker } from "../auth/types.js";
import type { Config } from "../config.js";
import { resolveClientIp } from "./clientIp.js";
import { clearedCookie, serializeCookie } from "./cookies.js";
import { renderLoginPage, type LoginPageOptions } from "./loginPage.js";
import type { LoginRateLimiter } from "./loginRateLimiter.js";
import { PayloadTooLargeError, readBody } from "./requestBody.js";

export const LOGIN_PATH = "/login";
export const LOGOUT_PATH = "/logout";

// Comfortably more than a username + password ever need; guards against a
// hostile client streaming an unbounded body at this route (see
// requestBody.ts).
const MAX_LOGIN_BODY_BYTES = 4 * 1024;

export interface LoginRouteOptions {
  config: Pick<Config, "sessionSecret" | "authPasswordHash" | "authUsername" | "sessionMaxAgeDays" | "trustedProxyHeader">;
  auth: AuthChecker;
  rateLimiter: LoginRateLimiter;
}

/** GET/POST /login. AUTH_MODE=password only — see router.ts. */
export async function handleLoginRoute(req: IncomingMessage, res: ServerResponse, options: LoginRouteOptions): Promise<void> {
  if (req.method === "POST") {
    await handleLoginSubmit(req, res, options);
    return;
  }
  if (req.method === "GET") {
    await handleLoginPageRequest(req, res, options);
    return;
  }
  res.writeHead(405, { "Content-Type": "text/plain", Allow: "GET, POST" }).end("Method not allowed");
}

/** GET/POST /logout. AUTH_MODE=password only — see router.ts. Always
 *  succeeds: clearing a cookie that was never valid is a no-op, not an
 *  error, so this never needs to check auth first. */
export function handleLogoutRoute(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(302, {
    Location: LOGIN_PATH,
    "Set-Cookie": clearedCookie(SESSION_COOKIE_NAME),
    "Cache-Control": "no-store",
  });
  res.end();
}

async function handleLoginPageRequest(req: IncomingMessage, res: ServerResponse, options: LoginRouteOptions): Promise<void> {
  // Already signed in (e.g. the owner navigates back to /login directly) —
  // send them on rather than showing the form again.
  const auth = await options.auth.isAuthenticated(req);
  if (auth.authenticated) {
    res.writeHead(302, { Location: "/", "Cache-Control": "no-store" }).end();
    return;
  }
  sendLoginPage(res, 200, {});
}

async function handleLoginSubmit(req: IncomingMessage, res: ServerResponse, options: LoginRouteOptions): Promise<void> {
  const ip = resolveClientIp(req, options.config.trustedProxyHeader);

  const retryAfterMs = options.rateLimiter.retryAfterMs(ip);
  if (retryAfterMs > 0) {
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    sendLoginPage(res, 429, { error: "rate-limited" });
    return;
  }

  let body: string;
  try {
    body = await readBody(req, MAX_LOGIN_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      res.writeHead(413, { "Content-Type": "text/plain" }).end("Payload too large");
      return;
    }
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Bad request");
    return;
  }

  const params = new URLSearchParams(body);
  const username = params.get("username") ?? "";
  const password = params.get("password") ?? "";

  if (!verifyCredentials(username, password, options.config)) {
    options.rateLimiter.recordFailure(ip);
    sendLoginPage(res, 401, { error: "invalid" });
    return;
  }

  options.rateLimiter.recordSuccess(ip);
  const maxAgeMs = options.config.sessionMaxAgeDays * 24 * 60 * 60 * 1000;
  const token = createSessionToken(options.config.sessionSecret, maxAgeMs);
  res.writeHead(302, {
    Location: "/",
    "Set-Cookie": serializeCookie(SESSION_COOKIE_NAME, token, { maxAgeSeconds: Math.floor(maxAgeMs / 1000) }),
    "Cache-Control": "no-store",
  });
  res.end();
}

/**
 * The password check (auth/passwordHash.ts, scrypt) always runs first and
 * unconditionally — never skipped by a short-circuit on the username check —
 * so response timing can't be used to learn whether a submitted username is
 * the configured one before the (comparatively expensive) password
 * comparison even happens. AUTH_USERNAME is optional; when unset, the
 * username field is accepted purely for password-manager friendliness (see
 * README "Auth") and never checked at all.
 */
function verifyCredentials(username: string, password: string, config: Pick<Config, "authPasswordHash" | "authUsername">): boolean {
  const passwordOk = verifyPassword(password, config.authPasswordHash);
  if (!config.authUsername) return passwordOk;
  const usernameOk = constantTimeStringEqual(username, config.authUsername);
  return usernameOk && passwordOk;
}

function constantTimeStringEqual(a: string, b: string): boolean {
  // Hashing both sides to a fixed-length digest before comparing means
  // timingSafeEqual is always comparing equal-length buffers regardless of
  // the two strings' actual lengths, so string length itself leaks nothing.
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

function sendLoginPage(res: ServerResponse, status: number, options: LoginPageOptions): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(renderLoginPage(options));
}
