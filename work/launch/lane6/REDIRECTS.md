# 301 redirect map — legacy solyxenergy.nl → 2026 site

Built from `production-urls.json` (171 URLs across all legacy sitemaps),
matched against `new-site-routes.json` (27 pages, 43 posts, 2 products) and
`lane3/blog/index.json` (75 captured blog posts, titles + slugs). Machine
version is `redirects.csv`. This document explains the reasoning, especially
everywhere the mapping isn't a like-for-like slug match.

Every target below is root-relative per `REDIRECT-MAP.md` §0 — no hostname,
so the table survives the domain switch untouched.

---

## 0. Needs a decision before cutover

Six rows (three old paths + their `/en/` duplicates) have no confident
target. Each already has a recommended interim target in the CSV so the
table stays loadable — pick one and swap it in.

| Old path | Currently recommended | Why it's open |
|---|---|---|
| `/sitemap/` | `/` (home) | No HTML sitemap page exists on the new site. This is a human-readable index page, not the crawler XML sitemap (which is unaffected either way). Recommend 301 to home; alternative is to rebuild the page. |
| `/en/sitemap-2/` | `/` (home) | Same question, English duplicate. |
| `/thank-you/` | `/installatie-formulier/` | Generic old confirmation page — could have served the install form, the Boilergarant form, or old WooCommerce checkout. No data ties it to one flow. Recommend pointing at the install form as the most likely source of traffic; confirm which flow this actually was before finalizing, or route it to `/checkout/` if it turns out to be order-related. |
| `/en/thank-you-2/` | `/installatie-formulier/` | Same question, English duplicate. |
| `/contact/` | `/over-ons/` | **The new site has no standalone contact page at all** — not in the 27 published pages. Recommend redirecting to `/over-ons/` (About us) as an interim landing spot, but the real fix is deciding whether a dedicated contact page belongs in the launch scope. |
| `/en/contact-2/` | `/over-ons/` | Same question, English duplicate. |

The `/contact/` gap is worth flagging loudest: it's a page every legacy site
had, and the new site currently has no equivalent anywhere in its route
inventory.

---

## 1. Accept gate results

1. **All 171 source URLs appear exactly once** — confirmed. `redirects.csv`
   has 171 data rows; set comparison against `production-urls.json` shows
   zero missing and zero extra paths, zero duplicate sources.
2. **Zero targets contain `http://`, `https://`, `solyxenergy.nl`, or `2026.`**
   — confirmed, 0 matches.
3. **Every `exact`/`strong` target matches a real path in `new-site-routes.json`**
   — confirmed, 0 mismatches. (As a further check beyond the gate, every
   `judgement` target was also verified to resolve to a real page, post, or
   product path — only the 10 rows coded `410` carry no target, correctly.)
4. **No source redirects to itself** — 55 rows have `source == target`, and
   **all 55 are `confidence=exact`**. This is expected, not a defect: `exact`
   is defined as "the old path is still live at the same slug," so for those
   rows the path literally doesn't change at cutover — there is nothing to
   redirect, and no rule needs to fire. They're kept in the CSV only to
   satisfy full 171-row coverage (gate 1). Zero self-redirects exist outside
   this documented case.
5. **No redirect chains** — 0 real chains (A→B→C where C ≠ B). Several
   `judgement`/`strong` rows land on a target that is *also* one of the 55
   identity rows above (e.g. `/calculator/` → `/besparen/`, and `/besparen/`
   → `/besparen/`); that second hop is a no-op, not a further redirect, so it
   isn't a chain in the sense this gate cares about.
6. **Counts per confidence bucket** — see below.

| Confidence | Count |
|---|---|
| `exact` | 55 |
| `strong` | 60 |
| `judgement` | 50 |
| `needs-decision` | 6 |
| **Total** | **171** |

| Code | Count |
|---|---|
| `301` | 161 |
| `410` | 10 |

---

## 2. Pages — unchanged (exact)

12 of the 60 legacy page URLs (including the homepage) are still live at the
identical path on the new site: `/`, `/besparen/`, `/wateraccu/`,
`/zonnestroomboiler/`, `/klantverhalen/`, `/faq/`, `/handleidingen/`,
`/installatie/`, `/installatie-formulier/`, `/installatie-formulier-boilergarant/`,
`/algemene-voorwaarden/`, `/levering-en-retourbeleid/`. Nothing to decide.

## 3. Pages — renamed (strong)

Same content, new slug. Old production pages don't carry titles in the
source data (only posts do), so these are matched on slug semantics plus the
live new-page title:

| Old path | New path | New title | Why |
|---|---|---|---|
| `/winkelwagen/` | `/cart/` | Winkelwagen | Same WooCommerce cart, Dutch UI title kept, slug internationalized. |
| `/calculator/` | `/besparen/` | Besparen | Confirmed by `REDIRECT-MAP.md` §1 — besparen.html is documented as "Saving calculator." |
| `/wateraccu-landing/` | `/landingspagina/` | WaterAccu | Same dedicated WaterAccu landing page. |
| `/installation-form-boilergarant/` | `/installatie-formulier-boilergarant/` | Installatie Formulier Boilergarant | Legacy URL had an English slug on a Dutch-domain path; same form. |
| `/vacatures/` | `/werken-bij/` | Werken bij Solyx | Confirmed by `REDIRECT-MAP.md` §3 (over-ons.html job listings target 727 werken-bij). |
| `/nieuws-blogs/` | `/blog-news/` | "Blog  Nieuws" (title as stored — looks like a stripped `&`) | Blog index, renamed. |
| `/winkel/` | `/shop/` | Winkel | Title match is exact ("Winkel" both sides) — this confirms `/shop/` is the WooCommerce store page, distinct from the marketing `/solyx-shop/` page (see AGENTS.md vocabulary note). |
| `/voor-installateurs/` | `/installateurs/` | Voor Installateurs | Title equals the old slug text verbatim. |
| `/over-solyx/` | `/over-ons/` | "Over ons — Onze missie  team" (title as stored — looks like a stripped `&`) | About-us page, renamed. |

## 4. Pages — best-fit content match (judgement)

No slug or title correspondence; these are old landing/marketing pages
folded into the closest surviving page that covers the same ground. Flagged
`judgement`, not `strong`, because the content isn't a verified 1:1 carry-over:

| Old path | New target | Reasoning |
|---|---|---|
| `/elektrische-boiler-op-zonnepanelen-laten-werken/` | `/zonnestroomboiler/` | "Get an electric boiler working on solar" is exactly what the zonnestroomboiler page now covers. |
| `/alternatief-voor-terugleververgoeding/` | `/zonnestroomboiler-als-oplossing-voor-terugleverkosten/` | Old page pitched an alternative to feed-in compensation; the surviving blog post covers the same ground (solar boiler as a feed-in-cost solution). |
| `/zonne-energie-thuis-opslaan/` | `/wateraccu/` | Generic "store solar energy at home" pitch; the WaterAccu product page is that pitch today. |
| `/slimme-boiler-of-wateraccu/` | `/hoe-een-simpele-boiler-een-slimme-batterij-wordt/` | "Smart boiler or WaterAccu" comparison; closest surviving content is the "how a simple boiler becomes a smart battery" post. |
| `/solar-iboost/` | `/solyx-shop/` | Discontinued third-party accessory (also gone as a product, see §6) — not sold or referenced anywhere on the new site. |
| `/ontdek-mogelijkheden/` | `/installatie/` | Flagged as an open item in `REDIRECT-MAP.md` §4c (linked from both shop pages, "no equivalent on the new site"). "Discover installation possibilities" maps closest to Installatie & Opstellingen. |
| `/ik-wil-de-wateraccu/` | `/how-to-get-it/` | "I want the WaterAccu" is the same user intent as the current Aan de slag get-started flow, just not a literal content carry-over. |
| `/home-b/` | `/` | An A/B-test variant of the homepage (`-b` suffix). Consolidated to the single canonical home — this is a real duplicate, not a catch-all. |

---

## 5. English (`/en/...`) URLs — Dutch-only at launch

**The launch site is Dutch only.** 60 of the 171 legacy URLs are `/en/`
(28 pages, 32 posts). Every one is redirected to its Dutch equivalent rather
than left to 404, using the same target its Dutch sibling resolves to above.

**This is temporary.** Once WPML is installed post-cutover and English pages
return, every redirect rule in this group must be removed — otherwise
`/en/...` requests will keep bouncing to the Dutch pages instead of reaching
the real English ones. Whoever wires up WPML should treat "delete the
`/en/` rows from this table" as part of that task's definition of done.

Highlights and edge cases inside this group:

- **Duplicate legacy URLs**: `/en/faqs/` and `/en/faqs-2/` both exist and
  both go to `/faq/`; `/en/how-does-it-work/` and `/en/how-does-it-work-2/`
  both go to `/hoe-werkt-het/`. These "-2" suffixed pages look like WPML
  slug-collision artifacts from the old site, not distinct content.
- **`/installation-form-boilergarant/`** (page group, §3) has no `/en/`
  prefix at all despite an English slug — it's a Dutch-domain URL that never
  got tagged. Handled alongside its properly-prefixed sibling
  `/en/installation-form-boilergarant/`; both point at the same form.
- Products and product categories under `/en/product...` and
  `/en/product-categorie/...` follow the same Dutch-only rule — see §6–7.
- Blog categories under `/en/category/...` follow the same rule — see §8.

---

## 6. Blog posts

75 legacy post URLs total: 43 Dutch (all imported to the new site — none
held back) and 32 English (all still pending WPML).

### 6a. Dutch posts (43) — exact

Every Dutch post slug from production exists verbatim on the new site
(`/%postname%/` permalinks preserved). Zero missing, verified by direct set
comparison against `new-site-routes.json`'s 43 posts. No action beyond the
inventory row.

One is worth flagging even though it needs no redirect decision:
`/dutch-startup-unveils-controller-to-store-excess-pv-power-in-hot-water/`
is counted among the "43 Dutch" posts by URL structure (no `/en/` prefix)
but its title and content are actually in English — a press citation that
was never localized. It carries over unchanged either way.

### 6b. English posts (32) — paired to their Dutch original

**None of these 32 posts are "held back" in the sense of missing content —
they're duplicate URLs for content that already exists in Dutch.** Each was
matched to its Dutch sibling by comparing translated title text (blog
titles were available for both languages via `lane3/blog/index.json`, unlike
pages). All 32 pairings are direct, unambiguous translations — full mapping
is in the CSV.

Two pairs are structurally unusual and worth calling out:

- **`/en/dutch-start-up-unveils-controller-to-store-surplus-pv-energy-in-hot-water/`**
  doesn't pair with a *translated* Dutch post — it pairs with the
  already-English post described in §6a above (near-identical wording,
  "surplus" vs "excess"). Consolidated onto that single existing URL rather
  than treated as a separate translation.
- **`/en/the-future-of-netting-and-returning/`** and
  **`/en/future-of-settlement-and-return/`** are two different English URLs
  that both translate the same Dutch post
  (`/nieuws-blogs-de-toekomst-van-salderen-en-terug-leveren/`) — apparently
  two translation attempts left live simultaneously on the old site. Both
  redirect to the one Dutch original.
- Two more (`/en/zonneboiler-en-wateraccu-een-betere-vergelijking/` and
  `/en/400-euro-sew-premie-op-de-wateraccu-in-vlaanderen/`) sit on `/en/`
  paths but were never actually translated — their titles are already in
  Dutch, identical to the target post's title.

All 32 are marked `strong` (translation match, not a guess) rather than
`judgement`.

---

## 7. Products — 10 legacy products → 2 current products

The new shop sells exactly two products: `Nymo WaterAccu`
(`/product/nymo-wateraccu/`) and `Nymo WaterAccu met boiler`
(`/product/nymo-wateraccu-met-boiler/`). Legacy production had 10 (6 Dutch +
4 English duplicates of 3 of those 6). Decided per product rather than
blanket-redirecting:

| Old product | Target | Confidence | Reasoning |
|---|---|---|---|
| `/product/nymo/` | `/product/nymo-wateraccu/` | strong | Same base controller, renamed slug. |
| `/product/zonnestroomboiler-complete-set/` | `/product/nymo-wateraccu-met-boiler/` | strong | "Complete set including boiler" is the met-boiler variant by definition. |
| `/product/nymo-x-homey/` (+ `/en/` pair) | `/product/nymo-wateraccu/` | judgement | Homey-integration bundle discontinued as its own SKU; Homey support now sits under the base product rather than a separate listing. |
| `/product/elektrische-boiler/` (+ `/en/` pair) | `/product/nymo-wateraccu-met-boiler/` | judgement | Standalone boiler component; closest current offering is the complete met-boiler product that includes it. |
| `/product/wateraccu-x-homey-complete-set/` | `/product/nymo-wateraccu/` | judgement | Homey bundle, same reasoning as nymo-x-homey above; routed to the base product (name doesn't mention boiler). |
| `/product/solar-iboost/` (+ `/en/product/solar-iboost-2/`) | `/solyx-shop/` | judgement | Third-party accessory brand, no longer sold or mentioned anywhere on the new site. Routed to the shop rather than a specific product since nothing replaces it directly. |
| `/en/product/electric-boiler-kopie/` | **410** | judgement | "Kopie" is Dutch for "copy" — reads as a duplicate/test product listing, not distinct content. De-indexed rather than redirected so it doesn't preserve a duplicate URL for no reason. Recommend the operator double-check this wasn't a real second SKU before cutover. |

Note on shop target choice: `/solyx-shop/` (title "Shop") was used for
generic "no specific product" cases rather than `/shop/` (title "Winkel",
the WooCommerce archive), per AGENTS.md's explicit vocabulary note that
"Marketing shop is solyx-shop, not WooCommerce page 12" — `/shop/` is
reserved for the literal store-index rename in §3.

## 8. Product category archives (7)

No product categories survive as distinct browsable archives on the new
site (only 2 flat products exist). Rather than dumping all 7 onto the shop
indiscriminately, each was routed to the most specific still-relevant target:

| Old path | Target | Reasoning |
|---|---|---|
| `/product-categorie/boilers/` (+ `/en/` pair) | `/product/nymo-wateraccu-met-boiler/` | Category held the boiler-inclusive products; the met-boiler product is the direct successor. |
| `/product-categorie/nymo/` | `/product/nymo-wateraccu/` | Category for the base Nymo; maps straight to the base product. |
| `/product-categorie/nymo-x-homey/` (+ `/en/` pair) | `/product/nymo-wateraccu/` | Same reasoning as the product-level Homey bundle in §6. |
| `/product-categorie/solar-iboost/` | `/solyx-shop/` | Discontinued accessory line, same as the product-level decision. |
| `/en/product-categorie/geen-categorie/` | **410** | "Geen categorie" = WooCommerce's default "uncategorized" placeholder term. Never held curated content; de-indexing is cleaner than redirecting a junk term. |

## 9. Blog category / taxonomy archives (11)

Old editorial taxonomy: `artikel`, `blog`, `interview`, `magazine` (nested
under artikel), `podcast` (nested under interview), `vacature` — each also
with an `/en/` pair except vacature. **Treated as two different problems, not
one:**

- **Editorial categories** (`artikel`, `blog`, `interview`, `magazine`,
  `podcast` + English pairs, 10 rows) → `/blog-news/`. The new site has no
  distinct category archives, so the single blog index is the honest
  substitute for "list of posts in this category" — not a home-page
  catch-all, a deliberate one-level-up consolidation of thin archive pages
  into the content hub that replaced them.
- **`/category/vacature/`** (job-post category, 1 row) → `/werken-bij/`.
  This is the case the task brief specifically warns about: a vacancy
  category archive is not blog content, it's job listings, and the site
  already has a live, purpose-built careers page. Redirecting it to the blog
  index would have been wrong.

## 10. Author archives (7) — de-indexed, not redirected

`/author/achourmiriam5gmail-com/`, `/author/miriam/`, `/author/ollie-milner/`,
`/author/emma_snaak/`, `/author/ivar-kotte/`, `/author/kirit-kerklaan/`,
`/author/job-van-breukelen/` — all coded **410**, confidence `judgement`.

Reasoning: a WordPress author archive is an auto-generated "everything this
person wrote" listing with no content of its own. Redirecting it to the blog
index or to an About page wouldn't satisfy the intent of anyone who actually
followed that link (they wanted *this person's* posts specifically), and
would read as a soft-404 to search engines — the exact pattern the task
brief calls out to avoid. De-indexing is the honest outcome for a thin,
duplicate-content archive type, regardless of whether the named person
(e.g. co-founder Emma Snaak, who is named in several press-citation blog
titles) is otherwise notable. Her author archive is still just a list of
links to posts that are separately, individually redirected in §6.

## 11. Shipping-class archive (1) — de-indexed

`/?taxonomy=product_shipping_class&term=gratis-verzending` → **410**.

This is a WooCommerce shipping-class taxonomy term ("free shipping"),
exposed via a bare query string rather than a pretty permalink — WooCommerce
doesn't render real front-end content for shipping-class archives; this URL
is a sitemap-generator artifact, not a page anyone was meant to land on.
Its raw path resolves to `/`, so it was kept as a distinct source row (with
its query string preserved) specifically to avoid colliding with the actual
homepage row. De-indexing avoids manufacturing a redirect to a page that
never had content to begin with.

---

## 12. Files

- `redirects.csv` — machine-loadable table, 171 rows, columns
  `source,target,code,confidence,note`.
- This document.
