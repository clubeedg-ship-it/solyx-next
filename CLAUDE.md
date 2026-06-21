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
branch: n/a (no git)
commit: n/a
state: >
  standardized + polished. All site pages share ONE header (full-width frosted-glass bar,
  flush top:0, installer-bar hidden). Every internal link is local — zero live-domain bounces
  (href AND onclick/window.open) and zero 404s. The 5 previously-missing pages exist
  (klantverhalen, over-ons, installatie-formulier x2, new home.html drop-in). index.html
  redirects -> home.html; registry = hub.html. Card icons unified: detailed Nymo + the boiler
  from midia/new_boiler.svg (viewBox 230x392, inlined as currentColor); old 92x132 stroke
  boiler removed site-wide. Footers darkened to #080c0a. Every nav logo is the transparent inline
  SVG wordmark (home/besparen/installatie/landingspagina were a base64 JPEG that showed a white
  box — swapped out). midia/ assets renamed to descriptive names + refs updated; screenshots
  live in screenshots/. Fixed: home 01/06 & 02/06 oversized content, hoe-werkt-het 07/07 video
  carousel (max-width 640->920px). Served on :4599 (no-cache); preview_start works (port 4599 pinned).
next: >
  the end goal — convert the finished pages to Greenshift blocks (user: "ONLY THEN convert";
  use the Greenshift skill). Then: optionally swap the SVG wordmark for the official Solyx logo
  asset if one is supplied; consistent mobile hamburger nav; <html lang> en->nl where stale.
blockers: none
working_style: >
  DON'T over-engineer or add unrequested UI (pill nav/hover/hamburger were rejected). Edit files
  directly; scripts only for bulk mechanical sweeps, never for visible-content transforms.
  Run the server yourself, never ask the user to. Verify VISUALLY before editing — he's terse and
  references things loosely; map his words to the real DOM/file first. See PROJECT.md §F.
updated: 2026-06-19
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
1. Decision landed? → append `PROJECT.md §B`. 2. Durable lesson? → `§F`. 3. Next-step changed? → overwrite the `§E` YAML. 4. Update the `§6` YAML snapshot above.
