import { createServer } from "node:http";
import { createAuthChecker } from "./auth/authChecker.js";
import { loadConfig } from "./config.js";
import { GatewayAdapter } from "./gateway/gatewayAdapter.js";
import { createOpenClawGatewayFactory } from "./gateway/openclawGatewayFactory.js";
import { createStubGatewayFactory } from "./gateway/stubGatewayFactory.js";
import { createRequestListener } from "./http/router.js";
import { createLogger } from "./logging/logger.js";
import { withRequestLogging } from "./logging/httpLogging.js";
import { attachWsLogging } from "./logging/wsLogging.js";
import { installProcessLogging } from "./logging/processLogging.js";
import { attachWsBridge } from "./ws/wsServer.js";

// Module scope, not inside main(): the process handlers below have to be armed
// before main() can reject, and every line here goes to stdout, which systemd
// captures into the journal. The human text of the boot lines is preserved
// verbatim in "msg" so existing operator greps still match.
const logger = createLogger();
installProcessLogging({ logger });

async function main(): Promise<void> {
  const config = loadConfig();
  const auth = createAuthChecker(config);
  logger.info(`AUTH_MODE=${config.authMode}`, { event: "boot.auth", authMode: config.authMode });

  if (config.gatewayMode === "stub") {
    logger.warn("OPENCLAW_GATEWAY_MODE=stub: talking to the in-process fake Gateway, not a real one. Do not use in production.", { event: "boot.gatewayMode", gatewayMode: config.gatewayMode });
  }

  const gateway = new GatewayAdapter({
    agentId: config.gatewayAgentId,
    createClient: config.gatewayMode === "stub" ? createStubGatewayFactory() : createOpenClawGatewayFactory(config),
  });

  logger.info("Connecting to OpenClaw Gateway...", { event: "gateway.connecting", gatewayMode: config.gatewayMode });
  const connectStartedAt = performance.now();
  await gateway.connect();
  logger.info("Connected.", {
    event: "gateway.connected",
    durationMs: Math.round(performance.now() - connectStartedAt),
  });

  const server = createServer(withRequestLogging(logger, createRequestListener({ config, auth })));
  const wss = attachWsBridge(server, { gateway, auth });
  attachWsLogging(wss, logger);

  server.listen(config.port, config.host, () => {
    logger.info(`solyx-webui server listening on ${config.host}:${config.port}`, {
      event: "boot.listening",
      host: config.host,
      port: config.port,
    });
  });

  // server.close() waits for open connections to finish, and a WebSocket never
  // finishes on its own — so closing the HTTP server alone hangs until systemd
  // gives up and SIGKILLs us ninety seconds later. That made every deploy a
  // 90-second dead dashboard ending in an abrupt 1006 drop for anyone with the
  // page open. Close the sockets first, with 1001 "going away" so the browser
  // can tell a deliberate restart from a network fault.
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    gateway.disconnect();
    for (const client of wss.clients) client.close(1001, "server shutting down");
    wss.close();
    server.close(() => process.exit(0));
    // Never let one stuck connection hold the process open past this.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  logger.error("Fatal startup error:", {
    event: "boot.failed",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
