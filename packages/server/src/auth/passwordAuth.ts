import type { IncomingMessage } from "node:http";
import type { Config } from "../config.js";
import { getCookie } from "../http/cookies.js";
import { verifySessionToken } from "./session.js";
import type { AuthChecker, AuthResult } from "./types.js";

/** Session cookie name. Also referenced by http/loginRoutes.ts (issuing and
 *  clearing it) — kept here, next to the checker that reads it, as the one
 *  place that owns the cookie's identity. */
export const SESSION_COOKIE_NAME = "solyx_session";

/**
 * AUTH_MODE=password (the default) — see README "Auth". This is the only
 * thing standing between this app and the public internet once Cloudflare
 * Access is removed, so it follows the exact same fail-closed discipline as
 * accessAuth.ts and clerkAuth.ts: any missing, malformed, tampered, or
 * expired session cookie is `authenticated: false`, never a thrown
 * exception.
 *
 * The session itself is issued by the login route
 * (http/loginRoutes.ts, after a successful password check —
 * auth/passwordHash.ts) as a signed token carrying its own expiry
 * (auth/session.ts). There is no server-side session store: verifying a
 * cookie here costs one HMAC computation, not a database or in-memory
 * lookup, and a cookie stops working on its own once SESSION_SECRET changes
 * or its `exp` passes.
 */
export function createPasswordAuthChecker(config: Pick<Config, "sessionSecret">): AuthChecker {
  return {
    async isAuthenticated(request: IncomingMessage): Promise<AuthResult> {
      const token = getCookie(request, SESSION_COOKIE_NAME);
      if (!token) return { authenticated: false };
      return { authenticated: verifySessionToken(token, config.sessionSecret) };
    },
  };
}
