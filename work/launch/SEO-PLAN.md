# SEO plan

Two halves. The technical configuration is done. The part that actually earns
traffic is content and continuity, and most of it needs decisions or data we do
not yet have.

Dutch page titles are given with an English gloss so they can be judged without
reading Dutch.

---

## 1. Applied and verified on staging

| Setting | Value | Why |
|---|---|---|
| Search engine indexing | **Discouraged** | It is a clone of the live site. Left open, it competes with production for Solyx's own brand terms and splits ranking signals. |
| Title template | `Page title – Solyx Energy` | Predictable, keeps the brand in every result |
| Attachment pages | Redirect to file | WordPress otherwise creates a thin page per image that ranks for nothing and eats crawl budget |
| Date / author / format archives | Disabled | Single-author commercial site; these are duplicate listings |
| Tag archives | No-index | Same reason |
| Breadcrumbs | Enabled | Internal linking plus richer search results |
| Organisation schema | Company, "Solyx Energy" | Required for brand knowledge panels and rich results |
| Social cards | Open Graph on, large image card | Controls how links look when shared |

**Cutover blocker — do not miss this.** Indexing is currently switched off. If it
is not switched back on at the domain switch, the new site will be invisible in
search and nobody will notice for weeks. This is the single most common way a
relaunch destroys its own traffic.

---

## 2. The two structural risks — worth more than every setting above

### 2.1 The blog: 75 posts, currently going nowhere
Production has **75 published posts**. Staging has **zero**. Those posts have
been live for years, they carry accumulated ranking history, and press coverage
links to them.

If the domain switches without them, every one of those URLs returns 404, the
rankings die, and any external links pointing at them are wasted. This is the
largest single traffic risk in the whole project, and it is a decision nobody has
made yet.

Options, best first:
1. **Migrate all 75 posts** and keep their URLs identical — zero loss
2. Migrate the top performers by real traffic, 301 the rest to the closest page
3. Drop the blog and 301 everything to relevant pages — accepts real loss

Option 2 needs Search Console data to identify the top performers. Option 1
needs no data and loses nothing, which is why it is first.

### 2.2 Redirect map at the domain switch
Every production URL that changes needs a 301 to its new equivalent. Without it,
accumulated ranking is discarded. The map can only be built from production's
real URL inventory — 76 pages and 75 posts — and must exist **before** the
switch. See `REDIRECT-MAP.md` section 5.

---

## 3. What we are missing: real data

Everything below is reasoning from the site's own content. It is not evidence.
Production has years of Search Console and Analytics history that would tell us
what genuinely earns traffic — which queries convert, which pages rank, where
impressions are wasted.

**Request:** Search Console and Analytics access for `www.solyxenergy.nl`. It
turns this plan from an educated guess into a prioritised one, and it costs
nothing to grant. Until then, treat the keyword mapping below as a hypothesis.

---

## 4. Keyword and intent mapping

The commercial logic of this market: Dutch households with solar panels are
losing the net-metering arrangement, so surplus power stops being worth
exporting. Solyx converts that surplus into hot water. The highest-intent
searches sit around that change, not around the product name — almost nobody
searches "WaterAccu" or "Nymo" who has not already met the brand.

That splits the site in two: pages that capture problem-aware demand, and pages
that convert people who already know the product.

### Problem-aware — where new clients come from

| Page | Intent to target | Proposed title | English gloss |
|---|---|---|---|
| hoe-werkt-het (120) | How to use solar surplus for hot water | `Zonne-overschot omzetten in warm water – zo werkt de WaterAccu` | Turning solar surplus into hot water — how it works |
| besparen (784) | What can I save | `Wat levert een WaterAccu op? Bereken je besparing` | What does a WaterAccu earn you? Calculate your saving |
| zonnestroomboiler (728) | Solar water heater as a category | `Zonnestroomboiler: warm water uit je eigen zonnepanelen` | Solar-power boiler: hot water from your own panels |
| wateraccu (769) | Home battery alternative | `WaterAccu: het betaalbare alternatief voor een thuisbatterij` | The affordable alternative to a home battery |
| installatie (802) | Can this work in my house | `Installatie-opstellingen: past de WaterAccu in jouw situatie?` | Layouts: does it fit your situation |

The saving page is the strongest commercial asset on the site — it answers the
only question that matters to a buyer and it already has a calculator. It
deserves the most attention.

### Product-aware — where visitors convert

| Page | Proposed title | English gloss |
|---|---|---|
| shop-nymo (838) | `Nymo WaterAccu kopen – €649 incl. btw` | Buy the Nymo — €649 incl. VAT |
| shop-complete-wateraccu (840) | `WaterAccu compleet met boiler – vanaf €1.189` | Complete with tank — from €1,189 |
| how-to-get-it (801) | `Aan de slag: welke WaterAccu past bij jou?` | Get started: which one suits you |
| klantverhalen (837) | `Klantverhalen: ervaringen met de WaterAccu` | Customer stories and experiences |
| faq (721) | `Veelgestelde vragen over de WaterAccu` | Frequently asked questions |
| installateurs (781) | `WaterAccu voor installateurs en groothandels` | For installers and wholesalers |

Putting the price in the shop titles is deliberate: it filters out browsers,
raises click-through from people who are ready, and prevents the bounce that
comes from a hidden price.

### Meta descriptions
Not drafted here. They should be written per page against the final copy, and
each one needs a concrete reason to click — a number, a saving, a timeframe —
not a summary of the page. Generic descriptions are why most sites lose clicks
they had already earned.

---

## 5. Beyond the plugin

- **Product schema.** The two products should emit price, availability and
  review data so results can show rich snippets. WooCommerce and Yoast do part
  of this; it needs verification once the products are final.
- **Internal linking.** The saving calculator and the "get started" quiz are the
  two conversion points. Every problem-aware page should link to one of them.
  Right now many of those links are dead — see `REDIRECT-MAP.md`.
- **Page speed.** Real ranking factor. The wizard pages currently load a font
  from a third-party CDN that returns a 500 error (logged in `ISSUES.md`).
- **The English side.** Needs the multilingual plugin before any of it can be
  done, and hreflang tags so the two languages do not compete with each other.

---

## 6. Cutover checklist

1. **Switch indexing back on** — nothing else matters if this is missed
2. Publish and submit the sitemap in Search Console
3. Load the 301 redirect map before the switch, not after
4. Verify the new domain in Search Console and watch coverage for two weeks
5. Confirm the blog decision has been executed either way
