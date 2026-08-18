import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "../src/auth/session.js";

const SECRET = "a".repeat(32);
const OTHER_SECRET = "b".repeat(32);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("createSessionToken / verifySessionToken", () => {
  it("accepts a freshly issued, unexpired token", () => {
    const token = createSessionToken(SECRET, ONE_DAY_MS);
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("rejects a token that has already expired", () => {
    const token = createSessionToken(SECRET, -1);
    expect(verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects a token verified against a different secret", () => {
    const token = createSessionToken(SECRET, ONE_DAY_MS);
    expect(verifySessionToken(token, OTHER_SECRET)).toBe(false);
  });

  it("rejects a token whose payload has been tampered with (signature mismatch)", () => {
    const token = createSessionToken(SECRET, ONE_DAY_MS);
    const [payloadB64, signature] = token.split(".");
    // Flip the payload to try to extend the expiry, keeping the original
    // signature — this must not verify, even though the signature is a
    // real one issued by this secret for a *different* payload.
    const forgedPayload = Buffer.from(JSON.stringify({ exp: Date.now() + 365 * ONE_DAY_MS })).toString("base64url");
    expect(forgedPayload).not.toBe(payloadB64);
    const forged = `${forgedPayload}.${signature}`;
    expect(verifySessionToken(forged, SECRET)).toBe(false);
  });

  it("rejects a token with a bit flipped in the signature itself", () => {
    const token = createSessionToken(SECRET, ONE_DAY_MS);
    const [payloadB64, signature] = token.split(".");
    const tamperedChar = signature[0] === "A" ? "B" : "A";
    const tampered = `${payloadB64}.${tamperedChar}${signature.slice(1)}`;
    expect(verifySessionToken(tampered, SECRET)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifySessionToken("", SECRET)).toBe(false);
    expect(verifySessionToken("not-a-token-at-all", SECRET)).toBe(false);
    expect(verifySessionToken("a.b.c", SECRET)).toBe(false);
    expect(verifySessionToken(".", SECRET)).toBe(false);
  });

  it("rejects a validly-signed payload that isn't the expected JSON shape", () => {
    // A correctly signed token whose payload is not `{ exp: number }` at
    // all — this isolates the post-signature-check JSON/shape validation
    // (session.ts's own `sign` is re-derived here with the same
    // construction, since it isn't exported) from signature verification,
    // which the other tests above already cover.
    const payloadB64 = Buffer.from("not json").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
    expect(verifySessionToken(`${payloadB64}.${signature}`, SECRET)).toBe(false);

    const noExpPayload = Buffer.from(JSON.stringify({ hello: "world" })).toString("base64url");
    const noExpSignature = createHmac("sha256", SECRET).update(noExpPayload).digest("base64url");
    expect(verifySessionToken(`${noExpPayload}.${noExpSignature}`, SECRET)).toBe(false);
  });
});
