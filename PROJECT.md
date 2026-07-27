# Solyx Energy website — master doc

Chunked retrieval. Reach a section via its `## §X` anchor — see `AGENTS.md` §8 for the index, `§G` below for snippets. There is no separate spec; `hub.html` is the page registry (`index.html` redirects to `home.html`) and this doc is the authority on static-site conventions. Staging WP migration truth: `.cursor/skills/solyx-migration/SKILL.md` + `work/greenshift-migration/status.json`.

Cadence: `§A` PR-gated · `§B` append-only · `§F` append-only · `§C §D §E §G` overwrite freely. `§E` hot state is YAML.

---

## §A — Architecture

### §A.1 Overview
A static, multi-page marketing site for **Solyx Energy** promoting the **Nymo WaterAccu** — an electric boiler that stores cheap/off-peak/solar electricity as hot water (a "water battery"). The folder is a working copy where page content is finished before it goes live on the WordPress site `solyxenergy.nl`. Core value: let a non-developer edit plain HTML pages (copy, images, prices, links) with no toolchain, previewing by opening the file in a browser.

### §A.2 Stack & component shape
- **No build step, no framework.** Each page is one self-contained `.html` file with an inline `<style>` block and inline `<script>`. No shared CSS/JS, no bundler, no npm, no server-side code.
- **Duplicated but standardized shell.** Every page ships its own `<nav>`/`<footer>` (no include mechanism — repeat changes per page). As of 2026-06-19 every page shares ONE header: a full-width frosted-glass bar pinned flush to the top — `nav{position:fixed;top:0;left:0;right:0;…;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,.5));backdrop-filter:blur(20px) saturate(180%);border-bottom:1px solid rgba(255,255,255,.55)}`. Any per-page `#installer-bar` strip is hidden (`display:none`). Footers are isolated from the decorative green blob field (`isolation:isolate` + opaque bg `#080c0a`, darkened 2026-06-19) so it can't bleed through. Copy the canonical nav/footer block from any current page.
- **Styling.** Inter + DM Sans (Google Fonts), CSS custom props `--font-head` / `--font-body`. Fixed brand palette: `#35A847` (primary green), `#1E7A30` (dark green), `#1c2422` (ink), `#f6f8f7` (page bg).
- **Assets.** Images are hot-linked from `https://www.solyxenergy.nl/wp-content/uploads/...` (the live WordPress media library). Local `midia/` now also holds real page assets: **`new_boiler.svg`** (canonical boiler glyph, viewBox `0 0 230 392`, inlined into product cards as `currentColor`) and the how-to-get-it photos `solyx-logo.jpg` / `nymo-homey.jpg` / `nymo-sensor.jpg`. Files were renamed 2026-06-20 from messy meeting-export names to descriptive ones (also: `sun-icon`, `solar-house-icon`, `solar-roof-icon`, `new_boiler.png` — unreferenced icon set).
- **Interactive widgets are per-page vanilla JS:** savings calculator + charts (`besparen.html`), snap-scroll explainer (`hoe-werkt-het.html`), product quiz wizard (`how-to-get-it.html`), configurator (`shop.html`), version tabs + add-ons (`wateraccu.html`), accordion FAQ (`faq.html`).
- **Serving.** `.claude/launch.json` → **`solyx-next-static`**: python `http.server` on **:4599** serving THIS folder with **no-cache** headers (custom `SimpleHTTPRequestHandler` subclass; `autoPort:false`), `/` → `home.html`. Started in isolated mode (`-I` + `os.chdir`) to survive the sandbox cwd restriction. (Two stale configs — `live-server`:8080, `python-http`:8000 — still point at the sibling `Solyx Edited Pages`; ignore them.)

### §A.3 Edit flow (the "data flow" here)
Author names a page + the change → edit that page's inline HTML/CSS/JS → save → refresh the browser. No compile, no deploy from this folder; going live means copying finished content into the WordPress site (process out of scope here).

### §A.4 Page registry
`hub.html` (the old `index.html` body, preserved) lists pages in three groups: **Main pages**, **New pages**, **Forms**; `index.html` itself now just redirects to `home.html`. Site pages present (14): `home`, `hoe-werkt-het`, `besparen`, `how-to-get-it`, `shop`, `wateraccu`, `faq`, `installatie`, `landingspagina`, `klantverhalen`, `over-ons`, `installatie-formulier`, `installatie-formulier-boilergarant`, plus the registry `hub` and the redirect `index`. Helper file: `design-canvas.html` (the approved look mockup — not a site page; excluded from link sweeps). Still **not built**: `handleidingen`, `blog-news`, `installateurs` — links that pointed at these are routed to the nearest real page (no 404s).

### §A.10 Invariants
Byte-identical mirror of static invariants in `AGENTS.md` §5 (static surface). Changes require updating both files + a `§B` entry.
- No build step, no framework, no npm: every page is a single standalone `.html` with inline `<style>` and inline `<script>`. Don't add bundlers, shared CSS/JS files, or dependencies.
- Each page carries its own `<nav>` and scripts — there is no shared shell; edits to nav/footer must be repeated per page.
- Brand palette is fixed: primary green `#35A847`, dark green `#1E7A30`, ink `#1c2422`. Fonts: Inter + DM Sans via Google Fonts (`--font-head` / `--font-body`).
- User-facing copy is Dutch, regardless of the `<html lang>` attribute.
- Images are hot-linked from `https://www.solyxenergy.nl/wp-content/uploads/...` — don't rebake to local paths unless asked. (Exceptions already local in `midia/`: `new_boiler.svg`, and the how-to-get-it photos `solyx-logo.jpg` / `nymo-homey.jpg` / `nymo-sensor.jpg`.)
- All internal nav/footer/CTA links are local relative `.html` paths — never point them at `solyxenergy.nl`. Only `<img>` and `mailto:` may reference the live domain. Watch for JS bounces too (`onclick="window.location.href=…"`, `window.open(…)`), not just `href`.
- `midia/` assets use descriptive kebab/snake names (renamed 2026-06-20). The only referenced ones are the how-to-get-it photos `solyx-logo.jpg` / `nymo-homey.jpg` / `nymo-sensor.jpg`; the rest (`new_boiler.svg`/`.png`, `sun-icon`, `solar-house-icon`, `solar-roof-icon`) are an unreferenced icon set. Don't reintroduce the old "Boiler Icon…"/"Scherm_afbeelding…"/"Solyx Website Next Steps…" names.
- `index.html` is a **redirect** to `home.html`; the page registry (source of truth for which pages should exist) is **`hub.html`** — keep `hub.html` in sync when adding/removing pages. Serve via `.claude/launch.json` → `solyx-next-static` (python no-cache server on :4599, `/` → home).

---

## §B — Decisions (append-only)

Each entry: date · id · title, then Decision / Rationale.

### 2026-06 · D-01 · Plain standalone HTML, no build step
**Decision:** Every page is a self-contained `.html` file with inline styles/scripts; no framework or toolchain. **Rationale:** Stated in `index.html` ("there is no build step… open any file in a browser to preview") — lets a non-developer finish content directly.

### 2026-06 · D-02 · Hot-link images from the live WordPress media library
**Decision:** Page images point at `www.solyxenergy.nl/wp-content/uploads/...` rather than local files. **Rationale:** Reuses the production asset library so the working copy mirrors live imagery without duplicating files.

### 2026-06-19 · D-03 · `solyx-next` is the canonical folder
**Decision:** This folder ships; `.claude/launch.json` was repointed to it (`solyx-next-static`, python no-cache server on :4599, `/`→home). **Rationale:** Resolves OQ-1. The sibling `Solyx Edited Pages` configs are stale and ignored.

### 2026-06-19 · D-04 · One standardized header across every page
**Decision:** All pages use a single header — a full-width frosted-glass bar pinned flush to the top (`top:0`), original link style (no pill/hover-bubbles/hamburger by default), `.btn-orange` CTA → `how-to-get-it.html`; any `#installer-bar` strip hidden. **Rationale:** Pages had drifted into 3 variants (transparent bar, green pill, plain). User picked "the plain frosted bar, flush to the top." A prior session's pill experiment was reverted.

### 2026-06-19 · D-05 · Self-contained local navigation — no live-domain bounces, no 404s
**Decision:** Every nav/footer/CTA/JS link resolves to a local relative `.html` (or `#`/`mailto:`). Live-domain links (incl. `onclick`/`window.open`) were localized; links to never-built pages route to the nearest real page; `index.html` became a redirect to `home.html` and the registry moved to `hub.html`. The 5 listed-but-missing content pages were authored and standardized. **Rationale:** The site must be browsable offline as a self-contained mockup before Greenshift conversion; clicking anything must not jump to the live WordPress site.

### 2026-06-19 · D-06 · Unified product-card icons; canonical boiler = `midia/new_boiler.svg`
**Decision:** The Nymo device icon uses the detailed glyph everywhere; the boiler uses `midia/new_boiler.svg` (renamed from "Boiler Icon from June 15 Meeting.svg"), **inlined** into cards as `currentColor` (not `<img>`, so it follows the card's green). The old simple-stroke boiler (viewBox `0 0 92 132`) is removed site-wide. **Rationale:** Card icons had a mix of old/new glyphs and an off-center boiler dial; user wanted the `/midia` boiler used consistently.

### 2026-06-20 · D-07 · Logo = transparent inline SVG wordmark everywhere
**Decision:** All nav/footer logos use the transparent inline SVG wordmark (dark `#1C2422` circle+bolt mark + "SOLYX ENERGY" text). The base64 **JPEG** logo on `home`/`besparen`/`installatie`/`landingspagina` was swapped out. **Rationale:** JPEG has no alpha → it rendered a white square block behind the logo on the frosted header. The SVG is transparent and already used by the other pages, so this also unifies the logo.

### 2026-06-20 · D-08 · `midia/` assets use descriptive names
**Decision:** Renamed all `midia/` files from meeting-export names to descriptive ones (e.g. `htg-1/2/3.jpg` → `solyx-logo.jpg`/`nymo-homey.jpg`/`nymo-sensor.jpg`; "Boiler Icon…"→`new_boiler.png`; "Solyx Website Next Steps…"→`solar-roof-icon`/`sun-icon`; "Scherm_afbeelding…"→`solar-house-icon`) and updated the 12 references in `how-to-get-it.html`. Verification screenshots moved to `screenshots/`. **Rationale:** The folder was unreadable; clear names + a tidy root help the next agent and the eventual Greenshift port.

### 2026-07-17 · D-09 · Profile-and-adapter Greenshift migration pipeline
**Decision:** Migrate each static page through a durable profile (`profiles/<slug>.json`) and page adapter (`profiles/<slug>.adapter.js`) instead of one-off page mutations. The pipeline requires valid editable blocks, scoped CSS, staging drafts, and automated source/preview/editor QA; complex DOM/interaction pages remain adapter-led rather than being falsely called “automatic.” **Rationale:** The Hybrid B homepage exposed editor sandbox failures (HTML iframes, SVG/CSS loss, page chrome overlays) that generic raw HTML imports cannot solve safely or repeatably.

### 2026-07-27 · D-20 · Agent memory is AGENTS.md; migration queue closed
**Decision:** Canonical always-loaded memory is `AGENTS.md`; `CLAUDE.md` is a pointer only. Treat the migrate-page queue as 22/22 finished (Otto verification pending). Next work is post-migration lanes in `AGENTS.md` §7 — not another migration sweep. **Rationale:** Queue work is complete as agent output; remaining website work is verification, home-on-ask, IA/go-live, WooCommerce, forms, WIP copy, and media.

### 2026-07-27 · D-21 · Install forms → Gravity Forms backend, UI frozen
**Decision:** Keep `installatie-formulier` (800) and `installatie-formulier-boilergarant` (807) wizard UI exactly as migrated. Gravity Forms collects submissions and emails `info@solyxenergy.nl`; do not connect HubSpot. No GF shortcode UI and no visual redesign of the wizard.
**Rationale:** Otto: never change the form UI; GF is data collection only (Option B).

### 2026-07-27 · D-22 · Two products and two conversion paths
**Decision:** The new customer-facing catalogue has exactly two products: Nymo without boiler and Nymo with boiler. `Aan de slag` routes a customer either to direct WooCommerce/Mollie purchase or to a customized, prefilled Gravity Forms quotation.
**Rationale:** Customers need both immediate purchasing and an installation-aware quotation path; the current cosmetic cart and submit states do neither.

### 2026-07-27 · D-23 · Staging becomes production; legacy stays isolated
**Decision:** Continue all development on `2026.solyxenergy.nl` while the legacy site remains live. After full staging verification, promote staging through the production domain/SSL switch and then stop the legacy host. Do not replace, merge, or migrate the live WordPress database, customers, orders, or stock.
**Rationale:** Staging is a cloned but independently rebuilt replacement site—the “new car” runs before the legacy engine stops.

### 2026-07-27 · D-24 · Launch lanes and Claude Code bootstrap
**Decision:** `AGENTS.md` defines the compact launch lane contract,
`work/launch/STATE.md` stores live status only, and `CLAUDE.md` imports
`AGENTS.md` using Claude Code’s supported `@AGENTS.md` syntax. Reusable browser
access is documented in `work/launch/BROWSER-ACCESS.md`.
**Rationale:** Cursor and Claude Code need the same lean instructions without
duplicated prompt templates or state.

### 2026-07-27 · D-25 · Wizard UI submits into a hidden Gravity Form
**Decision:** The approved installation-wizard UI is kept exactly as migrated and
is not rebuilt in Gravity Forms. WPCode snippet 859 renders a real, hidden,
AJAX Gravity Form on pages 800 (form 1) and 807 (form 4); `bridge.js` intercepts
the wizard's "Verzenden" button in the document capture phase, mirrors every
answer plus files into that form, submits it, and only advances to the "Bedankt!"
step after Gravity Forms confirms. Each photo zone maps to two single-file upload
fields, because GF multi-file fields use their own async uploader that cannot be
populated without relying on plugin internals. Sources of truth live in
`work/launch/lane1/`; staging page content is untouched.
**Rationale:** Preserves the approved UI and its 17-step branching while giving
real entries, uploads, validation and notifications. Before this the wizard
showed "Bedankt! We hebben je gegevens ontvangen" and sent nothing at all.

---

## §C — Roadmap & open questions

### §C.1 Roadmap
| Phase/Milestone | Content | Status |
|---|---|---|
| Static shell + local nav | Frosted header/footer, local links, hub registry | **Done** |
| Static page set | Marketing + legal/WIP + shop split + forms | **Done** (see `hub.html`) |
| Staging Gutenberg migration | 22-page `migrate-page` queue → editable drafts | **Done (agent)** 2026-07-27 — Otto verification pending |
| Home track | Staging 626 + WPCode 655 | **Separate / out of queue** |
| Launch backbone | Gravity Forms, two-product Woo/Mollie, NL/EN, tracking/consent | **Current** — `work/launch/STATE.md` |
| Responsive QA | Mobile/tablet/cross-browser after backbone | **Blocked by backbone** |
| Legacy cleanup | Approved staging allowlist; no blind deletion | **Ready for inventory** |
| Live cutover | Promote staging via domain/SSL, then stop legacy | **Blocked by staging verification** |

### §C.2 Immediate next work
- Run Lane 0 inventory and establish reusable browser access.
- Complete launch backbone lanes 1–4: Gravity Forms, two-product Woo/Mollie, Dutch/English, tracking/consent.
- Then responsive QA, approved legacy cleanup, staging verification, and domain/SSL cutover.
- Do not reopen the 22-page migration queue as a new migration project.

### §C.3 Open questions
- ~~**OQ-1 — Which folder is canonical?**~~ **Resolved 2026-06-19 (D-03):** `solyx-next` is canonical.
- ~~**OQ-2 — How do pages become editable WP?**~~ **Resolved 2026-07:** core Gutenberg drafts via `solyx-migration` skill (not paid Greenshift layout blocks).
- ~~**OQ-3 — Go-live model:**~~ **Resolved 2026-07-27 (D-23):** staging becomes production through domain/SSL; legacy remains isolated until shutdown.
- ~~**OQ-4 — Source of truth:**~~ **Resolved 2026-07-27 (D-23):** staging is the new site; static HTML is reference only.
- **OQ-5 — Staging allowlist:** exact legacy pages/plugins/settings to keep, disable, or remove after dependency inventory.

---

## §D — Workstreams (lane memory)

Lane scope lives in `AGENTS.md`; live status and handoff state live in
`work/launch/STATE.md`.

### §D.1 launch backbone
**Lanes:** forms/quotation, two-product commerce/Mollie, Dutch/English/legal, tracking/consent.
**Contract:** real backend success, no HubSpot, no PII in analytics, no cosmetic form/cart success.

### §D.2 responsive QA
**Root:** stable staging backbone.
**Contract:** mobile/tablet/cross-browser begins after the functional DOM and integrations stabilize.

### §D.3 staging cleanup and cutover
**Roots:** staging inventory, approved allowlist, domain/SSL promotion.
**Contract:** production read-only; no DB/customer/order/stock migration; legacy remains available until the promoted staging host passes.

### §D.4 deferred client agent
**Root:** post-launch discovery.
**Contract:** Claude/OpenClaw design requires explicit client consent, least-privilege WordPress access, draft-first edits, approval gates, and verified subscription/API billing behavior.

---

## §E — Handoff

```yaml
mode: launch-wiring
memory: AGENTS.md
launch_state: work/launch/STATE.md
browser_access: work/launch/BROWSER-ACCESS.md
migration_progress: work/greenshift-migration/status.json
state: >
  The 22-page migration is complete. Staging is the replacement site and stays
  separate from legacy production until verified. Backbone work is Gravity
  Forms quotations, two-product Woo/Mollie, Dutch/English, and consent-aware
  tracking. Responsive QA follows the backbone.
next_lanes:
  - 0 access and staging legacy inventory
  - 1 Gravity Forms and Aan de slag routing
  - 2 two-product WooCommerce and Mollie
  - 3 Dutch/English and final legal content
  - 4 tracking and consent contract
  - 5 responsive QA after backbone
  - 6 allowlist cleanup and domain/SSL cutover
do_not:
  - write to legacy production without explicit task-level approval
  - migrate or merge customers, orders, stock, or the production database
  - connect HubSpot
  - show false form/cart success before backend success
  - clean staging without an approved dependency-aware allowlist
  - place credentials or auth state in prompts/docs/source control
updated: 2026-07-27
```

## §F — History (append-only)

- **2026-07-27** — `AGENTS.md` becomes always-loaded memory (`CLAUDE.md` pointer). Migration queue closed (22/22 agent-finished); post-migration lanes documented.
- 2026-07-20 hoe-werkt-het: Gutenberg `components-sandbox` iframes do not load page CSS — embed scoped CSS inside each `core/html`. On frontend, remove those `<style>` nodes (hoisted siblings possible) so preview uses page assets. Never put decorative shell padding (`.hwh-hero { padding:120px 48px }`) on the group that wraps a full HTML section already carrying its own padding.

- **2026-06-16** — Memory docs (`CLAUDE.md` + `PROJECT.md`) created from a read-only deep-dive of the folder.
- **2026-06** — Pages last edited (file mtimes 8–16 Jun): `home`, `besparen`, `faq`, `installatie` most recent; `index.html` reflects a 16-page target layout.
- **2026-06-19** — Big standardization pass (D-03..D-06): one frosted-glass header flush to top on all pages; killed every live-domain bounce (href + JS); routed dead links to nearest real page; built + standardized the 5 missing pages; `index.html`→redirect, `hub.html`=registry; repointed `launch.json` to a no-cache :4599 server; unified Nymo + `midia/new_boiler.svg` card icons (renamed from "Boiler Icon from June 15 Meeting.svg"); fixed oversized content (home 01/06, 02/06), the hoe-werkt-het 07/07 video carousel width (640→920px), and darkened all footers (`#0e1512`→`#080c0a`). Design approved earlier via `design-canvas.html`.
- **2026-06-20** — Polish + housekeeping (D-07, D-08): replaced the base64-JPEG nav logo (white-box) with the transparent inline SVG wordmark on `home`/`besparen`/`installatie`/`landingspagina`; renamed all `midia/` assets to descriptive names and updated the 12 `how-to-get-it.html` references; moved 31 loose screenshots into `screenshots/`; fixed the `launch.json` port conflict (kill stray :4599 process before `preview_start`).
- **2026-07-17** — Added reusable editable-Gutenberg migration infrastructure: project skill, profile/adapter generator, parser validator, staging-draft uploader, and source/preview/editor visual QA gate. Profiled `hoe-werkt-het.html` as the first complex adapter candidate (snap/carousel/script features).

### Durable lessons
- A `href=` grep does NOT catch JS bounces — `onclick="window.location.href=…"` and `window.open(…)` also jumped to the live site. Sweep those too before claiming "no live links."
- The canonical boiler/icon source is a file in `midia/` (`new_boiler.svg`), not the inline placeholder in the cards. When the user says "use the SVG / the one from page X," find the real source asset, don't hand-tweak the placeholder paths.
- Snap-scroll sections cap content (`max-width` on inner blocks like `.vscroll`; large `padding-top`/`margin-top`; per-section font sizes). "Limited width / oversized / clipped" usually means an inner `max-width` or top-spacing value, not the column.
- Phantom layout bugs were stale browser cache: the python server sent no cache headers. The :4599 config now sends `Cache-Control: no-store` — if a fix "doesn't show," it's not cache anymore.
- Nav/footer are duplicated per page; the same bug/fix recurs across 9–14 files. The fastest correct move is `Edit replace_all` on identical blocks, then verify a couple of pages.
- The user's pages can be **dropped in/replaced wholesale** between sessions (a fresh `home.html` reverted all prior standardization). Re-check, don't assume earlier edits survived.
- `<html lang>` is unreliable (some Dutch pages declare `en`); never infer page language from the attribute.
- A **base64 JPEG** logo shows a white square block (JPEG has no transparency); `mix-blend-mode:multiply` doesn't fully hide it. Use the transparent inline SVG wordmark (already on most pages). Same trap for any "white box behind a graphic" report.
- `core/html` is rendered in a sandboxed iframe in Gutenberg’s visual editor. It cannot inherit the page stylesheet: make tiny fragment CSS self-contained, and inject decoration/page chrome only on the frontend. Never use `core/html` for the overall page layout or page-wide `<style>`.
- `preview_start` fails if a stray background python server still holds **:4599** — `pkill -f 4599` / `lsof -ti tcp:4599 | xargs kill -9` first, then `preview_start` (`autoPort:false` keeps it on 4599, the URL the user relies on).

### Working with THIS user (read before touching anything)
- **Don't over-engineer / don't add unrequested things.** A pill nav, hover-bubble links, and a hamburger menu were all added uninvited and angrily rejected. "Frosted glass header" meant *the same header with a frosted bg* — nothing more. Do the literal ask; surface extras as a question, don't ship them.
- **Edit files directly; reserve scripts for bulk mechanical sweeps only.** Hand-editing inline SVG paths instead of swapping in the real `midia/` asset drew a sharp "wtf are you doing." Bulk find/replace (domain localization, a global color) via a quick script is tolerated; transforming *visible content* by script is not — use the Edit tool there.
- **Run the dev server yourself; never ask the user to run commands.** "Never act as if I was your babysitter." Use Bash (`dangerouslyDisableSandbox` for the python server) or `preview_start`.
- **Verify visually before editing, and when a complaint is vague.** The user is terse and references things loosely ("the boiler", "section 07/07", "the svg at /media"). Screenshot/inspect first — several wrong guesses came from acting on the wrong element. Map his words to the real DOM/file before changing anything.
- **He hard-refreshes and judges live** — keep the no-cache :4599 server running so what he sees matches the files.

---

## §G — Retrieval

### §G.1 Section extract
```bash
sed -n '/^## §A/,/^## §B/p' PROJECT.md    # architecture
sed -n '/^## §B/,/^## §C/p' PROJECT.md    # decisions
sed -n '/^## §C/,/^## §D/p' PROJECT.md    # roadmap + OQs
sed -n '/^## §D/,/^## §E/p' PROJECT.md    # workstreams
sed -n '/^## §E/,/^## §F/p' PROJECT.md    # handoff (YAML hot state)
sed -n '/^## §F/,/^## §G/p' PROJECT.md    # history
sed -n '/^## §G/,$p'        PROJECT.md    # retrieval
```

### §G.2 Page map (current truth — read before re-scanning)
- `index.html` — **redirect** → `home.html` (no content of its own).
- `hub.html` — page registry / navigation hub (the old `index.html` body; lists Main/New/Forms cards).
- `home.html` — homepage: hero + welcome badge, snap-scroll sections 01–06/06 (problem, WaterAccu, besparing, reviews, vergelijking, Bestel). **User may drop in fresh versions between sessions — re-standardize header/links/icons if so.**
- `hoe-werkt-het.html` — product explainer, snap-scroll 01–07/07 incl. "De Componenten" (boiler illustration), pricing cards, and the video carousel (07/07). Largest page.
- `besparen.html` — savings calculator with charts + dimmer animation.
- `how-to-get-it.html` — "Aan de slag": product quiz wizard + pricing cards; photos local in `midia/` (`solyx-logo.jpg`, `nymo-homey.jpg`, `nymo-sensor.jpg`).
- `shop.html` — product configurator (brand + capacity selector) with breadcrumb.
- `wateraccu.html` — Nymo product page: version cards + add-on selector.
- `faq.html` — category cards + Q&A accordion; contact via `mailto:info@solyxenergy.nl`.
- `installatie.html` — installation info & opstellingen; hero CTA "Plan je installatie" → `installatie-formulier.html`.
- `landingspagina.html` — campaign landing page (still partly English copy).
- `klantverhalen.html` — customer stories (authored 2026-06).
- `over-ons.html` — about / mission & team (authored 2026-06).
- `installatie-formulier.html` / `installatie-formulier-boilergarant.html` — install-request form + Boilergarant variant. Use a minimal `.form-header` (not the full nav). Boilergarant is only reachable by direct URL (no public CTA yet).
- `design-canvas.html` — the approved "final look" mockup (helper, claude.ai-style). **NOT a site page — exclude from link sweeps.**
- `midia/` — `new_boiler.svg` (canonical boiler glyph, inlined into cards as `currentColor`), how-to-get-it photos (`solyx-logo.jpg`, `nymo-homey.jpg`, `nymo-sensor.jpg`), and an unreferenced icon set (`sun-icon`, `solar-house-icon`, `solar-roof-icon`, `new_boiler.png`). All descriptively renamed 2026-06-20.
- `.claude/launch.json` — `solyx-next-static` = no-cache python server on **:4599** serving THIS folder (`/`→home); the `:8080`/`:8000` configs are stale (point at the sibling folder).

### §G.3 Decision lookup
```bash
grep -n "^### .*D-" PROJECT.md
```

### §G.4 Spec + planning
- No external spec. `hub.html` is the page registry (`index.html` only redirects to `home.html`); this `PROJECT.md` is the conventions authority. `design-canvas.html` is the approved final-look reference mockup.

### §G.5 External
- Live site: `https://www.solyxenergy.nl` (WordPress) — also the image origin. Internal links must NOT point here (only `<img>`/`mailto:`).
- Sibling folder `/Users/ottogen/Downloads/Solyx Edited Pages` — **superseded**; `solyx-next` is canonical (D-03). The two stale `launch.json` configs still reference it; ignore them.
- Deployment target: WordPress via **Greenshift** blocks (the planned conversion of these pages — see §C.2).
