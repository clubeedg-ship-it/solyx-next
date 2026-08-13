# Solyx client agent — deployment state

Live status. Updated 13 Aug 2026.

## Live now

**https://solyx.oopuo.nl** — normal username + password login, app loads.

| # | Thing | Evidence |
|---|---|---|
| 1 | Public URL with password login | correct password → 302 + session; wrong → 401; no cookie → 302 |
| 2 | Cloudflare tunnel `solyx-webui` | 3 connections, **0 errors** after forcing IPv4 |
| 3 | DNS `solyx.oopuo.nl` → tunnel, proxied | created via API |
| 4 | Web UI on `core` | `solyx-webui.service` active, three columns, Dutch, **no publish button** |
| 5 | WordPress plugin installed + active on staging | `solyx-agent/v1` + `solyx-agent-admin/v1`, 12 routes, **no delete route** |
| 6 | Agent has its own WP account | user id 4, role `solyx_agent`, not administrator |
| 7 | MCP on `core` against live WordPress | `list_pages` returns the real site |
| 8 | Draft creation works | draft 1403 cloned from published page 784 |
| 9 | Draft preview renders | 107 KB HTML with agent credentials, **401 anonymous** |
| 10 | Screenshot tool works | real PNG via distro Chromium |
| 11 | OpenClaw agent `solyx` sandboxed | rootless podman, elevated off |
| 12 | Tool policy enforced at runtime | 8 tools removed by deny, 16 by allow |

## Security audit — run live, with the agent's own credentials

| Attempt | Result |
|---|---|
| Delete a page | **403** |
| Edit a published page | **403** |
| Read/write settings | **403** |
| List plugins | **403** |
| Publish via application password | **401**, refused at the door |
| Publish via admin session | reaches handler (404 on a fake draft — nothing published) |
| Core REST reads | 200, **byte-identical to anonymous** — no emails, no private data |
| Original page 784 after cloning | still `publish`, `modified` unchanged |
| Draft 1403 seen anonymously | **404** |

The three rules hold: cannot delete a page, cannot touch a published page,
cannot change a setting.

## The one blocker — needs a human

**No model credentials exist on `core`.** `openclaw models status`: zero
providers. `~/.claude/.credentials.json` has zero-length access and refresh
tokens, expiry at epoch 0. **`main` is unauthenticated too** — this predates
this work.

The agent runtime is `claude-cli` — OpenClaw shells out to the Claude Code CLI
on `core` (`~/.npm-global/bin/claude`, installed) and uses its credential file.
That file is a placeholder, not an expired session: access and refresh tokens
are both zero-length and `expiresAt` is `0`. "OAuth session expired and could
not be refreshed" is the runtime reporting that there is nothing to refresh.

Every automated route is closed: `models auth login` requires an interactive
TTY, `--device-code` is not a supported method for this provider, there is no
`ANTHROPIC_API_KEY` anywhere, and no `auth-profiles.json`.

```bash
# on core, in a terminal — needs a TTY for the OAuth step
ssh -t core '~/.npm-global/bin/openclaw models auth login --provider anthropic --force'
```

`--force` clears the stuck empty profile first.

Observed in the browser as of 2026-08-13: typing, sending and rendering all
work, and the failed turn reports this credential error by name. Before the
protocol fix below it reported nothing usable — see the note on the Gateway
wire contract.

## Gateway wire contract — settled 2026-08-13

The web UI spoke a protocol the Gateway does not serve. `@openclaw/gateway-*`
is pinned to `2026.8.1-beta.1`; `core` runs Gateway `2026.7.1-2`, an older
wire version. Every send was rejected before reaching the model with
`invalid agent params: must have required property 'idempotencyKey'`.

The contract is now verified method-by-method against the running Gateway and
documented at the top of `packages/server/src/gateway/gatewayAdapter.ts`. The
traps, all of which were live: the `sessions.*` family keys on `key` not
`sessionKey`; `agent.wait` takes `runId` alone; `agent.wait` reports a failed
turn as a *successful* response carrying `status:"error"`; the title field is
`label`; `sessions.catalog.archive` does not exist; `sessions.get` returns
message history rather than a summary; `updatedAt` is epoch millis; and there
is no `assistant` event — deltas arrive on the `agent` event under
`stream: "assistant"`, so no reply could ever have streamed.

None of it was caught because the stub Gateway implemented the same wrong
guess as the adapter, so the suite agreed with itself. The stub is now strict
and rejects each trap the way the Gateway does.

Still unverified, because it needs one successful turn to observe: the payload
shape of `stream: "tool"` events, which the draft panel reads. The handler is
deliberately permissive there.

## After that

1. Reload `https://solyx.oopuo.nl`, send a message, confirm the composer enables.
2. Ask for a copy change; confirm the draft updates and the right panel follows.
3. Delete test draft 1403 (the agent cannot — by design).
4. Consider sandbox hardening now testable: `docker.user`, `capDrop`, `pidsLimit`,
   `memory`. Not applied yet — untested constraints on an agent that has never
   run once would be guesswork.

## Credentials, where they live

Never in any repo. All `0600` on `core`:

- `~/.config/solyx/mcp.env` — WordPress URL, user, application password
- `~/.config/solyx/tunnel.env` — Cloudflare tunnel token
- `~/.config/solyx/webui-password.txt` — the UI login password
- `~/solyx-webui/.env` — session secret, password hash, gateway token

## Things that bit, worth not relearning

- `agents.entries.*` is documented; this build uses **`agents.list[]`**.
- `tools.sandbox.tools` is **global only** here — no per-agent override.
- `read`/`write`/`edit` are **not real tool names**; use `file_fetch`,
  `file_write`, `dir_list`, `dir_fetch`.
- WordPress application passwords contain spaces — env files must quote them.
- macOS `._*` files ride along in tarballs and broke the MCP's pattern loader.
- **`core` has no working IPv6.** It broke the Playwright CDN download *and*
  made the tunnel flap until `--edge-ip-version 4`. Suspect it first.
- Chromium came from `apt-get download` + `dpkg -x` — no root needed.
