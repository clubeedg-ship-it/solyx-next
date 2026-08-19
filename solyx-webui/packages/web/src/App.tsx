import { Suspense, lazy, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { ChatPane } from "./components/ChatPane.js";
import { DraftPanel } from "./components/DraftPanel.js";
import { PanelDivider } from "./components/PanelDivider.js";
import { Sidebar } from "./components/Sidebar.js";
import { authMode, backendWsUrl } from "./env.js";
import { BackendSocket } from "./runtime/backendSocket.js";
import { DraftSelectionStore } from "./runtime/draftSelection.js";
import { columnWidth } from "./runtime/panelLayout.js";
import { usePanelLayout } from "./runtime/usePanelLayout.js";
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
  const layout = usePanelLayout();

  // The grid's two side columns are driven from state; the chat pane keeps
  // whatever is left. Written as custom properties rather than an inline
  // grid-template-columns so styles.css still owns the shape of the layout
  // (five columns, dividers included) and this file only supplies the two
  // numbers that change.
  const columns = {
    "--layout-left": `${columnWidth(layout.state.left)}px`,
    "--layout-right": `${columnWidth(layout.state.right)}px`,
  } as CSSProperties;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="layout" style={columns}>
        <Sidebar collapsed={layout.state.left.collapsed} onToggleCollapsed={() => layout.toggle("left")} />
        <PanelDivider
          side="left"
          label="Resize sidebar"
          width={layout.state.left.width}
          collapsed={layout.state.left.collapsed}
          onResize={(pointerX) => layout.resize("left", pointerX)}
          onNudge={(delta) => layout.nudge("left", delta)}
          onReset={() => layout.reset("left")}
          onToggle={() => layout.toggle("left")}
        />
        <ChatPane />
        <PanelDivider
          side="right"
          label="Resize draft preview"
          width={layout.state.right.width}
          collapsed={layout.state.right.collapsed}
          onResize={(pointerX) => layout.resize("right", pointerX)}
          onNudge={(delta) => layout.nudge("right", delta)}
          onReset={() => layout.reset("right")}
          onToggle={() => layout.toggle("right")}
        />
        <DraftPanel
          store={draftSelection}
          collapsed={layout.state.right.collapsed}
          onToggleCollapsed={() => layout.toggle("right")}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}
