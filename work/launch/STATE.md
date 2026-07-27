# Solyx launch state

Live status only

## Current

- Migration: 22/22 staging drafts complete; human launch verification remains.
- Backbone: forms, commerce, bilingual content, and tracking are not wired.
- Sequence: backbone → responsive QA → staging cleanup → domain/SSL cutover.
- Legacy production remains live and read-only until cutover approval.

## Lane 0 — Access and inventory

- **Status:** `in_progress`
- **Done:** production Arc session authenticated and verified on
`www.solyxenergy.nl/wp-admin/`; staging auth state exists locally.
- **Next:** inventory staging pages, products, forms, plugins, snippets, menus, templates, redirects, SEO, consent, and Woo settings according to what user needs after an inspepction is  made and shown.
- **Output:** dependency-aware `keep / replace / disable / remove` list.
- **Blocker:** none.



## Lane 1 — Forms and quotation routing

- **Status:** `in_progress`
- **Done:** staging had zero Gravity Forms and both wizards faked success —
submit only rendered the "Bedankt!" step. Forms **1** (Installatie aanvraag) and
**4** (Boilergarant) now exist, notifying `info@solyxenergy.nl` with the
submitter as reply-to. WPCode snippet **859** renders a hidden AJAX form on
pages 800/807 and loads the bridge (D-25); page content unchanged.
- **Evidence:** full 17-step walk on both pages produced entries with every
field correct, `source` distinguishing the two variants, and 4 photos stored and
retrievable (`200 image/png` via `gf-download`); both slots of one photo zone
fill independently. GF entry note: "WordPress successfully passed the
notification email to the sending server." An invalid email showed the Dutch
error plus GF's message and did **not** advance to "Bedankt!". Test entries
trashed; reproduce with `work/launch/lane1/scripts/e2e-submit.js`.
- **Next:** confirm a notification actually lands in the `info@solyxenergy.nl`
inbox, then wire the `Aan de slag` (801) result CTAs — all five are still
`href="#"` — once product routing is decided.
- **Blocker:** English parity needs a multilingual mechanism (none installed);
`Aan de slag` product routing is awaiting the user's decision.



## Lane 2 — Commerce and Mollie

- **Status:** `ready`
- **Next:** inspect staging WooCommerce products and Mollie mode; map the two
launch products and replace cosmetic cart behavior.
- **Done when:** both products complete cart, checkout, payment
success/failure, order confirmation, and email flows in both languages.
- **Blocker:** none.



## Lane 3 — Dutch/English content and legal

- **Status:** `ready`
- **Next:** inventory the staging multilingual setup and pair Dutch/English
routes; replace legal stubs from the approved source documents.
- **Done when:** every launch route, system message, form, checkout, legal link,
canonical, and language switch works in both languages.
- **Blocker:** none.



## Lane 4 — Tracking and consent

- **Status:** `ready`
- **Next:** audit CookieYes and existing Google/Meta ownership; define safe
`dataLayer` events for the external GTM operator.
- **Required events:** `quote_started`, `quote_step_completed`,
`generate_lead`, `view_item`, `add_to_cart`, `view_cart`,
`begin_checkout`, `purchase`.
- **Done when:** consent defaults and updates work, events fire once after real
success, and no personal form data enters analytics.
- **Blocker:** none.



## Lane 5 — Responsive and cross-browser QA

- **Status:** `blocked`
- **Blocked by:** lanes 1–4.
- **Next:** test the stable backbone at mobile, tablet, laptop, and desktop
widths across Chromium, Safari, and Firefox-class browsers.
- **Done when:** both languages and critical flows pass without overflow,
inaccessible controls, or editor regressions.



## Lane 6 — Legacy cleanup and cutover

- **Status:** `blocked`
- **Blocked by:** lanes 0–5.
- **Next:** apply the reviewed staging inventory, verify the clean site, then
prepare the approved domain/SSL switch.
- **Done when:** staging is healthy on the production hostname and legacy can
stop without a database/customer/order/stock migration.



## Deferred — Client-operated WordPress agent

- **Status:** `blocked`
- **Blocked by:** website launch.
- **Next:** later verify Claude/OpenClaw authentication, billing, consent,
least-privilege WordPress access, draft-first edits, and approval gates.



## Update format

At session wrap-up, change only the assigned lane:

- `Status`
- `Done` or evidence
- `Blocker`
- `Next`

No diary, duplicated rules, credentials, or speculative backlog.