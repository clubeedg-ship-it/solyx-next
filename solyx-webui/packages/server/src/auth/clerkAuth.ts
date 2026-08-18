import type { IncomingMessage } from "node:http";
import { createClerkClient } from "@clerk/backend";
import type { Config } from "../config.js";
import type { AuthChecker, AuthResult } from "./types.js";

/**
 * One user, one login: Clerk verifies the session cookie/token on every
 * HTTP request and on the WebSocket upgrade request (the WS handshake is
 * itself an HTTP request, so the same check applies before the socket is
 * accepted). Selected via AUTH_MODE=clerk — see README "Auth" for when to
 * use this instead of the default Cloudflare Access mode
 * (accessAuth.ts).
 */
export function createClerkAuthChecker(config: Pick<Config, "clerkSecretKey" | "clerkPublishableKey">): AuthChecker {
  const clerkClient = createClerkClient({
    secretKey: config.clerkSecretKey,
    publishableKey: config.clerkPublishableKey,
  });

  return {
    async isAuthenticated(request: IncomingMessage): Promise<AuthResult> {
      // Fail closed: any error verifying the session (a malformed cookie, a
      // Clerk API/network hiccup, a misconfigured key) means the request is
      // not authenticated — it must never crash the process. A single bad
      // or hostile request taking down the server for the one legitimate
      // user would be a much worse outcome than an extra denied request.
      try {
        const webRequest = toWebRequest(request);
        const state = await clerkClient.authenticateRequest(webRequest, {
          // Single-tenant app, no organization concept — accept any valid
          // signed-in session for the one account that exists.
        });
        if (!state.isSignedIn) return { authenticated: false };
        // Clerk's default session token doesn't carry an `email` claim
        // (that requires a custom JWT template this project doesn't
        // configure) — nothing downstream reads AuthResult.identity today,
        // so this is left unset rather than reaching for a claim that may
        // not exist. Access mode (accessAuth.ts) does fill it in, from the
        // JWT's `email` claim, which Cloudflare always sets.
        return { authenticated: true };
      } catch (error) {
        console.error("Auth check failed, denying request:", error);
        return { authenticated: false };
      }
    },
  };
}

/**
 * Clerk's server SDK verifies against a Fetch API Request. Node's
 * IncomingMessage carries the same information (headers, method, URL) but
 * in Node's own shape — this adapts one to the other without needing a full
 * HTTP framework.
 */
export function toWebRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? "localhost";
  const protocol = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  return new Request(url, { method: req.method ?? "GET", headers });
}
