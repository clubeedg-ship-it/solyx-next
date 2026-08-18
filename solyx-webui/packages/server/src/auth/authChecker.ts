import type { Config } from "../config.js";
import { createAccessAuthChecker } from "./accessAuth.js";
import { createClerkAuthChecker } from "./clerkAuth.js";
import { createPasswordAuthChecker } from "./passwordAuth.js";
import type { AuthChecker } from "./types.js";

export type { AuthChecker, AuthResult } from "./types.js";

/**
 * AUTH_MODE selects which of the three implementations backs every auth
 * check in this app (HTTP requests, the WS upgrade, and the draft proxy) —
 * see README "Auth".
 *
 * - "password" (default): a plain username+password login form
 *   (passwordAuth.ts), gating a signed session cookie. The default because
 *   this app has no other protection in front of it once Cloudflare Access
 *   is removed — see README "Auth".
 * - "access": Cloudflare Access sits in front of this app at the edge; this
 *   verifies the signed JWT Access attaches to every request
 *   (accessAuth.ts).
 * - "clerk": the original path — Clerk's own session verification
 *   (clerkAuth.ts). Kept working as a tested alternative for deployments
 *   that want a third-party identity provider instead.
 */
export function createAuthChecker(config: Config): AuthChecker {
  if (config.authMode === "clerk") {
    return createClerkAuthChecker(config);
  }
  if (config.authMode === "access") {
    return createAccessAuthChecker(config);
  }
  return createPasswordAuthChecker(config);
}
