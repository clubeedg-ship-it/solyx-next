// All secrets come from the environment. Nothing here has a real default —
// anything security-sensitive is required and the process refuses to start
// without it, so a missing credential fails loudly at boot, not silently at
// first use.

import { assertValidPasswordHash } from "./auth/passwordHash.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export interface Config {
  /** Port the HTTP+WS server listens on. */
  port: number;

  /** "real" (default) talks to an actual OpenClaw Gateway; "stub" uses the
   *  in-process fake in gateway/stubGatewayFactory.ts for local dev without
   *  one — see README "Run locally against the stubs". */
  gatewayMode: "real" | "stub";
  /** OpenClaw Gateway WebSocket URL, e.g. ws://127.0.0.1:18789 or wss://...
   *  Required when gatewayMode is "real". */
  gatewayUrl: string;
  /** Device/operator token for the dedicated client-agent gateway profile.
   *  Required when gatewayMode is "real". */
  gatewayToken: string;
  /** Which agent this UI talks to, inside the dedicated profile's gateway. */
  gatewayAgentId: string;

  /** WordPress origin the draft proxy fetches from, e.g. https://2026.solyxenergy.nl */
  wordpressOrigin: string;
  /** WordPress Application Password credentials for the agent's account. */
  wordpressUser: string;
  wordpressAppPassword: string;

  /** "password" (default) gates a signed session cookie behind a plain
   *  username+password login form; "access" verifies Cloudflare Access's
   *  JWT on every request; "clerk" uses Clerk's own session verification
   *  instead. See auth/authChecker.ts and README "Auth". */
  authMode: "password" | "access" | "clerk";

  /** Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com" —
   *  its /cdn-cgi/access/certs endpoint is the JWKS used to verify tokens.
   *  Required when authMode is "access". */
  cfAccessTeamDomain: string;
  /** AUD tag of the Cloudflare Access application protecting this app's
   *  hostname — verified against the JWT's `aud` claim. Required when
   *  authMode is "access". */
  cfAccessAud: string;

  /** Clerk secret key, server-side only. Required when authMode is "clerk". */
  clerkSecretKey: string;
  /** Clerk publishable key — not secret, but kept server-config-driven so the
   *  frontend build doesn't hardcode it either; injected at serve time.
   *  Required when authMode is "clerk". */
  clerkPublishableKey: string;

  /** Session cookie signing secret (auth/session.ts). Required when authMode
   *  is "password"; must be at least 32 characters — checked at startup, not
   *  left to fail quietly at first use, since a short/guessable secret would
   *  make forging a session cookie feasible. */
  sessionSecret: string;
  /** scrypt hash of the login password — "scrypt:<saltHex>:<hashHex>", see
   *  auth/passwordHash.ts and `npm run hash-password`. Required when
   *  authMode is "password". Never a plaintext password. Validated at
   *  startup (assertValidPasswordHash) so a malformed value fails fast. */
  authPasswordHash: string;
  /** Optional username shown on the login form. Only when authMode is
   *  "password"; when unset the field is still shown (cosmetic /
   *  password-manager friendliness) but not checked — see
   *  http/loginRoutes.ts. */
  authUsername: string;
  /** Session cookie lifetime, in days. Default 30 — one user, a business
   *  owner, who shouldn't have to type a password daily. */
  sessionMaxAgeDays: number;
  /** Empty by default (raw TCP socket address). When set to a header name
   *  (e.g. "CF-Connecting-IP"), the login rate limiter keys off that
   *  header's value instead — see http/clientIp.ts and README "Auth" for
   *  the exact deployment property that has to hold for this to be safe:
   *  nothing may be able to reach this app except through the one proxy
   *  that sets the header. Only meaningful when authMode is "password". */
  trustedProxyHeader: string;

  /** Directory containing the built frontend (packages/web/dist) to serve. */
  staticDir: string;
}

let cached: Config | undefined;

export function loadConfig(): Config {
  if (cached) return cached;

  const gatewayMode = optional("OPENCLAW_GATEWAY_MODE", "real");
  if (gatewayMode !== "real" && gatewayMode !== "stub") {
    throw new Error(`OPENCLAW_GATEWAY_MODE must be "real" or "stub", got: ${gatewayMode}`);
  }

  const authMode = optional("AUTH_MODE", "password");
  if (authMode !== "password" && authMode !== "access" && authMode !== "clerk") {
    throw new Error(`AUTH_MODE must be "password", "access", or "clerk", got: ${authMode}`);
  }

  const sessionSecret = authMode === "password" ? required("SESSION_SECRET") : optional("SESSION_SECRET", "");
  if (authMode === "password" && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long — generate one with e.g. `openssl rand -base64 48`.");
  }

  const authPasswordHash = authMode === "password" ? required("AUTH_PASSWORD_HASH") : optional("AUTH_PASSWORD_HASH", "");
  if (authMode === "password") {
    // Fails fast at startup on a malformed hash, not on the first login
    // attempt — see passwordHash.ts.
    assertValidPasswordHash(authPasswordHash);
  }

  const sessionMaxAgeDaysRaw = optional("SESSION_MAX_AGE_DAYS", "30");
  const sessionMaxAgeDays = Number(sessionMaxAgeDaysRaw);
  if (!Number.isFinite(sessionMaxAgeDays) || sessionMaxAgeDays <= 0) {
    throw new Error(`SESSION_MAX_AGE_DAYS must be a positive number, got: ${sessionMaxAgeDaysRaw}`);
  }

  cached = {
    port: Number(optional("PORT", "8787")),

    gatewayMode,
    gatewayUrl: gatewayMode === "real" ? required("OPENCLAW_GATEWAY_URL") : optional("OPENCLAW_GATEWAY_URL", ""),
    gatewayToken: gatewayMode === "real" ? required("OPENCLAW_GATEWAY_TOKEN") : optional("OPENCLAW_GATEWAY_TOKEN", ""),
    gatewayAgentId: optional("OPENCLAW_AGENT_ID", "sol"),

    wordpressOrigin: required("WORDPRESS_ORIGIN"),
    wordpressUser: required("WORDPRESS_APP_USER"),
    wordpressAppPassword: required("WORDPRESS_APP_PASSWORD"),

    authMode,
    cfAccessTeamDomain: authMode === "access" ? required("CF_ACCESS_TEAM_DOMAIN") : optional("CF_ACCESS_TEAM_DOMAIN", ""),
    cfAccessAud: authMode === "access" ? required("CF_ACCESS_AUD") : optional("CF_ACCESS_AUD", ""),

    clerkSecretKey: authMode === "clerk" ? required("CLERK_SECRET_KEY") : optional("CLERK_SECRET_KEY", ""),
    clerkPublishableKey: authMode === "clerk" ? required("CLERK_PUBLISHABLE_KEY") : optional("CLERK_PUBLISHABLE_KEY", ""),

    sessionSecret,
    authPasswordHash,
    authUsername: optional("AUTH_USERNAME", ""),
    sessionMaxAgeDays,
    trustedProxyHeader: optional("TRUSTED_PROXY_HEADER", ""),

    staticDir: optional("STATIC_DIR", "../web/dist"),
  };

  return cached;
}

/** Test-only escape hatch: reset the memoized config between test cases. */
export function resetConfigForTests(): void {
  cached = undefined;
}
