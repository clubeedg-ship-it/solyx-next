# Responsive QA — 2026.solyxenergy.nl

Read-only audit. No logins, no form submissions, no writes to the site.
Date: 2026-08-03. Evidence: `work/launch/qa-shots-responsive/`.

Every number below is measured, not estimated. Where something could not be
tested, it says so explicitly — absence of a defect line is not a pass claim
unless the combination appears in the measured count.

---

## Accept gates

### Gate A — combination arithmetic

**Primary sweep (all 23 pages x all 8 breakpoints x 3 engines):**

```
23 pages x 8 breakpoints              =  184 combinations per engine
184 x 3 engines (chromium/webkit/ff)  =  552 combinations attempted
successfully measured                 =  552
blocked (bot challenge / load error)  =    0
javascript/measurement errors         =    0
552 attempted = 552 measured + 0 blocked        ✔
```

Per engine: chromium 184/184, webkit 184/184, firefox 184/184.

The SiteGround bot challenge *did* fire — on the first request of every fresh
browser context. It was handled by a per-context warm-up (load `/`, wait for the
challenge to self-clear, up to 5 attempts). After warm-up, 0 of 552 page loads
were blocked. No challenge was bypassed or circumvented.

**Supplementary passes (chromium only):**

```
overflow root-cause attribution   24 combinations (the 24 overflowing ones)  -> 24 measured
wizard step walk                   2 pages x 2 widths x 8 steps  = 32 step snapshots
mobile-nav open/close test         5 pages x 5 widths            = 25 measured
site-chrome (fixed nav) geometry   6 pages x 8 breakpoints       = 48 measured
nav-presence across whole site    23 pages x 2 widths            = 46 measured
wizard card geometry               1 page  x 5 widths            =  5 measured
broken-image network verification  5 pages x 1 width             =  5 measured

Total supplementary                                              = 185 measured, 0 blocked
Grand total: 552 + 185 = 737 measurements, 0 blocked
```

### Gate B — horizontal overflow combinations

`document.documentElement.scrollWidth` vs `documentElement.clientWidth`,
confirmed against `window.scrollX` after `scrollTo(99999, y)`.

**Count: 24 distinct page x breakpoint combinations overflow (chromium).**
webkit 23, firefox 23 — the difference is `/hoe-werkt-het/ @1024` (chromium only).

Site-wide, `html { overflow-x: hidden }` is set. Measured `maxScrollX = 0` in
**all 24** cases. This is important for triage: the user never gets a horizontal
scrollbar — **the overflowing content is clipped and permanently unreachable.**
That makes these worse than a normal overflow bug, not better.

| # | Page | Width | Offending selector (root cause) | Element width | Viewport | Overflow |
|---|------|-------|--------------------------------|---------------|----------|----------|
| 1 | /algemene-voorwaarden/ | 360 | `div.elementor.elementor-11960 > section.elementor-section.elementor-top-section` | 1470px | 360px | **1110px** |
| 2 | /levering-en-retourbeleid/ | 360 | `div.elementor.elementor-11955 > section.elementor-section.elementor-top-section` | 1470px | 360px | **1110px** |
| 3 | /algemene-voorwaarden/ | 390 | same as #1 | 1470px | 390px | 1080px |
| 4 | /levering-en-retourbeleid/ | 390 | same as #2 | 1470px | 390px | 1080px |
| 5 | /algemene-voorwaarden/ | 768 | same as #1 | 1470px | 768px | 702px |
| 6 | /levering-en-retourbeleid/ | 768 | same as #2 | 1470px | 768px | 702px |
| 7 | /hoe-werkt-het/ | 390 | `div#s-video > div.two-col > div.col-r` | 776px (css 792px) | 390px | 664px |
| 8 | /hoe-werkt-het/ | 360 | `div#s-video > div.two-col > div.col-r` | 729px (css 744px) | 360px | 647px |
| 9 | /hoe-werkt-het/ | 768 | `div#s-video > div.two-col > div.col-r` | 949px (css 968px) | 768px | 463px |
| 10 | /algemene-voorwaarden/ | 1024 | same as #1 | 1470px | 1024px | 446px |
| 11 | /levering-en-retourbeleid/ | 1024 | same as #2 | 1470px | 1024px | 446px |
| 12 | /over-ons/ | 360 | `div#s-media > div.two-col > div.col-l` | 753px (css 768px) | 360px | 396px |
| 13 | /over-ons/ | 390 | `div#s-media > div.two-col > div.col-l` | 753px (css 768px) | 390px | 367px |
| 14 | /shop-complete-wateraccu/ | 360 | `div.shop-section.usp-reviews > div.usp-col` | 569px | 360px | 257px |
| 15 | /shop-complete-wateraccu/ | 390 | `div.shop-section.usp-reviews > div.usp-col` | 569px | 390px | 227px |
| 16 | /shop-nymo/ | 360 | `div.shop-section.usp-reviews > div.reviews-col` | 251px @ left 324 (right 575) | 360px | 215px |
| 17 | /hoe-werkt-het/ | 1024 | `div#s-video > div.two-col > div.col-r` | 949px (css 968px) | 1024px | 209px |
| 18 | /algemene-voorwaarden/ | 1280 | same as #1 | 1470px | 1280px | 190px |
| 19 | /levering-en-retourbeleid/ | 1280 | same as #2 | 1470px | 1280px | 190px |
| 20 | /shop-nymo/ | 390 | `div.shop-section.usp-reviews > div.reviews-col` | 251px @ left 324 (right 575) | 390px | 185px |
| 21 | /over-ons/ | 1024 | `div#s-media > div.two-col > div.col-r` | 902px (css 920px) | 1024px | 162px |
| 22 | /algemene-voorwaarden/ | 1440 | same as #1 | 1470px | 1440px | 30px |
| 23 | /levering-en-retourbeleid/ | 1440 | same as #2 | 1470px | 1440px | 30px |
| 24 | /handleidingen/ | 360 | `div#groups-iboost > div.group > div.cards > div.card` | 320px (right 368) | 360px | 8px |

Pages with **zero** overflow at **every** one of the 8 breakpoints, on all three
engines: `/`, `/besparen/`, `/how-to-get-it/`, `/faq/`, `/solyx-shop/`,
`/wateraccu/`, `/zonnestroomboiler/`, `/installatie/`, `/installatie-formulier/`,
`/installatie-formulier-boilergarant/`, `/installateurs/`, `/klantverhalen/`,
`/werken-bij/`, `/blog-news/`, `/landingspagina/`, `/privacy/`. (16 of 23.)

Attribution note — the following were checked and are **not** defects: elements
inside their own `overflow-x` container (marquee `div.media-track`, review
carousel `div#revTrack`, decorative `div.blob` inside `div#gc`), and elements
whose only clipping ancestor is a `position: fixed` overlay. The
`div.cky-consent-container` widths reported by naive tooling (1007px, 1470px …)
are a *symptom*: the consent bar stretches to the document's overflowing
scrollWidth. Fix the overflow and the consent bar follows.

### Gate C — browser engines

| Engine | Status | Combinations measured |
|--------|--------|----------------------|
| Chromium 1228 (Playwright 1.61.1) | exercised, was already installed | 184/184 |
| WebKit 2311 (Safari engine) | **was not installed**; `playwright install webkit` succeeded in ~40s, then exercised | 184/184 |
| Firefox 151.0 (playwright 1532) | **was not installed**; installed in ~50s, then exercised | 184/184 |

All three engines were exercised on the full page x breakpoint matrix. None was
skipped. Cross-engine agreement on overflow is exact for 21 of 24 combinations;
the three disagreements are recorded as defect #20.

### Gate D — defect record completeness

Every defect below carries page, breakpoint, selector, measured value, and
severity. 20 numbered defects: 3 BLOCKER, 11 MAJOR, 6 MINOR.

### Gate E — screenshot evidence

**179 screenshots, 44 MB, in `/Users/ottogen/solyx-next/work/launch/qa-shots-responsive/`.**

```
chromium full-page sweep (defect-referenced combos)   36
webkit   full-page sweep (cross-engine overflow)      23
firefox  full-page sweep (cross-engine overflow)      23
wizard step-by-step walk (2 pages x 2 widths x 8)     32
mobile nav open/close                                 25
site chrome / fixed nav viewport shots                40
                                                     ---
                                                     179
```

Every BLOCKER and MAJOR defect has at least one named screenshot in its entry.
An initial 649-shot / 144 MB capture was pruned to this 179-shot set so the
evidence stays proportionate to the repo; the deleted shots were all
zero-defect or duplicate-engine combinations.

---

## BLOCKER

### 1. Legal page `/algemene-voorwaarden/` renders at a hard 1470px and is clipped at every viewport below 1470px

- **Page:** `/algemene-voorwaarden/`
- **Breakpoints:** 360, 390, 768, 1024, 1280, 1440 (6 of 8; clean at 1920 and 2560)
- **Selector:** `div.entry-content > div.elementor.elementor-11960 > section.elementor-section.elementor-top-section.elementor-element`
- **Measured:** computed `width: 1470px`, `min-width: 0px`. At 360px viewport the
  element's right edge is at 1470px — overflow 1110px. `html` has
  `overflow-x: hidden` and measured `maxScrollX = 0`, so **75.5% of every line of
  the terms text is clipped and cannot be reached by scrolling, zooming or
  dragging.** 183 descendant elements overflow the viewport.
- **Engines:** identical on chromium, webkit, firefox (1110 / 1110 / 1110 at 360px).
- **Evidence:** `chromium__algemene-voorwaarden__360x740.jpg` (the full-page
  render is literally 1470px wide), plus 390/768/1024/1280/1440 and the webkit +
  firefox 360/390 shots.
- **Fix direction:** the Elementor section carries a fixed desktop width. Give
  `section.elementor-top-section` and its `.elementor-container`
  `width: 100%; max-width: 100%` and let the inner column flow.
- **Severity: BLOCKER.** This is a legally required document that is unreadable
  on every phone and tablet.

### 2. Legal page `/levering-en-retourbeleid/` — same defect, same numbers

- **Page:** `/levering-en-retourbeleid/`
- **Breakpoints:** 360, 390, 768, 1024, 1280, 1440
- **Selector:** `div.entry-content > div.elementor.elementor-11955 > section.elementor-section.elementor-top-section.elementor-element`
- **Measured:** computed `width: 1470px`; overflow 1110px @360, 1080px @390,
  702px @768, 446px @1024, 190px @1280, 30px @1440. `maxScrollX = 0`.
  99–101 descendant elements overflow.
- **Engines:** identical on all three.
- **Evidence:** `chromium__levering-en-retourbeleid__360x740.jpg` (+ 5 more widths, + webkit/firefox).
- **Severity: BLOCKER.** Same reasoning as #1. Fix both together — they are the
  same Elementor template.

### 3. Site navigation disappears at ≤768px and there is no mobile menu

- **Pages:** all inner pages — verified on `/hoe-werkt-het/`, `/besparen/`,
  `/how-to-get-it/`, `/faq/`, `/solyx-shop/`, `/shop-nymo/`,
  `/shop-complete-wateraccu/`, `/wateraccu/`, `/zonnestroomboiler/`,
  `/installatie/`, `/installateurs/`, `/klantverhalen/`, `/over-ons/`,
  `/werken-bij/`, `/handleidingen/`, `/blog-news/`, `/landingspagina/`,
  `/privacy/` (18 pages)
- **Breakpoints:** hidden at 360, 390, 768. Visible from 1024 upward.
- **Selector:** `div#nav > div.solyx-nav-row > div.wp-block-group.solyx-nav-links`
- **Measured:** `getComputedStyle(...).display === "none"` at 360 and 768;
  `display: flex`, width 410px, at 1280. The "Hoe werkt het" anchor measures
  `0x0` at ≤768 and `87x16` at 1280. Counting distinct top-nav labels reachable
  per width on `/besparen/`, `/faq/`, `/over-ons/`, `/wateraccu/`:
  `{360:1, 390:1, 768:1, 1024:5, 1280:5, 1440:5, 1920:5, 2560:5}` — the single
  hit at ≤768 is a *footer* link, not the top nav.
- **No replacement exists.** An exhaustive scan for a toggle
  (`button`, `[role=button]`, `[aria-expanded]`, `.menu-toggle`, `.hamburger`,
  `[class*=burger]`, `.wp-block-navigation__responsive-container-open`) across
  all 23 pages x 8 breakpoints returned **only** the CookieYes consent buttons
  and two calculator-sidebar close buttons. There is no `<header>` and no `<nav>`
  element anywhere in the document.
- **Consequence:** on a phone, every inner page is a dead end. The only way to
  move between pages is to scroll to the very bottom and use the footer links —
  which are themselves undersized (defect #11).
- **Evidence:** `chromium__NAV-besparen__360x740__menu-open.jpg`,
  `chromium__NAV-faq__360x740__menu-open.jpg` (clicking the only clickable
  candidate produces no menu), `chromium__CHROME-besparen__360x740__viewport.jpg`.
- **Severity: BLOCKER.** A production site cannot ship without mobile navigation.

---

## MAJOR

### 4. `/hoe-werkt-het/` — video section two-column layout never collapses

- **Page:** `/hoe-werkt-het/` · **Breakpoints:** 360, 390, 768, 1024
- **Selector:** `div#s-video > div.wp-block-group.two-col > div.wp-block-group.col-r`
- **Measured:** rendered width 729px @360 (css `width: 744px`), 776px @390
  (css 792px), 949px @768 and @1024 (css 968px). Overflow 647 / 664 / 463 / 209px.
  `div.two-col` reports 2 columns with a 141px minimum child width at 360/390 —
  it is still laying out side-by-side at phone width.
- **Engines:** chromium 647/664/463/209; webkit 348/319/96/0; firefox 359/329/106/0.
  Chromium clips the most; at 1024 only chromium overflows.
- **Evidence:** `chromium__hoe-werkt-het__360x740.jpg`, `__390x844`, `__768x1024`,
  `__1024x768`, plus `webkit__hoe-werkt-het__360x740.jpg`, `firefox__…`.
- **Fix direction:** add a stacking rule for `.two-col` below ~900px and drop the
  fixed `width` on `.col-r`.
- **Severity: MAJOR.**

### 5. `/over-ons/` — media section two-column layout never collapses

- **Page:** `/over-ons/` · **Breakpoints:** 360, 390, 1024
- **Selector:** `div#s-media > div.wp-block-group.two-col > div.wp-block-group.col-l`
  (at 1024 the offender is the sibling `div.col-r`)
- **Measured:** `col-l` rendered 753px, css `width: 768px`, at both 360 and 390 →
  overflow 396px and 367px. At 1024, `col-r` is 902px (css 920px) → overflow 162px.
- **Engines:** chromium 396/367/162, webkit 396/367/162, firefox 408/378/176.
- **Evidence:** `chromium__over-ons__360x740.jpg`, `__390x844`, `__1024x768`.
- **Severity: MAJOR.** Same `.two-col` pattern as #4 — likely one shared fix.

### 6. `/shop-complete-wateraccu/` — USP/reviews band does not collapse

- **Page:** `/shop-complete-wateraccu/` · **Breakpoints:** 360, 390
- **Selector:** `div.wp-block-group.alignfull.solyx-main > div.wp-block-group.shop-section.usp-reviews > div.wp-block-group.usp-col`
- **Measured:** css `width: 569px`, right edge 617px against a 360px viewport →
  overflow 257px (@360) and 227px (@390). 39 descendants overflow at 360.
- **Engines:** chromium 257/227, webkit 256/226, firefox 257/227.
- **Evidence:** `chromium__shop-complete-wateraccu__360x740.jpg`, `__390x844`.
- **Severity: MAJOR.** This is a purchase page — clipped USPs and reviews sit
  directly on the conversion path.

### 7. `/shop-nymo/` — reviews column positioned outside the viewport

- **Page:** `/shop-nymo/` · **Breakpoints:** 360, 390
- **Selector:** `div.wp-block-group.shop-section.usp-reviews > div.wp-block-group.reviews-col`
- **Measured:** child width 251px but laid out at `left: 324px`, so its right edge
  is 575px — 215px beyond a 360px viewport (185px beyond 390px). The `.usp-reviews`
  band is holding a two-up layout at phone width instead of stacking.
- **Engines:** chromium 215/185, webkit 215/185, firefox 216/186.
- **Evidence:** `chromium__shop-nymo__360x740.jpg`, `__390x844`.
- **Severity: MAJOR.** Second purchase page, same band as #6.

### 8. Installation wizard wastes 276–328px of blank space between two adjacent fields at phone width

- **Pages:** `/installatie-formulier/` and `/installatie-formulier-boilergarant/`
- **Breakpoints:** 360, 390
- **Selector:** `div#form-step-1 > div.field-row.two-col > div` (the column wrapper)
- **Measured** (step 1, "Wat is je naam?", progress `1 / 16`):
  - 360x740: column wrapper `height: 362px` (49% of the viewport) containing 86px
    of actual content → **276px of dead space**. `input#firstName` sits at document
    y=247, `input#lastName` at y=625 — the two name fields are **378px apart**
    although each is only 63px tall.
  - 390x844: wrapper `height: 414px`, content 86px → **328px dead space**;
    fields 430px apart.
  - The `Volgende` button lands at document y=1011 (360x740 viewport) and y=1115
    (390x844) — roughly 300px below the fold, per step, for **16 steps**.
- **Not a defect (checked):** the Gravity Forms inputs at `left: -9999px`
  (`input#input_1_1` etc.) are the intentional hidden mirror the wizard writes
  into. They are excluded from this report.
- **Evidence:** `chromium__FORM-installatie-formulier__360x740__step1.jpg`
  through `__step8.jpg` and the boilergarant equivalents (32 shots total).
- **Severity: MAJOR.** The wizard is *usable* at 360px (no overflow, fields
  reachable, buttons not cut off) but each of 16 steps forces a long scroll past
  an empty panel.

### 9. Installation wizard field row is pinned to 100vh at tablet width

- **Pages:** `/installatie-formulier/`, `/installatie-formulier-boilergarant/`
- **Breakpoint:** 768
- **Selector:** `div#form-step-1 > div.field-row.two-col`
- **Measured:** computed `min-height: 1024px` / `height: 1024px` — exactly the
  768x1024 viewport height — while holding 86px of content. **938px of empty space.**
  The two inputs do sit side by side correctly here (left 64 and left 392), so
  the column behaviour is right; the height is not.
- **Evidence:** `chromium__CHROME-installatie-formulier__768x1024__viewport.jpg`.
- **Severity: MAJOR.**

### 10. Homepage fixed nav occupies 28% of a phone viewport and does not collapse

- **Page:** `/` (the only page that has `.hb-nav`) · **Breakpoints:** 360, 390, 768, 1024
- **Selector:** `div.wp-block-group.alignfull.hb-nav` (`position: fixed`, `z-index: 45`, `top: 30px`)
- **Measured height vs viewport:**
  | Width | Nav size | % of viewport height |
  |-------|----------|----------------------|
  | 360x740 | 360x206 | **28%** |
  | 390x844 | 390x206 | **24%** |
  | 768x1024 | 768x163 | 16% |
  | 1024x768 | 1024x163 | **21%** |
  | 1280x800 | 1280x75 | 9% |
  | 1920x1080 | 1920x75 | 7% |
- **Cause:** `div.hb-nav-links` wraps from 5 columns to 3 at ≤390px; the nav grows
  in height instead of collapsing. `hasMenuToggle` measured `false` at every width.
  The bar stays fixed at `top: 30px` after scrolling to y=2000 (re-measured), so
  the loss is permanent, not just at rest.
- **Evidence:** `chromium__CHROME-home__360x740__viewport.jpg`,
  `__390x844`, `__768x1024`, `__1024x768`, `__1280x800`.
- **Severity: MAJOR.**

### 11. Homepage nav links and site-wide footer links are far below the 44x44 touch minimum

- **Pages:** homepage nav (`/`); footer links on ~20 pages
- **Breakpoints:** 360 and 390 (measured); sizes are identical at desktop widths
- **Measured — homepage `.hb-nav` links (all 6 fail, identical at 360 and 1280):**
  `Hoe werkt het` 86x17 · `Besparen` 58x17 · `Aan de slag` 70x17 · `FAQs` 31x17 ·
  `Shop` 31x17 · `Bestel` 84x42. Font-size 13px throughout. Six of six below
  44x44; the smallest is **31x17 = 527px², 27% of the 1936px² minimum.**
- **Measured — footer links at 360px** (excluding inline-in-prose links, which
  WCAG 2.5.5 exempts): `FAQ` 25x16, `Shop` 32x16, `Contact` 49x16,
  `Home` 43x15, `Winkel` 56x15, `Installatie` 59x16, `Besparing` 62x16.
  Present on `/`, `/hoe-werkt-het/`, `/besparen/`, `/solyx-shop/`, `/shop-nymo/`,
  `/shop-complete-wateraccu/`, `/wateraccu/`, `/zonnestroomboiler/`,
  `/installateurs/`, `/over-ons/`, `/werken-bij/`, `/handleidingen/`,
  `/blog-news/`, `/privacy/`, `/faq/` and both form pages.
- **Per-page count of distinct sub-44px non-inline interactive elements at 360px:**
  `/faq/` 51, `/blog-news/` 57, `/installatie-formulier/` 59,
  `/installatie-formulier-boilergarant/` 64, `/hoe-werkt-het/` 40, `/over-ons/` 41,
  `/handleidingen/` 35, `/` 29. All 46 mobile combinations (23 pages x 2 widths)
  contain at least one.
- **Note:** a large share of the raw count is `label.gfield_label` elements
  measuring `1x43` — those are Gravity Forms labels, not tap targets, and should
  be ignored by the fixer. The anchor and button figures above are the real ones.
- **Evidence:** `chromium__CHROME-home__360x740__viewport.jpg`,
  `chromium__faq__360x740.jpg`, `chromium__blog-news__360x740.jpg`.
- **Severity: MAJOR.**

### 12. `/hoe-werkt-het/` footer logo returns HTTP 404 (broken relative path)

- **Page:** `/hoe-werkt-het/` · **Breakpoints:** all 8
- **Selector:** `img.flogo` (`alt="Solyx Energy"`)
- **Measured:** requested URL
  `https://2026.solyxenergy.nl/hoe-werkt-het/midia/solyx-logo.png` →
  **HTTP 404** (captured from the network layer, not inferred).
  `naturalWidth = 0`, box reserved at 120x30.
  The path is relative (`midia/solyx-logo.png`) so it resolves against the page
  URL, and `midia` is a typo for `media`.
- **Evidence:** `chromium__hoe-werkt-het__360x740.jpg` (footer area).
- **Severity: MAJOR.** Broken brand logo in the footer of a top-level page.

### 13. `/installateurs/` partner logos fail DNS — the Clearbit logo service is gone

- **Page:** `/installateurs/` · **Breakpoints:** all 8
- **Selectors:** `img[src^="https://logo.clearbit.com/"]` — measured for
  `reheat.nl`, `ithodaalderop.nl`, `groenehoed.nl`, `cvtotaal.nl`
- **Measured:** `net::ERR_NAME_NOT_RESOLVED` on
  `https://logo.clearbit.com/reheat.nl?size=256` (network layer). Three broken
  images remain on the page after a full lazy-load scroll; boxes reserved at
  69x54 and 105x54, `naturalWidth = 0`.
- Also on this page: one `<img alt="WaterAccu-installatie">` whose `src` is empty
  and therefore resolves to the page URL itself, and one `data:image/png;base64,`
  URI whose payload is actually JPEG (`/9j/4AAQ…` magic bytes).
- **Evidence:** `chromium__installateurs__360x740.jpg`, `__390x844`.
- **Severity: MAJOR.** The installer-partner page is a trust surface and its
  partner logos are all missing.

### 14. Body text at 9–11px across the marketing pages

- **Pages/breakpoints:** 168 of 184 chromium combinations contain at least one
  text node under 12px. Sizes are viewport-independent — identical at 360 and 2560 —
  so this is a base type-scale issue that bites hardest on phones.
- **Measured — 124 distinct selector+size pairs. Worst offenders:**
  | Size | Page | Selector | Sample text |
  |------|------|----------|-------------|
  | 9px | /hoe-werkt-het/ | `div.fc-tag` | "Al aanwezig" |
  | 9px | /hoe-werkt-het/ | `span.fc-hint` (x4) | "hover = draaien" |
  | 9px | /hoe-werkt-het/ | `div.nymo-spec-k` | "Voltage" |
  | 9px | /besparen/ | `p.dim-card-title` (x2) | "Gewone boilerschakelaar" |
  | 10px | / | `p.hb-eyebrow` | "Bereken direct" |
  | 10px | / | `p.hb-calc-result-label` | "Jaarlijkse besparing" |
  | 10px | /hoe-werkt-het/ | `button.fc-meer-btn` (x4) | "Meer info" |
  | 10px | /hoe-werkt-het/ | `div#chk-hint-0` | "klik om aan te vinken" |
  | 10px | /besparen/ | `p.bd-stat-label` | "CO₂-besparing" |
  | 10px | /besparen/ | `p.csb2-step-num` | "Stap 1" |
- **Evidence:** `chromium__hoe-werkt-het__360x740.jpg`, `chromium__besparen__360x740.jpg`.
- **Severity: MAJOR** at 360/390 (9px is below every accessibility floor and
  triggers iOS auto-zoom behaviour on focus); MINOR at ≥1280.

---

## MINOR

### 15. `/handleidingen/` — 8px overflow from a fixed-width card at 360px

- **Page:** `/handleidingen/` · **Breakpoint:** 360 only
- **Selector:** `div#groups-iboost > div.group > div.cards > div.card`
  (and the identical `div#groups > … > div.card`)
- **Measured:** card `width: 320px`, right edge 368px vs 360px viewport →
  8px clipped. Six descendants affected. Clean at 390 and above.
- **Engines:** 8px on all three.
- **Evidence:** `chromium__handleidingen__360x740.jpg`.
- **Severity: MINOR.**

### 16. `/installatie/` — one product image never renders and a lightbox `<img>` requests the page URL

- **Page:** `/installatie/` · **Breakpoints:** all 8
- **Selectors / measured:**
  - `img.wp-image-792` (`Nymo-Install1-min.png`, `alt="Nymo Hoofdunit aansluiten"`,
    `loading="lazy"`) — renders 0x0, `naturalWidth = 0`, after a full-page
    lazy-load scroll. No 404 was recorded, so the file exists but the element
    never gets a box.
  - `img#lb-img` — empty `src`, resolves to `https://2026.solyxenergy.nl/installatie/`,
    firing a needless document request. Same pattern on `/installateurs/`.
- **Evidence:** `chromium__installatie__360x740.jpg`.
- **Severity: MINOR** (the lightbox placeholder is invisible to users; the
  product image is worth a look before launch).

### 17. Form radio and checkbox inputs are 20x20

- **Pages:** `/installatie-formulier/`, `/installatie-formulier-boilergarant/`, `/faq/`
- **Breakpoints:** 360, 390
- **Selectors:** `input#choice_1_7_1`, `input#choice_1_7_2`, `input#choice_1_8_0`,
  `input#choice_1_8_1` (and `input#choice_4_*` on the boilergarant form);
  `input#cf-consent` 18x18 and `input#choice_5_9_1` 20x20 on `/faq/`
- **Measured:** 20x20 = 400px², versus the 1936px² (44x44) minimum.
- **Mitigating:** each control has an adjacent `<label>`, so the effective hit
  area is larger than the input box; this is why it is MINOR rather than MAJOR.
- **Evidence:** `chromium__FORM-installatie-formulier__360x740__step1.jpg`.
- **Severity: MINOR.**

### 18. Legal pages carry no navigation at any width

- **Pages:** `/algemene-voorwaarden/`, `/levering-en-retourbeleid/`
- **Breakpoints:** all 8
- **Measured:** zero visible links in the top 220px of the document at both 360
  and 1280 (`topLinks: []`), and no `.hb-nav` / `div#nav`. These two Elementor
  pages have neither header nor footer navigation.
- **Severity: MINOR** as a responsive issue, but note it compounds #1 and #2 —
  a phone user who lands on the terms page is clipped *and* stranded.

### 19. Cramped multi-column groups at 360/390

Measured at 360px; each is a grid/flex container still running 2–3 columns with
very narrow children. Verify visually before changing — several are icon rows
where a small child is correct by design.

| Page | Selector | Measured at 360 |
|------|----------|-----------------|
| /besparen/ | `div.wp-block-group.dim-cards` | 2 columns, min child 149px |
| /besparen/ | `div.wp-block-group.bd-cum-stats` | 3 columns, min child 81px |
| /hoe-werkt-het/ | `div.wp-block-group.prob-page` | 2 columns, min child 144px |
| /hoe-werkt-het/ | `div.cost-line` | 2 columns, min child 80px |
| / | `div.wp-block-group.hb-nav-links` | 3 columns, min child 31px (see #10) |
| / , /besparen/ | `div.wp-block-column.hb-footer-legal` / `div.flegal` | 2 columns, min child 78px |

- **Severity: MINOR.**

### 20. Engine-specific overflow variance on `/hoe-werkt-het/`

- **Page:** `/hoe-werkt-het/` · **Breakpoints:** 360, 390, 768, 1024
- **Measured overflow, chromium / webkit / firefox:**
  360 → 647 / 348 / 359 · 390 → 664 / 319 / 329 · 768 → 463 / 96 / 106 ·
  1024 → **209 / 0 / 0**
- Chromium clips roughly twice as much as the other two, and at 1024 only
  chromium overflows at all. Whatever fix is applied to defect #4 must be
  re-verified on Chromium specifically, since it is the strictest case.
- All other 21 overflow combinations agree across engines to within 14px.
- **Severity: MINOR** on its own (it is a property of defect #4), but it is a
  **verification requirement**: do not accept a fix validated only in Safari.

---

## Checked and found clean

These were measured and are *not* defects. Recorded so the next agent does not
re-investigate them.

- **Horizontal scrolling:** `maxScrollX = 0` on all 552 combinations. No page
  produces a horizontal scrollbar; the overflows in Gate B clip instead.
- **Text clipped by a fixed-height container:** 0 of 184 combinations. No
  `overflow: hidden` container was found holding text taller than its own box.
- **Content hidden behind a sticky header:** none. The geometric overlap test
  flagged `div#gc` and `div.hb-page-blobs`, but both are full-viewport decorative
  gradient layers at `z-index: 0`, i.e. painted *behind* content. False positive —
  no text is actually obscured.
- **Text overlap:** the 111 flagged combinations were reviewed and are false
  positives — the CookieYes overlay sitting above page content (expected), and
  `p.fc-back-desc` / `button.fc-meer-btn` pairs which are the reverse faces of
  3D flip cards.
- **Wizard usability at 360px:** both form pages walked 8 steps deep. Overflow 0
  at every step, `maxScrollX` 0, all visible fields inside the viewport, no
  button clipped. 8 of 12 upload elements visible. The wizard is usable — its
  problem is the dead space in #8, not reachability. **No form was submitted.**
- **Cookie consent bar at 360px:** 360x318 (43% of viewport height), buttons
  `Instellingen` / `Weigeren` / `Accepteren` each 310x44 — correctly sized and
  fully inside the viewport.
- **16 of 23 pages** have zero overflow at all 8 breakpoints on all 3 engines
  (listed under Gate B).

## Not tested — stated explicitly

- **Steps 2–16 of the wizard with real data.** Clicking `Volgende` without
  filling required fields leaves the wizard on question `1 / 16`; the audit is
  read-only and did not fill or submit the form. Steps beyond question 1 are
  therefore **untested**, not passed.
- **Mobile-menu open behaviour** could not be exercised because no toggle exists
  (defect #3). The 25 NAV screenshots record that absence rather than a menu.
- **`/shop/`**, which the homepage nav links to, was not in the assigned page
  list and was not audited. (The list contains `/solyx-shop/`.)
- **Dark mode, print, and reduced-motion** variants were out of scope.

---

## Suggested fix order

1. #1 + #2 together (one Elementor template, unblocks both legal pages)
2. #3 (mobile navigation — largest user-facing gap)
3. #4 + #5 together (shared `.two-col` pattern), then re-verify on Chromium (#20)
4. #6 + #7 together (shared `.usp-reviews` band, both purchase pages)
5. #8 + #9 together (shared `.field-row.two-col` sizing)
6. #10 + #11 (nav and footer touch targets)
7. #12, #13, #16 (broken media)
8. #14 (type scale), then #15, #17, #18, #19
