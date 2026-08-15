import type { ReactNode } from "react";
import { ClerkProvider, SignIn, useAuth } from "@clerk/react";
import { clerkPublishableKey } from "../env.js";

/**
 * AUTH_MODE=clerk only. App.tsx loads this via React.lazy so that in the
 * default AUTH_MODE=access build, @clerk/react and everything it pulls in
 * is never fetched or executed by the browser at all — not just unused,
 * genuinely never requested (see README "Auth").
 */
export default function ClerkGate({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <Gate>{children}</Gate>
    </ClerkProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <div className="login-screen">
        <SignIn />
      </div>
    );
  }
  return <>{children}</>;
}
