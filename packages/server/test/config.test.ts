import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config.js";

// Enough environment for loadConfig to succeed without a real password hash:
// Cloudflare Access mode plus the in-process stub Gateway.
const MINIMAL_ENV = {
  AUTH_MODE: "access",
  CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud-for-tests",
  OPENCLAW_GATEWAY_MODE: "stub",
  WORDPRESS_ORIGIN: "https://example.test",
  WORDPRESS_APP_USER: "tester",
  WORDPRESS_APP_PASSWORD: "app-password-for-tests",
} as const;

describe("loadConfig", () => {
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
    for (const key of ["HOST", "PORT", "OPENCLAW_AGENT_ID"]) {
      delete process.env[key];
    }
    Object.assign(process.env, MINIMAL_ENV);
    resetConfigForTests();
  });

  afterEach(() => {
    process.env = saved;
    resetConfigForTests();
  });

  // cloudflared terminates the public tunnel on this same host and only ever
  // dials 127.0.0.1. A wildcard bind therefore does nothing for the tunnel and
  // everything for an attacker: it puts the client dashboard on the LAN and the
  // tailnet with Cloudflare Access skipped entirely.
  it("binds loopback by default so the tunnel cannot be side-stepped", () => {
    expect(loadConfig().host).toBe("127.0.0.1");
  });

  it("still honours an explicit bind address for other deployments", () => {
    process.env.HOST = "0.0.0.0";
    resetConfigForTests();
    expect(loadConfig().host).toBe("0.0.0.0");
  });

  // There is no agent called "sol"; the real id is "solyx". A wrong default
  // here surfaces as a Gateway error mid-conversation rather than at boot.
  it("defaults the agent id to an agent that actually exists", () => {
    expect(loadConfig().gatewayAgentId).toBe("solyx");
  });
});
