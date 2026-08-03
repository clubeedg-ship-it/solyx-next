# Solyx launch state

Live status only

## Current

- Migration: 22/22 staging drafts complete; human launch verification remains.
- Backbone: forms, commerce, and tracking-consent are wired; bilingual content
is not.
- Sequence: backbone → responsive QA → staging cleanup → domain/SSL cutover.
- Legacy production remains live and read-only until cutover approval.
- **Site chrome is now a theme property.** The header and footer were duplicated
inside all 23 pages and missing entirely from the three legal pages. The design
chrome was lifted into the theme's `header` and `footer` template parts, the
per-page copies were removed, and every page moved off `solyx-blank` onto the
theme template. One header and one footer everywhere, edited in one place.
- **The unstyled-site incident was a stale page cache, not a broken snippet.**
SiteGround's proxy cache was serving copies predating the generated CSS: an
`x-proxy-cache: HIT` returned 921KB with 0 scoped rules while a `MISS` returned
2.1MB with 362. WPCode snippet 684 was healthy throughout. Purge with
`PUT /wp-json/siteground-optimizer/v1/purge-cache`; a HIT now carries ~8,600
scoped rules. Any future "the CSS vanished" report should check the cache first.
- **Admin session note:** the staging admin session expires periodically and
returns `wp-login.php?...&reauth=1`. Scripts must select a tab already inside
`/wp-admin` and take the REST nonce from
`/wp-admin/admin-ajax.php?action=rest-nonce`, since `window.wpApiSettings` is
absent on many admin screens.

## Lane 0 — Access and inventory

- **Status:** `in_progress`
- **Done:** production Arc session authenticated and verified on
`www.solyxenergy.nl/wp-admin/`; staging auth state exists locally.
HubSpot removed from staging on the user's instruction — "HubSpot All-In-One"
(`leadin/leadin.php`) and the "Gravity Forms HubSpot Add-On"
(`gravityformshubspot/hubspot.php`) deactivated then deleted, satisfying the
no-HubSpot launch rule. Staging went 21 → 19 active plugins with no PHP errors,
no HubSpot admin menu, and no HubSpot frontend requests; both wizard pages still
render their forms and a post-removal submission produced entry 4 with 4 uploads
and a sent notification. Deletion removed the plugin files, so restoring either
plugin means reinstalling it.
- **Staging inventory so far:** 28 pages (5 published, 23 drafts) plus **50
pages in trash** from the old clone; 0 posts; 0 orders; 0 coupons; 3
administrator accounts; Greenshift theme active alongside three unused default
themes. Published pages are Cart 13, Checkout 14, My account 15 and the old Home
129 — which coexists with migrated Home 626.
- **Production surveyed (read-only):** 79 active plugins, 656 orders, 75 posts,
76 pages, 12 products, and Gravity Forms carrying real history (home calculator
3635 entries, installation form 389, Boilergarant 56, installers 137). Services
running there that staging lacked: SMTP sending, WPML multilingual, Tag Manager
/ Meta Pixel / Pixel Manager / Google for WooCommerce / Hotjar, PDF invoicing
plus WeFact, product add-on fields, MailerLite, backups and caching.
- **Replicated to staging so far:** Gravity Forms Zero Spam (installed, active,
and regression-tested — the wizard still completes and the entry lands);
WP Mail SMTP configured exactly as production (own mail server
`mail.solyxenergy.nl`, SSL/465, auth on, sender `noreply@solyxenergy.nl` as
"Solyx Energy", forced sender) with the password left blank for the client;
PDF Invoices configured with the production company block, VAT and chamber of
commerce numbers, footer text, A4/Simple template, attached to the new-order and
processing-order emails, "WS" prefix, 30-day due date.
- **Deliberately not copied:** the invoice counter. Production is past 656 and
still issuing, so cloning it now would duplicate numbers. Set staging's counter
to production's final number at cutover.
- **Staging cleaned:** inherited published pages trashed (old Home 129, Shop 12
— 12 restored because WooCommerce's shop-page setting still referenced it).
Cart, Checkout and My account kept as WooCommerce system pages. The 23 migrated
drafts are untouched. Front page still points at trashed page 129 and must be
repointed to migrated Home 626 once that is published.
- **Transport security done:** SiteGround HTTPS enforcement was off
(`ssl_enabled: 0`); it is on, and `http://` now answers `307` to `https://`.
WPCode snippet **1354** adds the response headers that were all missing —
`Strict-Transport-Security: max-age=15552000` (HTTPS only, no preload, so the
host can still be moved at cutover), `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy`
denying geolocation, microphone and camera. No Content-Security-Policy: the
pages carry inline styles and scripts throughout and a blind policy would break
them. All five headers verified live.
- **Next:** client enters the SMTP password, then send a real test message to
prove delivery end-to-end. Then tracking.
- **Output:** dependency-aware `keep / replace / disable / remove` list.
- **Blocker:** none. Production access works while the Arc session holds; it
signs out periodically and a SiteGround bot challenge sits in front of it, so
re-authentication is needed before any further production reads.



## Lane 1 — Forms and quotation routing

- **Status:** `in_progress`
- **Done:** all four approved form UIs now submit into real Gravity Forms with
the frontend unchanged. Forms **1** (Installatie), **4** (Boilergarant), **5**
(Contactvraag, page 721) and **6** (Installateurs inkoopinformatie, page 781)
are active and notify `info@solyxenergy.nl` with the submitter as reply-to;
pages 721 and 781 previously faked success and discarded every submission.
WPCode snippet **859** renders the hidden AJAX form per page (800→1, 807→4,
721→5, 781→6) and loads one bridge bundle with three adapters (D-25); page
content unchanged. Backend defects closed: form 4 now accepts the wizard's
`horizontal` boiler choice, which was silently dropped; upload extensions
widened to match `accept="image/*"`; phone fields moved off GF's US `standard`
mask to `international`; Dutch validation messages on required fields;
submitter confirmation notification on all four forms; personal-data
export/erase mapping set. Bridge timeout 60s → 180s and it no longer re-enables
submit on timeout, which had been producing duplicate leads.
- **Evidence:** run `E2E-1785770194746` drove all four UIs through their own
visible controls. Entries 6/7/8/9 recorded every field, including
`boilerType: horizontal` on form 4 and `tapwater`, `marketingOptIn`, `source`
and `pageUrl` on form 5. Existing success states unchanged (wizard step 17,
`.sent`, "Verzonden ✓"). Test entries trashed; reproduce with
`work/launch/lane1/scripts/e2e-all.js`. Form changes are idempotent and
versioned in `work/launch/lane1/migrate.php`.
- **Next:** once mail authenticates, confirm arrival and spam placement at
`info@solyxenergy.nl`, then wire the `Aan de slag` (801) result CTAs — all five
are still `href="#"` — once product routing is decided.
- **Blocker:** **no form notification can leave the site.** Every one of the
eight notifications fired by the E2E run failed with `SMTP Error: Could not
authenticate` (WP Mail SMTP debug events #4–#8) — the empty SMTP password of
CLIENT-QUESTIONS A1, now confirmed against live submissions rather than
inferred. Earlier "passed to the sending server" entry notes predate the SMTP
mailer and are not evidence of delivery. English parity still needs a
multilingual mechanism; `Aan de slag` product routing awaits the user.



## Lane 2 — Commerce and Mollie

- **Status:** `in_progress`
- **Done:** the inherited 13-product component catalogue was trashed
(recoverable) and replaced with the two launch products, priced from the static
HTML configurator which the client confirmed is authoritative: `NYMO`
€611–€649 (standard/Homey) and `NYMO-SET` €1.076–€1.768 (14 combinations,
standard + 100L steel = €1.189). Tax needed no change — prices are BTW-inclusive
with a 21% NL rate. EU standard rates corrected from a blanket 21% to
destination values (DE 19, AT 20, SE 25, FI 25.5, LU 17, DK 25); revert if the
client is under the €10k threshold and not OSS-registered. Mollie live key is
present and iDEAL + Bancontact are enabled. Scripts in `work/launch/lane2/`.
- **Shop is reachable.** WooCommerce's own "Store coming soon" mode was still
on (`woocommerce_coming_soon: yes`, store pages only) — separate from the
Under Construction plugin and gating every commerce route. Turned off; `/shop/`
now lists both products at €611–€649 and €1.076–€1.768 with working
"select options", and `/cart/` and `/checkout/` render. The store address was
already complete, so the PDF-invoice warning is about something else and is
still open.
- **Site language was `en_US`** on a Dutch storefront, so WooCommerce rendered
"Showing all 2 results", "Default sorting" and "Select options" to Dutch
customers. Set to `nl_NL`. Setting this operator's own profile language back to
English is still pending — WordPress lists that option with an empty value, and
the browser session locked up before it was applied.
- **Both products have no image** — the shop grid shows placeholder icons.
- **Not verified:** no checkout has been run. Cart → checkout → Mollie redirect
→ order status → confirmation email are all unproven. The payment step itself
needs the client, since it requires their bank login.
- **Next:** drive a real order to the Mollie redirect, then have the client
complete payment and verify order status and emails.
- **Blocker:** Belgium shipping cost and the €1.725 package composition are
client questions (see Needs review); go-live also needs the delivery/returns
text.



## Lane 3 — Dutch/English content and legal

- **Status:** `ready`
- **Next:** inventory the staging multilingual setup and pair Dutch/English
routes; replace legal stubs from the approved source documents.
- **Done when:** every launch route, system message, form, checkout, legal link,
canonical, and language switch works in both languages.
- **Done:** legal text imported from production — terms 21,461 chars and
delivery/returns 3,146 chars are live, placeholders gone, and the delivery page
carries the EU 14-day withdrawal section. 43 Dutch blog posts imported with
original slugs and dates; 34 legacy article links on the blog index localised.
89 dead links repaired across 18 pages (166 -> 77 remaining) and every legacy
`.html` link removed; 488 root-relative links now in place.
- **Link audit is effectively clean.** A crawl of all 26 public routes found 155
distinct internal targets and only two broken: `/installatie/` still linked the
pre-migration file name `hoe-werkt-het.html#s-check`, and `/installateurs/`
linked "Technische Info" to `/technisch`, which has never existed here and has
no matching in-page anchor — the manuals page is the technical documentation, so
it now points at `/handleidingen/`. Both are fixed and re-verified: 0 links
ending in `.html` remain on `/installatie/`. `/contact/` and `/aan-de-slag/`
return 404 but nothing links to them; they are cutover redirect entries, not
on-site defects.
- **Where the last legacy link was hiding:** not in page content and not in any
snippet body, because snippet 684 stores its payloads base64-encoded — a
literal search over the snippet source can never match. It holds two blobs, the
page CSS (1,448,252 chars) and the injected page chrome (572,924). The link sat
in the second. Patched by decoding only that blob, rewriting the pre-migration
file names, re-encoding, and splicing it back with the CSS literal left
byte-identical; verified afterwards that the site still delivers ~8,600 scoped
rules. Use the same approach for anything else buried in generated assets.
- **Editor instruction text is gone.** It came from the `solyx-blank` template,
not a snippet, and no page uses that template any more. Confirmed absent from
all 26 routes.
- **Blocker:** (1) the privacy page — production has no privacy page at all,
only a May 2022 PDF, so there is nothing to copy (CLIENT-QUESTIONS B4) — privacy, delivery/returns, terms —
are empty placeholders on both the static sources and staging; production
appears to hold the real text and should be copied across (CLIENT-QUESTIONS B4).
This blocks taking real payments. (2) No multilingual plugin is installed, so no
lane can pass its English half until the mechanism is chosen.



## Lane 4 — Tracking and consent

- **Status:** `in_progress`
- **Done:** the Meta Pixel no longer fires before consent. Pixel
`2264362454021133` was pasted raw into the GreenShift theme's head code, so it
ran on first paint and set `_fbp` while the consent cookie still said
`advertisement:no`. It now lives in WPCode's site-wide header behind its own
consent guard: it reads `cookieyes-consent`, starts only on
`advertisement:yes`, and also listens for the CookieYes update event plus a
short cookie poll so it starts the moment the banner is answered, without a
reload. The `<noscript>` beacon was dropped — it fires an image request with no
way to check consent first. CookieYes' own `data-cookieyes` blocking attribute
was tried first and does not work on this install: the script stayed
`text/plain` even after full consent.
- **Evidence:** clean profile, `/besparen/`. Before consent — no `_fbp`, `fbq`
undefined, 0 requests to any facebook host. After clicking accept — `_fbp` set,
`fbq` a function, and `fbevents.js`, `signals/config` and
`tr/?ev=PageView` all fire. A second run where consent was declined
(`advertisement:no`) kept the pixel off. The HubSpot and Hotjar cookies seen
earlier were stale `.solyxenergy.nl` cookies in the operator's own browser
profile, not staging — a clean profile sets none.
- **Next:** audit Google ownership and define safe `dataLayer` events for the
external GTM operator.
- **Required events:** `quote_started`, `quote_step_completed`,
`generate_lead`, `view_item`, `add_to_cart`, `view_cart`,
`begin_checkout`, `purchase`.
- **Done when:** consent defaults and updates work, events fire once after real
success, and no personal form data enters analytics.
- **Blocker:** none.



## Lane 5 — Responsive and cross-browser QA

- **Status:** `in_progress`
- **Done:** phones have navigation again. The design simply hid the nav links
below 900px, leaving 18 pages with no menu at all; the new theme header carries
a toggle that opens the links and the Bestel button, so the fix landed once
rather than per page. Verified at 390px on the migrated and the legal pages —
toggle visible, no horizontal overflow. All 23 pages measure 0 overflow at
1440px with the chrome painted on top.
- **Available, not yet deployed:** `work/launch/lane5/responsive-fixes.css`
from the fix agent. Its measurements were taken while the stale cache was
serving two different versions of the same URLs, and several rules are scoped to
`.solyx-page-<slug> .solyx-nav-row` / `.solyx-installer` — selectors that no
longer match now that the chrome sits in the theme part outside the page
wrapper. Re-measure against the current site and re-scope the chrome rules to
`.solyx-site-chrome` before deploying.
- **Next:** re-run the sweep now that the cache serves one consistent version.
- **Done when:** both languages and critical flows pass without overflow,
inaccessible controls, or editor regressions.



## Lane 6 — Legacy cleanup and cutover

- **Status:** `blocked`
- **Blocked by:** lanes 0–5.
- **Next:** apply the reviewed staging inventory, verify the clean site, then
prepare the approved domain/SSL switch.
- **Checklist:** `work/launch/CUTOVER.md` holds every switch-day step, including
the media URL search-and-replace, re-enabling search indexing, the invoice
counter, and the 301 table.
- **Done when:** staging is healthy on the production hostname and legacy can
stop without a database/customer/order/stock migration.



## Deferred — Client-operated WordPress agent

- **Status:** `blocked`
- **Blocked by:** website launch.
- **Next:** later verify Claude/OpenClaw authentication, billing, consent,
least-privilege WordPress access, draft-first edits, and approval gates.



## Needs review

Client questions — credentials and business decisions — live in
`work/launch/CLIENT-QUESTIONS.md`. Blocking right now: the SMTP password (A1),
the delivery and returns text (B4), and Tag Manager / Meta / WPML credentials
(A2, A3, A5) before tracking and English can start.

**Staging is a clone of an old production site. Nothing already configured there
is evidence of a decision — treat every pre-existing setting as unverified
legacy until confirmed against production or by the client.**

## Update format

At session wrap-up, change only the assigned lane:

- `Status`
- `Done` or evidence
- `Blocker`
- `Next`

No diary, duplicated rules, credentials, or speculative backlog.