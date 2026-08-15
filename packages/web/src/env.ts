export type AuthMode = "password" | "access" | "clerk";

// AUTH_MODE (server env var name) is threaded into the client bundle by
// vite.config.ts's `define`, as VITE_AUTH_MODE — see that file's comment
// for why this isn't just a second env var the operator has to keep in
// sync by hand. Anything other than the literals "clerk"/"access" is
// treated as the default, "password".
const rawAuthMode = import.meta.env.VITE_AUTH_MODE as string | undefined;
export const authMode: AuthMode = rawAuthMode === "clerk" ? "clerk" : rawAuthMode === "access" ? "access" : "password";

// Not secret — Clerk publishable keys are meant to ship in the frontend
// bundle. Baked in at build time via Vite's env handling (see .env.example
// / README "Env vars"). The matching secret key stays server-side only
// (packages/server/src/config.ts).
//
// Only required in Clerk mode. Password and Access modes never load Clerk
// at all (see App.tsx's lazy-loaded ClerkGate) — the server already gates
// every asset (password mode's login redirect, or Access at the edge)
// before the browser gets here, so this must not throw unconditionally — a
// build with AUTH_MODE=password or AUTH_MODE=access and no Clerk key
// configured is the expected, supported case.
export const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (authMode === "clerk" && !clerkPublishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is not set — see .env.example.");
}

export function backendWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
