import type { IncomingMessage } from "node:http";

// Resolves the bucket key the login rate limiter uses to tell one visitor
// from another (loginRateLimiter.ts). By default this is the raw TCP
// socket address — safe under any deployment topology, since nothing a
// client sends can forge it, but it only actually distinguishes visitors
// when nothing sits between them and this process.
//
// TRUSTED_PROXY_HEADER (config.ts) opts into reading a specific header
// instead, e.g. Cloudflare's `CF-Connecting-IP`. That is only safe when
// this app cannot be reached except through the one proxy that sets that
// header — see README "Auth" for the full explanation of why (binding to
// loopback, with a tunnel as the sole ingress, is what enforces it in this
// app's actual deployment) — so it defaults to off, opt-in only.
//
// When configured but the header is missing or its value doesn't look like
// an IP address on a given request, this falls back to that request's
// socket address rather than either lumping every such request into one
// shared bucket (which a missing/malformed header could otherwise be
// abused to force) or skipping the rate limit outright for it.

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function looksLikeIp(value: string): boolean {
  const ipv4 = IPV4_RE.exec(value);
  if (ipv4) {
    return ipv4.slice(1).every((segment) => Number(segment) <= 255);
  }
  // Permissive IPv6 check — hex digits and colons, at least one colon. Not
  // a full RFC 4291 parse, just enough to reject empty/garbage/list values
  // without a dependency for it; CF-Connecting-IP is always a single
  // address, never a comma-separated list like X-Forwarded-For.
  return value.includes(":") && /^[0-9a-fA-F:]+$/.test(value);
}

export function resolveClientIp(req: IncomingMessage, trustedProxyHeader: string): string {
  const socketAddress = req.socket.remoteAddress ?? "unknown";
  if (!trustedProxyHeader) return socketAddress;

  // Node lowercases incoming header names.
  const raw = req.headers[trustedProxyHeader.toLowerCase()];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (value && looksLikeIp(value)) return value;

  return socketAddress;
}
