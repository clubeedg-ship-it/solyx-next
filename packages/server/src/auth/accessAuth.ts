import type { IncomingMessage } from "node:http";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Config } from "../config.js";
import type { AuthChecker, AuthResult } from "./types.js";

const JWT_HEADER = "cf-access-jwt-assertion";
const JWT_COOKIE = "CF_Authorization";

export interface AccessAuthOptions {
  /** Resolves the signing key used to verify a token. Defaults to a remote
   *  JWKS fetched from the team domain's Access certs endpoint, cached with
   *  the TTLs below. Overridable in tests to avoid a real network call —
   *  see test/accessAuth.test.ts. */
  getKey?: JWTVerifyGetKey;
}

/**
 * Verifies Cloudflare Access's signed JWT on every request. Access puts the
 * token on the `Cf-Access-Jwt-Assertion` header (HTTP requests, including
 * the WS upgrade request) and also on a `CF_Authorization` cookie (used as
 * a fallback here for parity, e.g. non-XHR navigations).
 *
 * This is real verification, not header-trusting: signature (via
 * Cloudflare's published JWKS), `aud` (the configured Access application's
 * AUD tag), `iss` (the team domain), and expiry are all checked. Any
 * request that reaches this origin directly (bypassing the tunnel/Access,
 * if that were ever possible) with a forged or stale header is rejected —
 * see README "Auth" for why this matters even though Access already blocks
 * unauthenticated traffic at the edge.
 *
 * Fails closed: any verification error (bad signature, wrong aud/iss,
 * expired, malformed, missing, or a JWKS fetch failure) returns
 * `authenticated: false`. It never throws out of isAuthenticated — a
 * hostile or malformed request must never crash the process (same
 * discipline as clerkAuth.ts).
 */
export function createAccessAuthChecker(
  config: Pick<Config, "cfAccessTeamDomain" | "cfAccessAud">,
  options: AccessAuthOptions = {},
): AuthChecker {
  const issuer = `https://${config.cfAccessTeamDomain}`;
  const jwksUrl = new URL("/cdn-cgi/access/certs", issuer);

  // jose's remote JWK set has its own built-in cache: cooldownDuration
  // limits how often an unrecognized `kid` can trigger a re-fetch (abuse
  // protection), cacheMaxAge is the hard upper bound on how stale the
  // cached key set is allowed to get before a fresh fetch is forced. These
  // are jose's own sane defaults, made explicit here rather than left
  // implicit.
  const getKey =
    options.getKey ??
    createRemoteJWKSet(jwksUrl, {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60 * 1000,
    });

  return {
    async isAuthenticated(request: IncomingMessage): Promise<AuthResult> {
      const token = extractToken(request);
      if (!token) return { authenticated: false };

      try {
        const { payload } = await jwtVerify(token, getKey, {
          issuer,
          audience: config.cfAccessAud,
        });
        const identity = typeof payload.email === "string" ? payload.email : undefined;
        return { authenticated: true, identity };
      } catch (error) {
        console.error("Cloudflare Access token verification failed, denying request:", error);
        return { authenticated: false };
      }
    },
  };
}

function extractToken(request: IncomingMessage): string | undefined {
  const header = request.headers[JWT_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader) return fromHeader;

  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader !== "string") return undefined;

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = part.slice(0, separatorIndex).trim();
    if (name !== JWT_COOKIE) continue;
    const value = part.slice(separatorIndex + 1).trim();
    if (!value) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}
