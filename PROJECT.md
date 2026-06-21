# Solyx Energy website — master doc

Chunked retrieval. Reach a section via its `## §X` anchor — see `CLAUDE.md §7` for the index, `§G` below for snippets. There is no separate spec; `hub.html` is the page registry (`index.html` redirects to `home.html`) and this doc is the authority on conventions.

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
Byte-identical mirror of `CLAUDE.md §5`. Changes require updating both files + a `§B` entry.
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

---

## §C — Roadmap & open questions

### §C.1 Roadmap
| Phase/Milestone | Content | Status |
|---|---|---|
| Standardize shell | One frosted-glass header (flush top) + isolated footer, every page | **Done 2026-06-19** |
| Local navigation | All links local; no live-domain bounces or 404s | **Done 2026-06-19** |
| New pages | `over-ons`, `klantverhalen`, both `installatie-formulier*` | **Created + standardized** |
| Icons | Unified Nymo + `midia/new_boiler.svg` boiler across cards | **Done** |
| Support pages | `handleidingen`, `blog-news`, `installateurs` | Not built; links routed to nearest real page |
| Greenshift conversion | Port the finished pages to Greenshift blocks (WordPress) | **Not started — the end goal** |

### §C.2 Immediate next work
- **Greenshift conversion** — the user's stated end goal ("ONLY THEN convert to Greenshift"). Port the finished, approved pages into Greenshift blocks in WordPress; invoke the Greenshift skill when starting, and keep section structure clean so it survives the port.
- Drop the **real Solyx logo** into the footer (placeholder wordmark there now); confirm CTA accent (kept orange `Bestel`; green was offered).
- Optional polish: consistent mobile hamburger nav (only some pages have one); `<html lang>` → `nl` where it still says `en`; externalize remaining base64 in `how-to-get-it.html` if perf matters.

### §C.3 Open questions
- ~~**OQ-1 — Which folder is canonical?**~~ **Resolved 2026-06-19 (D-03):** `solyx-next` is canonical; `.claude/launch.json` was repointed here (`solyx-next-static`, :4599).
- **OQ-2 — How does content go live?** Now answered in principle: via **Greenshift** blocks in WordPress (the user's planned conversion step). Exact porting workflow still to be done — see §C.2.

---

## §D — Workstreams (lane memory)

One lane per task. Read only the lane you're in.

### §D.1 content lane
**Roots:** the body of any existing `*.html` page.
**Contract:** change copy (Dutch), prices, image URLs, and links only. Keep the page's existing inline structure and brand palette. Don't touch the duplicated `<nav>` unless the task is explicitly nav. Verify by opening the file in a browser.

### §D.2 build lane
**Roots:** new `*.html` pages, interactive widgets, and `hub.html` (the registry; `index.html` is only a redirect).
**Contract:** new page = one standalone file in repo root + a matching card in `hub.html` (NOT `index.html`, which is just a redirect to `home.html`). Reuse the established palette/fonts and copy the standardized frosted-glass nav/footer + transparent SVG logo from a sibling page (no shared include). Keep all JS inline and dependency-free. Route every link local; no `solyxenergy.nl` bounces.

---

## §E — Handoff (current next-step)

> Hot state — overwrite per session. YAML.
```yaml
as_of: 2026-06-20
mode: static Dutch marketing-site mockup, finished locally; no git; served from solyx-next on :4599 (no-cache, /->home; preview_start pinned to 4599)
what_matters: look + structure are approved and standardized — the next real step is the Greenshift port, not more page edits
state_done (cumulative — the site is in this state now):
  - one frosted-glass header (flush top:0) + isolated dark footer (#080c0a) on every page; installer-bar hidden
  - every internal link local (href, onclick, window.open) — zero live-domain bounces, zero 404s
  - all 5 once-missing pages built + standardized (klantverhalen, over-ons, installatie-formulier x2, new home.html)
  - product-card icons unified; boiler = midia/new_boiler.svg inlined as currentColor; old 92x132 stroke boiler gone
  - nav logos = transparent inline SVG wordmark (base64-JPEG white box removed from home/besparen/installatie/landingspagina)
  - index.html -> redirect to home.html; hub.html = page registry
  - midia/ files renamed to descriptive names (refs updated); verification screenshots live in screenshots/
next_actions:
  - convert the finished pages to Greenshift blocks (THE end goal; use the Greenshift skill)
  - optional: swap the SVG wordmark for the official Solyx logo asset if one is supplied; consistent mobile hamburger nav; <html lang> en->nl where stale
do_not:
  - introduce a build step, framework, or shared CSS/JS file
  - link nav/footer/CTAs to solyxenergy.nl (only <img> + mailto may); check onclick/window.open too, not just href
  - use a base64 JPEG logo (it shows a white box) — use the transparent inline SVG wordmark
  - assume one edit propagates — nav/footer/logo are duplicated per file (use Edit replace_all or repeat per page)
  - over-engineer or add unrequested UI; edit files directly (scripts only for bulk mechanical sweeps); run the server yourself
```

---

## §F — History (append-only)

- **2026-06-16** — Memory docs (`CLAUDE.md` + `PROJECT.md`) created from a read-only deep-dive of the folder.
- **2026-06** — Pages last edited (file mtimes 8–16 Jun): `home`, `besparen`, `faq`, `installatie` most recent; `index.html` reflects a 16-page target layout.
- **2026-06-19** — Big standardization pass (D-03..D-06): one frosted-glass header flush to top on all pages; killed every live-domain bounce (href + JS); routed dead links to nearest real page; built + standardized the 5 missing pages; `index.html`→redirect, `hub.html`=registry; repointed `launch.json` to a no-cache :4599 server; unified Nymo + `midia/new_boiler.svg` card icons (renamed from "Boiler Icon from June 15 Meeting.svg"); fixed oversized content (home 01/06, 02/06), the hoe-werkt-het 07/07 video carousel width (640→920px), and darkened all footers (`#0e1512`→`#080c0a`). Design approved earlier via `design-canvas.html`.
- **2026-06-20** — Polish + housekeeping (D-07, D-08): replaced the base64-JPEG nav logo (white-box) with the transparent inline SVG wordmark on `home`/`besparen`/`installatie`/`landingspagina`; renamed all `midia/` assets to descriptive names and updated the 12 `how-to-get-it.html` references; moved 31 loose screenshots into `screenshots/`; fixed the `launch.json` port conflict (kill stray :4599 process before `preview_start`).

### Durable lessons
- A `href=` grep does NOT catch JS bounces — `onclick="window.location.href=…"` and `window.open(…)` also jumped to the live site. Sweep those too before claiming "no live links."
- The canonical boiler/icon source is a file in `midia/` (`new_boiler.svg`), not the inline placeholder in the cards. When the user says "use the SVG / the one from page X," find the real source asset, don't hand-tweak the placeholder paths.
- Snap-scroll sections cap content (`max-width` on inner blocks like `.vscroll`; large `padding-top`/`margin-top`; per-section font sizes). "Limited width / oversized / clipped" usually means an inner `max-width` or top-spacing value, not the column.
- Phantom layout bugs were stale browser cache: the python server sent no cache headers. The :4599 config now sends `Cache-Control: no-store` — if a fix "doesn't show," it's not cache anymore.
- Nav/footer are duplicated per page; the same bug/fix recurs across 9–14 files. The fastest correct move is `Edit replace_all` on identical blocks, then verify a couple of pages.
- The user's pages can be **dropped in/replaced wholesale** between sessions (a fresh `home.html` reverted all prior standardization). Re-check, don't assume earlier edits survived.
- `<html lang>` is unreliable (some Dutch pages declare `en`); never infer page language from the attribute.
- A **base64 JPEG** logo shows a white square block (JPEG has no transparency); `mix-blend-mode:multiply` doesn't fully hide it. Use the transparent inline SVG wordmark (already on most pages). Same trap for any "white box behind a graphic" report.
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
