import { randomBytes } from "node:crypto";
import type { Logger } from "./logger.js";

/** The parts of ws's WebSocketServer / WebSocket this module actually uses. */
export interface EventSourceLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
}
export type WsServerLike = EventSourceLike;

/**
 * Connection-lifecycle logging for the browser bridge.
 *
 * Additive by construction: it registers ONE extra "connection" listener and
 * never removes or replaces the bridge's own handler in ws/wsServer.ts, so it
 * cannot affect frame routing. Frame-level logging is deliberately not here —
 * that belongs with the bridge itself.
 */
export function attachWsLogging(wss: WsServerLike, logger: Logger): void {
  wss.on("connection", (ws: EventSourceLike) => {
    const connId = randomBytes(4).toString("hex");
    logger.info("ws connection opened", { event: "ws.connect", connId });

    ws.on("close", (code: unknown, reason: unknown) => {
      // Fires for every client during graceful shutdown too (index.ts closes
      // them with 1001), so it must stay cheap and non-throwing.
      logger.info("ws connection closed", {
        event: "ws.close",
        connId,
        code: typeof code === "number" ? code : null,
        reason: reasonText(reason),
      });
    });
  });
}

function reasonText(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (Buffer.isBuffer(reason)) return reason.toString("utf8");
  return "";
}
