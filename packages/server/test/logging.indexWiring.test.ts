import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the wiring in src/index.ts, not its source text.
 *
 * The previous version of this file counted /console\./ matches over the source
 * string, which stayed green with every logging call deleted. Here index.ts is
 * imported for real against mocked collaborators, so removing any one of the
 * three wiring calls turns exactly one assertion red.
 */
const h = vi.hoisted(() => {
  // Sentinels: identity is the whole point — we assert the exact value produced
  // by one collaborator is the exact value handed to the next.
  const ROUTER_LISTENER = function routerListenerSentinel() {};
  const WRAPPED_LISTENER = function wrappedListenerSentinel() {};
  const LOGGER = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const WSS = { clients: new Set<never>(), on: vi.fn(), close: vi.fn() };
  const httpServer = {
    listen: vi.fn((_port: number, _host: string, cb?: () => void) => {
      cb?.();
      return httpServer;
    }),
    close: vi.fn(),
  };

  return {
    ROUTER_LISTENER,
    WRAPPED_LISTENER,
    LOGGER,
    WSS,
    httpServer,
    createServer: vi.fn(() => httpServer),
    loadConfig: vi.fn(() => ({
      authMode: "none",
      gatewayMode: "stub",
      gatewayAgentId: "solyx-agent",
      host: "127.0.0.1",
      port: 8099,
    })),
    createAuthChecker: vi.fn(() => ({ name: "auth-checker-sentinel" })),
    createRequestListener: vi.fn(() => ROUTER_LISTENER),
    attachWsBridge: vi.fn(() => WSS),
    createLogger: vi.fn(() => LOGGER),
    withRequestLogging: vi.fn(() => WRAPPED_LISTENER),
    attachWsLogging: vi.fn(),
    installProcessLogging: vi.fn(),
    gatewayConnect: vi.fn(async () => {}),
    gatewayDisconnect: vi.fn(),
  };
});

vi.mock("node:http", () => ({ createServer: h.createServer }));
vi.mock("../src/config.js", () => ({ loadConfig: h.loadConfig }));
vi.mock("../src/auth/authChecker.js", () => ({ createAuthChecker: h.createAuthChecker }));
vi.mock("../src/gateway/gatewayAdapter.js", () => ({
  GatewayAdapter: class {
    connect = h.gatewayConnect;
    disconnect = h.gatewayDisconnect;
  },
}));
vi.mock("../src/gateway/openclawGatewayFactory.js", () => ({
  createOpenClawGatewayFactory: vi.fn(() => () => ({})),
}));
vi.mock("../src/gateway/stubGatewayFactory.js", () => ({
  createStubGatewayFactory: vi.fn(() => () => ({})),
}));
vi.mock("../src/http/router.js", () => ({ createRequestListener: h.createRequestListener }));
vi.mock("../src/ws/wsServer.js", () => ({ attachWsBridge: h.attachWsBridge }));
vi.mock("../src/logging/logger.js", () => ({ createLogger: h.createLogger }));
vi.mock("../src/logging/httpLogging.js", () => ({ withRequestLogging: h.withRequestLogging }));
vi.mock("../src/logging/wsLogging.js", () => ({ attachWsLogging: h.attachWsLogging }));
vi.mock("../src/logging/processLogging.js", () => ({ installProcessLogging: h.installProcessLogging }));

/** Lets the module-scope `main().catch(...)` settle before we assert. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe("index.ts wiring", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // index.ts calls process.exit(1) when main() rejects. Left unstubbed that
    // kills the vitest worker instead of failing an assertion.
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${String(code)}) called`);
    }) as never);
    await import("../src/index.js");
    await flushMicrotasks();
  });

  afterEach(() => {
    // main() arms SIGINT/SIGTERM on the real process; leaking one per test run
    // trips Node's MaxListenersExceededWarning and leaks state across files.
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    exitSpy.mockRestore();
  });

  it("main() reaches the wiring without hitting the fatal-startup exit", () => {
    expect(h.LOGGER.error).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("createServer receives the exact listener returned by withRequestLogging(logger, routerListener)", () => {
    expect(h.withRequestLogging).toHaveBeenCalledTimes(1);
    expect(h.withRequestLogging).toHaveBeenCalledWith(h.LOGGER, h.ROUTER_LISTENER);
    expect(h.createServer).toHaveBeenCalledTimes(1);
    expect(h.createServer).toHaveBeenCalledWith(h.WRAPPED_LISTENER);
  });

  it("attachWsLogging is called once with the WebSocketServer from attachWsBridge and the module logger", () => {
    expect(h.attachWsBridge).toHaveBeenCalledTimes(1);
    expect(h.attachWsLogging).toHaveBeenCalledTimes(1);
    expect(h.attachWsLogging).toHaveBeenCalledWith(h.WSS, h.LOGGER);
  });

  it("installProcessLogging({logger}) runs at module scope, before main() reads config", () => {
    expect(h.installProcessLogging).toHaveBeenCalledTimes(1);
    expect(h.installProcessLogging).toHaveBeenCalledWith({ logger: h.LOGGER });
    // Ordering is the module-scope claim: the crash handlers must be armed
    // before the first thing that can throw (loadConfig) runs.
    expect(h.installProcessLogging.mock.invocationCallOrder[0]).toBeLessThan(
      h.loadConfig.mock.invocationCallOrder[0],
    );
  });
});
