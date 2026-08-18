import type { IncomingMessage } from "node:http";
import { generateKeyPair, SignJWT, type CryptoKey, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createAccessAuthChecker } from "../src/auth/accessAuth.js";

const TEAM_DOMAIN = "solyx-webui-test.cloudflareaccess.com";
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUD = "test-application-aud-tag";
const EMAIL = "owner@solyxenergy.nl";

function fakeRequest(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("createAccessAuthChecker", () => {
  let privateKey: CryptoKey;
  let getKey: JWTVerifyGetKey;

  beforeAll(async () => {
    // A local, in-test key pair stands in for Cloudflare's real signing
    // key. `getKey` is injected (AccessAuthOptions.getKey) so verification
    // never makes a real network call to a JWKS endpoint — see
    // accessAuth.ts's default, which fetches from
    // https://<team-domain>/cdn-cgi/access/certs in production.
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey;
    getKey = async () => pair.publicKey;
  });

  function checker() {
    return createAccessAuthChecker({ cfAccessTeamDomain: TEAM_DOMAIN, cfAccessAud: AUD }, { getKey });
  }

  async function signToken(overrides: {
    audience?: string;
    issuer?: string;
    expirationTime?: number;
    email?: string;
  } = {}): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: overrides.email ?? EMAIL })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUD)
      .setIssuedAt()
      .setExpirationTime(overrides.expirationTime ?? nowSeconds + 300)
      .sign(privateKey);
  }

  it("accepts a validly signed token with the right audience and reports the email claim", async () => {
    const token = await signToken();
    const result = await checker().isAuthenticated(fakeRequest({ "cf-access-jwt-assertion": token }));
    expect(result).toEqual({ authenticated: true, identity: EMAIL });
  });

  it("accepts a token carried on the CF_Authorization cookie when there is no header", async () => {
    const token = await signToken();
    const result = await checker().isAuthenticated(fakeRequest({ cookie: `foo=bar; CF_Authorization=${token}` }));
    expect(result).toEqual({ authenticated: true, identity: EMAIL });
  });

  it("rejects an expired token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signToken({ expirationTime: nowSeconds - 60 });
    const result = await checker().isAuthenticated(fakeRequest({ "cf-access-jwt-assertion": token }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a token issued for a different Access application (wrong aud)", async () => {
    const token = await signToken({ audience: "some-other-applications-aud-tag" });
    const result = await checker().isAuthenticated(fakeRequest({ "cf-access-jwt-assertion": token }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a token from an unexpected issuer", async () => {
    const token = await signToken({ issuer: "https://not-our-team.cloudflareaccess.com" });
    const result = await checker().isAuthenticated(fakeRequest({ "cf-access-jwt-assertion": token }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects when neither the header nor the cookie carries a token", async () => {
    const result = await checker().isAuthenticated(fakeRequest({}));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a malformed token", async () => {
    const result = await checker().isAuthenticated(fakeRequest({ "cf-access-jwt-assertion": "not-a-real-jwt" }));
    expect(result).toEqual({ authenticated: false });
  });

  it("rejects a token signed with a different key (bad signature)", async () => {
    const otherPair = await generateKeyPair("ES256");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ email: EMAIL })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime(nowSeconds + 300)
      .sign(otherPair.privateKey);
    const result = await checker().isAuthenticated(fakeRequest({ "cf-access-jwt-assertion": token }));
    expect(result).toEqual({ authenticated: false });
  });
});
