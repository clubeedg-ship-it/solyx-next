import type { IncomingMessage } from "node:http";

export interface AuthResult {
  /** True if the request carries a valid, verified session/token. */
  authenticated: boolean;
  /** Verified identity (email), when the auth mode can determine one.
   *  Cloudflare Access mode fills this in from the JWT's `email` claim. */
  identity?: string;
}

export interface AuthChecker {
  /** Verifies the request and reports who (if anyone) it's authenticated as.
   *  Both AUTH_MODE implementations (clerkAuth.ts, accessAuth.ts) fail
   *  closed: any verification error means `authenticated: false`, never a
   *  thrown exception that could crash the process. */
  isAuthenticated(request: IncomingMessage): Promise<AuthResult>;
}
