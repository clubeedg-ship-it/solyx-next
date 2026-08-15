import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, createPasswordAuthChecker } from "../src/auth/passwordAuth.js";
import { createSessionToken } from "../src/auth/session.js";

const SECRET = "a".repeat(32);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fakeRequest(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("createPasswordAuthChecker", () => {
  function checker() {
    return createPasswordAuthChecker({ sessionSecret: SECRET });
  }

  it("accepts a request carrying a validly signed, unexpired session cookie", async () => {
    const token = createSessionToken(SECRET, ONE_DAY_MS);
    const result = await checker().isAuthenticated(fakeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` }));
    expect(result).toEqual({ authenticated: true });
  });

  it("rejects a request with no cookie header at all", async () => {
    const result = await checker().isAuthenticated(fakeRequest({}));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a request whose cookie header doesn't include the session cookie", async () => {
    const result = await checker().isAuthenticated(fakeRequest({ cookie: "other=value; unrelated=1" }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a tampered cookie (signature no longer matches)", async () => {
    const token = createSessionToken(SECRET, ONE_DAY_MS);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const result = await checker().isAuthenticated(fakeRequest({ cookie: `${SESSION_COOKIE_NAME}=${tampered}` }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects an expired session", async () => {
    const token = createSessionToken(SECRET, -1);
    const result = await checker().isAuthenticated(fakeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a cookie signed with a different secret", async () => {
    const token = createSessionToken("different-secret-that-is-32-chars", ONE_DAY_MS);
    const result = await checker().isAuthenticated(fakeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` }));
    expect(result).toEqual({ authenticated: false });
  });
});
