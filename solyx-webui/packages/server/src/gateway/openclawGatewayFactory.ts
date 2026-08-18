// Production wiring for GatewayAdapter: the one place this codebase touches
// the real @openclaw/gateway-client runtime.
//
// ============================================================================
// DO NOT bump @openclaw/gateway-client / @openclaw/gateway-protocol without
// reading this first.
//
// The Gateway WebSocket protocol is beta (both packages ship only under the
// npm `beta` dist-tag; `latest` is a reserved 0.0.0 — there is no stable
// release). OpenClaw's own docs state a wire-version bump is "an explicit
// breaking event for third-party clients" (docs.openclaw.ai/gateway/clients).
// package.json pins BOTH packages to the exact version 2026.8.1-beta.1 (no
// ^ or ~) for this reason. Bumping either one is a compatibility decision,
// not a routine dependency update:
//   1. Read that version's CHANGELOG for wire-protocol changes.
//   2. Re-check PROTOCOL_VERSION below still matches what the target Gateway
//      negotiates (both must move together).
//   3. Re-verify the method/event names this file and gatewayAdapter.ts rely
//      on (sessions.list, sessions.subscribe, sessions.changed, agent,
//      agent.wait, assistant, tool.*) against the new protocol.schema.json —
//      several of those are not confirmed stable, see gatewayAdapter.ts.
//   4. Only then bump the version pin, as its own reviewed change.
// ============================================================================

import { GatewayClient } from "@openclaw/gateway-client";
import { PROTOCOL_VERSION } from "@openclaw/gateway-protocol/version";
import type { Config } from "../config.js";
import type { GatewayClientFactory, GatewayClientLike } from "./gatewayAdapter.js";

export function createOpenClawGatewayFactory(config: Pick<Config, "gatewayUrl" | "gatewayToken">): GatewayClientFactory {
  return (options) => {
    const client = new GatewayClient({
      url: config.gatewayUrl,
      token: config.gatewayToken,
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      onHelloOk: options.onHelloOk,
      onConnectError: options.onConnectError,
      onEvent: (event: { event: string; payload?: unknown }) =>
        options.onEvent({
          event: event.event,
          payload: (event.payload ?? {}) as Record<string, unknown>,
        }),
    });

    return client as unknown as GatewayClientLike;
  };
}
