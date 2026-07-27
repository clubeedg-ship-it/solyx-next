# Browser access

Use the personal Arc profile for reusable authenticated inspection. Never put
credentials or cookie values in prompts, docs, screenshots, or source control.

## Current session

- Arc remote debugging: `127.0.0.1:9222`.
- Production admin session is verified on `www.solyxenergy.nl`.
- Staging automation uses the ignored local file
  `work/greenshift-migration/wp-auth-state.json`.
- Production is read-only unless the user explicitly authorizes a named write.

## Attach

Use the `user-arc-devtools` MCP server:

1. `list_pages`.
2. Select the exact intended hostname.
3. Confirm the final URL and an authenticated marker (`body.wp-admin` or
   `#wpadminbar`).
4. If redirected to `wp-login.php`, stop and ask the user to sign in manually.
5. Recheck the hostname before every write.

Environment rule:

- `2026.solyxenergy.nl` → staging; assigned-lane writes may be allowed.
- `www.solyxenergy.nl` → legacy production; read-only by default.
- Anything else → stop.

## Restore Arc

If the debugging endpoint is unavailable, fully quit Arc and relaunch:

```bash
open -a "Arc" --args --remote-debugging-port=9222
```

Open tabs manually (`Cmd+T`); Arc can crash when automation creates them.
Sign in manually when required and leave Arc running for session reuse.

## Production read-only scope

Allowed: inspect pages, products, forms, plugins, menus, snippets, settings,
redirects, SEO, consent, and frontend behavior.

Do not save settings, submit admin forms, edit content, forms, products, orders,
payments, plugins, users, API keys, webhooks, domain, DNS, or SSL.

If the session expires, the hostname is wrong, or it is unclear whether a
control saves, stop.
