import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { type WebSocketServer } from "ws";
import type { AuthChecker } from "../src/auth/types.js";
import {
  GatewayAdapter,
  type GatewayClientFactoryOptions,
  type GatewayClientLike,
} from "../src/gateway/gatewayAdapter.js";
import type { SessionSummary } from "../src/gateway/types.js";
import { attachWsBridge } from "../src/ws/wsServer.js";
import type { ClientFrame, ServerFrame, SessionWire } from "../src/ws/protocol.js";

const alwaysAuthenticated: AuthChecker = { isAuthenticated: async () => ({ authenticated: true }) };

function summary(sessionKey: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionKey,
    title: "New chat",
    updatedAt: "2026-08-01T00:00:00.000Z",
    hasTitle: false,
    archived: false,
    ...extra,
  };
}

function startServer(gateway: Partial<GatewayAdapter>): { server: Server; wss: WebSocketServer; url: string } {
  const server = createServer((_req, res) => res.writeHead(404).end());
  const wss = attachWsBridge(server, { gateway: gateway as GatewayAdapter, auth: alwaysAuthenticated });
  server.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, wss, url: `ws://127.0.0.1:${port}/ws` };
}

/** See wsServer.test.ts: frames can arrive batched in one synchronous turn. */
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

/** The `result` payload of a frame we already know is a successful result. */
function resultOf(frame: ServerFrame): unknown {
  if (frame.type !== "result" || !frame.ok) throw new Error(`expected an ok result frame, got ${JSON.stringify(frame)}`);
  return frame.result;
}

/**
 * A fake transport that stands in for the real @openclaw/gateway-client —
 * same harness shape as gatewayAdapter.test.ts, kept local because the two
 * suites are the only users and there is no shared test-helper module.
 */
function createFakeGateway() {
  const responses = new Map<string, unknown>();
  let helloCallback: (() => void) | undefined;

  const factory = (options: GatewayClientFactoryOptions): GatewayClientLike => {
    helloCallback = options.onHelloOk;
    return {
      start: () => helloCallback?.(),
      stop: () => {},
      request: async (method) => responses.get(method) ?? {},
    };
  };

  return {
    factory,
    setResponse: (method: string, value: unknown) => responses.set(method, value),
  };
}

describe("session wire: messageCount", () => {
  let openServer: Server | undefined;
  let openWss: WebSocketServer | undefined;

  afterEach(() => {
    openWss?.close();
    openServer?.close();
    openWss = undefined;
    openServer = undefined;
  });

  it("sessions.list carries messageCount when the gateway summary has one", async () => {
    const gateway: Partial<GatewayAdapter> = {
      subscribeSessions: () => () => {},
      listSessions: async () => [summary("s1", { messageCount: 0 }), summary("s2", { messageCount: 7 })],
    };
    const { server, wss, url } = startServer(gateway);
    openServer = server;
    openWss = wss;

    const { ws, frames } = await connect(url);
    send(ws, { type: "sessions.list", id: "r1" });
    const wire = resultOf(await frames.next()) as SessionWire[];

    // 0 is a real answer ("empty"), not a missing one — it must survive.
    expect(wire[0]).toMatchObject({ sessionKey: "s1", messageCount: 0 });
    expect(wire[1]).toMatchObject({ sessionKey: "s2", messageCount: 7 });
    ws.close();
  });

  it("sessions.changed and sessions.get carry messageCount through the same mapper", async () => {
    let push: ((session: SessionSummary) => void) | undefined;
    const gateway: Partial<GatewayAdapter> = {
      subscribeSessions: (listener) => {
        push = listener;
        return () => {};
      },
      getSession: async (sessionKey: string) => summary(sessionKey, { messageCount: 3 }),
    };
    const { server, wss, url } = startServer(gateway);
    openServer = server;
    openWss = wss;

    const { ws, frames } = await connect(url);
    push?.(summary("s1", { messageCount: 3 }));
    const changed = await frames.next();
    expect(changed).toMatchObject({ type: "sessions.changed", session: { sessionKey: "s1", messageCount: 3 } });

    send(ws, { type: "sessions.get", id: "r1", sessionKey: "s1" });
    expect(resultOf(await frames.next())).toMatchObject({ sessionKey: "s1", messageCount: 3 });
    ws.close();
  });

  it("messageCount is omitted, never zero, when the gateway summary does not report one", async () => {
    const gateway: Partial<GatewayAdapter> = {
      subscribeSessions: () => () => {},
      listSessions: async () => [summary("s1")],
    };
    const { server, wss, url } = startServer(gateway);
    openServer = server;
    openWss = wss;

    const { ws, frames } = await connect(url);
    send(ws, { type: "sessions.list", id: "r1" });
    const wire = resultOf(await frames.next()) as SessionWire[];

    // "unknown" must not be encoded as "empty": the key is simply absent.
    expect(Object.prototype.hasOwnProperty.call(wire[0], "messageCount")).toBe(false);
    ws.close();
  });

  it("GatewayAdapter maps a raw session's messageCount onto SessionSummary", async () => {
    const fake = createFakeGateway();
    fake.setResponse("sessions.list", { sessions: [{ key: "s1", messageCount: 4 }, { key: "s2" }] });
    const adapter = new GatewayAdapter({ agentId: "sol", createClient: fake.factory });
    await adapter.connect();

    const sessions = await adapter.listSessions();

    expect(sessions[0].messageCount).toBe(4);
    expect(Object.prototype.hasOwnProperty.call(sessions[1], "messageCount")).toBe(false);
  });
});
