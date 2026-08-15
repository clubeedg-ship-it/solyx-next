import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthChecker } from "../src/auth/authChecker.js";
import { hashPassword } from "../src/auth/passwordHash.js";
import { SESSION_COOKIE_NAME } from "../src/auth/passwordAuth.js";
import { createSessionToken } from "../src/auth/session.js";
import type { Config } from "../src/config.js";
import { createRequestListener } from "../src/http/router.js";

// End-to-end coverage of AUTH_MODE=password's request-listener wiring —
// login/logout routes, and the "every other route fails closed" gate in
// router.ts — against a real http.Server, the same way wsServer.test.ts
// exercises the WS bridge. Unit-level coverage of the individual pieces
// (hashing, session signing, the AuthChecker itself, the rate limiter) is
// in passwordHash.test.ts / session.test.ts / passwordAuth.test.ts /
// loginRateLimiter.test.ts — this file is specifically about them wired
// together the way a real request experiences them.

const TEST_PASSWORD = "correct horse battery staple";
const SESSION_SECRET = "s".repeat(32);

function fakeConfig(overrides: Partial<Config> = {}, staticDir: string): Config {
  return {
    port: 0,
    gatewayMode: "stub",
    gatewayUrl: "",
    gatewayToken: "",
    gatewayAgentId: "sol",
    wordpressOrigin: "http://127.0.0.1:1",
    wordpressUser: "agent",
    wordpressAppPassword: "irrelevant",
    authMode: "password",
    cfAccessTeamDomain: "",
    cfAccessAud: "",
    clerkSecretKey: "",
    clerkPublishableKey: "",
    sessionSecret: SESSION_SECRET,
    authPasswordHash: hashPassword(TEST_PASSWORD),
    authUsername: "",
    sessionMaxAgeDays: 30,
    trustedProxyHeader: "",
    staticDir,
    ...overrides,
  };
}

function startServer(config: Config): { server: Server; url: string } {
  const auth = createAuthChecker(config);
  const server = createServer(createRequestListener({ config, auth }));
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

function setCookieValue(response: Response): string | undefined {
  const raw = response.headers.get("set-cookie");
  if (!raw) return undefined;
  return raw.split(";")[0];
}

describe("AUTH_MODE=password request listener", () => {
  let staticDir: string;
  let openServer: Server | undefined;

  beforeAll(() => {
    staticDir = mkdtempSync(join(tmpdir(), "solyx-webui-login-test-"));
    writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>app shell</title>");
  });

  afterAll(() => {
    rmSync(staticDir, { recursive: true, force: true });
  });

  afterEach(() => {
    openServer?.close();
    openServer = undefined;
  });

  it("redirects an unauthenticated request for the app shell to /login", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const res = await fetch(`${url}/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("fails the draft proxy closed (401) for an unauthenticated request, not a redirect loop", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const res = await fetch(`${url}/api/draft/42`, { redirect: "manual" });
    expect(res.status).toBe(401);
  });

  it("serves the login page without requiring auth", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const res = await fetch(`${url}/login`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('name="password"');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts the correct password: sets a session cookie and redirects to /", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const res = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: "owner", password: TEST_PASSWORD }),
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const cookie = setCookieValue(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));

    // That cookie now unlocks a previously-gated route.
    const authed = await fetch(`${url}/`, { headers: { Cookie: cookie! } });
    expect(authed.status).toBe(200);
    expect(await authed.text()).toContain("app shell");
  });

  it("rejects the wrong password: no cookie is set, protected routes stay locked", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const res = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: "owner", password: "not-the-password" }),
      redirect: "manual",
    });

    expect(res.status).toBe(401);
    expect(setCookieValue(res)).toBeUndefined();

    const stillLocked = await fetch(`${url}/`, { redirect: "manual" });
    expect(stillLocked.status).toBe(302);
    expect(stillLocked.headers.get("location")).toBe("/login");
  });

  it("rejects a request with a tampered session cookie", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const login = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: TEST_PASSWORD }),
      redirect: "manual",
    });
    const cookie = setCookieValue(login)!;
    const [name, value] = cookie.split("=");
    const tamperedValue = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");

    const res = await fetch(`${url}/`, { headers: { Cookie: `${name}=${tamperedValue}` }, redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("rejects an expired session cookie", async () => {
    // config.sessionMaxAgeDays must be a positive number of days, so a
    // real login can't produce an already-expired cookie through the HTTP
    // surface — this issues one directly with the same secret the server
    // is configured with (createSessionToken(secret, -1), same as
    // session.test.ts) and presents it over HTTP, which is exactly what an
    // expired cookie looks like from the server's point of view.
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const expiredToken = createSessionToken(SESSION_SECRET, -1);
    const res = await fetch(`${url}/`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${expiredToken}` },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("logs out: clears the cookie and the protected route locks again", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    const login = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: TEST_PASSWORD }),
      redirect: "manual",
    });
    const cookie = setCookieValue(login)!;

    const logout = await fetch(`${url}/logout`, { headers: { Cookie: cookie }, redirect: "manual" });
    expect(logout.status).toBe(302);
    expect(logout.headers.get("location")).toBe("/login");
    const cleared = setCookieValue(logout)!;
    expect(cleared).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;?`));

    const afterLogout = await fetch(`${url}/`, { headers: { Cookie: cleared }, redirect: "manual" });
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.get("location")).toBe("/login");
  });

  it("engages the rate limiter after repeated failures, independent of whether the password is later correct", async () => {
    const { server, url } = startServer(fakeConfig({}, staticDir));
    openServer = server;

    async function attempt(password: string) {
      return fetch(`${url}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ password }),
        redirect: "manual",
      });
    }

    // The free-attempt budget (5) is exhausted by five wrong attempts, all
    // still plain rejections rather than a lockout.
    for (let i = 0; i < 5; i++) {
      const res = await attempt("wrong");
      expect(res.status).toBe(401);
    }

    // The 6th failure is the one that engages the lockout.
    const sixth = await attempt("wrong");
    expect(sixth.status).toBe(401);

    // Now even the *correct* password is turned away — the limiter, not
    // the credential check, is what's answering.
    const rateLimited = await attempt(TEST_PASSWORD);
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get("retry-after")).toBeTruthy();
    expect(setCookieValue(rateLimited)).toBeUndefined();
  });

  describe("TRUSTED_PROXY_HEADER", () => {
    const HEADER_NAME = "CF-Connecting-IP";

    async function attempt(url: string, password: string, headers: Record<string, string> = {}) {
      return fetch(`${url}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams({ password }),
        redirect: "manual",
      });
    }

    it("gives two different header values independent lockout buckets, so one attacker can't lock out another visitor", async () => {
      const { server, url } = startServer(fakeConfig({ trustedProxyHeader: HEADER_NAME }, staticDir));
      openServer = server;

      // An attacker hammering behind one apparent client IP...
      for (let i = 0; i < 6; i++) {
        await attempt(url, "wrong", { [HEADER_NAME]: "203.0.113.9" });
      }
      const attackerLockedOut = await attempt(url, TEST_PASSWORD, { [HEADER_NAME]: "203.0.113.9" });
      expect(attackerLockedOut.status).toBe(429);

      // ...must not affect the real client behind a different one, even
      // against the very same server instance.
      const realClient = await attempt(url, TEST_PASSWORD, { [HEADER_NAME]: "198.51.100.1" });
      expect(realClient.status).toBe(302);
      expect(setCookieValue(realClient)).toBeTruthy();
    });

    it("falls back to the socket address (still enforcing the limit) when the configured header is absent", async () => {
      const { server, url } = startServer(fakeConfig({ trustedProxyHeader: HEADER_NAME }, staticDir));
      openServer = server;

      // No CF-Connecting-IP header on any of these — must not be treated
      // as "skip the limit"; it must still accumulate against the socket
      // address (all these requests share one, from this test's loopback
      // connection) and eventually lock out.
      for (let i = 0; i < 6; i++) {
        await attempt(url, "wrong");
      }
      const res = await attempt(url, TEST_PASSWORD);
      expect(res.status).toBe(429);
    });

    it("falls back to the socket address (still enforcing the limit) when the configured header is present but unparseable", async () => {
      const { server, url } = startServer(fakeConfig({ trustedProxyHeader: HEADER_NAME }, staticDir));
      openServer = server;

      for (let i = 0; i < 6; i++) {
        await attempt(url, "wrong", { [HEADER_NAME]: "not-an-ip" });
      }
      const res = await attempt(url, TEST_PASSWORD, { [HEADER_NAME]: "not-an-ip" });
      expect(res.status).toBe(429);
    });
  });
});
