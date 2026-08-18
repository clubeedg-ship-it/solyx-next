import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { AuthChecker } from "../src/auth/types.js";
import type { GatewayAdapter } from "../src/gateway/gatewayAdapter.js";
import type { SessionSummary } from "../src/gateway/types.js";
import { attachWsBridge } from "../src/ws/wsServer.js";
import type { ClientFrame, ServerFrame } from "../src/ws/protocol.js";

function fakeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionKey: "s1",
    title: "Onderhoud",
    updatedAt: "2026-08-12T00:00:00Z",
    hasTitle: true,
    archived: false,
    ...overrides,
  };
}

function startServer(gateway: Partial<GatewayAdapter>, auth: AuthChecker): { server: Server; url: string } {
  const server = createServer((_req, res) => res.writeHead(404).end());
  attachWsBridge(server, { gateway: gateway as GatewayAdapter, auth });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, url: `ws://127.0.0.1:${port}/ws` };
}

/**
 * A server can send several frames synchronously back-to-back in response
 * to one client message (e.g. an ack immediately followed by streamed
 * deltas). When that happens, the underlying socket may deliver them in one
 * batch, and `ws` emits all of the resulting 'message' events in the same
 * synchronous turn — before a fresh `ws.once("message", ...)` registered by
 * an `await`ed continuation would even attach. A queue attached once up
 * front, rather than a new `once` listener per awaited frame, is what
 * avoids silently dropping frames 2..n of a batch.
 */
class FrameQueue {
  private readonly buffered: ServerFrame[] = [];
  private waiter: ((frame: ServerFrame) => void) | undefined;

  constructor(ws: WebSocket) {
    ws.on("message", (raw) => {
      const frame: ServerFrame = JSON.parse(raw.toString());
      if (this.waiter) {
        const waiter = this.waiter;
        this.waiter = undefined;
        waiter(frame);
      } else {
        this.buffered.push(frame);
      }
    });
  }

  next(): Promise<ServerFrame> {
    const buffered = this.buffered.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }
}

async function connect(url: string): Promise<{ ws: WebSocket; frames: FrameQueue }> {
  const ws = new WebSocket(url);
  const frames = new FrameQueue(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, frames };
}

function send(ws: WebSocket, frame: ClientFrame): void {
  ws.send(JSON.stringify(frame));
}

const alwaysAuthenticated: AuthChecker = { isAuthenticated: async () => ({ authenticated: true }) };
const neverAuthenticated: AuthChecker = { isAuthenticated: async () => ({ authenticated: false }) };

describe("attachWsBridge", () => {
  let openServer: Server | undefined;

  afterEach(() => {
    openServer?.close();
    openServer = undefined;
  });

  it("rejects the upgrade when the caller is not authenticated", async () => {
    const { server, url } = startServer({}, neverAuthenticated);
    openServer = server;

    const ws = new WebSocket(url);
    const failure = await new Promise<Error>((resolve) => {
      ws.once("error", resolve);
      ws.once("unexpected-response", (_req, res) => resolve(new Error(`status ${res.statusCode}`)));
    });
    expect(failure.message).toContain("401");
  });

  it("answers sessions.list with the sessions the gateway reports", async () => {
    const gateway: Partial<GatewayAdapter> = {
      listSessions: async () => [fakeSession({ sessionKey: "s1" }), fakeSession({ sessionKey: "s2", title: "Besparingen" })],
      subscribeSessions: () => () => {},
    };
    const { server, url } = startServer(gateway, alwaysAuthenticated);
    openServer = server;

    const { ws, frames } = await connect(url);
    send(ws, { id: "req-1", type: "sessions.list" });
    const reply = await frames.next();

    expect(reply).toMatchObject({ type: "result", id: "req-1", ok: true });
    if (reply.type === "result" && reply.ok) {
      expect(reply.result).toEqual([
        expect.objectContaining({ sessionKey: "s1" }),
        expect.objectContaining({ sessionKey: "s2", title: "Besparingen" }),
      ]);
    }
    ws.close();
  });

  it("carries hasTitle:false through to the wire for an untitled session", async () => {
    const gateway: Partial<GatewayAdapter> = {
      listSessions: async () => [fakeSession({ sessionKey: "s1", title: "New chat", hasTitle: false })],
      subscribeSessions: () => () => {},
    };
    const { server, url } = startServer(gateway, alwaysAuthenticated);
    openServer = server;

    const { ws, frames } = await connect(url);
    send(ws, { id: "req-1", type: "sessions.list" });
    const reply = await frames.next();

    expect(reply).toMatchObject({ type: "result", id: "req-1", ok: true });
    if (reply.type === "result" && reply.ok) {
      expect(reply.result).toEqual([expect.objectContaining({ sessionKey: "s1", hasTitle: false })]);
    }
    ws.close();
  });

  it("forwards sessions.changed pushes from the gateway to the browser", async () => {
    let pushChange: ((session: SessionSummary) => void) | undefined;
    const gateway: Partial<GatewayAdapter> = {
      subscribeSessions: (cb) => {
        pushChange = cb;
        return () => {};
      },
    };
    const { server, url } = startServer(gateway, alwaysAuthenticated);
    openServer = server;

    const { ws, frames } = await connect(url);
    // Give the connection handler a tick to call subscribeSessions.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const framePromise = frames.next();
    pushChange?.(fakeSession({ sessionKey: "s9", title: "Nieuwe titel" }));
    const frame = await framePromise;

    // hasTitle must survive the trip to the wire — gatewayAdapter.ts computes
    // it (toSessionSummary), but toWire() used to drop it, forcing the client
    // to string-match the literal "New chat" placeholder instead of reading
    // the real signal. See threadListFilter.ts for the client-side fallout.
    expect(frame).toEqual({
      type: "sessions.changed",
      session: {
        sessionKey: "s9",
        title: "Nieuwe titel",
        updatedAt: "2026-08-12T00:00:00Z",
        hasTitle: true,
        archived: false,
      },
    });
    ws.close();
  });

  it("streams assistant.delta then assistant.done for chat.send", async () => {
    const gateway: Partial<GatewayAdapter> = {
      subscribeSessions: () => () => {},
      sendMessage: (sessionKey, _text, handlers) => {
        handlers.onDelta({ sessionKey, text: "Bezig..." });
        handlers.onDone();
        return { cancel: () => {} };
      },
    };
    const { server, url } = startServer(gateway, alwaysAuthenticated);
    openServer = server;

    const { ws, frames } = await connect(url);
    send(ws, { id: "req-1", type: "chat.send", sessionKey: "s1", text: "Hallo" });

    const ack = await frames.next();
    expect(ack).toEqual({ type: "result", id: "req-1", ok: true, result: null });

    const delta = await frames.next();
    expect(delta).toEqual({ type: "assistant.delta", sessionKey: "s1", text: "Bezig..." });

    const doneFrame = await frames.next();
    expect(doneFrame).toEqual({ type: "assistant.done", sessionKey: "s1" });

    ws.close();
  });

  it("returns a result error frame when a gateway call throws", async () => {
    const gateway: Partial<GatewayAdapter> = {
      subscribeSessions: () => () => {},
      listSessions: async () => {
        throw new Error("gateway offline");
      },
    };
    const { server, url } = startServer(gateway, alwaysAuthenticated);
    openServer = server;

    const { ws, frames } = await connect(url);
    send(ws, { id: "req-1", type: "sessions.list" });
    const reply = await frames.next();

    expect(reply).toEqual({ type: "result", id: "req-1", ok: false, error: "gateway offline" });
    ws.close();
  });
});
