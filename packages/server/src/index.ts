import { createServer } from "node:http";
import { createAuthChecker } from "./auth/authChecker.js";
import { loadConfig } from "./config.js";
import { GatewayAdapter } from "./gateway/gatewayAdapter.js";
import { createOpenClawGatewayFactory } from "./gateway/openclawGatewayFactory.js";
import { createStubGatewayFactory } from "./gateway/stubGatewayFactory.js";
import { createRequestListener } from "./http/router.js";
import { attachWsBridge } from "./ws/wsServer.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const auth = createAuthChecker(config);
  console.log(`AUTH_MODE=${config.authMode}`);

  if (config.gatewayMode === "stub") {
    console.warn("OPENCLAW_GATEWAY_MODE=stub: talking to the in-process fake Gateway, not a real one. Do not use in production.");
  }

  const gateway = new GatewayAdapter({
    agentId: config.gatewayAgentId,
    createClient: config.gatewayMode === "stub" ? createStubGatewayFactory() : createOpenClawGatewayFactory(config),
  });

  console.log("Connecting to OpenClaw Gateway...");
  await gateway.connect();
  console.log("Connected.");

  const server = createServer(createRequestListener({ config, auth }));
  const wss = attachWsBridge(server, { gateway, auth });

  server.listen(config.port, config.host, () => {
    console.log(`solyx-webui server listening on ${config.host}:${config.port}`);
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

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
