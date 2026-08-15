import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveClientIp } from "../src/http/clientIp.js";

function fakeRequest(headers: Record<string, string | string[]>, remoteAddress: string | undefined): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe("resolveClientIp", () => {
  it("uses the socket address when no trusted proxy header is configured", () => {
    const req = fakeRequest({ "cf-connecting-ip": "203.0.113.9" }, "10.0.0.5");
    expect(resolveClientIp(req, "")).toBe("10.0.0.5");
  });

  it("uses the configured header's value when present and well-formed (IPv4)", () => {
    const req = fakeRequest({ "cf-connecting-ip": "203.0.113.9" }, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("203.0.113.9");
  });

  it("uses the configured header's value when present and well-formed (IPv6)", () => {
    const req = fakeRequest({ "cf-connecting-ip": "2001:db8::1" }, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("2001:db8::1");
  });

  it("matches the configured header name case-insensitively (Node lowercases headers)", () => {
    const req = fakeRequest({ "cf-connecting-ip": "203.0.113.9" }, "127.0.0.1");
    expect(resolveClientIp(req, "cf-connecting-ip")).toBe("203.0.113.9");
  });

  it("falls back to the socket address when the configured header is missing", () => {
    const req = fakeRequest({}, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("127.0.0.1");
  });

  it("falls back to the socket address when the header value doesn't look like an IP", () => {
    const req = fakeRequest({ "cf-connecting-ip": "not-an-ip" }, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("127.0.0.1");
  });

  it("falls back to the socket address when the header value is empty", () => {
    const req = fakeRequest({ "cf-connecting-ip": "" }, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("127.0.0.1");
  });

  it("falls back to the socket address when an IPv4-shaped value has an out-of-range octet", () => {
    const req = fakeRequest({ "cf-connecting-ip": "999.0.0.1" }, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("127.0.0.1");
  });

  it("falls back to the socket address when the header arrives as a comma-separated list", () => {
    // CF-Connecting-IP is always single-valued in practice, but a header
    // that somehow arrives looking like an X-Forwarded-For list must not
    // be trusted as-is.
    const req = fakeRequest({ "cf-connecting-ip": "203.0.113.9, 198.51.100.1" }, "127.0.0.1");
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("127.0.0.1");
  });

  it("gives two different header values two different resolved addresses", () => {
    const reqA = fakeRequest({ "cf-connecting-ip": "203.0.113.9" }, "127.0.0.1");
    const reqB = fakeRequest({ "cf-connecting-ip": "198.51.100.1" }, "127.0.0.1");
    const resolvedA = resolveClientIp(reqA, "CF-Connecting-IP");
    const resolvedB = resolveClientIp(reqB, "CF-Connecting-IP");
    expect(resolvedA).not.toBe(resolvedB);
  });

  it("falls back to \"unknown\" when both the header and the socket address are unavailable", () => {
    const req = fakeRequest({}, undefined);
    expect(resolveClientIp(req, "CF-Connecting-IP")).toBe("unknown");
  });
});
