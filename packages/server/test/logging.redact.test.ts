import { describe, expect, it } from "vitest";
import { redact } from "../src/logging/redact.js";

describe("redact", () => {
  it("redact() masks every Config secret and preserves non-secret fields", () => {
    const cfg = {
      port: 8099,
      host: "127.0.0.1",
      authMode: "password",
      wordpressOrigin: "https://2026.solyxenergy.nl",
      gatewayToken: "GATEWAY-TOKEN-SENTINEL",
      sessionSecret: "SESSION-SECRET-SENTINEL",
      clerkSecretKey: "CLERK-SECRET-SENTINEL",
      authPasswordHash: "AUTH-HASH-SENTINEL",
      wordpressAppPassword: "WP-APP-PASSWORD-SENTINEL",
    };
    const out = redact(cfg) as Record<string, unknown>;
    const serialized = JSON.stringify(out);

    for (const sentinel of [
      "GATEWAY-TOKEN-SENTINEL",
      "SESSION-SECRET-SENTINEL",
      "CLERK-SECRET-SENTINEL",
      "AUTH-HASH-SENTINEL",
      "WP-APP-PASSWORD-SENTINEL",
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(out.gatewayToken).toBe("[redacted]");
    expect(out.sessionSecret).toBe("[redacted]");
    expect(out.clerkSecretKey).toBe("[redacted]");
    expect(out.authPasswordHash).toBe("[redacted]");
    expect(out.wordpressAppPassword).toBe("[redacted]");

    expect(out.port).toBe(8099);
    expect(out.host).toBe("127.0.0.1");
    expect(out.authMode).toBe("password");
    expect(out.wordpressOrigin).toBe("https://2026.solyxenergy.nl");
  });

  it("redact() masks an Authorization: Basic header without exposing the base64 credential", () => {
    // Exact header shape built at src/proxy/draftProxy.ts:52 for every
    // /api/draft/:id call — the live WordPress application password.
    const credentials = Buffer.from("wpuser:APP-PASSWORD-SENTINEL").toString("base64");
    const out = redact({ Authorization: `Basic ${credentials}`, Accept: "text/html" }) as Record<string, unknown>;

    expect(out.Authorization).toBe("[redacted]");
    expect(JSON.stringify(out)).not.toContain(credentials);
    expect(JSON.stringify(out)).not.toContain("APP-PASSWORD-SENTINEL");
    expect(out.Accept).toBe("text/html");
  });

  it("redact() masks cookie / set-cookie / x-api-key case-insensitively", () => {
    const out = redact({
      Cookie: "solyx_session=COOKIE-SENTINEL",
      "set-cookie": "solyx_session=SETCOOKIE-SENTINEL",
      "X-Api-Key": "APIKEY-SENTINEL",
    });
    const serialized = JSON.stringify(out);

    expect(serialized).not.toContain("COOKIE-SENTINEL");
    expect(serialized).not.toContain("SETCOOKIE-SENTINEL");
    expect(serialized).not.toContain("APIKEY-SENTINEL");
  });
});
