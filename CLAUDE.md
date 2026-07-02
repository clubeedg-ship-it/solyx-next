# Solyx Energy website — agent memory (always loaded)

Short snapshot + rules. Long-form lives in `PROJECT.md`, retrieved by section anchor (`sed -n '/^## §A/,/^## §B/p' PROJECT.md`). This is the working-memory layer; `hub.html` is the human-facing page registry / source of truth for which pages should exist (`index.html` now just redirects to `home.html`).

## 1. Identity
- Project: `solyx-next` — static marketing website for **Solyx Energy**, selling the **Nymo WaterAccu** (a "water battery" / hot-water energy-storage product). Dutch market.
- Repo: `/Users/ottogen/Downloads/solyx-next` (work only here). Not a git repo.
- Live site: `https://www.solyxenergy.nl` (WordPress) — these static pages are a redesign/working copy that hot-links the live site's images.
- Branch: n/a (no version control).

## 2. Session start
Read `PROJECT.md §E` (handoff) first. Then `§A` if the task is structural, `§D` for your lane (`content` / `build`). Read the cited §§ only — never the whole thing. Prefer the per-page facts in `§G` over re-scanning every file.

## 3. Behaviors (every task — bias to caution; judgment on trivial ones)
- Think before coding — state assumptions; if ambiguous, ask; surface tradeoffs.
- Simplicity first — minimum that solves it; no speculative abstractions.
- Surgical changes — touch only what the task needs; match the page's existing inline style; flag dead code, don't delete it.
- Goal-driven — name the page + exactly what changes, edit the inline HTML, open the file in a browser to verify.

## 4. Vocabulary
- `Solyx Energy` = the company / brand; live site `solyxenergy.nl` (WordPress).
- `Nymo` / `Nymo WaterAccu` = the product — an electric boiler that stores cheap/solar electricity as hot water ("WaterAccu" = water battery). Do not rename.
- `Opstelling` = an installation layout/configuration (e.g. `installatie.html`, image names `Opstelling1..4`).
- `Boilergarant` = partner-specific program; has its own install-form variant (`installatie-formulier-boilergarant.html`).
- `working copy` = this folder — where page content is finished before it goes live.

## 5. Invariants (byte-identical mirror of `PROJECT.md §A.10`)
- No build step, no framework, no npm: every page is a single standalone `.html` with inline `<style>` and inline `<script>`. Don't add bundlers, shared CSS/JS files, or dependencies.
- Each page carries its own `<nav>` and scripts — there is no shared shell; edits to nav/footer must be repeated per page.
- Brand palette is fixed: primary green `#35A847`, dark green `#1E7A30`, ink `#1c2422`. Fonts: Inter + DM Sans via Google Fonts (`--font-head` / `--font-body`).
- User-facing copy is Dutch, regardless of the `<html lang>` attribute.
- Images are hot-linked from `https://www.solyxenergy.nl/wp-content/uploads/...` — don't rebake to local paths unless asked. (Exceptions already local in `midia/`: `new_boiler.svg`, and the how-to-get-it photos `solyx-logo.jpg` / `nymo-homey.jpg` / `nymo-sensor.jpg`.)
- All internal nav/footer/CTA links are local relative `.html` paths — never point them at `solyxenergy.nl`. Only `<img>` and `mailto:` may reference the live domain. Watch for JS bounces too (`onclick="window.location.href=…"`, `window.open(…)`), not just `href`.
- `index.html` is a **redirect** to `home.html`; the page registry (source of truth for which pages should exist) is **`hub.html`** — keep `hub.html` in sync when adding/removing pages. Serve via `.claude/launch.json` → `solyx-next-static` (python no-cache server on :4599, `/` → home).
- Nav/footer logos are the **transparent inline SVG wordmark** (dark `#1C2422` mark + "SOLYX ENERGY" text; copy from any current page). Never use a base64 **JPEG** logo — JPEG has no alpha, so it shows a white square block. Verification screenshots go in `screenshots/`, not the repo root.

## 6. Current snapshot
> Hot state — overwritten at session close. YAML.
```yaml
branch: main
commit: 3a6e075
repo: https://github.com/clubeedg-ship-it/solyx-next
vm: adminuser@oopuopu-cloud (Tailscale), served at http://oopuopu-cloud:8090 via systemd
    solyx-next.service (python3 http.server), root /home/adminuser/solyx-next. Deploy:
    `git push` then `ssh adminuser@oopuopu-cloud 'cd ~/solyx-next && git pull'`. Old
    docker WordPress stack + volumes destroyed; nginx solyx configs removed.
state: >
  Every marketing page (17 total) carries a shell.com-style utility strip at top:0 —
  light grey rgba(240,240,240,.96) + 1px border-bottom, right-aligned "Installer pagina"
  → installateurs.html. Nav pushed to top:30px. Real logo (midia/solyx-logo.png) in
  every nav + footer. Canonical footer (SHA 0aa1776f45ab, fcol-brand + fcompany + fsocial
  + fgoogle 4.7★ + flegal) on installatie/home/landingspagina/installateurs/handleidingen
  and 12 more. Shop split: shop.html = 2-card hub (60% size), shop-nymo + shop-complete-
  wateraccu as product pages; existing "Nog geen boiler? Geen probleem" inline text is
  the only cross-link (subtle by designer intent). Hero eyebrow tag "Nieuwe website · 2026"
  (client rejected "Welkom op onze vernieuwde website" as AI-marketing fluff). 5 previously-
  orphan footer labels now real HTML: algemene-voorwaarden, privacy, levering-en-
  retourbeleid, werken-bij, zonnestroomboiler (Onder constructie template). handleidingen
  .html brought in (NL/EN/DE/FR PDF hub for Nymo + Homey + Solar iBoost). besparen page:
  perf sweep done (killed mix-blend-mode:multiply, blob animations, backdrop-filter site-
  wide; nav bumped to rgba(255,255,255,.92); dim cards opacity 0.85→0.96), scroll calmed
  (snap-align + per-panel opacity/blur/scale animations + "Scroll voor meer ↓" nudge all
  removed — content preserved), sticky "Jouw besparing." title slides center→left over
  bd-left card when bd-scrolled fires. how-to-get-it quiz: found + verified — the 10
  href="#" buttons INSIDE quiz-result panels are the "broken redirects" (obvious targets
  mapped, awaiting user greenlight to wire). Klantverhalen 01/03 fixed (h2 margin-top 160
  removed + scroll-snap-type y proximity).
next: >
  BESPAREN focus for next session — client called it WIP. Already applied: A+C+D perf,
  scroll calming, sticky title slide, dim opacity fix. Remaining opportunities: revisit
  layout consistency (client mentioned "left header higher than right header"); the
  bd-panels-mount panels still stack tall (min-height:84vh each) — may need height
  reduction now that scroll transitions are gone; consider whether the sticky-input UX
  still makes sense post-perf-sweep. Also: finish wiring 5 dead canonical-footer hrefs
  (Zonnestroomboiler, Werken bij, Algemene voorwaarden, Privacy, Levering) on 13
  remaining pages (blog-news, faq, hoe-werkt-het, how-to-get-it, installatie-formulier
  ×2, klantverhalen, landingspagina, over-ons, shop, shop-complete-wateraccu, shop-nymo,
  wateraccu) — 3 edits each, same anchors as installatie.html footer.
blockers: >
  13 pages still have href="#" for Zonnestroomboiler/Werken bij/legal trio — same
  mechanical pattern, just tedious. handleidingen.html links exist in shop-nymo/shop-
  complete-wateraccu but currently point to how-to-get-it.html (from earlier remap when
  handleidingen didn't exist yet) — could be repointed but not urgent.
working_style: >
  Client mantra: "step back first to understand before executing" — for UX/perf/design
  issues, always investigate root cause and PRESENT OPTIONS with tradeoffs before
  editing. Reference files (zip pages) are NEVER edited beyond mechanical fixes
  (logo/href/CSS technical); content/copy/sections/layout stay untouched.
  Copy standards: NO AI-marketing fluff — no "Welkom", "vernieuwde", "ontdek",
  "renewed" framing; prefer factual/dated/place-anchored ("Nieuwe website · 2026",
  "Gemaakt in Nederland"). Minimal-invasive design changes: aim for smallest visual
  change that solves the issue. Client is terse and references things loosely — map
  words to real DOM/file first (VERIFY VISUALLY where possible). No mobile burger
  nav additions unrequested. See PROJECT.md §F for accumulated lessons.
updated: 2026-07-01
```

## 7. Pointer table — `PROJECT.md`
| Anchor | Content | Cadence |
|---|---|---|
| `§A` | Architecture + invariants | PR-gated |
| `§B` | Decisions (D-NN) | append-only |
| `§C` | Roadmap & open questions | overwrite |
| `§D` | Workstreams (content / build lanes) | overwrite |
| `§E` | Handoff (current next-step) | overwrite |
| `§F` | History | append-only |
| `§G` | Retrieval + per-page map | overwrite |

## 8. Execution & write rules
- One lane per task (`content` or `build`); don't mix unless explicitly asked.
- Per-section cadence: `§A` PR-gated · `§B`/`§F` append-only · `§C §D §E §G` overwrite · `§6 snapshot` overwrite at session close.
- Don't create new top-level planning files when `CLAUDE.md` or `PROJECT.md` can hold the truth.
- New pages go in the repo root as `<kebab-name>.html`; add a matching card to `hub.html`, the standardized frosted-glass nav/footer (copy from a sibling page), and route all links local.

## 9. Session close
1. Decision landed? → append `PROJECT.md §B`. 2. Durable lesson? → `§F`. 3. Next-step changed? → overwrite the `§E` YAML. 4. Update the `§6` YAML snapshot above. 5. If the user asks for a handoff, put it in a **paste-ready chat block** — never write session reports (what happened / recent commits / likely-next asks) as memory files or repo files. Memory is for durable rules only; point-in-time state goes stale and pollutes future context. See `solyx-no-session-reports.md`.
