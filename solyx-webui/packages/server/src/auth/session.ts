import { createHmac, timingSafeEqual } from "node:crypto";

// AUTH_MODE=password's session token: `<payload>.<signature>`, both
// base64url. No server-side session store — the token carries its own
// expiry (`exp`, unix ms), so a stolen cookie stops working on its own once
// it passes, and restarting the process doesn't need to invalidate anything
// (there's nothing to invalidate). This is the only thing standing between
// the public internet and this app once Cloudflare Access is removed (see
// README "Auth"), so it is built the same way a JWT's HMAC variant (HS256)
// is: sign-then-verify with a constant-time comparison, never a
// string-equality check on the token itself.

const ENCODING = "base64url";

interface SessionPayload {
  exp: number;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest(ENCODING);
}

/** Issues a signed session token valid for `maxAgeMs` from now. */
export function createSessionToken(secret: string, maxAgeMs: number): string {
  const payload: SessionPayload = { exp: Date.now() + maxAgeMs };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString(ENCODING);
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verifies a session token: signature first (constant-time), then expiry.
 * Never throws — a missing, malformed, tampered, or expired token is simply
 * invalid, same fail-closed discipline as accessAuth.ts / clerkAuth.ts.
 *
 * Signature is checked before the payload is ever parsed or its expiry
 * inspected, so a request cannot learn anything about a token's contents
 * (e.g. how close to expiry it is) without first producing a validly signed
 * one — the JSON parse only runs once the HMAC has already matched.
 */
export function verifySessionToken(token: string, secret: string): boolean {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;

  const payloadB64 = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);
  const expectedSignature = sign(payloadB64, secret);

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, ENCODING).toString("utf8")) as Partial<SessionPayload>;
    return typeof payload.exp === "number" && Date.now() < payload.exp;
  } catch {
    return false;
  }
}
