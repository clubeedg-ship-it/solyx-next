# QA — Static prototype vs live WordPress fidelity audit

**Audited:** 2026-08-03, 16:50–18:38 local
**A (live):** `https://2026.solyxenergy.nl` — public, read-only, never logged in, no form submitted
**B (static):** `/Users/ottogen/solyx-next/*.html` served from `http://localhost:4599`
**Method:** own headless-off Chromium (Playwright 1440×900), isolated context. Never connected to port 9222.
**Screenshots:** `/Users/ottogen/solyx-next/work/launch/qa-shots/` (88 PNG)

---

## ⚠️ Read this before working through the list

**The live site changed state during the audit.** Two distinct states were measured:

| | State A — page CSS delivered | State B — page CSS absent |
|---|---|---|
| When | 16:50 – ~18:15 | ~18:25 – 18:38 (still current at 18:38) |
| Evidence | `qa-shots/*--live--*.png` (17:05–17:35), CSS dumps, CDP matched-styles | `ZZ-home-freshctx-0.png` (18:33), 8/8 pages re-probed, 5/5 fresh browser contexts |
| Rendering | Close to the static design | Completely unstyled |

**Defect 1 (State B) currently masks almost everything else.** Fix it first, then re-verify
defects 4–14, which were measured in State A and describe bugs that will resurface once
styling is restored. Defects 2, 3, 5 were confirmed in both states.

---

## Accept gates

**A — Page pairs**
- Attempted: **20 / 20**
- Loaded successfully on **both** sides: **20 / 20**
- Blocked: **0**
- Note: with `chromium.launch({headless:true})` **20/20 live pages were blocked** by SiteGround
  (`sg-captcha: challenge`, HTTP 202 → HTTP 403 "403 - Forbidden", 80 671-byte body).
  Launching the same Chromium with `headless:false` let the challenge resolve itself normally
  (202 → `/.well-known/sgcaptcha/?r=…` → 200). No challenge was solved or bypassed by me.
  **Any future automated QA on this host must run headed.**

**B — Screenshots: 88 total** in `/Users/ottogen/solyx-next/work/launch/qa-shots/`
- 80 pair screenshots = 20 pages × 2 sides × 2 modes (`--viewport.png` at scroll 0, `--full.png` full-page with fixed/overflow locks removed so inner-scroller pages capture completely)
- 8 targeted evidence shots (`ZZ-*.png`)

**C — Interactive elements exercised: 1 907**
- Hovered: **1 733** (static 829 / live 904)
- Clicked: **174** (static 87 / live 87)
- Per page (hover static/live · click static/live): home 55/55·0/1 — hoe-werkt-het 48/55·10/11 — besparen 29/44·0/1 — how-to-get-it 28/33·2/5 — faq 42/44·8/1 — shop 39/47·0/1 — shop-nymo 48/45·8/3 — shop-complete-wateraccu 52/52·14/3 — wateraccu 30/37·3/1 — zonnestroomboiler 25/32·0/1 — installatie 47/49·10/1 — installatie-formulier 21/24·0/2 — installatie-formulier-boilergarant 23/25·0/2 — installateurs 54/55·1/1 — klantverhalen 55/55·12/13 — over-ons 55/55·2/3 — werken-bij 25/32·0/1 — handleidingen 51/55·1/1 — blog-news 55/55·14/32 — landingspagina 47/55·2/3
- Hover contrast failures: live **58**, static **97**, of which **19 are live-only regressions**
- Forms were never submitted. Submit buttons and anything inside a `<form>` were excluded from clicking.

**D — Defect format:** every entry below carries page, selector, static behaviour, live behaviour, severity. No entry says only "looks different".

**E — Snap-scroll root cause: IDENTIFIED** down to the exact CSS selector. See below. Two independent faults found.

---

## E. Home snap-scroll — root cause

### How static does it (`home.html`)

```css
html,body        { height:100%; overflow:hidden; }
#scroll-container{ height:100%; overflow-y:scroll; scroll-snap-type:y mandatory;
                   scroll-behavior:smooth; scrollbar-width:none; }
.snap-page       { scroll-snap-align:start; scroll-snap-stop:always; }
```

Measured at runtime: `html`/`body` = 900 px, `overflow:hidden`; `div#scroll-container` = 900 px tall,
`scrollHeight` 6 790 px, `overflow-y:scroll`, `scroll-snap-type:y mandatory`, 8 `.snap-page` children
each `scroll-snap-align:start; height:900px`. The document itself never scrolls — the inner div does,
and because it is a real scroll container the snap applies.

### Fault 1 — the migrated markup dropped `#scroll-container`, and the site's own "fix" keys off it

WPCode snippet 296 ships this, and it loads **last**:

```css
/* === SCROLL ARCHITECTURE FIX 2026-06-02 (loads last via snippet 296) === */
html:has(body.gspb-bodyfront):has(#scroll-container){
  height:100%!important; overflow:hidden!important; scroll-snap-type:none!important; }
html:has(body.gspb-bodyfront):has(#scroll-container) body{
  height:100%!important; overflow:hidden!important; }
html:has(body.gspb-bodyfront):not(:has(#scroll-container)){
  height:auto!important; overflow-x:hidden!important; overflow-y:auto!important;
  scroll-snap-type:none!important; }
html:has(body.gspb-bodyfront):not(:has(#scroll-container)) body{
  height:auto!important; overflow:visible!important; }
```

Its own comment states the intent: *"snap-scroll pages are exactly the ones that bake in a
`#scroll-container` … so detect that and lock the viewport for them."*

`document.getElementById("scroll-container")` returns **null on every migrated page** —
verified on `/`, `/hoe-werkt-het/`, `/besparen/`, `/over-ons/`, `/installatie/`, `/installateurs/`.
Gutenberg renders the wrapper as `div.wp-block-group.alignfull.solyx-hb` (home) or
`.solyx-page-<slug>` (others); the ID was never carried over. So the `:not(:has(#scroll-container))`
branch wins on all of them and forces `html{height:auto; overflow-y:auto; scroll-snap-type:none}`
plus `body{height:auto; overflow:visible}` — the document becomes the scroller and snapping is
switched off at the root.

On home there is an extra patch, `html:has(body.gspb-bodyfront):has(.solyx-hb){height:100%!important;
overflow:hidden!important; scroll-snap-type:none!important}`. It matches, but so does the
`:not(:has(#scroll-container))` rule; both are `!important` with identical specificity (0-2-0 + `:has()`
arguments), so **source order decides and the `:not()` branch, which comes later, wins**. The patch is dead.

### Fault 2 — a blanket `!important` reset strips the wrapper's scroll geometry

Confirmed with CDP `CSS.getMatchedStylesForNode` on `div.solyx-hb`:

```css
body.page-template-solyx-blank .wp-site-blocks,
body.page-template-solyx-blank .entry-content,
body.page-template-solyx-blank .wp-block-post-content, …
{ overflow:visible!important; height:auto!important; max-height:none!important; }
```

This matches the snap wrapper and is the **last** declaration standing for `height`, `max-height`
and `overflow`. The wrapper keeps `scroll-snap-type:y mandatory`, but per CSS Scroll Snap
`scroll-snap-type` only applies to a **scroll container**, and an element with `overflow:visible`
is not one. **The property is inert.** Measured on home: `.solyx-hb` → `overflow-y:visible`,
`height:7200px`, `clientHeight === scrollHeight === 7200` (nothing to scroll),
`scroll-snap-type:y mandatory` (dead), while `html` scrolls with `scroll-snap-type:none`.

### Why three pages still snap and five do not

Pages that snap have a **later, higher-specificity** rule that re-asserts the geometry after the
blanket reset. Pages that don't, don't:

| Page | Wrapper rule that decides it | Specificity vs the reset (0-2-1) | Live result |
|---|---|---|---|
| installatie | `body.page-template-solyx-blank .solyx-page-installatie.wp-block-group.alignfull {height:100vh!important;max-height:100vh!important;overflow-y:scroll!important}` | 0-4-1 — **wins** | ✅ snaps (900 px / 5 385 px) |
| klantverhalen | equivalent high-specificity rule | wins | ✅ snaps (900 px / 4 295 px) |
| landingspagina | equivalent high-specificity rule | wins | ✅ snaps (900 px / 5 978 px) |
| **home** | `body.gspb-bodyfront .solyx-hb {height:100%!important;max-height:100vh!important;overflow-y:auto!important}` | 0-2-1 — **ties, loses on source order** | ❌ inert |
| **hoe-werkt-het** | `.solyx-page-hoe-werkt-het {height:100vh;max-height:100vh;overflow-y:auto}` | 0-1-0, not `!important` — **loses** | ❌ inert |
| **over-ons** | `.solyx-page-over-ons {height:100vh!important;overflow-y:scroll!important}` | 0-1-0 — **loses** | ❌ inert |
| **besparen** | no page-level re-assertion | — | ❌ page-level snap inert (inner `.bd-col-right` still snaps) |
| **installateurs** | `.solyx-page-installateurs {overflow-y:visible!important;height:auto!important;max-height:none!important}` explicitly unlocks it | — | ❌ snap deliberately removed but `scroll-snap-type:y mandatory` left behind |

Static `installateurs.html` puts `scroll-snap-type:y mandatory` on `html` itself (no
`#scroll-container`); live moves it to a wrapper div and kills it on `html`.

### Fix direction (for the fix agent)

Either (a) restore `id="scroll-container"` on the migrated wrapper so snippet 296 works as designed,
or (b) rewrite snippet 296 to key off `.solyx-hb, [class*="solyx-page-"]` instead of `#scroll-container`
— **and** in both cases add the wrapper to an exclusion in the
`body.page-template-solyx-blank .wp-site-blocks,…{overflow:visible!important;height:auto!important;max-height:none!important}`
reset, or give the wrapper rule specificity above 0-2-1 the way `installatie` already does.
Option (b) plus copying `installatie`'s selector pattern to the other four pages is the smallest change.

---

# Defects

Ordered by severity, numbered for sequential execution.

## BLOCKER

### 1. Every page-specific stylesheet is missing from the live site — whole site renders unstyled
- **Pages:** all 20 (spot-verified on `/`, `/hoe-werkt-het/`, `/besparen/`, `/installatie/`, `/over-ons/`, `/faq/`, `/klantverhalen/`, `/installateurs/` — 8/8 fail)
- **Selector / evidence:** searched every `<style>` tag **and** every same-origin `<link rel=stylesheet>` on `/hoe-werkt-het/`: `.solyx-page-hoe-werkt-het` appears **0 times in any stylesheet** while the class **is** present in the markup. Only plugin/theme CSS loads (`embedpress.css`, `blocks.build.css`, `woocommerce-blocktheme.css`, `swatches.css`, greenshift `style.min.css`, `woocommerce.css`, `qty/style.css`, `woocommerce-smallscreen.css`, `wc-blocks.css`). No GreenShift block-CSS cache file and no WPCode design snippet is emitted.
- **Static:** all design CSS is inline in each `.html` file; pages render as designed.
- **Live:** `nav` computes `position:static` (should be `fixed`), `#gc` gradient-blob layer absent from DOM, `scroll-snap-type:none` on every wrapper, footer unstyled, buttons render as plain 5 px-radius rectangles.
- **Reproducibility:** 5/5 fresh browser contexts, plus warmed context — identical. Not a cache-warming artifact.
- **Regression window:** page CSS **was** present at 17:05–18:00 (see `qa-shots/*--live--*.png` taken 17:21–17:26 and the CSS dumps); absent from ~18:25 onward.
- **Evidence:** `qa-shots/ZZ-home-freshctx-0.png`, `qa-shots/ZZ-home-live-top-clean.png`
- **Note:** an existing comment in snippet 296 already flags this class of problem — *"Delivered here because the Stylebook logo rule doesn't reach the frontend (GS CSS cache)."*
- **Fix first. Everything below marked "State A" must be re-verified after this is resolved.**

### 2. Home page cannot be scrolled at all
- **Page:** `/`
- **Selector:** `html` / `div.wp-block-group.alignfull.solyx-hb`
- **Static:** `#scroll-container` scrolls internally, 900 px viewport over 6 790 px of content.
- **Live:** `document.scrollingElement.scrollHeight` = **900**, `clientHeight` = 900 → the document has nothing to scroll; meanwhile `.solyx-hb` is **8 287.43 px** tall with `overflow-y:visible`, so its content overflows with **no scroller anywhere**. Everything below the first viewport is unreachable by scrolling. Reproduced 5/5 fresh contexts.
- **Severity:** BLOCKER — the homepage is unusable.

### 3. Editor-only instruction text is published on every page
- **Pages:** all checked (`/`, `/over-ons/`, `/besparen/`, `/faq/`, `/installatie/`, `/hoe-werkt-het/`, `/klantverhalen/`, `/installateurs/`)
- **Selector:** `p` containing `strong` "Solyx blank template", inside the `page-template-solyx-blank` template
- **Text shipped to the public:** *"**Solyx blank template** — this template only passes through page content (no theme header/footer). To edit the Hybrid B homepage blocks, open the page **Home — Solyx hybrid B** (Pages → that page), not this template canvas. The Content block below is a passthrough placeholder when no page is selected."*
- **Static:** not present.
- **Live:** rendered at document top, `1440 × 189 px`, `display:block`, `visibility:visible`, `opacity:1`, 19.2 px. On `/` `document.elementFromPoint()` returns this paragraph — it is the topmost element, i.e. genuinely visible. It is included in `document.body.innerText`, so screen readers and search engines get it even where page content layers over it.
- **Evidence:** `qa-shots/ZZ-home-live-top-clean.png`, `qa-shots/ZZ-editor-text-home.png`, `qa-shots/ZZ-editor-text-besparen.png`
- **Fix:** remove the instructional block from the `solyx-blank` template, or wrap it so it renders only inside the block editor.

### 4. Scroll-snap is dead on 5 pages (State A)
- **Pages / selectors:**
  - `/` → `div.wp-block-group.alignfull.solyx-hb`
  - `/hoe-werkt-het/` → `div.wp-block-group.alignfull.solyx-page-hoe-werkt-het`
  - `/over-ons/` → `div.wp-block-group.alignfull.solyx-page-over-ons`
  - `/installateurs/` → `div.wp-block-group.alignfull.solyx-page-installateurs`
  - `/besparen/` → `div.wp-block-group.alignfull.solyx-page-besparen` (page level only; inner `.bd-col-right` still snaps)
- **Static:** `#scroll-container` (or `html` on installateurs) is a real scroll container with `scroll-snap-type:y mandatory` and `.snap-page{scroll-snap-align:start;scroll-snap-stop:always}`; each section locks to the viewport.
- **Live:** wrapper has `scroll-snap-type:y mandatory` but `overflow-y:visible` and `height` = full content height (home 7 200 px, hoe-werkt-het 9 100 px, over-ons 5 894 px, installateurs 3 772 px, besparen 2 466 px), so `clientHeight === scrollHeight` — not a scroll container, so the snap property is inert. `html` scrolls instead with `scroll-snap-type:none`.
- **Working reference:** `/installatie/`, `/klantverhalen/`, `/landingspagina/` still snap correctly — copy their selector pattern.
- **Full analysis:** section E above.

### 5. Home savings calculator is a dead mock-up
- **Page:** `/`
- **Static (`home.html`, section `#s2`):** 2 × `input[type=range].cslider` (`#pvs` panels 1–16, `#pes` persons 1–5), live result element `#cout` (e.g. "€ 130"), value labels `#pv-v` / `#pe-v` ("8 PANELEN"), and a "Hoe wordt dit berekend? →" link opening `#calc-sidebar`.
- **Live:** `document.querySelectorAll("input[type=range]").length` = **0**. The two sliders were migrated as **`<p class="hb-calc-slider wp-block-paragraph">`** — static paragraphs. `#cout` absent, `#pv-v` absent, `#calc-sidebar` absent, "Hoe wordt dit berekend?" link count = 0.
- **Impact:** the headline "Bereken mijn besparing" CTA leads to a calculator that cannot be operated.
- **Severity:** BLOCKER — primary conversion feature non-functional.

---

## MAJOR

### 6. hoe-werkt-het footer links turn white-on-white on hover — completely invisible
- **Page:** `/hoe-werkt-het/`
- **Selector:** `footer a` — affects 9 links: *WaterAccu, Zonnestroomboiler, Besparing, Handleidingen, Installatie, Klantverhalen, FAQ, Over Solyx, Werken bij*
- **Static:** footer background `rgb(14,21,18)`; link rest `rgba(255,255,255,0.5)` → hover `rgb(255,255,255)`. Contrast on hover ≈ 17:1. Correct.
- **Live:** link rest `rgb(90,90,90)` on `rgb(255,255,255)` (6.9:1) → **hover `rgb(255,255,255)` on `rgb(255,255,255)` = contrast ratio 1.00**. The link text disappears entirely. WCAG AA needs 4.5.
- **This is the contrast failure flagged by the user.** Root cause is defect 7.

### 7. The dark footer background is gone site-wide
- **Pages:** `/`, `/hoe-werkt-het/`, `/besparen/`, `/faq/`, `/over-ons/`, `/klantverhalen/`, `/installatie/`, `/shop-nymo/` (8/8 checked)
- **Selector:** `footer` / `div.wp-block-group.alignfull.solyx-footer-wrap` (home: `div.hb-footer`)
- **Static:** `background-color: rgb(14,21,18)` on all 8 equivalents.
- **Live:** `background-color: rgba(0,0,0,0)` (transparent, no `background-image`) on all 8 — the footer sits on the white page. Footer link colour is `rgba(255,255,255,0.7)` on **both** sides, so on live it is near-white text on white.
- **Consequence:** the entire footer is illegible, not just on hover. Fixing this fixes defect 6.
- **Evidence:** `qa-shots/ZZ-footer-static.png` vs `qa-shots/ZZ-footer-live.png`

### 8. Review carousel arrows do nothing
- **Pages / selectors:** `/shop-nymo/` → `#revNext`, `[class*=rev-arrow]` (4 matched); `/shop-complete-wateraccu/` → `p.rev-arrow.wp-block-paragraph` (2 matched, "‹" and "›")
- **Static:** clicking the arrow moves the track — `transform` goes `none` → `matrix(1,0,0,1,-512,0)` on shop-nymo and `matrix(1,0,0,1,-455,0)` on shop-complete-wateraccu.
- **Live:** after the same click `transform` stays `none`, `scrollLeft` stays `0`, no DOM change, **no JS error**. Handler is simply not bound.
- **Note:** on shop-complete-wateraccu the arrows were migrated as `<p>` elements, not `<button>`, so they are also not keyboard-reachable.

### 9. FAQ category filter does nothing
- **Page:** `/faq/`
- **Selector:** `[class*=cat-card]` — 8 cards on both sides (*Werking van de WaterAccu, Inpassen van de Nymo, De WaterAccu aanschaffen, Nymo x Homey, Boilerkeuze, Combineren met andere systemen, …*)
- **Static:** the cards are `<button>` (49 buttons on the page). Clicking card #2 changes `document.body.innerText` — the question list filters.
- **Live:** only **2** `<button>` elements exist on the whole page (cookie-banner elements excluded). Clicking card #2 leaves `document.body.innerText` byte-identical — no filtering, no error.
- **Also:** the ~40 static question-toggle buttons have no live equivalent; live shows 5 visible question headings vs 0 (collapsed) on static, suggesting answers render permanently expanded instead of as an accordion. **The question-toggle behaviour itself could not be exercised on either side — see "Not tested".**

### 10. Broken image: `/hoe-werkt-het/midia/solyx-logo.png` → HTTP 404
- **Page:** `/hoe-werkt-het/`
- **Selector:** `img[src*="midia/solyx-logo.png"]`
- **Live:** relative `src` resolves to `https://2026.solyxenergy.nl/hoe-werkt-het/midia/solyx-logo.png` → 404, image renders broken (`naturalWidth === 0`). Note the directory is spelled **`midia`**, almost certainly a typo for `media`.
- **Static:** no equivalent broken reference.
- **Fix:** repoint to the uploaded logo in the media library with an absolute URL.

### 11. Seven partner logos fail to load on installateurs
- **Page:** `/installateurs/`
- **Selector:** `img[src^="https://logo.clearbit.com/"]`
- **Live:** 7 requests to `logo.clearbit.com` fail with `net::ERR_NAME_NOT_RESOLVED` — `reheat.nl`, `ithodaalderop.nl`, `groenehoed.nl`, `cvtotaal.nl`, `omnieuweenergie.nl`, `woonwijzerwinkel.nl`, `warmtebeheer.nl`. The Clearbit logo API is discontinued; the host no longer resolves.
- **Static:** same 8 broken images — this is inherited from the prototype, not a migration regression, but it is broken on the public site.
- **Fix:** host the partner logos locally in the media library.

### 12. Home is missing the calculator methodology content (State A)
- **Page:** `/`
- **Static:** 16 text blocks present in `home.html` are absent from the live DOM, notably the entire `#calc-sidebar` explainer: *"Hoe berekenen we dit?"*, *"Omrekenen naar kWp"* + `kWp = aantal panelen × 0,4`, *"Schatting van het overschot"* + `Opgeslagen kWh ≈ kWp × 50 − personen × 10`, *"Besparing berekenen"* + `Besparing ≈ opgeslagen kWh × €0,28 (gas + stroom gecombineerd)`, and the indicative-estimate disclaimer. Also missing: *"Gemiddeld gaat 70% van jouw opwek verloren"*, *"Verbruik vindt vooral plaats …"*, and *"De explainer video wordt hier binnenkort toegevoegd."*
- **Live:** none of these strings appear anywhere in the DOM.
- **Related to defect 5** — the calculator and its explainer were dropped together.
- **Note:** `/over-ons/` was checked the same way and has **0 missing strings** — the earlier text-length delta there was a whitespace artifact, not lost content.

### 13. over-ons press-mention links drop to 3.07:1 on hover (live-only)
- **Page:** `/over-ons/`
- **Selector:** `a` for *BNR, MT/Sprout, Duurzaam Ondernemen, Gawalo, Change.inc, The Happy Activist, Solar365, De Groene Nerds* (8 links)
- **Static:** these links do not change colour on hover, staying `rgb(61,61,61)` on white = 10.86:1.
- **Live:** hover switches to `rgb(53,168,71)` (brand green) on `rgb(255,255,255)` = **3.07:1** at 13 px. WCAG AA needs 4.5.

### 14. shop-nymo breadcrumb links drop to 3.07:1 on hover (live-only)
- **Page:** `/shop-nymo/`
- **Selector:** breadcrumb `a` — "HOME", "WINKEL"
- **Static:** no hover colour change from `rgb(136,136,136)`.
- **Live:** hover → `rgb(53,168,71)` on white = **3.07:1** at 12 px.

### 15. Brand green on white is used for hover text across the site — 3.07:1, below AA
- **Pages/selectors (present on both sides, so not a regression, but live-facing):**
  - `/` → `a` "Bekijk onze Google Reviews" — 3.74 → **3.07**
  - `/hoe-werkt-het/` → `button#play-btn.btn` "▶ Afspelen" — 10.27 → **2.66**; `button.varrow` "←"/"→" — 10.86 → **3.07**
  - `/solyx-shop/` → `a.wp-block-button__link` "Bekijk →" — 5.41 → **3.07**
  - `/shop-complete-wateraccu/` → `a` "Home"/"Winkel", `div#bh.tbtn` "Horizontaal", `a` "★★★★★ 4,7 op Google…" — **3.07**
  - `/wateraccu/` → `a` "Home"/"Winkel" — **3.07**
  - `/installateurs/` → `p.benefit-card-btn` / `a` "Hoe werkt de WaterAccu", "Installatiehandleiding", "Stuur een mailtje" — green-on-white 3.07 → white-on-green **3.07** (fails in both states)
- **Concrete fix:** `rgb(53,168,71)` (#35A847) on white is 3.07:1. The darker brand token `--green-deep: #1E7A30` = `rgb(30,122,48)` gives 5.41:1 and passes. Use `--green-deep` for hover text on white.

### 16. installatie FAQ card: dark text on green, worsens on hover
- **Page:** `/installatie/`
- **Selector:** `p.faq-card.wp-block-paragraph` / its `a` — "FAQs — Bekijk de veelgestelde vragen"
- **Live:** rest `rgb(61,61,61)` on `rgb(53,168,71)` = 3.54:1 (already below 4.5 at 19.2 px); hover darkens the background to `rgb(30,122,48)` → **2.01:1**.
- **Static:** same defect, slightly worse at rest (1.74). Not a regression, but it fails AA on the live site.

---

## MINOR

### 17. `fonts.cdnfonts.com/css/alliance-no-2` returns HTTP 500 — all pages, both sides
- 20/20 live pages and 18/20 static pages. Known issue, listed once as instructed. The Alliance No.2 webfont never loads; pages fall back to Inter/DM Sans. Fix by self-hosting the font or removing the `<link>`.

### 18. Failed request to `mpc-prod-24-s6uit34pua-uw.a.run.app/events?cee=no` on all 20 live pages
- `net::ERR_ABORTED` on every live page; not present on static. Third-party endpoint, no user-visible effect observed. Worth identifying and removing before launch — it is an uncontrolled outbound call on every page view and relevant to the lane-4 tracking/consent work.

### 19. Images with an empty `src` resolve to the page URL
- **Pages/selectors:** `/installatie/` (1), `/installateurs/` (1) — `img` whose `currentSrc` equals the page URL itself, i.e. `src=""` or a missing attribute.
- Present on static too. Low impact but produces a broken-image request per page load.

### 20. Live-only third-party accessibility widget
- A blue circular widget renders bottom-left on live pages (visible in `qa-shots/home--live--viewport.png`), absent from static. Informational — confirm it is intended before launch.

---

## Not tested / inconclusive — do not assume these pass

1. **how-to-get-it quiz answers** — `[class*=qz-a]`, `[class*=qz-panel]`. Two attempts timed out on `scrollIntoViewIfNeeded` (element never became stable). One earlier click on `div.qz-panel.qz-d-q-qz-q1` produced no DOM change, but that heuristic returned false positives elsewhere. **Needs manual click-through.**
2. **`/installatie-formulier/` and `/installatie-formulier-boilergarant/` "Start het formulier"** — on static the click changes page text (666 → 610 chars) with a form visible. On live the click scrolls the page to y=554 but `.gform_wrapper`/`form` visible-count stays **0**, and text length is unchanged. The DOM does contain a form (88 inputs vs 30 on static — the real Gravity Form from lane 1). **Inconclusive; verify by hand that the wizard actually opens.** No form was submitted.
3. **FAQ question accordion toggle** — could not be exercised on either side; my selector matched nothing clickable. Only the category filter (defect 9) was proven.
4. **Overlay/modal parity** — static pages declare fixed overlays (`#videoModal`, `#chart-overlay`, `#calc-overlay`, `#asos-sidebar`, `#sm-drawer`, `#bd-info-overlay`, `#lightbox`, …). My sticky/fixed inventory was capped at 10 elements per page and live renames them (`#nav`→`.hb-nav`, `#gc`→`.hb-page-blobs`, `.col-l`→`.hb-side`), so I could **not** conclude whether any overlay is missing. Needs a dedicated pass.
5. **YouTube embed on `/over-ons/`** — `https://www.youtube.com/embed/vPN9nE1pvSI` returned `net::ERR_ABORTED`. I had declined cookies (clicked "Weigeren"), and the CookieYes consent manager blocks YouTube on refusal. This is expected behaviour, **not** confirmed as a defect. Re-test with consent accepted.
6. **Responsive / mobile breakpoints** — out of scope for this audit (lane 5). All measurements at 1440×900 only.
7. **WooCommerce cart/checkout/Mollie** — not exercised (would require state-changing actions).

---

## Structural fidelity summary (State A, measured 17:05–17:35)

Headings were compared in document order on all 20 pairs: **zero headings present in static are missing on live.** Live has additional headings where the migration promoted prototype `<div>` text into real heading blocks (home +8, faq +5, how-to-get-it +4, hoe-werkt-het +1) — consistent with the WordPress contract that marketing copy lives in core blocks. Body-text length is 100–110 % of static on 16/20 pages. The exceptions:

| Page | static → live text | Reading |
|---|---|---|
| home | 10 629 → 9 267 (87 %) | defect 12 — real content loss |
| over-ons | 7 947 → 6 203 (78 %) | false alarm — 0 strings actually missing |
| installatie-formulier | 666 → 2 607 (391 %) | expected — real Gravity Form replaced the mock |
| installatie-formulier-boilergarant | 694 → 2 654 (382 %) | expected — same |

`<section>` counts differ everywhere (static uses `<section>`, Gutenberg emits `<div class="wp-block-group">`); this is a markup-idiom difference, not a defect.

---

## Suggested fix order

1. Defect 1 — restore page CSS delivery (blocks verification of everything else)
2. Defects 2, 3 — homepage scrollability, editor text leak
3. Defect 4 — scroll-snap selector/specificity (section E)
4. Defect 7 → resolves 6 — footer background
5. Defect 5, 12 — home calculator + explainer
6. Defects 8, 9 — carousel arrows, FAQ filter
7. Defects 10, 11 — broken images
8. Defects 13–16 — hover contrast (`--green-deep` swap covers most)
9. Defects 17–20 — minor
10. Re-run this audit and close out the "Not tested" list
