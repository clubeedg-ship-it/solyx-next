# solyx-webui

A three-column web app for one non-technical business owner to talk to her
WordPress-editing agent ("Sol") and watch drafts update live. No publish
button anywhere — this app only ever produces drafts; going live happens in
WordPress, by a human.

Read `work/client-agent/webui/PLAN.md` (in the `solyx-next` repo) for the
full design reasoning this implements: the OpenClaw Gateway protocol
research, the framework comparison, the deployment host, and the phased
plan. This README covers running and deploying what was actually built.

## Architecture

```
Browser (a signed session cookie from /login, or authenticated by Cloudflare
         Access at the edge, or by Clerk — AUTH_MODE)
  │  HTTPS + one WebSocket (/ws)
  ▼
packages/web  — static React app (assistant-ui chat pane, session list, draft panel)
  │  same origin, single WS connection, this project's OWN small protocol
  │  (packages/*/src/*/protocol.ts) — never the OpenClaw wire protocol
  ▼
packages/server — thin Node backend
  │  holds the OpenClaw Gateway device token (env only)
  │  holds the WordPress Application Password (env only)
  │  verifies every request (HTTP, the WS upgrade, and — in password mode
  │  only — static asset requests too) via AuthChecker: a signed session
  │  cookie (default), Cloudflare Access JWT verification, or Clerk session
  │  verification, see "Auth" below
  ├─ WebSocket bridge → OpenClaw Gateway (@openclaw/gateway-client, pinned)
  └─ HTTP proxy → WordPress draft preview (Basic auth, HTML rewritten with
                  a <base> tag, re-served same-origin)
```

The browser never holds a Gateway credential or a WordPress credential.
Only `packages/server` does, and only from environment variables — never
committed, never in the client bundle, never logged.

`packages/stub` is a local stand-in for WordPress, so the draft proxy can be
exercised without ever contacting `2026.solyxenergy.nl` or
`www.solyxenergy.nl` (both off-limits for this project). There is no stub
*server* for the OpenClaw Gateway — its wire protocol involves challenge-based
device auth this project has no live Gateway to verify against safely.
Instead, `packages/server/src/gateway/stubGatewayFactory.ts` is an in-process
fake that implements `GatewayAdapter`'s own dependency seam directly
(`OPENCLAW_GATEWAY_MODE=stub`), so the rest of the app — WS bridge, frontend,
draft proxy — can be built, run, and clicked through end to end without a
real Gateway.

## Repo layout

```
packages/server/   thin backend: Gateway bridge, WordPress proxy, auth (password, Access, or Clerk), static file serving
packages/web/      static frontend: 3-column layout, assistant-ui chat pane
packages/stub/     local WordPress stand-in (dev-only)
deploy/core/       Dockerfile + compose/nginx/cloudflared fragments for core (not applied by this repo)
```

## Setup

```bash
npm install
cp .env.example .env   # fill in real values, or leave OPENCLAW_GATEWAY_MODE=stub for local dev
npm run hash-password   # AUTH_MODE=password (the default): generates AUTH_PASSWORD_HASH for .env
```

## Env vars

See `.env.example` for the full list with comments. Summary:

| Var | Used by | Notes |
|---|---|---|
| `PORT` | server | HTTP+WS listen port |
| `OPENCLAW_GATEWAY_MODE` | server | `stub` (default, no real Gateway needed) or `real` |
| `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN` | server | required only when mode is `real` |
| `OPENCLAW_AGENT_ID` | server | which agent inside the dedicated profile's Gateway (`sol`) |
| `WORDPRESS_ORIGIN` / `WORDPRESS_APP_USER` / `WORDPRESS_APP_PASSWORD` | server | draft proxy auth (WordPress Application Passwords, RFC 7617 Basic auth) |
| `AUTH_MODE` | server (and threaded into the web build — see below) | `password` (default), `access`, or `clerk` — see "Auth" below |
| `SESSION_SECRET` | server | required only when `AUTH_MODE=password`; signs the session cookie, at least 32 characters, generate with `openssl rand -base64 48` |
| `AUTH_PASSWORD_HASH` | server | required only when `AUTH_MODE=password`; scrypt hash of the login password, generate with `npm run hash-password` — never a plaintext password |
| `AUTH_USERNAME` | server | optional, only meaningful when `AUTH_MODE=password`; leave blank to accept any username and gate on the password alone |
| `SESSION_MAX_AGE_DAYS` | server | optional, only meaningful when `AUTH_MODE=password`; session cookie lifetime in days, default 30 |
| `TRUSTED_PROXY_HEADER` | server | optional, only meaningful when `AUTH_MODE=password`; unset by default (rate limiter keys off the socket address) — set to a header name (e.g. `CF-Connecting-IP`) only when this app is reachable *exclusively* through the one proxy that sets it, see "Auth" below |
| `CF_ACCESS_TEAM_DOMAIN` | server | required only when `AUTH_MODE=access`; e.g. `myteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | server | required only when `AUTH_MODE=access`; the Access application's AUD tag |
| `CLERK_SECRET_KEY` | server | required only when `AUTH_MODE=clerk`; never sent to the browser |
| `CLERK_PUBLISHABLE_KEY` | server | required only when `AUTH_MODE=clerk`; not secret, but read server-side too (Clerk backend SDK wants it) |
| `VITE_CLERK_PUBLISHABLE_KEY` | web build | required only when `AUTH_MODE=clerk`; same value as above, baked into the frontend bundle at build time |
| `STATIC_DIR` | server | where the built frontend lives, relative to `packages/server`'s cwd |

`AUTH_MODE` itself doesn't need a `VITE_`-prefixed twin: `packages/web/vite.config.ts`
reads the root `.env`'s `AUTH_MODE` directly and bakes it into the bundle as
`import.meta.env.VITE_AUTH_MODE` at build time, so setting it once at the
root is enough for both the server and the web build.

## Run locally against the stubs

Three processes, in three terminals (or backgrounded):

```bash
npm run dev:stub    # WordPress stand-in on :8788
npm run dev:server  # backend on :8787, OPENCLAW_GATEWAY_MODE=stub talks to the in-process fake gateway
npm run dev:web     # Vite dev server on :5173, proxies /api and /ws to :8787
```

Open `http://127.0.0.1:5173`. The stub gateway seeds two fake sessions and
echoes back a canned reply with a fake tool-event when you send a message,
so the session list, streaming, and the draft panel's "follow the agent"
behavior are all exercisable without any real backend.

`npm run build` also works against the stubs (build doesn't need either
service running) and produces `packages/server/dist` +
`packages/web/dist`; from `packages/server`, `npm start` then serves the
built frontend and backend as one process, same as the deployed container.

## Auth: password (default), Cloudflare Access, or Clerk

`AUTH_MODE` selects one of three independent, fully implemented
`AuthChecker` implementations (`packages/server/src/auth/`). All three gate
every HTTP request and the WS upgrade the same way; see "Architecture"
above. **In `password` mode specifically, they also gate every static
asset request** (the app shell, JS, CSS) — there's no Cloudflare edge and
no client-side gate to fall back on in that mode, so `router.ts` itself is
the only place left to fail closed. `access` and `clerk` mode leave static
assets ungated at this layer on purpose (the edge, or the client-side
`ClerkGate`, already handles it there — see their sections below).

### `AUTH_MODE=password` (default)

A plain username+password login form at `/login`
(`packages/server/src/http/loginPage.ts` / `loginRoutes.ts`) gating a
signed session cookie. **This is the default because, once Cloudflare
Access is removed, this app has nothing else in front of it — it is
directly reachable from the public internet, and the password is the only
thing standing between that and the Gateway/WordPress credentials this
backend holds.** It is built accordingly, not as a formality:

- **The password is never configured as plaintext.** `AUTH_PASSWORD_HASH`
  holds a scrypt hash (`node:crypto.scryptSync`, `auth/passwordHash.ts`) —
  generate it with `npm run hash-password` (prompts for the password, or
  pass it as an argument: `npm run hash-password -- "the password"`, only
  on a machine where a moment in shell history is acceptable). A malformed
  `AUTH_PASSWORD_HASH` fails fast at startup (`assertValidPasswordHash` in
  `config.ts`), not on the first login attempt.
- **Every comparison that touches the secret is constant-time**:
  `crypto.timingSafeEqual` for the password hash comparison and for the
  session cookie's HMAC signature (`auth/session.ts`). The optional
  `AUTH_USERNAME` check (see below) always runs *after* the password check
  has already executed unconditionally, so response timing can't be used
  to learn whether a submitted username is correct before the
  comparatively expensive scrypt comparison even happens — no timing
  oracle on username existence.
- **The session cookie is a signed token with its own expiry**, not a bare
  `logged-in=true` flag: `<base64url payload>.<base64url HMAC-SHA256
  signature>`, signed with `SESSION_SECRET` (required, at least 32
  characters — the server refuses to start otherwise). `httpOnly`,
  `Secure`, `SameSite=Lax`. There's no server-side session store — a
  cookie stops working the moment `SESSION_SECRET` changes or its `exp`
  passes, and a restart doesn't need to invalidate anything. Default
  lifetime 30 days (`SESSION_MAX_AGE_DAYS`) — one user, a business owner,
  who shouldn't have to type a password daily.
- **`POST /login` is rate-limited per client** (`http/loginRateLimiter.ts`):
  5 free attempts, then a lockout that doubles per further failure (1s,
  2s, 4s, … capped at 15 minutes), reset by either a success or an hour of
  quiet. The lockout is never permanent — `recordFailure` refuses to push
  the unlock time further out while a lockout is still active, so it
  always elapses on its own within that 15-minute cap no matter how it's
  hammered (`test/loginRateLimiter.test.ts`'s "does not extend"/"expires"
  cases). In-memory and per-process — a deliberate trade-off for a
  single-instance, single-user app; a restart resets every counter.
  - **Which "client" a bucket represents is `TRUSTED_PROXY_HEADER`
    (`http/clientIp.ts`), unset by default.** Unset, the bucket key is the
    raw TCP socket address — safe under any topology, but only actually
    distinguishes visitors when nothing sits between them and this
    process. **This app's real deployment is `cloudflared → 127.0.0.1:8099`
    directly, no reverse proxy in the path** (the same binding described
    in the `AUTH_MODE=access` section below — that detail doesn't change
    between auth modes) — every request this process sees would otherwise carry
    `127.0.0.1`, turning "5 attempts per visitor" into "5 attempts for the
    entire internet": one attacker locks the owner out of her own site,
    a self-inflicted denial of service. Set `TRUSTED_PROXY_HEADER=CF-Connecting-IP`
    to key the limiter off that header instead. **This is only safe
    because — and only for as long as — nothing can reach this app except
    through Cloudflare**: the process binds loopback only, with
    `cloudflared` as the sole ingress, so nothing else is in a position to
    set that header. It's that property doing the work, not the header
    name itself; if this app is ever bound to `0.0.0.0` or otherwise made
    reachable by anything other than that one tunnel, `CF-Connecting-IP`
    (or any other proxy header) becomes attacker-controlled and
    `TRUSTED_PROXY_HEADER` must not be set. If the header is configured
    but missing or unparseable on a given request, `clientIp.ts` falls
    back to that request's socket address rather than lumping every such
    request into one bucket or skipping the limit for it.
- **Fails closed everywhere**: `router.ts` redirects any unauthenticated
  request for the app shell or its assets to `/login`; the WS upgrade and
  `/api/draft/:id` return 401 the same way the other two modes' checkers
  already do (`passwordAuth.ts` follows the exact fail-closed discipline
  `accessAuth.ts`/`clerkAuth.ts` established: any missing, malformed,
  tampered, or expired cookie is `authenticated: false`, never a thrown
  exception).

Client-side: `AUTH_USERNAME` is optional — the login form always shows a
username field (costs nothing, and helps a password manager save the right
entry), but it's only actually checked server-side if `AUTH_USERNAME` is
set; left blank, any username is accepted and the password alone gates
access. There is no client-side auth logic at all in this mode (same as
`access` mode, below) — `App.tsx` just renders, because by the time the
browser has any asset, the server has already decided it's allowed to.
A quiet "Uitloggen" link in the sidebar (password mode only) hits
`/logout`, which clears the cookie and redirects back to `/login`.

**What this repo could not verify without a live deployment**: that
`cloudflared` actually sets `CF-Connecting-IP` the way Cloudflare's own
docs say it does, and that nothing else can reach `127.0.0.1:8099` on the
real host — both load-bearing for `TRUSTED_PROXY_HEADER` and neither
checkable without a live deployment, which this project was not permitted.
Everything else — hashing, session signing/verification, the login/logout
routes, the static-asset gate, the rate limiter (including the
`TRUSTED_PROXY_HEADER` bucketing and its missing/malformed-header
fallback), and the lockout's expiry — is unit- and integration-tested
against a real `http.Server` (`test/passwordHash.test.ts`,
`test/session.test.ts`, `test/passwordAuth.test.ts`,
`test/loginRateLimiter.test.ts`, `test/clientIp.test.ts`,
`test/loginRoutes.test.ts`) and was also manually exercised end-to-end
against a running server during this build (login, wrong password,
tampered/expired cookie, WS upgrade with and without a cookie, logout, and
the rate limiter engaging after repeated failures — all against
`127.0.0.1`, never a live host).

### `AUTH_MODE=access`

The only route to this app is a Cloudflare Tunnel — the server binds
`127.0.0.1:8099` with no other ingress, and the public hostname is
protected by a Cloudflare Access application. Access blocks unauthenticated
requests at Cloudflare's edge, before they ever reach this app, and attaches
a signed JWT to every request that does get through (`Cf-Access-Jwt-Assertion`
header, also a `CF_Authorization` cookie).

This app does not just trust that header — a header can be forged by
anything that reaches the origin directly, so `accessAuth.ts` verifies it
properly on every request:

- Fetches Cloudflare's public signing keys from
  `https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` (via `jose`'s
  `createRemoteJWKSet`, which caches them — 30s cooldown between fetches,
  10 minute max cache age).
- Verifies the signature, `aud` against `CF_ACCESS_AUD` (the specific
  Access application protecting this hostname — this is what stops a token
  for a *different* Access application on the same Cloudflare account from
  being accepted here), `iss` against the team domain, and expiry.
- Any failure — bad signature, wrong `aud`/`iss`, expired, malformed, or no
  token at all — is rejected with 401. Fails closed, same discipline as
  the password and Clerk paths: verification errors deny the request, they
  never throw out of `isAuthenticated` and crash the process.

The authenticated identity is the JWT's `email` claim
(`AuthResult.identity`); nothing downstream currently consumes it (there's
only ever been one owner, single-tenant), but it's threaded through in case
that changes.

Client-side, there is nothing to gate on: the browser is already
authenticated by the edge before any asset is served, so `App.tsx` just
renders (`AuthenticatedApp`, no login screen). `@clerk/react` is not just
unused in this mode — because `App.tsx` loads Clerk via `React.lazy()` and
only actually calls that `import()` when `AUTH_MODE=clerk`, the browser
never fetches or executes the Clerk chunk at all when running in `password`
or `access` mode (confirmed against a real build during this change: `vite
build` with no `.env` at all — so the new default, `AUTH_MODE=password` —
emits `ClerkGate-*.js` as its own chunk, and `dist/index.html` has no
modulepreload for it).

**What this repo could not verify without a live deployment**: whether
Cloudflare Access is actually configured on the account (application
created, policy scoped to the owner, AUD tag issued) — that's a dashboard
step outside this repo, and this project was not permitted to deploy or
connect to any live host to check it. The JWT verification logic itself is
unit-tested against locally-generated tokens (`test/accessAuth.test.ts`),
not against a real Cloudflare-issued token.

### `AUTH_MODE=clerk`

A third option for a deployment that wants a third-party identity
provider instead of either of the above: `clerkAuth.ts` verifies the
session cookie/token via Clerk's backend SDK on every request. Client-side,
`ClerkGate.tsx` wraps the app in `ClerkProvider` and gates on
`useAuth().isSignedIn`, showing Clerk's own `<SignIn />` when not
authenticated.

Switching between modes needs no code change, only env vars — set
`AUTH_MODE` (and the matching var group in `.env.example`) and rebuild.
Note the one behavioral difference: switching *into* `password` mode also
starts gating static asset requests (see the note at the top of this
section) — `access` and `clerk` don't need that gate and don't get it.

## Draft panel: the proxy

The owner's decision (not screenshots): `packages/server/src/proxy/draftProxy.ts`
fetches `{WORDPRESS_ORIGIN}/?p=<id>&preview=true` authenticated with the
agent's WordPress Application Password (HTTP Basic auth), then
`packages/server/src/proxy/htmlRewrite.ts` inserts a `<base>` tag so the
draft's relative asset URLs resolve against the real WordPress origin,
before re-serving the HTML same-origin at `/api/draft/:postId` (auth-gated
by the same `AuthChecker` as everything else, whichever `AUTH_MODE` is
active). The right column embeds that URL in an `<iframe>`.

**What this does and doesn't do**, per `PLAN.md` §3's own accepted
limitations: it's reliable for "what does this page look like," not for
"let me click around it" — any script on the page that calls back to
WordPress (admin-ajax, REST, cart fragments, Gravity Forms AJAX) becomes a
genuine cross-origin request once a `<base>` tag is present, and most
WordPress installs don't send permissive CORS headers for those endpoints.
The product doesn't need interactivity here (no publish button, no
requirement to submit forms from inside the preview), so this is an
accepted trade-off, not an oversight.

**Getting an authenticated draft render at all was flagged in PLAN.md §3 as
a genuinely open question** — whether WordPress's preview-nonce mechanism
just works for an Application-Password-authenticated request, or needs a
small custom endpoint, was explicitly unverified because verifying it would
require a network request to `2026.solyxenergy.nl`, which is off-limits for
this project. **That is still true after this build** — `draftProxy.ts` is
built and unit-tested against a fixture response and the local
`packages/stub` server, but the real WordPress round trip has not been
exercised, and can't be from here.

## Drafts ▾ follows the agent

`gatewayAdapter.ts` forwards Gateway `tool.*` events to the browser as
`tool.event` frames; `packages/web/src/runtime/draftSelection.ts`
best-effort-extracts a post/page id from the event's raw args (trying
`postId`, `post_id`, `pageId`, `page_id`, `id` in turn) and switches the
selected draft to it. **The real event name and payload shape were not
confirmed against `protocol.schema.json` for the specific WordPress-editing
tool** (PLAN.md §1.1/§9 flag this explicitly) — this was inspected against
the actual `@openclaw/gateway-protocol@2026.8.1-beta.1` schema during this
build (confirmed real method/event names: `chat.send`, `sessions.list`,
`sessions.subscribe`, `agent`, `agent.wait`, `tool.call`, `tool.result`,
`assistant`), but the *WordPress tool's own* argument shape is defined by
whatever tool Sol actually has, which doesn't exist yet (no agent has been
provisioned — see PLAN.md §8). Until it does, this is untestable end to
end; the extraction is deliberately tolerant (falls back to "stay on the
last known draft") rather than assuming a shape that turns out wrong.

## The Gateway client version is pinned on purpose

`@openclaw/gateway-client` and `@openclaw/gateway-protocol` are pinned to
the exact version `2026.8.1-beta.1` (no `^`/`~`) in
`packages/server/package.json`. Both ship only under npm's `beta` dist-tag —
there is no stable release — and OpenClaw's own docs state a wire-version
bump is "an explicit breaking event for third-party clients." A large
comment block at the top of `packages/server/src/gateway/openclawGatewayFactory.ts`
spells out what to re-verify before ever bumping this pin; read it before
touching the version.

## Scale to zero

Not deployed by this repo, but designed for it: `deploy/core/` has the
Dockerfile (frontend + backend in one image, one container — see its
comments for why) and a `docker-compose.fragment.yml` with Traefik+Sablier
labels following the *real* pattern already running on `core`
(`/srv/infra/stacks/platform/compose.yml`, read-only inspected during this
build: Traefik v3.7.10 bound to the tailnet IP, Sablier v1.16.2, `edge`
Docker network). One honest correction to PLAN.md's framing: Sablier is
running on `core` today, but as of this inspection **no existing service
(Forgejo, Kuma) actually has a Sablier middleware attached to its router** —
this app would be the first to use it, not the Nth following an established
label pattern. The labels in the fragment follow Sablier's own documented
Traefik plugin syntax, not a copy of an existing router's labels, because
there isn't one yet.

## Deploy to core

Not performed by this project — a human step, per the hard constraint
("Do not deploy anything"). The checklist:

1. Clone this repo onto `core` (or push it to the `/srv/infra`-adjacent
   location the deploy convention expects).
2. Create `stacks/solyx-webui/compose.yml` in `/srv/infra` from
   `deploy/core/docker-compose.fragment.yml`, fixing the two marked
   placeholders (build context path, internal hostname) and creating
   `secrets/solyx-webui.env` (or `.sops.yaml`, following the infra repo's
   existing secrets convention) with the real values from `.env.example`.
3. Pick a real public hostname for this tool (not
   `2026.solyxenergy.nl`/`www.solyxenergy.nl` — those are the client's own
   site) and fill it into `deploy/core/nginx-vhost.conf.example` and
   `deploy/core/cloudflared-ingress.snippet.yml`.
4. Install the nginx vhost (`sites-available/` + symlink into
   `sites-enabled/`, `nginx -t`, reload).
5. Add the cloudflared ingress block, run
   `cloudflared tunnel route dns core <hostname>`, reload `cloudflared`.
6. Set up auth for whichever `AUTH_MODE` this deployment runs:
   - **`password` (the default)**: run `npm run hash-password` locally
     (never on `core` where it could linger in shell history) and put
     `SESSION_SECRET` (`openssl rand -base64 48`), the resulting
     `AUTH_PASSWORD_HASH`, and optionally `AUTH_USERNAME` /
     `SESSION_MAX_AGE_DAYS` into `secrets/solyx-webui.env`. No dashboard
     step — this is the mode this project *was* able to fully build and
     verify from here (see "Auth" above).
   - **`access`**: create the Cloudflare Access application for that
     hostname in the Zero Trust dashboard (a policy scoped to the owner's
     email is enough for one user), then copy its team domain and AUD tag
     into `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` in
     `secrets/solyx-webui.env`. This is a dashboard step with no code
     involved, and this project was not permitted to do it — see "Auth"
     above.
7. Deploy the infra repo as usual (`git push` to `main` → Forgejo Actions,
   or `make up`).
8. Confirm `/healthz` responds, then confirm the app actually requires
   login before assuming auth is live — nothing in this repo can check
   that from here. Then measure real cold-start time end-to-end (PLAN.md
   §4 flags this as an estimate, not a measurement, and asks for it to be
   a real Phase 3 deliverable) — this repo cannot measure it without a
   deployed container.
9. Separately: provision the actual OpenClaw Gateway profile + agent "Sol"
   on `core` (PLAN.md Phase 0) — this repo's `OPENCLAW_GATEWAY_MODE=real`
   path is built and unit-tested against a fake transport, but has not
   talked to a real Gateway, because none has been provisioned yet.

## Build, typecheck, test

```bash
npm run build       # tsc (server) + tsc --noEmit && vite build (web)
npm run typecheck   # all three packages
npm run test        # server (vitest) + web (vitest)
```

## What's tested and why

- `packages/server/test/htmlRewrite.test.ts` — the draft proxy's HTML
  rewriting: `<base>` tag insertion/replacement, malformed-document
  fallbacks, attribute escaping. This is the part most likely to silently
  break a real draft's rendering.
- `packages/server/test/draftProxy.test.ts` — request shaping (Basic auth
  header, URL construction, post-id validation) and error handling, against
  a fake `fetch`.
- `packages/server/test/gatewayAdapter.test.ts` — the Gateway transport
  adapter: connect/hello-ok, session listing and mapping, `sessions.changed`
  merge-by-key, the `agent`/`agent.wait` RPC pair with streamed `assistant`
  deltas, tool-event routing scoped to the right session, cancellation. All
  against a fake `GatewayClientFactory` — this is the seam that makes the
  adapter testable without a running Gateway.
- `packages/server/test/wsServer.test.ts` — the browser-facing WS bridge
  end to end over a real `ws` socket (not mocked): auth rejection, session
  listing, push events, streamed chat frames, error frames.
- `packages/server/test/accessAuth.test.ts` — Cloudflare Access JWT
  verification (`AUTH_MODE=access`): a validly signed token is accepted and
  its `email` claim surfaced as the identity; rejected when expired, when
  signed for the wrong `aud`, when issued by the wrong `iss`, when
  malformed, when signed with a different key (bad signature), and when
  neither the header nor the `CF_Authorization` cookie carries a token at
  all. Runs against a locally generated key pair via an injectable `getKey`
  (`AccessAuthOptions.getKey`) — the same fake-the-seam pattern
  `gatewayAdapter.test.ts` uses — so no network call to Cloudflare's real
  JWKS endpoint happens in the test suite.
- `packages/server/test/passwordHash.test.ts` — scrypt hashing
  (`AUTH_MODE=password`): correct password accepted against its own hash,
  wrong password and the empty string rejected, unicode passwords round-trip,
  two hashes of the same password differ (random salt), and a malformed
  `AUTH_PASSWORD_HASH` (wrong prefix, missing segment, non-hex data, plain
  text) is rejected by both `assertValidPasswordHash` (the startup check)
  and `verifyPassword` rather than silently treated as "no password matches"
  or worse "anything matches."
- `packages/server/test/session.test.ts` — the signed session token
  (`auth/session.ts`): a freshly issued token verifies; an expired one,
  one verified against the wrong secret, one with a tampered payload (kept
  the real signature, changed the expiry), one with a single flipped bit
  in the signature, and assorted malformed strings are all rejected without
  throwing.
- `packages/server/test/passwordAuth.test.ts` — the `AuthChecker`
  (`AUTH_MODE=password`) end to end: a valid cookie is accepted; no cookie
  header, a cookie header without the session cookie, a tampered cookie, an
  expired cookie, and a cookie signed with a different secret are all
  rejected.
- `packages/server/test/loginRateLimiter.test.ts` — the per-bucket
  escalating lockout: allowed while under the free-attempt budget, engages
  once it's exceeded, tracked independently per bucket key, cleared by a
  recorded success, escalates on a genuinely new failure after the
  previous window has elapsed, caps at 15 minutes rather than escalating
  forever, and — using fake timers to control `Date.now()` — never
  extends an already-active lockout no matter how many failures land
  during its window, and always expires back to "allowed" on its own once
  the window passes, with no `recordSuccess` needed.
- `packages/server/test/clientIp.test.ts` — the rate limiter's bucket-key
  resolution: the socket address is used when `TRUSTED_PROXY_HEADER` is
  unset; the configured header's value is used (case-insensitively) when
  it's set and looks like a real IPv4 or IPv6 address; and the socket
  address is used as a fallback — never a shared bucket, never an
  unlimited pass — when the header is absent, empty, malformed, or an
  X-Forwarded-For-style comma list.
- `packages/server/test/loginRoutes.test.ts` — the login/logout routes and
  the static-asset gate wired together against a real `http.Server` (not
  mocked, same pattern as `wsServer.test.ts`): an unauthenticated request
  for the app shell redirects to `/login`; the draft proxy fails closed
  with 401 rather than redirecting; the login page serves without auth; the
  correct password sets a cookie that then unlocks a gated route; the wrong
  password sets no cookie and leaves the route locked; a tampered cookie
  and an expired cookie are both rejected; `/logout` clears the cookie and
  re-locks the route; repeated failures engage the rate limiter, including
  turning away the *correct* password once locked out; and, with
  `TRUSTED_PROXY_HEADER` configured, two different header values get
  independent lockout buckets (one attacker can't lock out another
  visitor) while a missing or unparseable header still falls back to
  enforcing the limit rather than skipping it. Beyond the automated suite,
  the core login flow (login, wrong password, tampered/expired cookie, WS
  upgrade with and without a cookie, logout, rate limiting) was also
  manually driven with `curl` against a locally running server during this
  build — see "Auth" above.
- `packages/web/src/test/*` — `AsyncQueue` (the push/pull bridge between
  socket events and an `AsyncGenerator`), `BackendSocket` (request/response
  correlation, push-frame dispatch), `chatModelAdapter` (assistant-ui's
  `ChatModelAdapter.run()` contract: cumulative-yield semantics, session
  scoping, abort, error propagation), `threadListAdapter` (assistant-ui's
  `RemoteThreadListAdapter` contract against the backend protocol),
  `draftSelection` (best-effort post-id extraction, MRU tracking).

Not tested: React component rendering (`Sidebar`/`ChatPane`/`DraftPanel`,
`App`'s auth-mode branching, `ClerkGate`'s gating) — these are thin
arrangements of assistant-ui/Clerk primitives with no logic of their own
worth a rendering harness for one internal tool (the logic that *is*
worth testing — JWT verification, password hashing, session signing, the
login flow — lives server-side and is covered above); the real
`@openclaw/gateway-client` runtime itself (device-auth challenge/response,
reconnect backoff) — that's OpenClaw's own tested library, not this
project's code; and Clerk's own session verification (`clerkAuth.ts`'s
call into `@clerk/backend`) — unchanged from before this change and still
only exercised indirectly, via `wsServer.test.ts`'s fake `AuthChecker`.
The WS bridge's composition with the *real* password `AuthChecker`
specifically isn't separately re-tested either — `wsServer.test.ts`
already proves the bridge correctly honors whatever an `AuthChecker`
returns (via a fake one), and `passwordAuth.test.ts` already proves the
real one returns the right thing for every case that matters; the two
compose by construction, the same reasoning that already applied to
`access`/`clerk` before this change.

## What is stubbed, incomplete, or unverifiable from here

- **No real OpenClaw Gateway exists yet.** PLAN.md Phase 0 (provision a
  dedicated profile + agent "Sol") hasn't happened. `OPENCLAW_GATEWAY_MODE=real`
  is implemented and typechecked against the real `@openclaw/gateway-client`
  package's types, but has never connected to an actual Gateway.
- **The WordPress draft-preview round trip is unverified against the real
  site**, by hard constraint — see "Draft panel: the proxy" above.
- **The WordPress-editing tool's `tool.event` payload shape is unverified**
  — see "Drafts ▾ follows the agent" above. No such tool exists yet either.
- **Cloudflare Access verification is implemented and unit-tested, but not
  exercised against a real Cloudflare-issued token or a real deployment.**
  `accessAuth.ts` is tested against locally generated JWTs signed with a
  throwaway key pair (`test/accessAuth.test.ts`); whether Access is
  actually configured on the account (application created, AUD tag issued,
  policy scoped correctly) and whether a real token round-trips through
  verification the same way is a dashboard/live-deployment fact this
  project was not permitted to check — see "Auth" above and "Deploy to
  core" step 6.
- **The password-mode rate limiter's `TRUSTED_PROXY_HEADER` opt-in is
  unverified against the real `cloudflared` deployment** — see "Auth"
  above's `AUTH_MODE=password` section for the full explanation of the
  trust model (why `CF-Connecting-IP` is safe to key off of specifically
  because `cloudflared → 127.0.0.1:8099` is meant to be the only path in).
  What's confirmed: the bucketing logic itself, including its
  missing/malformed-header fallback (`test/clientIp.test.ts`,
  `test/loginRoutes.test.ts`). What isn't, and can't be from here: that
  the real `cloudflared` config actually sets that header on every
  request the way Cloudflare's docs describe, and that the deployed
  process is in fact bound to loopback only with no other ingress —
  both are live-deployment facts, not code.
- **A few `sessions.*` RPC names are best-effort, not schema-exact**:
  `protocol.schema.json` (2026.8.1-beta.1) has no dedicated `sessions.rename`
  or `sessions.unarchive` method; `gatewayAdapter.ts` uses the generic
  `sessions.patch` for both (setting `title` / `archived: false`), which is
  the closest documented fit but hasn't been confirmed against a live
  Gateway. Flagged with a comment at each call site.
- **Real cold-start time under Sablier is unmeasured** — this repo isn't
  deployed anywhere (hard constraint), so there's nothing to measure yet.
- **`npm audit` is clean at time of writing** (0 vulnerabilities); re-check
  before deploying since this wasn't re-verified at handoff time.
