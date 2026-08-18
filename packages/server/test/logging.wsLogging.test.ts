import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logging/logger.js";
import { attachWsLogging, type WsServerLike } from "../src/logging/wsLogging.js";

function fakeStream() {
  const chunks: string[] = [];
  return { chunks, write: (chunk: string) => { chunks.push(chunk); return true; } };
}

function lines(stream: { chunks: string[] }) {
  return stream.chunks.map((c) => JSON.parse(c) as Record<string, unknown>);
}

describe("attachWsLogging", () => {
  it("a connection logs one ws.connect line with a connection id", () => {
    const stream = fakeStream();
    const wss = new EventEmitter();
    attachWsLogging(wss as unknown as WsServerLike, createLogger({ stream }));

    wss.emit("connection", new EventEmitter(), { url: "/ws" });

    expect(stream.chunks).toHaveLength(1);
    const [line] = lines(stream);
    expect(line.event).toBe("ws.connect");
    expect(typeof line.connId).toBe("string");
    expect(line.connId as string).not.toBe("");
  });

  it("a close logs the close code and reason, including an abnormal 1006", () => {
    for (const [code, reason] of [[1006, ""], [1001, "server shutting down"]] as const) {
      const stream = fakeStream();
      const wss = new EventEmitter();
      const ws = new EventEmitter();
      attachWsLogging(wss as unknown as WsServerLike, createLogger({ stream }));

      wss.emit("connection", ws, { url: "/ws" });
      ws.emit("close", code, Buffer.from(reason));

      const [connect, close] = lines(stream);
      expect(stream.chunks).toHaveLength(2);
      expect(close.event).toBe("ws.close");
      expect(close.code).toBe(code);
      expect(close.reason).toBe(reason);
      expect(close.connId).toBe(connect.connId);
    }
  });

  it("attaching logging does not remove or displace the bridge's own connection handler", () => {
    const stream = fakeStream();
    const wss = new EventEmitter();
    const sentinel = vi.fn();
    wss.on("connection", sentinel);

    attachWsLogging(wss as unknown as WsServerLike, createLogger({ stream }));
    wss.emit("connection", new EventEmitter(), { url: "/ws" });

    expect(sentinel).toHaveBeenCalledTimes(1);
    expect(wss.listenerCount("connection")).toBe(2);
  });
});
