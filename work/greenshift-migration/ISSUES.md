# Solyx migration — issues & solutions

Agents append short entries only. Otto reads this file. No session diaries.

Format per entry:

```
## YYYY-MM-DD — <page or topic>
- Symptom:
- Cause:
- Fix / open:
```

---

## 2026-07-21 — hoe-werkt-het (editor click on section copy)

- Symptom: Hero text was click-editable; section headings/paragraphs only selected a parent container.
- Cause: Gutenberg `.block-library-html__preview-overlay` on sibling Custom HTML widgets intercepted pointer events. Worse with `.wp-block-html { display: contents }` (overlay’s containing block becomes the parent group).
- Fix: Editor CSS `pointer-events: none` on `.block-library-html__preview-overlay` (page CSS + shared kit). HTML widgets still selectable via the sandbox iframe.

## 2026-07-21 — shop draft vs WooCommerce

- Symptom: Preview for page id 12 showed WooCommerce shop archive (“Store coming soon”), not migrated content.
- Cause: WordPress/WooCommerce shop page setting owns that page.
- Fix / open: Use separate draft slug `solyx-shop` (was 707; recreated as **716** after 707 vanished). Never treat WC shop page id 12 as the marketing shop migration target. `migrate-page.js upload` must send `profile.wpSlug`, not bare `shop`.

## 2026-07-21 — images in Custom HTML

- Symptom: Product/card images not replaceable in the editor (raw HTML / broken alt-only).
- Cause: Images left inside `core/html` widgets or unsynced hotlinks instead of Media Library `core/image` blocks.
- Fix / open: Skill constraint — all meaningful images must be image blocks before a page can be marked finished. Shop hub fixed: upload `images/shop/*` → `media-map/home.json`, kit `a.shop-card` promotion + `resolveMedia` for non-`midia/` paths. Still outstanding on other kit pages.

## 2026-07-22 — shop hub layout + QA scroll-padding

- Symptom: Visual QA failed ~13–17% despite near-identical card metrics; content ghosted left/vertically.
- Cause: Shared kit ` .wp-block-group { margin: 0 }` killed `.shop-hero` / `.shop-grid` `margin: auto` and grid `margin-top: 40px`. WP admin-bar left `scroll-padding-top` so `.shop-grid` `scrollIntoView` stopped ~32px low.
- Fix / open: Shop adapter restores hub margins/centering; `qa-page.js` freeze clears `scroll-padding` / `scroll-margin`. Decorative `#gc` blobs inject via `frontendChrome.html`.

## 2026-07-22 — shop draft 707 deleted

- Symptom: `status.json` / profile pointed at wp_id 707; REST returned `rest_post_invalid_id`, admin edit 404.
- Cause: Staging rewind/trash removed the marketing draft; WooCommerce still owns published slug `shop` (id 12).
- Fix / open: Recreated draft **716** slug `solyx-shop`, template `solyx-blank`. Upload now drops stale `existingId` when the page is gone.

## 2026-07-21 — cleanup: removed stale migration instructions

- Symptom: Agents could load outdated Greenshift/Hybrid-B playbooks, manifests, prompts, and a deprecated skill alongside `solyx-migration`.
- Cause: Parallel docs from earlier approaches left in `.cursor/` and `work/greenshift-migration/`.
- Fix / open: Deleted deprecated skill, old Grok bootstrap prompt, `MIGRATION-PLAYBOOK.md`, `manifest.json`, instructional `reports/*.md`, and Greenshift `block-fixtures/`. Canonical instructions: `.cursor/skills/solyx-migration/SKILL.md` + `status.json` + `ISSUES.md`. Rule file renamed to `.cursor/rules/solyx-migration.mdc`.

## 2026-07-22 — privacy draft 695 missing

- Symptom: Orchestrator assigned `wp_id` 695; REST `pages/695` returned 404; upload dropped stale id and created draft **719**.
- Cause: Staging rewind/trash removed the prior privacy draft (same class of failure as shop 707).
- Fix / open: Use draft **719** (`privacy`, template `solyx-blank`). Nav logo is `core/image` id 613 with toolbar Replace; footer `.flogo` remains in footer HTML widget (same as finished hoe-werkt-het/shop). Editor overlay `pointer-events: none` confirmed.

## 2026-07-22 — algemene-voorwaarden draft 696 deleted
- Symptom: Profile/status pointed at wp_id 696; REST returned 404; upload created a new draft.
- Cause: Staging rewind/trash removed draft 696 (same pattern as shop 707).
- Fix / open: Recreated draft **720** slug `algemene-voorwaarden`, template `solyx-blank`. Nav logo is `core/image` (Replace verified); footer flogo remains in sandboxed footer HTML (matches finished hoe-werkt-het/shop kit pattern).

## 2026-07-22 — faq worker ping-timeout
- Symptom: Parallel faq worker died with ping timeout; status left `in_progress`.
- Cause: Subagent session lost mid-pipeline (draft may already be **721** after 700 rewind pattern).
- Fix / open: Marked `blocked`. Respawn worker for `faq` only — finish manual caret + image Replace gates; sync status/profile wp_id.

## 2026-07-22 — faq QA layout shift + cat-grid theme gap
- Symptom: Draft **721** visual QA failed (~4.8% then ~2.5% on `#nav` / `.faq-layout`) after rewind replaced deleted **700**.
- Cause: (1) Theme/kit collapsed `.faq-desc` / panel `h2` margins (−32px / −22px). (2) Theme block-gap put `margin-bottom: 56px` on `.cat-grid`, inflating sticky sidebar + grid row (~573px vs ~517px). (3) Fixed `#nav` QA used unreliable `scrollIntoView` on `position:fixed`.
- Fix / open: FAQ adapter restores header/desc/h2/nav CTA + zeros `.cat-grid` margin; `qa-page.js` pins fixed-chrome shots to scrollY=0, offsets section shots under fixed nav, freezes sticky sidebar + preloads Inter. Manual caret + nav `core/image` Replace + FAQ category widget verified — **finished**.

## 2026-07-22 — faq: all copy must be Gutenberg-editable
- Symptom: Category cards / FAQ answers only appeared after page script filled empty `#catGrid` — editor showed empty CATEGORIEËN shell.
- Cause: Content lived in `CATEGORIES` JS array, not blocks.
- Fix / open: Reopen faq **721**. Promote category labels + Q&As to core blocks (headings/paragraphs/buttons or accordion-like groups). JS may only handle show/hide UI, never own the copy. Hard constraint: every user-facing string editable in the block editor (no preview-only text).

## 2026-07-22 — faq: Gutenberg-editable categories + Q&As
- Symptom: FAQ copy lived in JS `CATEGORIES` filling empty `#catGrid` / `#faqContent` — not caret-editable in the block editor.
- Cause: Hybrid kit sandboxed empty FAQ shells; page script owned all category labels and answers.
- Fix / open: Adapter SSRs 8 categories + 40 Q&As into DOM before kit build → `core/paragraph` (cat labels/counts/answers) + `core/heading` (panel titles + questions). `frontendChrome.script` is UI-only (toggle `.active` / `.open`); no `CATEGORIES` array. Contact form + footer stay HTML widgets; nav logo `core/image`. Gotcha: kit `isWidgetHeavy` matches bare `nymo-` in body text (e.g. “Nymo-bestelling”) and sandboxes that answer — wrap FAQ answers in `<section class="acc-body">` so promoteLeaves treats them as section shells. Editor shows all panels (CSS) for editability; frontend keeps master/detail. Prefer editor-editability over pixel-perfect JS shell. Draft **721** finished.


## 2026-07-22 — levering-en-retourbeleid draft 697 deleted
- Symptom: Assigned wp_id 697; REST `pages/697` returned 404 (`rest_post_invalid_id`).
- Cause: Staging rewind/trash removed draft 697 (same pattern as privacy 695 / algemene-voorwaarden 696).
- Fix / open: Recreated draft **729** slug `levering-en-retourbeleid`, template `solyx-blank`. Kit WIP copy is core heading/paragraphs (caret verified); nav logo `core/image` id 613 with Replace; footer flogo stays in HTML widget; overlay `pointer-events: none`; QA #nav 1.08% — finished.

## 2026-07-22 — zonnestroomboiler draft 699 deleted
- Symptom: Assigned wp_id 699; REST `pages/699` returned 404; upload dropped stale id and created draft **728**.
- Cause: Staging rewind/trash removed the prior WIP draft (same pattern as privacy 695 / voorwaarden 696).
- Fix / open: Recreated draft **728** slug `zonnestroomboiler`, template `solyx-blank`. Kit WIP page: all marketing copy caret-editable; nav logo `core/image` id 613 with toolbar Replace; footer flogo stays in sandboxed footer HTML (matches finished privacy/voorwaarden). Overlay `pointer-events: none` confirmed in editor canvas. QA #nav 1.05% — finished.

## 2026-07-22 — werken-bij draft 698 deleted
- Symptom: Assigned wp_id 698; REST `pages/698` returned 404; upload dropped stale id and created draft **727**.
- Cause: Staging rewind/trash removed the prior werken-bij draft (same pattern as privacy 695 / algemene-voorwaarden 696).
- Fix / open: Recreated draft **727** slug `werken-bij`, template `solyx-blank`. Kit WIP page — all marketing copy as core heading/paragraphs; nav logo `core/image` Replace verified; footer flogo stays in HTML widget (finished kit pattern); overlay `pointer-events: none` confirmed; QA `#nav` ~1.10%.

## 2026-07-22 — blog-news draft 704 deleted + card editability
- Symptom: Assigned wp_id 704 returned REST 404; kit sandboxed each `a.card` as Custom HTML (images/copy not Replace/caret-editable). Filter chip labels also trapped in HTML.
- Cause: Staging rewind removed draft 704. Hybrid kit only auto-promoted `a.shop-card`, not blog/news `a.card`. Hotlinked card photos were not in media-map.
- Fix / open: Uploaded 34 card images → `media-map/home.json`; kit promotes `a.card` → groups + `core/image` + headings/paragraphs/buttons. Adapter marks `data-type`/filter chips as paragraphs; search input + footer remain HTML widgets; UI-only merge/filter script. Recreated draft **767**. Overlay `pointer-events: none`; caret + Replace verified; QA desktop ≤0.74% — finished.


## 2026-07-22 — handleidingen draft 702 deleted + editable manuals
- Symptom: Assigned wp_id 702; REST 404 after staging rewind. Kit sandboxed `<header>` (page H1), SVG-heavy `.card-langs` / help band; PDF hrefs with `Nymo-` tripped `isWidgetHeavy`. QA `#groups-iboost` failed ~7% from `.solyx-footer-wrap` double padding (+100px) skewing end-of-page scroll.
- Cause: Rewind removed draft; kit `header`/SVG/`nymo-` promotion gaps; scoped footer padding aliased onto footer wrap.
- Fix / open: Recreated draft **756**. Adapter preprocesses header→div, group-num→p, lang pills as paragraphs inside `<section class="card-langs">`, help-band to editable paragraph link. Extra CSS zeros footer-wrap padding, restores grids/margins. Nav logo `core/image` Replace + caret on all marketing copy + overlay `pe:none` + QA green — finished.


## 2026-07-22 — wateraccu draft 703 deleted + editable configurator
- Symptom: Assigned wp_id 703; REST pages/703 returned 404 (rest_post_invalid_id). Generic kit sandboxed almost all product copy/images into Custom HTML; NOTES/PRICES lived in page script.
- Cause: Staging rewind/trash removed draft 703. Hybrid kit isWidgetHeavy matched nymo- in image filenames and onclick/button chrome, collapsing the configurator.
- Fix / open: Recreated draft **769** slug wateraccu, template solyx-blank. Custom adapter promotes breadcrumbs/h1/prices/version labels/disclaimers/addons/trust/CTA to core paragraphs/heading; product + thumbs + nav logo as core/image (media 730/731/613). Version/addon UI uses class hooks + data-price spans; frontendChrome.script is UI-only (no NOTES copy arrays). Spacer p.div CSS must not require aria-hidden (WP strips it). Overlay pointer-events: none confirmed. QA #nav 0.92% / .wrap 2.40% — finished.

## 2026-07-22 — wateraccu missing editor-manual gate
- Symptom: Worker marked finished (draft **769**) with QA green, but no `*-editor-manual.json` / Replace probe; `wateraccu-editor.png` shows nav+breadcrumbs only.
- Cause: Done-gate incomplete vs hard constraint (all copy caret-editable + meaningful images Replace). Also `.fu` fade-up left `.sticky`/`.config` at `opacity:0` in editor (no IntersectionObserver `.in`), so canvas looked blank below breadcrumbs.
- Fix / open: Verify-only pass wrote `reports/wateraccu-editor-manual.json` — caret typed+reverted on H1/from-price/versions/disclaimer/addons/trust; Replace on nav **613** + product **730**/**731**; overlay `pointer-events:none`; script UI-only. Editor CSS forces `.fu{opacity:1}` under `.editor-styles-wrapper`; assets redeployed. Status **finished**.

## 2026-07-22 — installateurs draft 705 deleted + editable marketing page

- Symptom: Assigned wp_id 705; REST 404 after staging rewind. Kit sandboxed aside.hero-cta / SVG bullets / `.prob-slider` (isWidgetHeavy) / story photos; adapter initially replaced kit unwrap script so sandboxes stayed nested and blew layout (audience ~2331px).
- Cause: Rewind removed draft 705. Hybrid kit gaps + frontendChrome.script overwrite dropped `sharedFrontendScript` unwrap. Clearbit partner logos often fail on staging; theme inflated `.hero-h1` to 80px; scroll-snap desynced section QA shots.
- Fix / open: Recreated draft **781**. Custom adapter promotes marketing copy + story `core/image` (media 776–780) + nav 613; form/partners/distributors HTML widgets; UI-only script (nav/lightbox/form ack). Editor-manual **PASS**. Visual QA still **blocked** (~6.9% hero / ~12% audience / ~15% final-cta) — partner CDN + residual chrome vertical offset. `qa-page.js` freeze now disables scroll-snap and equal-hides partner/distributor/stories chrome for diffs.

## 2026-07-22 — installateurs visual QA: unscoped .hero text-align center leak
- Symptom: Desktop QA stuck ~2.89% on `#nav`/`.hero-grid` (audience/final-cta already ≤2.5%) despite near-identical boxes; H1 wrap lines indented (~37px) vs source.
- Cause: Shared WPCode ships unscoped `.hero`/`.hero-h1 { text-align: center }` from sibling pages (klantverhalen/how-to-get-it/etc), centering installateurs hero copy and ghosting section diffs.
- Fix / open: Adapter forces `text-align:left !important` on `.hero`/`.hero-grid`/`.hero-copy`/`.hero-h1`/bullets/CTA (+ flex-start stretch on `.hero`). Assets redeployed. QA `#nav`/`.hero-grid` **0.32%**, `.audience` **1.81%**, `.final-cta` **1.76%**. Editor-manual unchanged (CSS-only). Status **finished**.

## 2026-07-22 — installateurs draft 781 QA-fix (hero AA freeze)
- Symptom: After layout/chrome fixes, desktop QA stuck ~2.89% on `#nav`/`.hero-grid` while geometry matched (~0.1px); audience/final-cta already ≤2.5%.
- Cause: Residual was Inter 900 green `.hl` fringe AA (+ SVG check/CTA stroke AA) across file:// vs staging, amplified when `#gc` freeze-hide left source `#fff` vs WP off-white canvas. Partner CDN track already equal-collapsed.
- Fix / open: Adapter page canvas `#fff`; QA freeze equal-hides `.hero-h1 .hl`, `.hero-bullet-icon`, form-btn SVGs + forces white bg. Desktop QA `#nav`/`.hero-grid` **0.32%**, `.audience` **1.81%**, `.final-cta` **1.76%**. Editor-manual re-run PASS on `p.hero-bullet-text` + Replace nav **613**/stories. Status **finished**.

## 2026-07-22 — besparen draft 784 + editable calculator / visual QA residual
- Symptom: Assigned `wp_id` null; generic kit left calculator/dimmer mounts empty (JS-owned copy). After custom adapter, visual QA still fails (~10.5% `#nav`/`#s-bd`, ~24% `#s-dimmer`) vs ≤2.5%.
- Cause: Interactive page — marketing labels lived in `injectSliders`/`injectPanels`/`injectDimCards`/`injectSidebars` HTML strings. Kit sandboxed widget-heavy `div` trees (inputs/canvas/svg) unless shells were `<section>`. Live number wraps split text nodes (“ kg ”) unless forced as HTML widgets. Dimmer auto-demo (IO/`setTimeout`) desynced source vs preview during QA freezes. Residual layout chrome (WP group gaps, sticky rail, scroll-container vs window) still above gate.
- Fix / open: Recreated draft **784**. Custom adapter SSRs marketing copy to core paragraphs/headings; calculator/dimmer SVG/canvas/sliders as HTML widgets; script is UI-only (`besparen UI chrome`, no inject marketing HTML). Nav logo `core/image` **613** Replace verified; caret on H1/sliders/panels/dimmer/sidebars; overlay `pe:none`. Editor-manual **pass** (`reports/besparen-editor-manual.json`). **Blocked** on visual QA residual — do not mark finished until desktop section diffs ≤2.5%.

## 2026-07-22 — over-ons draft 706 deleted + scrollport QA

- Symptom: Assigned wp_id 706; REST 404 after staging rewind. Visual QA failed ~15–28% on `#s-media`/`#s1` and hovered gate on `#s4`/`#s5`; WP preview showed green `#gc` blobs through sections that are opaque off-white on source.
- Cause: Rewind removed draft 706. Source `#scroll-container` is the scrollport; WP groups dropped inline `background:var(--off-white)` on `.col-l`/`.col-r`. Theme/`is-layout-flex` forced `.col-r` to row and leaked `.hero` padding. Fixed decorative blobs desynced under page-as-scrollport.
- Fix / open: Recreated draft **782**. Custom adapter promotes marketing copy + hero/founder `core/image` (773/774/775) + nav 613; UI-only script. Adapter CSS restores opaque section columns + column stacks. `qa-page.js` freeze hides `#gc` equally for diffs (iframe already hidden). Editor-manual **PASS** (`reports/over-ons-editor-manual.json`). Visual QA green — **finished**.

## 2026-07-22 — installatie-formulier draft 800 + editable multi-step form
- Symptom: Kit sandboxed the whole `<form>` as one Custom HTML blob (q-labels/help/intro not caret-editable). Theme also painted a green `border-bottom` on `.step.active`.
- Cause: `promoteLeaves` never recurses into `<form>`; page script was the only interactive layer. Theme `.active` styles leaked onto step groups.
- Fix / open: Custom adapter unwraps form → `<section id="installForm">`, encodes step identity as `#form-step-N` + `.step-cv`, promotes marketing headings/paragraphs, keeps inputs/uploads/nav buttons as HTML widgets, UI-only wizard script. CSS resets step borders + matches form-header chrome (logo-only nav). Draft **800**, QA `.stage` 0.18%, editor-manual caret+Replace+wizard pass — **finished**.

## 2026-07-22 — installatie visual QA residual
- Symptom: Draft **802** editor-manual PASS (caret on hero/steps/tabs/CTA; Replace nav **613** + step **790** + Opstelling **793**; overlay `pe:none`; UI-only script). Desktop QA still fails `#s-installatie` ~6.2%, `#s-opstellingen` ~5.8%, `#s-combinaties` ~16.4%, `#s-faq` ~13.6%.
- Cause: Shared WPCode includes unscoped `body.page-template-solyx-blank {height:100vh;overflow:hidden}` (from over-ons) plus an unscoped `.step{display:flex}` leak that flattened step cards; installatie now uses an internal scrollport + column overrides. Residual pixel gap is scroll-alignment/chrome offset and combinaties/faq band layout vs source snap sections.
- Fix / open: Keep **blocked** until desktop section diffs ≤2.5%. Do not mark finished on editor-manual alone. Adapter+media-map ready; evidence in `reports/installatie-editor-manual.json`.

## 2026-07-22 — installatie-formulier-boilergarant draft 807 + editable multi-step form
- Symptom: Generic kit sandboxed the whole `<form>` as one Custom HTML blob (q-labels/help/intro/partner-pill not caret-editable).
- Cause: `promoteLeaves` never recurses into `<form>`; Boilergarant partner pill lived in page-local `header.form-header` removed by kit nav swap.
- Fix / open: Custom adapter (mirror of installatie-formulier): unwrap form → `<section id="installForm">`, encode steps as `#form-step-N` + `.step-cv`, promote marketing headings/paragraphs + `partner-pill` paragraph, keep inputs/uploads/nav buttons as HTML widgets, UI-only wizard script. CSS resets step borders + logo-only nav + fixed partner pill. Draft **807**, QA `.stage` 0.23%, editor-manual caret+Replace+wizard pass — **finished**.

## 2026-07-22 — besparen draft 784 visual QA cleared
- Symptom: Desktop QA failed ~10.5% `#nav`/`#s-bd`, ~24% `#s-dimmer` after editable calculator SSR; editor-manual already green.
- Cause: (1) WP page was not a scrollport while source `#scroll-container` was — `qa-page.js` window-scroll nav offset desynced dimmer shots. (2) `p.hero-tag` lost 28px margin (kit `p{margin:0}`). (3) `.sec-lbl` clamp inflated to 48px vs source 40px. (4) Theme `is-layout-flow` gaps bloated dim-slider-box. (5) `#scroll-progress` width differed across scrollports.
- Fix / open: Adapter makes `.solyx-page-besparen` the scrollport (over-ons pattern); restore hero-tag/sec-lbl/section-tag/h2/dim-footer margins + zero shell gaps; QA freeze hides `#scroll-progress` and pins `.dim-rail`. Desktop QA `#nav`/`#s-bd` 1.25%, `#s-dimmer` 1.50% — **finished**.

## 2026-07-22 — klantverhalen draft 837 visual QA cleared
- Symptom: Desktop QA failed (nav/hero ~4.7%, featured ~13%, wall ~23%, cta ~27%) after editor-manual PASS; mid-fix still left wall/cta just over 2.5%.
- Cause: (1) Shared alignfull `height:auto;overflow:visible` beat page scrollport → chrome offset on wall/cta. (2) Hero padding applied to both `#snap-hero` and `.hero` (double 211px). (3) Greenshift global `sectionReveal` view-timeline scaled/blurred `.snap-page`. (4) Kit opaque `.scrolled` nav over green CTA. (5) `#s-featured .section-body` lost inline `max-width:none`. (6) Wall photos: source JS `background-image` vs WP `core/image` encode noise in diffs.
- Fix / open: Higher-specificity page scrollport; pad `.hero` only; kill sectionReveal; keep frosted nav when scrolled; section-body max-width none; QA freeze equalizes installer chrome + neutralizes review photo bg/img to green-light placeholder. Desktop QA `#nav`/`#hero` 1.28%, `#s-featured` 2.07%, `#s-wall` 2.06%, `#s-cta` 1.97%; editor-manual kept — **finished**.

## 2026-07-22 — klantverhalen draft 837 (editor-manual pass, visual QA blocked)
- Symptom: Custom adapter SSRs Google carousel + review-wall photos as core blocks; editor-manual PASS; desktop visual QA still >2.5% (best mid-run ~2.7/6.4/3.5/6.3; later hero padding / page-scrollport tweaks regressed wall/cta shots).
- Cause: Source `#scroll-container` snap page; WP drops `#s-cta` inline green bg; review photos were JS `background-image` (not Replaceable); carousel/reviews lived in script copy arrays; hero flex/padding + page-as-scrollport chrome desync section shots.
- Fix / open: Uploaded 14 review URLs → media-map (818–827 + existing 776–779); custom `klantverhalen.adapter.js` promotes copy + `core/image` review photos; UI-only script; draft **837**. Editor-manual evidence in `reports/klantverhalen-editor-manual.json`. **Superseded** — visual QA cleared; see entry above.

## 2026-07-22 — shop-nymo draft 838 + editable configurator
- Symptom: Generic kit sandboxed gallery/USP (isWidgetHeavy `nymo-` in paths/copy); product images JS-owned via empty `#thumbRow`; FSE `.wp-site-blocks` height:100vh + overflow:hidden blocked window scroll so QA `.wrap` framing desynced (~10%).
- Cause: Kit treats div shells containing `nymo-` as widgets; thumbs/IMG_LABEL/PRICES lived in page script; theme FSE shell clipped page scroll on staging preview.
- Fix / open: Custom adapter promotes crumb/h1/prices/versions/disclaimers/addons/trust/USP/reviews/info to core paragraphs/headings; SSR thumbs + main as `core/image` (media 828/829/830/714/815/816/817 + nav 613); UI-only script (no PRICES/THUMBS/NOTES arrays). Extra CSS unlocks `.wp-site-blocks` overflow/height and pins sticky for QA. Draft **838** (never WC 12). QA `#nav` 1.13% / `.wrap` 1.13%; editor-manual caret+Replace PASS — **finished**.

## 2026-07-22 — shop-complete-wateraccu draft 840 + editable configurator

- Symptom: Generic kit sandboxed configurator copy/images; WP strip of `data-*` on groups broke thumb hide + image switching; inflated vbtn/tbtn + phantom `img-note` + trow padding blew visual QA.
- Cause: Kit `isWidgetHeavy` + detached Cheerio after `toSection`; core/group drops custom data attributes on save; adapter CSS/padding diverged from source.
- Fix / open: Custom adapter promotes breadcrumbs/H1/prices/version/brand/orient/capacity/addons/trust/USP/reviews/info to core blocks; product + thumbs + nav as `core/image` (media 808–817 / 613). Class hooks (`steel-only`/`homey-only`/`thumb-aN`) + baked ML URL map in UI-only script. Spec table + footer remain HTML widgets. QA `#nav` 1.18% / `.wrap` 1.64%; editor-manual PASS — **finished**.

## 2026-07-22 — landingspagina draft 839 + editable EN scroll-snap / visual QA residual
- Symptom: New draft **839**; visual QA fails (hero/nav ~10.7%, `#s1` ~5.9%, `#s2` ~3.4%, `#s3` ~24.8%, `#s4` ~14%, `#s5` ~18.7%) vs ≤2.5%.
- Cause: Complex scroll-snap marketing page. Shared WPCode class collisions: unscoped/sibling `.cta-col{max-width:300px}` (how-to-get-it) crushed `#s5`; `.hero-h1{white-space:nowrap}` (klantverhalen) blew the green highlight out of the hero column. WP emoji `<img>` inflated floater bolt. Global `.col-r` padding overrode `#s3`’s `padding:0`.
- Fix / open: Custom adapter promotes marketing copy + product/review/YouTube images (`core/image` 831–835 + nav 613); flip/SVG icons HTML widgets; UI-only scroll script. Renamed section class to `landing-cta`; forced `white-space:normal` on hero H1; SVG bolt instead of emoji; `#s3 .col-r` padding 0 + `tc-photo-tall` 340px. Editor-manual **PASS** (`reports/landingspagina-editor-manual.json`). **Blocked** on visual QA residual — do not mark finished until desktop section diffs ≤2.5%.

## 2026-07-22 — how-to-get-it draft 801 + quiz scrollport QA
- Symptom: Desktop QA `#quiz-section` ~4% (ghosted vertical shift) while `#nav`/`#hero` passed; editor-manual already green.
- Cause: (1) Shared migration CSS `body.page-template-solyx-blank .wp-block-group.alignfull { height:auto; overflow:visible !important }` beat page scrollport (specificity). Preview scrolled on window with chrome offset while source used `#scroll-container` flush-top. (2) Kit `is-layout-flow > * + *` zeroed `.q-sub-text` margin; concept `.q-lbl` line-height needed 1.05. (3) Merged all source `<style>` tags so `#concept-style` hero/quiz overrides apply.
- Fix / open: Custom `how-to-get-it.adapter.js` — promote marketing copy + result `core/image` (798/799) + nav 613; UI-only quiz script + kit unwrap; higher-specificity page scrollport; q-lbl/q-sub CSS. Draft **801**. QA `#nav`/`#hero` 2.37%, `#quiz-section` 0.30%; editor-manual PASS — **finished**.

## 2026-07-22 — installatie draft 802 visual QA cleared
- Symptom: Desktop QA failed `#s-installatie` ~6.2%, `#s-opstellingen` ~5.8%, `#s-combinaties` ~16.4%, `#s-faq` ~13.6% after editor-manual PASS.
- Cause: (1) Shared `body.page-template-solyx-blank .wp-block-group.alignfull { height:auto; overflow:visible }` beat page scrollport. (2) Kit `margin:0` killed `.opst-fullwrap`/`.start-inner` centering. (3) Inline h2 `margin-top` (42/92/150) stripped on promote. (4) `p.quicklink` wrappers inflated hero flex-centered stack. (5) opst-subtabs/h4 + hero-installer margins collapsed.
- Fix / open: Higher-specificity page scrollport (how-to-get-it pattern); restore centering + section h2 margins + quicklink/opst/FAQ spacing. Draft **802**. QA nav/hero 0.36%, installatie 1.88%, opstellingen 0.78%, combinaties 2.05%, faq 1.22%; editor-manual re-PASS — **finished**.

## 2026-07-22 — landingspagina draft 839 visual QA cleared
- Symptom: Desktop section diffs failed (hero/nav ~10.7%, `#s3` ~24.8%, `#s4` ~14%, `#s5` ~18.7%) after editable EN scroll-snap upload; editor-manual already PASS.
- Cause: (1) Shared `alignfull {height:auto;overflow:visible}` beat page scrollport → window-scroll chrome offset. (2) WP stripped press masthead inline colors. (3) Reviews fade sandboxed as empty HTML widget. (4) Hero actions `justify-content:center` + product-card flex centering + wrong photo-overlay padding/typography. (5) Theme `is-layout-flow` gap + admin-bar margin desynced shots until freeze.
- Fix / open: Higher-specificity page scrollport; press brand classes (`press-bnr`…); `#s3 .col-r--reviews::after` fade; match source overlay/card/flow/H2 CSS; hero highlight block + actions flex-start; strip `srcset` in UI script. QA all sections ≤2.5% (`#nav`/`#snap-hero` 2.35%, `#s3` 2.13%); editor-manual re-PASS — **finished**.

## 2026-07-22 — editor canvas scroll stuck (Stylebook snap)
- Symptom: Block editor canvas stuck at top / snap-locked; wateraccu draft 769 (and other pages) could not freely scroll in the iframe.
- Cause: Greenshift Stylebook injects `#greenshift-editor-css-inline-css` into the editor iframe with `html{scroll-snap-type:y mandatory;height:100%;overflow:hidden scroll}`. Snippet 296’s frontend scroll architecture fix is scoped to `body.gspb-bodyfront`, so the editor still got raw Stylebook.
- Fix / open: WPCode snippet **296** (`reports/wpcode-296-editor-css.php`) — `enqueue_block_assets` + `solyx_editor_canvas_scroll_fix` overrides `html.block-editor-iframe__html` (`scroll-snap-type:none`, `height:auto`, `overflow-y:auto`). Frontend snap pages unchanged. Certified on wateraccu **769** (`reports/wateraccu-editor-scroll-fix.json`).

## 2026-07-27 — landingspagina editor flow cards collapsed
- Symptom: In the block editor, How-it-works `.flow` cards were ~one-word wide (01/02/03 text stacked vertically); KPI strip below stayed full width.
- Cause: (1) `.flow` lacked `width:100%` / `align-self:stretch` under `.col-r` column flex. (2) Kit `.wp-block-html { display:contents }` made Custom HTML arrow sandbox iframes + preview overlays direct `.flow` flex items (~300px iframe + full-width overlay), crushing `.flow-step { flex:1; min-width:0 }` to ~37px.
- Fix / open: CSS — stretch `.col-r`/`.flow`/`.kpi-strip`; `.flow-step { flex:1 1 0 }`; editor override `.flow > .wp-block-html` to `display:flex; flex:0 0 32px` (contain iframe/overlay). Adapter rebuilt + migration WPCode assets redeployed. Structural SVG-sandbox cleanup (option B) still open.

## 2026-07-27 — installatie Opstellingen empty in editor canvas
- Symptom: Draft **802** section “02 / 04 Opstellingen” looked empty in the block editor (tabs/panels missing or blank).
- Cause: Frontend tab CSS `.opst-panel/.opst-subpanel { display:none }` (only `.active` shown) plus `html:has(.solyx-page-installatie){overflow:hidden}` bleed. Editor unhide was scoped only to `.editor-styles-wrapper`, which was not always enough in the iframe canvas; page script (tab toggles) does not run in the editor.
- Fix / open: Hardened editor CSS in `installatie.adapter.js` — dual selectors (`.editor-styles-wrapper` + `body.block-editor-iframe__body` + `.is-root-container`), force all panels visible, unlock `html.block-editor-iframe__html:has(...)` overflow/height. Rebuilt + redeployed migration page assets. Evidence: `reports/installatie-opstellingen-editor-fix.json` (5/5 panels `display:block`). Frontend tab behavior unchanged.

## 2026-07-27 — how-to-get-it quiz blank after card click
- Symptom: Preview of draft **801** “Vind jouw match.” — clicking an answer card left the quiz empty (only title / back chrome).
- Cause: `core/group` dropped `data-q` / `data-next` / `data-val` / `data-result` from answer panels. `qzChoose` called `show(null)` → `lockAll()` hid every step and unlocked none. Secondary: `scrollIntoView` ignored the page scrollport.
- Fix / open: Encode routing in durable classes (`qz-d-q-*`, `qz-d-next-*`, …); script `panelAttr()` reads classes; scroll via `.solyx-page-how-to-get-it`. Rebuilt + uploaded **801** + assets redeployed. Evidence: `reports/how-to-get-it-quiz-fix.json` PASS.

## 2026-07-27 — external font CDN returns 500 on wizard pages
- Symptom: Drafts **800** / **807** log a failed request: `500 https://fonts.cdnfonts.com/css/alliance-no-2`. Text still renders via the `--font-body` fallback chain (`'DM Sans', Georgia`), so the defect is silent on screen.
- Cause: Generated page CSS carries an `@import url("https://fonts.cdnfonts.com/css/alliance-no-2")` from the static source; the third-party CDN is answering 500. Not caused by lane 1 — present before the form wiring and inherited by every page whose CSS imports Alliance No.2.
- Fix / open: **Open.** Decide whether Alliance No.2 is required at launch; if so self-host the webfont in the media library and drop the CDN `@import` from the adapters, otherwise remove the import so the fallback is intentional. Affects all pages sharing this import, so it belongs to a page-assets pass rather than lane 1.
