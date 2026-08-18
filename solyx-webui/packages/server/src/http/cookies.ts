import type { IncomingMessage } from "node:http";

/** Reads a single cookie by name from the `Cookie` request header. Mirrors
 *  accessAuth.ts's own local cookie parsing (kept independent rather than
 *  shared — see that file's `extractToken`) — this is the version used by
 *  the password-mode session cookie (passwordAuth.ts) and the login route. */
export function getCookie(request: Pick<IncomingMessage, "headers">, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader !== "string") return undefined;

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key !== name) continue;
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

export interface CookieOptions {
  maxAgeSeconds?: number;
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  /** Defaults to true. The one reason to ever set this false is exercising
   *  the cookie over plain HTTP in a local, non-browser test — never do
   *  this in a real deployment (see README "Auth": this cookie is the only
   *  thing gating a directly internet-reachable app). */
  secure?: boolean;
}

/** Builds a `Set-Cookie` header value for the signed session token:
 *  `HttpOnly` (never readable from JS — irrelevant to XSS exfiltration),
 *  `Secure` (never sent over plain HTTP), `SameSite=Lax` (sent on top-level
 *  navigation, e.g. the redirect after login, but not on cross-site
 *  subrequests). */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const segments = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.maxAgeSeconds !== undefined) segments.push(`Max-Age=${Math.floor(options.maxAgeSeconds)}`);
  segments.push("HttpOnly");
  if (options.secure ?? true) segments.push("Secure");
  segments.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return segments.join("; ");
}

/** A `Set-Cookie` header value that immediately expires the cookie — used
 *  by the logout route. */
export function clearedCookie(name: string, options: Pick<CookieOptions, "path" | "secure"> = {}): string {
  return serializeCookie(name, "", { path: options.path, maxAgeSeconds: 0, secure: options.secure });
}
