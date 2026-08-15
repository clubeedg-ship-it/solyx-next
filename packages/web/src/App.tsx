import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { ChatPane } from "./components/ChatPane.js";
import { DraftPanel } from "./components/DraftPanel.js";
import { Sidebar } from "./components/Sidebar.js";
import { authMode, backendWsUrl } from "./env.js";
import { BackendSocket } from "./runtime/backendSocket.js";
import { DraftSelectionStore } from "./runtime/draftSelection.js";
import { useBackendRuntime } from "./runtime/useBackendRuntime.js";

// Dynamically imported so the default AUTH_MODE=password (and AUTH_MODE=access)
// builds never pull @clerk/react into a chunk the browser actually fetches —
// see ClerkGate.tsx and README "Auth".
const ClerkGate = lazy(() => import("./auth/ClerkGate.js"));

export function App() {
  if (authMode === "clerk") {
    return (
      <Suspense fallback={null}>
        <ClerkGate>
          <AuthenticatedApp />
        </ClerkGate>
      </Suspense>
    );
  }

  // Password mode (default) and Cloudflare Access mode: in both, the
  // server has already gated this asset before the browser ever got it —
  // password mode's router redirects any unauthenticated request to
  // /login (packages/server/src/http/router.ts), Access mode blocks it at
  // Cloudflare's edge — so there is nothing left for the client to gate
  // on here; it just renders.
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const socket = useMemo(() => new BackendSocket(() => new WebSocket(backendWsUrl())), []);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    socket.connect().then(() => {
      if (!cancelled) setConnected(true);
    });
    return () => {
      cancelled = true;
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  if (!connected) {
    return (
      <div className="app-loading">
        <div className="app-loading-mark" aria-hidden="true" />
        <p className="app-loading-text">Connecting…</p>
      </div>
    );
  }

  // Only mounted once the socket is actually open — assistant-ui's
  // RemoteThreadListRuntime issues its first sessions.list request as soon
  // as it mounts, and BackendSocket.request() rejects outright if the
  // underlying socket isn't open yet.
  return <ConnectedApp socket={socket} />;
}

function ConnectedApp({ socket }: { socket: BackendSocket }) {
  const draftSelection = useMemo(() => new DraftSelectionStore(socket), [socket]);
  const runtime = useBackendRuntime(socket);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="layout">
        <Sidebar />
        <ChatPane />
        <DraftPanel store={draftSelection} />
      </div>
    </AssistantRuntimeProvider>
  );
}
