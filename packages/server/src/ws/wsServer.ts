import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AuthChecker } from "../auth/types.js";
import type { GatewayAdapter } from "../gateway/gatewayAdapter.js";
import type { ClientFrame, ServerFrame, SessionWire } from "./protocol.js";

export interface WsBridgeOptions {
  gateway: GatewayAdapter;
  auth: AuthChecker;
}

/**
 * The browser-facing bridge: one WebSocket connection per browser tab,
 * translating the small protocol in ./protocol.ts into GatewayAdapter calls.
 * This is the only place browser input reaches the Gateway adapter — the
 * browser itself never sees a Gateway credential (see README "Architecture").
 */
export function attachWsBridge(server: import("node:http").Server, options: WsBridgeOptions): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }

    void options.auth
      .isAuthenticated(request)
      .then((auth) => {
        if (!auth.authenticated) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      })
      // AuthChecker.isAuthenticated already fails closed internally, but an
      // upgrade request must never be left hanging or crash the process on
      // any other unexpected error either.
      .catch((error: unknown) => {
        console.error("WS upgrade auth check failed, denying:", error);
        socket.destroy();
      });
  });

  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    handleConnection(ws, options.gateway, request);
  });

  return wss;
}

function handleConnection(ws: WebSocket, gateway: GatewayAdapter, _request: IncomingMessage): void {
  const cancelers = new Map<string, () => void>();
  const unsubscribeSessions = gateway.subscribeSessions((session) => {
    send(ws, { type: "sessions.changed", session: toWire(session) });
  });

  ws.on("close", () => {
    unsubscribeSessions();
    for (const cancel of cancelers.values()) cancel();
    cancelers.clear();
  });

  ws.on("message", (raw) => {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    void handleFrame(frame, ws, gateway, cancelers);
  });
}

async function handleFrame(
  frame: ClientFrame,
  ws: WebSocket,
  gateway: GatewayAdapter,
  cancelers: Map<string, () => void>,
): Promise<void> {
  try {
    switch (frame.type) {
      case "sessions.list": {
        const sessions = await gateway.listSessions();
        respond(ws, frame.id, sessions.map(toWire));
        return;
      }
      case "sessions.create": {
        const session = await gateway.createSession();
        respond(ws, frame.id, toWire(session));
        return;
      }
      case "sessions.get": {
        const session = await gateway.getSession(frame.sessionKey);
        respond(ws, frame.id, toWire(session));
        return;
      }
      case "sessions.rename": {
        await gateway.renameSession(frame.sessionKey, frame.title);
        respond(ws, frame.id, null);
        return;
      }
      case "sessions.archive": {
        await gateway.archiveSession(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
      case "sessions.unarchive": {
        await gateway.unarchiveSession(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
      case "sessions.delete": {
        await gateway.deleteSession(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
      case "chat.send": {
        respond(ws, frame.id, null);
        const handle = gateway.sendMessage(frame.sessionKey, frame.text, {
          onDelta: (delta) => send(ws, { type: "assistant.delta", sessionKey: delta.sessionKey, text: delta.text }),
          onToolEvent: (event) =>
            send(ws, { type: "tool.event", sessionKey: event.sessionKey, tool: event.tool, at: event.at, args: event.payload }),
          onDone: () => {
            cancelers.delete(frame.sessionKey);
            send(ws, { type: "assistant.done", sessionKey: frame.sessionKey });
          },
          onError: (error) => {
            cancelers.delete(frame.sessionKey);
            send(ws, { type: "assistant.error", sessionKey: frame.sessionKey, error: error.message });
          },
        });
        cancelers.set(frame.sessionKey, handle.cancel);
        return;
      }
      case "chat.abort": {
        cancelers.get(frame.sessionKey)?.();
        cancelers.delete(frame.sessionKey);
        respond(ws, frame.id, null);
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ("id" in frame) {
      respondError(ws, frame.id, message);
    }
  }
}

function toWire(session: { sessionKey: string; title: string; updatedAt: string; archived: boolean }): SessionWire {
  return {
    sessionKey: session.sessionKey,
    title: session.title,
    updatedAt: session.updatedAt,
    archived: session.archived,
  };
}

function respond(ws: WebSocket, id: string, result: unknown): void {
  send(ws, { type: "result", id, ok: true, result });
}

function respondError(ws: WebSocket, id: string, error: string): void {
  send(ws, { type: "result", id, ok: false, error });
}

function send(ws: WebSocket, frame: ServerFrame): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}
