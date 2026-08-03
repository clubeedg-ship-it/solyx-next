# Link and CTA architecture

Design only. Nothing here is wired yet — this is the map to work from when the
redirect/CTA pass runs.

---

## 0. URL rule — domain-agnostic, decided

**Every internal link is stored root-relative: `/besparen/`, never
`https://2026.solyxenergy.nl/besparen/`.**

The browser resolves a root-relative path against whichever host served the
page. The same stored link therefore works on the staging subdomain today and on
the live domain after cutover, with nothing to rewrite. No search-and-replace, no
redirect table to re-point, no risk of a missed absolute URL silently sending
customers to a dead subdomain after the old site is switched off.

Confirmed working on staging: permalinks are `/%postname%/`, all 23 launch pages
are published, and each resolves at its own path.

| Path | Serves |
|---|---|
| `/` | Home (page 626) |
| `/besparen/` | Saving calculator |
| `/hoe-werkt-het/` | How it works |
| `/how-to-get-it/` | Get started quiz |
| `/shop-nymo/` | Nymo product |
| `/installatie-formulier/` | Installation form |
| `/faq/` | FAQ |
| `/blog-news/` | Blog index |

**The one exception: uploaded media.** WordPress stores image and PDF URLs
absolutely in the database, so those carry the hostname. They are not fixed by
this rule and need a single search-and-replace at cutover — one command, run
once, on `wp_posts` and `wp_postmeta`. Everything else needs nothing.

**Applies to redirects too.** Any 301 rule should be written as
`/old-path/ → /new-path/`, never with a hostname, so the same rule survives the
domain change untouched.

Measured across all 23 static source pages:

| Class | Count | Meaning |
|---|---|---|
| Internal, resolves | 510 | Fine, just needs slug mapping |
| **Dead (`href="#"`)** | **172** | Clicks that do nothing today |
| **Points at the legacy domain** | **65** | Breaks when legacy is switched off |
| External (press, partners) | 70 | Fine, keep |
| `mailto:` / `tel:` | 63 | Fine, keep |
| In-page anchors | 15 | Fine |
| Internal, broken target | 1 | `index.html` from the FAQ page |

---

## 1. Page map — static source to staging page

| Static file | Page | Slug |
|---|---|---|
| home.html | 626 | gs-home-fse |
| hoe-werkt-het.html | 120 | hoe-werkt-het |
| besparen.html | 784 | besparen |
| how-to-get-it.html | 801 | how-to-get-it |
| faq.html | 721 | faq |
| shop.html | 716 | solyx-shop |
| shop-nymo.html | 838 | shop-nymo |
| shop-complete-wateraccu.html | 840 | shop-complete-wateraccu |
| wateraccu.html | 769 | wateraccu |
| zonnestroomboiler.html | 728 | zonnestroomboiler |
| installatie.html | 802 | installatie |
| installatie-formulier.html | 800 | installatie-formulier |
| installatie-formulier-boilergarant.html | 807 | installatie-formulier-boilergarant |
| installateurs.html | 781 | installateurs |
| klantverhalen.html | 837 | klantverhalen |
| over-ons.html | 782 | over-ons |
| werken-bij.html | 727 | werken-bij |
| handleidingen.html | 756 | handleidingen |
| blog-news.html | 767 | blog-news |
| landingspagina.html | 839 | landingspagina |
| privacy.html | 719 | privacy |
| algemene-voorwaarden.html | 720 | algemene-voorwaarden |
| levering-en-retourbeleid.html | 729 | levering-en-retourbeleid |

`design-canvas.html` is a design reference and is not a launch page.

---

## 2. Shared chrome — fix once, fixes most of the 172

The same dead links repeat on nearly every page because they live in the shared
header and footer. Five footer entries and one review badge account for the bulk
of the total. All six targets already exist.

| Dead label | Target |
|---|---|
| Zonnestroomboiler | 728 zonnestroomboiler |
| Werken bij | 727 werken-bij |
| Algemene voorwaarden | 720 algemene-voorwaarden |
| Privacy policy | 719 privacy |
| Levering en retourbeleid | 729 levering-en-retourbeleid |
| "4,7 · Google reviews" badge | The Google reviews search URL already used on the home page |

Because the migrated pages get their chrome from the shared WPCode asset
snippet, this is one edit applied everywhere rather than 23 separate ones.

---

## 3. Page-specific CTAs

### home.html (626)
| CTA | Target |
|---|---|
| Bereken mijn besparing | 784 besparen |
| Bekijk waarom | Section anchor on the same page |
| Hoe wordt dit berekend? | 784 besparen |
| Explainer video | **Needs the video** — placeholder today |
| Ontvang de uitgebreide calculator op maat | **Decision** — is this a form, or the besparen page? |

### how-to-get-it.html (801) — the quiz outcomes
| Outcome CTA | Target |
|---|---|
| Vraag Boilergarant aan | 807 boilergarant form |
| Vul het formulier in | 800 installation form |
| Bekijk de gidsen | 756 handleidingen |
| Bekijk in de shop (x2) | **Decision B5** — both currently aim at the plain Nymo, leaving the with-boiler product with no route |
| Meer info / Bekijk kenmerken / Wat zit erin? / FAQ | 838, 838, 840, 721 respectively |
| Order NYMO / Installation manual | 838 shop-nymo / 756 handleidingen |

### over-ons.html (782)
Two job listings — Sales & Operations, and the internship — both dead. Target
727 werken-bij, or individual vacancy pages if those are wanted.

### shop pages (838, 840)
"installatievideo" and the review badge are dead. The video needs an asset; the
badge follows the shared rule above.

### landingspagina.html (839) — English page
Its entire navigation is dead: How does it work?, Benefits, Reviews, FAQs,
Contact, Order now, Learn more. This page is the English entry point, so its
targets depend on the English URL structure, which depends on the multilingual
plugin. **Do not wire this page until WPML is in place** — otherwise it gets
wired twice.

---

## 4. Legacy-domain links — the cutover trap

65 links point at `www.solyxenergy.nl`. That domain will serve the *new* site
after cutover, so each one either resolves to something that exists or 404s.

**a. Manuals and datasheets — `/wp-content/uploads/...`**
`handleidingen.html` links 6 PDFs, and both installation forms link the privacy
statement PDF. These files live in the legacy media library. They must be
migrated into the new media library and the links repointed, or they die at
cutover. This is the highest-risk item in the list because the documents are
part of the product promise.

**b. The blog — 35 links, zero content**
`blog-news.html` links 35 legacy articles. Production has **75 published posts**;
staging has **none**. Every one of those links breaks. Options:
1. Migrate the posts (they carry SEO value and inbound links)
2. Keep them out and remove the section
3. Migrate a selected subset and redirect the rest

This is a business and SEO decision, not a technical one, and it is the largest
single question left in the content lane.

**c. Old page URLs**
`/ontdek-mogelijkheden/` and `/ontdek-mogelijkheden/#Installatiehulp` are linked
from both shop pages and have no equivalent on the new site. They need a target
or a 301 redirect.

---

## 5. Redirect table needed at cutover

Beyond in-page links, the old site's public URLs are indexed by search engines.
Any URL that changes needs a 301 to preserve ranking. That list can only be built
from production's real URL inventory — 76 pages and 75 posts — and should be
produced before the domain switch, not after.

---

## 6. Suggested order of work

1. Shared chrome — one edit, clears most of the 172
2. Page-specific CTAs whose targets are unambiguous
3. Migrate the manuals and datasheets into the new media library
4. Decide the blog question, then act on it
5. Quiz outcomes once product routing is settled (B5)
6. English page after the multilingual plugin is installed
7. Build the 301 table from production's URL inventory, immediately before cutover
