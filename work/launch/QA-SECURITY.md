# QA — Security & Professional Quality Audit

**Target:** `https://2026.solyxenergy.nl` (staging, pre-production)
**Date:** 2026-08-03
**Method:** read-only reconnaissance via headless Chromium (Playwright) + `curl` + `openssl s_client`
**Rate:** ~1 request/second throughout

---

## Scope & method statement (Accept gate D)

**No exploitation, authentication, or write attempt was made.**
Specifically: no login was attempted, no credentials were sent, no form was
submitted, no order was placed, no injection or fuzzing payload was sent, no
brute force or load testing was performed, no XML-RPC method was called, and no
write/delete request was issued. Every request was a plain `GET` (plus one
`HEAD`) against public URLs. Port 9222 was never contacted.

The SiteGround bot challenge (HTTP 202, `SG-Captcha: challenge`) was cleared the
intended way: `/` was loaded once in a real browser and the challenge's own
JavaScript was allowed to run and self-navigate. No bypass was attempted. All
subsequent probes reused that browser context's cookie jar, which is why real
status codes (not 202) are reported below.

---

## Accept gate A — Totals measured

| Metric | Count |
| --- | --- |
| Pages rendered and audited | **30** (23 listed pages + 6 blog posts + `/shop/`) |
| `<a>` elements encountered | **977** |
| `<img>` elements encountered | **297** |
| Unique link URLs checked (HTTP) | **122** (66 internal, 16 legacy-domain, 40 external) |
| Unique image URLs checked (HTTP) | **117** (102 internal, 15 external) |
| Total URL status checks | **239** |
| Exposure probes (Part 1) | **66** |
| Total HTTP requests issued by the audit | **~305** discrete probes + page renders |

Observed status distribution across the 239 link/image checks:
`200 × 197 · 202 × 16 (legacy domain, challenge) · 301 × 3 · 302 × 3 · 303 × 1 ·
308 × 1 · 403 × 2 · 404 × 2 · 500 × 1 · 999 × 2 · connection error × 11`

---

## Accept gate B — Every Part 1 exposure check with its observed value

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | `/readme.html` | **200**, `text/html`, 7 406 B | **Exposed** |
| 2 | `/license.txt` | 403 | Blocked |
| 3 | `/wp-config.php.bak` | 403 | Blocked |
| 4 | `/wp-config.txt` | 403 | Blocked |
| 5 | `/wp-config.php~` | 403 | Blocked |
| 6 | `/.env` | 403 | Blocked |
| 7 | `/debug.log` | 403 | Blocked |
| 8 | `/wp-content/debug.log` | 403 | Blocked |
| 9 | `/error_log` | 403 | Blocked |
| 10 | `/.git/config` | 403 | Blocked |
| 11 | `/.htaccess` | 403 | Blocked |
| 12 | `/wp-content/uploads/` (listing) | 403 | No listing |
| 13 | `/wp-content/plugins/` (listing) | 403 | No listing |
| 14 | `/wp-content/themes/` (listing) | 403 | No listing |
| 15 | `/wp-includes/` (listing) | 403 | No listing |
| 16 | `/wp-content/` (listing) | 403 | No listing |
| 17 | `/wp-json/wp/v2/users` | **200**, JSON, 3 108 B | **User enumeration** |
| 18 | `/wp-json/wp/v2/users/1` | **200**, JSON, 1 573 B | **User enumeration** |
| 19 | `/?rest_route=/wp/v2/users` | **200**, JSON, 1 716 B | **User enumeration** |
| 20 | `/?author=1` | 301 → `https://2026.solyxenergy.nl` (home) | Author archive suppressed |
| 21 | `/?author=2` … `/?author=5` | 403 (WAF blocked the query pattern) | Inconclusive — see F-22 |
| 22 | `/xmlrpc.php` | curl `HEAD` → **202** (`SG-Captcha: challenge`); cleared browser `GET` → connection reset (`socket hang up`) | Reachable at edge, origin resets — see F-23 |
| 23 | `/wp-login.php` | **200**, login form rendered | Reachable, no CAPTCHA |
| 24 | `/wp-admin/` | 302 → `/wp-login.php?redirect_to=…` | Correct |
| 25 | `/wp-admin/install.php` | **200** — body: "Already Installed" | Correct behaviour, minor disclosure |
| 26 | `/wp-signup.php` | 302 → `/wp-login.php?action=register` | No public registration link on login page |
| 27 | `/wp-cron.php` | 200, 0 B | Reachable (default) |
| 28 | `/wp-content/uploads/gravity_forms/` | **200**, **0 bytes** (blank index) | Directory exists, **no listing** |
| 29 | `/wp-content/uploads/gravity_forms/index.html` | 200, 0 B | Blank guard file present |
| 30 | `/wp-content/uploads/gravity_forms/1/`, `/2/`, `/export/` | 404 | Not guessable |
| 31 | `/wp-content/uploads/gravityforms/` | 404 | Not present |
| 32 | `/wp-content/uploads/2026/`, `/2025/` | 403 | No listing |
| 33 | `/wp-content/uploads/wc-logs/` | 403 | No listing |
| 34 | `/wp-content/uploads/woocommerce_uploads/` | 403 | No listing |
| 35 | `/wp-content/uploads/wpcode/` | 200, 0 B | Exists, no listing |
| 36 | `/wp-content/uploads/wp-file-manager-pro/fm_backup/` | 404 | Not present |
| 37 | `/wp-json/gf/v2/forms` | 404 (JSON) | GF REST API not public |
| 38 | `/wp-json/gf/v2/entries` | 404 (JSON) | **Form entries not publicly readable** |
| 39 | `/wp-json/wc/v3/products` | 401 | Correctly authenticated |
| 40 | `/wp-json/wc/store/v1/products` | 200, 7 148 B | Public by design (Store API) |
| 41 | `/wp-json/` | **200, 1 398 730 B** — 31 namespaces, 1 051 routes | Full stack disclosure |
| 42 | `/wp-json/wp/v2/pages?per_page=100` | 200, **7 095 384 B** | Full page content readable |
| 43 | `/wp-json/wp/v2/posts?per_page=100` | 200, 1 050 904 B | Full post content readable |
| 44 | `/feed/` | 200, 93 802 B | Normal |
| 45 | `/wp-links-opml.php` | 200, 191 B | Legacy endpoint reachable |
| 46 | `/robots.txt` | 200, 446 B | Present — see F-24 |
| 47 | `/wp-sitemap.xml` | 301 → `/sitemap_index.xml` | Yoast handling |
| 48 | `/sitemap_index.xml` | 200, 1 067 B | Present — see F-24 |
| 49 | HTTP → HTTPS redirect | **`http://…/hoe-werkt-het/` → HTTP 200, 3 201 025 B, no `Location`** | **NO REDIRECT** |
| 50 | HSTS (`Strict-Transport-Security`) | **Absent** on `/`, `/wp-login.php`, `/solyx-shop/` | **Missing** |
| 51 | `X-Frame-Options` | Absent on `/` and `/solyx-shop/`; `SAMEORIGIN` on `/wp-login.php` | Partial |
| 52 | `Content-Security-Policy` | Absent on front end; `frame-ancestors 'self';` on `/wp-login.php` | Partial |
| 53 | `X-Content-Type-Options` | `nosniff` on `/` and `/solyx-shop/`; **absent** on `/wp-login.php` | Partial |
| 54 | `Referrer-Policy` | **Absent** on front end; `strict-origin-when-cross-origin` on `/wp-login.php` | Partial |
| 55 | `Permissions-Policy` | **Absent** everywhere | Missing |
| 56 | `X-XSS-Protection` | `1; mode=block` on front end | Present (deprecated header) |
| 57 | TLS certificate | `CN=*.solyxenergy.nl`, issuer `Let's Encrypt CN=YR1`, valid **2026-07-20 → 2026-10-18**, SAN `*.solyxenergy.nl, solyxenergy.nl` | Valid (76 days left) |
| 58 | TLS protocol support | TLS 1.0 ✗ · TLS 1.1 ✗ · **TLS 1.2 ✓** · **TLS 1.3 ✓** | Good |
| 59 | Secrets in page source | 12 secret patterns scanned across 30 pages — **0 hits** (no API keys, tokens, private keys, DB creds) | Clean |
| 60 | Email addresses in source | Only `info@solyxenergy.nl` (28 pages) and `naam@voorbeeld.nl` (form placeholder) | Clean |
| 61 | Developer comments in source | Layout comments only + Yoast/Meta Pixel markers; **no credentials, hostnames or internal notes** | Clean, one disclosure (F-25) |
| 62 | Custom 404 handling | 404 returned correctly, but body is **1 995 192 B** | Works — see F-19 |

---

# FINDINGS

Ordered by severity. Each finding is marked **CONFIRMED** (directly observed) or
**UNVERIFIED** (suspected; what would confirm it is stated).

---

## CRITICAL

### F-1 — Site is fully served over plain HTTP with no redirect to HTTPS, and no HSTS `CONFIRMED`

**Evidence:**
`GET http://2026.solyxenergy.nl/hoe-werkt-het/` (port 80, redirects disabled)
returned **HTTP 200**, `Content-Type: text/html; charset=UTF-8`,
`Content-Length: 3 201 025` — the complete rendered page — with **no `Location`
header**. Header inspection of `https://2026.solyxenergy.nl/` shows the full
response header set is
`server, date, content-type, transfer-encoding, connection, vary, x-cache-enabled,
x-content-type-options, x-xss-protection, link, x-httpd-modphp, host-header,
x-proxy-cache, content-encoding` — **no `strict-transport-security`**.

**Why it matters:** this site is about to take WooCommerce/Mollie payments and
Gravity Forms submissions containing names, addresses, phone numbers and email
addresses. Any visitor who reaches `http://` (typed URL, old link, QR code,
hostile Wi-Fi) transacts in cleartext, and without HSTS a downgrade is not
prevented on subsequent visits either.

**Remediation:** add a permanent 301 from `http://` to `https://` at the nginx /
SiteGround level for the production hostname, then add
`Strict-Transport-Security: max-age=31536000; includeSubDomains` (start with a
short `max-age` such as 300 during cutover, raise to a year once verified).
Re-run `curl -sI http://<host>/` and confirm `301` + `Location: https://…`.

---

### F-2 — Meta Pixel fires before consent; `_fbp` cookie is set pre-consent `CONFIRMED`

**Evidence:** In a **fresh browser context with no consent interaction of any
kind**, loading `/` resulted in:

- third-party hosts contacted: `connect.facebook.net`,
  `d1rozh26tys225.cloudfront.net`, `fonts.googleapis.com`
- cookie `_fbp` set on domain `.solyxenergy.nl` (Secure=false, HttpOnly=false)
- a CookieYes banner rendered simultaneously, reading: *"Wij gebruiken cookies om
  uw ervaring te verbeteren. Door onze website te gebruiken, gaat u akkoord met
  ons cookiebeleid. Instellingen / Weigeren / Accepteren"*

Page source confirms the pixel is an **unblocked inline `<script>`**:
`fbq('init','<id>'); fbq('track','PageView');` loading
`https://connect.facebook.net/en_US/fbevents.js`, immediately followed by a
`<noscript><img … facebook.com/tr?…&ev=PageView>` fallback. The document contains
**43 `data-cky-tag` attributes and 0 `type="text/plain"` scripts** — CookieYes'
blocking mechanism is in use elsewhere on the page but the Meta Pixel block is
**not** tagged, so consent management cannot gate it.

**Why it matters:** this is a marketing tracker executing before consent under
GDPR/ePrivacy, on a Dutch consumer site. It is also self-contradictory: the site
presents a Reject button that does not prevent the tracking that already
happened. The banner copy ("by using our website you agree") is implied-consent
wording, which is not a valid basis.

**Remediation:** move the Meta Pixel into CookieYes' blocked-script mechanism
(`type="text/plain"` + `data-cky-tag="advertisement"`, or register it through the
CookieYes script manager) so it only executes after an explicit advertising-
category opt-in. Replace the implied-consent sentence. Re-verify by loading the
site in a clean profile and confirming `connect.facebook.net` is not contacted
and `_fbp` is not set until Accept is clicked. Coordinate with Lane 4 (Tracking).

---

### F-3 — Every audited page carries `<meta name="robots" content="noindex, nofollow">` `CONFIRMED`

**Evidence:** All **30** rendered pages returned `robots = "noindex, nofollow"`,
including `/`, `/solyx-shop/`, `/shop-nymo/`, `/shop-complete-wateraccu/`, the
legal pages and all 6 sampled blog posts. Consequence, also confirmed: **no page
emits a `<link rel="canonical">`** (0 of 30) — WordPress/Yoast suppress the
canonical when discouraging indexing.

**Why it matters:** correct for staging, catastrophic if carried into production.
Launching in this state means zero organic visibility and no canonical signals
for the whole catalogue.

**Remediation:** this is a cutover gate. In Settings → Reading, clear
"Discourage search engines from indexing this site" **as part of the domain
switch, not before**, then immediately re-verify that `robots` is gone and
`rel=canonical` is present on all 24 sitemap pages. Add this to
`work/launch/CUTOVER.md` as a blocking step with a post-switch verification run.

---

## HIGH

### F-4 — Editor-facing instruction text is rendered in the body of every page `CONFIRMED`

**Evidence:** The following text appears in `document.body.innerText` on every
page sampled (`/`, `/besparen/`, `/privacy/`, `/solyx-shop/`, `/blog-news/`,
`/over-ons/` — and in the crawl, on all 23 non-post pages):

> "Solyx blank template — this template only passes through page content (no
> theme header/footer). To edit the Hybrid B homepage blocks, open the page
> Home — Solyx hybrid B (Pages → that page), not this template canvas. The
> Content block below is a passthrough placeholder when no page is selected for
> preview."

Computed style of the containing `<p class="wp-block-paragraph">`:
`display: block`, `visibility: visible`, `opacity: 1`, `font-size: 19.2px`,
`color: rgb(61,61,61)`, `offsetParent` not null, no hidden ancestor. On
`/hoe-werkt-het/` its box is 748 × 98 px at y = −249 relative to the viewport.

**Why it matters:** it is real rendered content, not a comment. It is exposed to
screen readers, to search-engine text extraction, to the REST API content
payload, and to any copy/paste or reader-mode view. It names internal editing
workflow on a public commercial site.

**Remediation:** remove this paragraph from the `Solyx blank template` block
template. If the note must be retained for editors, move it into a block
`<!-- comment -->` or an editor-only `InspectorControls` note — never into
rendered post content. Re-verify with
`document.body.innerText.includes('Solyx blank template')` returning `false` on
all pages.

---

### F-5 — `/shop/` serves WooCommerce's English "Coming soon" placeholder and is in the public sitemap `CONFIRMED`

**Evidence:** `https://2026.solyxenergy.nl/shop/` → 200, `<title>Shop</title>`,
`<h1>Great things are on the horizon</h1>`, body text:

> "Something big is brewing! Our store is in the works and will be launching
> soon!"

`/page-sitemap.xml` lists `https://2026.solyxenergy.nl/shop/` among its 24 URLs.

**Why it matters:** an English WooCommerce default placeholder on a Dutch
commercial site, at the most guessable commerce URL there is, published in the
sitemap. It directly contradicts the two live shop pages (`/shop-nymo/`,
`/shop-complete-wateraccu/`) and the marketing shop at `/solyx-shop/`.

**Remediation:** decide the fate of page `/shop/` explicitly — either redirect
301 to `/solyx-shop/`, or set it to draft and exclude it from the sitemap. Note
`AGENTS.md` records that the marketing shop is `solyx-shop`; `/shop/` looks like
an unmanaged WooCommerce leftover. Add the decision to `REDIRECT-MAP.md`.

---

### F-6 — Two published pages state "ONDER CONSTRUCTIE" `CONFIRMED`

**Evidence:**

- `/zonnestroomboiler/`: "SOLYX ENERGY Zonnestroomboiler. Verwarm tapwater met
  jouw eigen zonne-energie. **ONDER CONSTRUCTIE** Deze pagina wordt binnenkort
  ingevuld. De volledige tekst van deze pagina…"
- `/werken-bij/`: "SOLYX ENERGY Werken bij Solyx. Bouw mee aan slimme
  energieopslag voor thuis. **ONDER CONSTRUCTIE** Deze pagina wordt binnenkort
  ingevuld. De volledige tekst van deze pagina…"

Both return 200 and both appear in `/page-sitemap.xml`.

**Why it matters:** `/zonnestroomboiler/` is a product page reachable from site
navigation. Shipping it in this state at launch damages credibility on a
revenue-relevant page.

**Remediation:** either write the content before cutover, or set both pages to
draft and remove their navigation entries and sitemap inclusion. `/werken-bij/`
in particular can safely be deferred; `/zonnestroomboiler/` should be treated as
Lane 3 content work.

---

### F-7 — Username enumeration via the REST API; the exposed account is an administrator `CONFIRMED`

**Evidence:** `/wp-json/wp/v2/users` → **200**, returning a user object with
`"id":3`, `"name":"emma"`, `"slug":"emma"`,
`"link":"https://2026.solyxenergy.nl/author/emma/"`, and — significantly —
`"is_super_admin":true`. The same data is served from
`/?rest_route=/wp/v2/users` (200) and `/wp-json/wp/v2/users/1` (200), so blocking
one path is not sufficient. The response also leaks the WooCommerce admin
preference blob for that account.

Corroborating surfaces observed (not tested):
- `/wp-login.php` → 200, standard `log` / `pwd` form, **no reCAPTCHA, hCaptcha or
  Turnstile element, and no occurrence of the string "captcha" in the HTML**.
- `/wp-json/` advertises `application-passwords` authentication with the
  authorization endpoint `/wp-admin/authorize-application.php`.

**Why it matters:** half of a credential pair is public, tied to an
administrator, on a login form with no visible challenge. No credential was ever
submitted during this audit, so the presence or absence of server-side login
rate limiting is **UNVERIFIED** — see F-22.

**Remediation:** (a) disable the anonymous REST users endpoint (Yoast SEO →
Crawl optimization → "Remove the REST API users endpoint", or a
`rest_endpoints` filter removing `/wp/v2/users` for unauthenticated callers);
(b) confirm the SiteGround Security plugin's login-limiting and 2FA are enabled
for all administrator accounts; (c) consider a non-default login URL; (d) confirm
Application Passwords is disabled if no integration requires it.

---

### F-8 — 16 links point at the legacy domain that is being switched off `CONFIRMED`

**Evidence:** 16 unique `https://www.solyxenergy.nl/…` targets are linked from
staging pages. All currently answer `202` (the legacy host's own bot challenge),
i.e. they resolve today — but per `AGENTS.md` legacy is stopped after cutover, at
which point every one becomes dead.

| Target on `www.solyxenergy.nl` | Linked from |
| --- | --- |
| `/wp-content/uploads/2025/10/253539-…Gebruikershandleiding-Nymo-NY-GH_10-2025.pdf` | `/handleidingen/` |
| `/wp-content/uploads/2026/01/253700-…NY-GH_UK_01-2026_proef.pdf` | `/handleidingen/` |
| `/wp-content/uploads/2026/01/253700-…NY-GH_DE_01-2026_proef.pdf` | `/handleidingen/` |
| `/wp-content/uploads/2026/01/253700-…NY-GH_FR_01-2026_proef.pdf` | `/handleidingen/` |
| `/wp-content/uploads/2025/10/253598-…Handleiding-Nymo-NY-IH_HO_10-2025_NL.pdf` | `/handleidingen/` |
| `/wp-content/uploads/2023/01/…Installatiehandleiding-Solar-iBoost.pdf` | `/handleidingen/` |
| `/wp-content/uploads/2025/01/…Installatiehandleiding-Nymo-NY-IH_01-2025.pdf` | `/shop-nymo/`, `/shop-complete-wateraccu/`, `/installateurs/` |
| `/wp-content/uploads/2025/01/…Gebruikershandleiding-Nymo-NY-GH_1-2025.pdf` | `/shop-nymo/`, `/shop-complete-wateraccu/` |
| `/wp-content/uploads/2022/05/Privacy-Verklaring-Solyx-Energy.pdf` | `/installatie-formulier/`, `/installatie-formulier-boilergarant/` |
| `/ontdek-mogelijkheden/` | `/shop-nymo/`, `/shop-complete-wateraccu/`, 2 blog posts |
| `/wateraccu/` | 2 blog posts |
| `/product/nymo/` | `/nieuws-blogs-energieverbruik-huishouden/` |
| `/opstellingen-wateraccu/` | `/nieuws-blogs-energieverbruik-huishouden/` |
| `/nieuws-blogs-de-gevolgen-van-salderen/` | `/nieuws-blogs-energieverbruik-huishouden/` |
| `/nieuws-blogs-zonne-energie-opslaan_solar365/` | `/blog-news/` |
| `/` (legacy home) | `/privacy/` |

Note the two highest-risk cases: **all product manuals** on `/handleidingen/` and
the **privacy statement PDF** linked from both installation forms — the latter is
the document a user is pointed at before submitting personal data.

**Remediation:** re-upload the 9 PDFs to the staging media library and repoint
every link at `2026.solyxenergy.nl` (post-cutover: `solyxenergy.nl`). Rewrite the
6 in-content legacy page links to their staging equivalents. Record any that have
no staging equivalent in `REDIRECT-MAP.md` so cutover redirects cover them. This
must be closed before legacy is stopped.

---

### F-9 — Front-end responses are missing every modern security header `CONFIRMED`

**Evidence** (headers observed on `https://2026.solyxenergy.nl/`, status 200):

| Header | `/` | `/solyx-shop/` | `/wp-login.php` |
| --- | --- | --- | --- |
| `Strict-Transport-Security` | **missing** | **missing** | **missing** |
| `Content-Security-Policy` | **missing** | **missing** | `frame-ancestors 'self';` |
| `X-Frame-Options` | **missing** | **missing** | `SAMEORIGIN` |
| `Referrer-Policy` | **missing** | **missing** | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | **missing** | **missing** | **missing** |
| `X-Content-Type-Options` | `nosniff` | `nosniff` | **missing** |
| `X-XSS-Protection` | `1; mode=block` | `1; mode=block` | missing |

The only hardening headers present on the public site are `X-Content-Type-Options`
and the deprecated `X-XSS-Protection`. With `X-Frame-Options` and CSP
`frame-ancestors` both absent, **the shop and checkout pages can be framed by any
origin** (clickjacking surface on a payment flow).

**Remediation:** set at the server/SiteGround level for all responses:
`Strict-Transport-Security: max-age=31536000; includeSubDomains` (after F-1),
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()`,
and `X-Content-Type-Options: nosniff` on **all** paths including `/wp-login.php`.
Add a report-only CSP first (`Content-Security-Policy-Report-Only`) because the
page loads Meta Pixel, YouTube, Google Fonts and a CloudFront asset — enforce
only after the report is clean.

---

### F-10 — All 10 partner logos on `/installateurs/` are permanently broken `CONFIRMED`

**Evidence:** `/installateurs/` loads 10 logos from `logo.clearbit.com`. Every
one fails DNS resolution (`net::ERR_NAME_NOT_RESOLVED`) and measures 0 × 0 after
a full lazy-load settle:

```
logo.clearbit.com/reheat.nl?size=256          logo.clearbit.com/ithodaalderop.nl?size=256
logo.clearbit.com/groenehoed.nl?size=256      logo.clearbit.com/cvtotaal.nl?size=256
logo.clearbit.com/omnieuweenergie.nl?size=256 logo.clearbit.com/woonwijzerwinkel.nl?size=256
logo.clearbit.com/warmtebeheer.nl?size=256    logo.clearbit.com/amyheat.nl?size=256
logo.clearbit.com/homey.app?size=256          logo.clearbit.com/boilergarant.nl?size=256
```

The same page also carries one `<img>` with a **truncated base64 data URI**
(`data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQAB…f//Z` — a JPEG payload declared
as PNG), producing `net::ERR_INVALID_URL`. `/installateurs/` accounts for **11 of
the 12 console errors** recorded across the whole crawl.

**Why it matters:** the installer-partner page — the page meant to establish
credibility with trade partners, including Itho Daalderop and Boilergarant —
renders with every partner logo missing.

**Remediation:** the Clearbit Logo API is discontinued; it will not come back.
Obtain each partner's logo with permission, upload to the media library, and
reference locally with proper `alt` text. Fix or remove the malformed data-URI
image. Never depend on a third-party logo CDN for brand assets.

---

## MEDIUM

### F-11 — WordPress and plugin versions are disclosed `CONFIRMED` (no vulnerable version found)

**Evidence:**

- `/readme.html` → **200** (7 406 B), the stock WordPress readme.
- No `<meta name="generator">` on the homepage, but asset query strings disclose:
  **WordPress core 7.0.2** (`wp-includes/css/dashicons.min.css?ver=7.0.2`),
  **WooCommerce 10.9.4**, **CookieYes / cookie-law-info 3.5.4**,
  **GreenShift theme 2.6.5**, **greenshiftwoo 1.7**, embedpress (cache-busted).
- `<!-- This site is optimized with the Yoast SEO plugin v28.1 -->` on 28 pages.
- `/wp-json/` (1.4 MB, 200) enumerates **31 REST namespaces / 1 051 routes**,
  disclosing the full stack: `wc/v3`, `wc/store/v1`, `wc/pos/v1/catalog`,
  `wc/private`, `mollie/v1`, `yoast/v1`, `jetpack/v4`, `mwai/v1` + `mwai-ui/v1`
  (AI Engine), `cky/v1`, `foogallery/v1`, `embedpress/v1`, `greenshift/v1`,
  `greenshiftwoo/v1`, `greenshifttheme/v1`, `siteground-settings/v1`,
  `siteground-optimizer/v1`, `sg-security/v1`, `mcp/v1`, `wp-abilities/v1`.

**Advisory status — checked against the WordPress.org API:** core **7.0.2 is the
current release**; WooCommerce **10.9.4 is the current release**; CookieYes
**3.5.4 is the current release**. **No component I could version was running an
outdated release, and I observed no component with a known public advisory.**
GreenShift theme 2.6.5, greenshiftwoo 1.7 and embedpress are commercial/
non-repository and their currency is **UNVERIFIED** — confirming them requires
the wp-admin Updates screen.

**Remediation:** delete or block `/readme.html` (it is pure disclosure with no
function); suppress the Yoast generator comment; keep the current patch discipline
that produced this clean result. Reducing `/wp-json/` disclosure is optional and
low-value — treat F-7 (users endpoint) as the part that matters.

---

### F-12 — No page has a meta description; no page has a canonical URL `CONFIRMED`

**Evidence:** across all 30 rendered pages, `<meta name="description">` is
**absent on 30/30** and `<link rel="canonical">` is **absent on 30/30**. Page
titles are present and unique (**0 duplicate titles** across the 30 pages), and
`og:image` is present on 20 of 30.

**Remediation:** the missing canonicals are a side effect of F-3 and will return
when indexing is enabled — verify, do not hand-author them. Meta descriptions are
independent of F-3 and must be authored per page in Yoast; prioritise `/`,
`/hoe-werkt-het/`, `/besparen/`, `/solyx-shop/`, `/shop-nymo/`,
`/shop-complete-wateraccu/`, `/wateraccu/`, `/faq/`. Add `og:image` to the 10
pages lacking one (the 3 legal pages and all 6 blog posts). This belongs in
`SEO-PLAN.md`.

---

### F-13 — Dutch pages declare `lang="en-US"` `CONFIRMED`

**Evidence:** `<html lang="en-US">` on **29 of 30** pages, including `/`,
`/hoe-werkt-het/`, `/besparen/`, `/privacy/`, `/algemene-voorwaarden/` and all
Dutch blog posts, whose content is Dutch throughout. No `hreflang` alternates
were emitted on any page.

**Why it matters:** screen readers apply English pronunciation rules to Dutch
text (a WCAG 3.1.1 failure), and search engines receive a contradictory language
signal. It also blocks the planned Dutch/English pairing in Lane 3.

**Remediation:** set the WordPress site language to Dutch (`nl-NL`) so Dutch
pages emit `lang="nl-NL"`, and mark the English routes (`/how-to-get-it/`,
`/landingspagina/`) explicitly. Add reciprocal `hreflang` pairs once Lane 3
completes the paired routes.

---

### F-14 — Two confirmed broken internal targets `CONFIRMED`

**Evidence:**

1. `https://2026.solyxenergy.nl/hoe-werkt-het/midia/solyx-logo.png` → **404**.
   The markup uses the relative path `midia/solyx-logo.png`, which resolves
   against the page URL instead of the media library. This is the only HTTP 404
   image on the site and the only 404-class console error in the entire crawl.
2. `https://2026.solyxenergy.nl/technisch` → **404**, linked from
   `/installateurs/`.

**Remediation:** repoint the logo at its absolute media-library URL
(`/wp-content/uploads/2026/07/solyx-logo.png`, which returns 200). Decide what
`/technisch` was meant to be — create the page or remove the link.

---

### F-15 — 12 visible form inputs have no programmatic label `CONFIRMED`

**Evidence** (inputs with no `<label for>`, no wrapping `<label>`, no
`aria-label` / `aria-labelledby` / `title`):

| Page | Unlabelled controls |
| --- | --- |
| `/installatie-formulier/` | `input[email]` name=`email`, `input[tel]` name=`phone`, `textarea` name=`notes` |
| `/installatie-formulier-boilergarant/` | `input[email]` name=`email`, `input[tel]` name=`phone`, `textarea` name=`notes` |
| `/besparen/` | 3 × `input[range]` (savings calculator sliders) |
| `/hoe-werkt-het/` | 2 × `<select>` |
| `/installateurs/` | `input[email]` (newsletter/contact) |

All rely on `placeholder` alone (e.g. `naam@voorbeeld.nl`, `06 12345678`), which
disappears on focus and is not a label.

**Why it matters:** these are the two installation quotation forms — the primary
lead-capture path in Lane 1 — plus the savings calculator. Screen-reader users
cannot determine what to enter. WCAG 2.1 AA 3.3.2 / 4.1.2 failure.

**Remediation:** add a visible `<label for>` bound to each control's `id`, or at
minimum `aria-label`. Keep placeholders as format hints only. Also fix the 2
buttons with no accessible name found on `/besparen/`.

---

### F-16 — Heading hierarchy defects on 7 pages `CONFIRMED`

**Evidence:**

| Page | Defect |
| --- | --- |
| `/privacy/` | first heading is `h2` — **no `h1`** |
| `/algemene-voorwaarden/` | first heading is `h2` — **no `h1`** |
| `/levering-en-retourbeleid/` | first heading is `h2` — **no `h1`** |
| `/` | `h1` → `h3` (skips `h2`); `€ 342` is marked up as an `h2` |
| `/how-to-get-it/` | `h1` → `h3` at "Nymo" |
| `/blog-news/` | `h1` → `h3` at the first post title |
| `/shop-nymo/`, `/shop-complete-wateraccu/` | `h2` → `h4` at "Links en checks" |

**Remediation:** give the 3 legal pages a real `h1` (their page title). Demote
skipped levels so headings descend by one. Change the `€ 342` figure from `h2` to
a styled paragraph — a price is not a section heading.

---

### F-17 — `/hoe-werkt-het/` shows two unfilled testimonial video placeholders `CONFIRMED`

**Evidence:** rendered text —
"▶ Lonneke (Amersfoort) over de WaterAccu **VIDEO KOMT BINNENKORT BESCHIKBAAR**
▶ Theo (Soest) over de WaterAccu **VIDEO KOMT BINNENKORT BESCHIKBAAR**"

**Remediation:** publish the videos or remove the two placeholder cards before
launch. Named customers with permanently "coming soon" testimonials reads worse
than having no testimonial section.

---

### F-18 — Internal code-snippet CPT is published in the public sitemap `CONFIRMED`

**Evidence:** `/gscodesnippet-sitemap.xml` → 200, listing
`https://2026.solyxenergy.nl/gs-code-snippets/home-v2-widgets-new/`.

**Remediation:** set the `gscodesnippet` post type to `noindex` and exclude it
from the Yoast sitemap (SEO → Search Appearance → Content Types). Internal build
artefacts should not be discoverable URLs.

---

### F-19 — The 404 page ships a ~2 MB payload `CONFIRMED`

**Evidence:** `GET /deze-pagina-bestaat-niet-audit-test/` → **404**, body
**1 995 192 bytes**. Confirmed repeatedly: the same ~1.99 MB body was returned
for `/wp-content/uploads/gravity_forms/1/`, `/2/`, `/export/` and
`/wp-content/uploads/gravityforms/`.

**Why it matters:** every 404 — including bot scans and broken-link crawls —
transfers ~2 MB. It is a needless bandwidth and origin-CPU cost, and mildly
amplifies scanning traffic.

**Remediation:** give the 404 a lightweight dedicated template (heading, search,
links to the main sections) instead of rendering the full homepage block stack.

---

### F-20 — Session cookies are set without the `Secure` flag `CONFIRMED`

**Evidence:** cookies set on first load, all `Secure=false`:
`_I_` (HttpOnly, `.2026.solyxenergy.nl`), `cookieyes-consent`, `_fbp`, and eight
Sourcebuster order-attribution cookies (`sbjs_migrations`, `sbjs_current_add`,
`sbjs_first_add`, `sbjs_current`, `sbjs_first`, `sbjs_udata`, `sbjs_session`).
By contrast `/wp-login.php` correctly sets
`wordpress_test_cookie=…; path=/; secure; HttpOnly`, and `/solyx-shop/` correctly
sets `ep_session_id=…; SameSite=Lax; Secure`.

Combined with F-1 (site reachable over plain HTTP), these cookies will be
transmitted in cleartext to any visitor who arrives on `http://`.

**Remediation:** fix F-1 first, then force `Secure` on all cookies (`session.cookie_secure`,
WooCommerce "Force secure checkout", and the CookieYes/Sourcebuster settings).
Re-check with the browser cookie inspector that no cookie shows `Secure=false`.

---

### F-21 — `robots.txt` and `sitemap_index.xml` advertise `http://` URLs, and `robots.txt` contains a conflicting Yoast block `CONFIRMED`

**Evidence:** `/robots.txt` (200, 446 B) ends with:

```
# START YOAST BLOCK
User-agent: *
Disallow:
Sitemap: http://2026.solyxenergy.nl/sitemap_index.xml
# END YOAST BLOCK
```

That is a **second `User-agent: *` group** whose `Disallow:` (allow-all) conflicts
with the earlier WooCommerce group that disallows `/wp-admin/`,
`/wp-content/uploads/wc-logs/`, `/wp-content/uploads/woocommerce_uploads/` and
`?add-to-cart=` — crawler behaviour with two `*` groups is
implementation-dependent. Separately, `/sitemap_index.xml` (200) lists all six
sub-sitemaps with **`http://` locs** (`http://2026.solyxenergy.nl/post-sitemap.xml`
etc.), though the sub-sitemaps' own 70 entries are correctly `https://`
(page 24, post 43, product 3, snippet 1 — 0 `http://` entries).

**Remediation:** merge into a single `User-agent: *` group and correct the scheme
to `https://` (Yoast derives this from the WordPress Site Address — it will fix
itself once the site URL and F-1 redirect are correct at cutover).

---

## LOW

### F-22 — Login rate limiting and 2FA could not be verified `UNVERIFIED`

`/wp-login.php` returns 200 with a standard form and **no CAPTCHA element of any
kind** (`.g-recaptcha`, `[data-sitekey]`, hCaptcha, Turnstile all absent; the
string "captcha" does not appear in the HTML). The SiteGround Security plugin
**is** installed (`sg-security/v1` REST namespace present), and it commonly
provides login limiting and 2FA server-side without any visible markup.

**Whether login attempts are actually throttled, and whether 2FA is enforced for
the administrator account, is UNVERIFIED — confirming it would require submitting
credentials, which was deliberately not done.** Confirm from wp-admin: SiteGround
Security → Login Security (Limit Login Attempts, 2FA) and the per-user 2FA state
for the `emma` account.

The `?author=2` … `?author=5` probes returned **403** from the WAF (a blocked
query pattern, not a WordPress response), so **author-archive enumeration for IDs
other than 1 is UNVERIFIED**. `?author=1` → 301 to the homepage, which indicates
author archives are disabled.

### F-23 — `/xmlrpc.php` reachability is ambiguous `UNVERIFIED`

`curl -I https://2026.solyxenergy.nl/xmlrpc.php` → **HTTP/2 202** with
`SG-Captcha: challenge` (the edge challenge, not WordPress). A `GET` through the
challenge-cleared browser context → connection reset (`socket hang up`), while
every other path in the same batch returned normally. **No XML-RPC method was
called.** The behaviour is consistent with the file being blocked or disabled,
but that is not proven from outside.

Confirm from the server side that `xmlrpc.php` is disabled (SiteGround Security →
"Disable XML-RPC", or an nginx `location = /xmlrpc.php { deny all; }`). If any
integration needs it, restrict by IP rather than leaving it open.

### F-24 — Endpoints reachable by default that are worth reviewing `CONFIRMED`

- `/wp-cron.php` → 200 (0 B). Standard WordPress; can be hit repeatedly to force
  cron runs. Consider `DISABLE_WP_CRON` plus a real system cron.
- `/wp-links-opml.php` → 200 (191 B). Obsolete Links Manager endpoint; block it.
- `/wp-admin/install.php` → 200, "Already Installed". Correct behaviour, but it
  discloses the exact core version in its stylesheet URLs.
- `/wp-json/wp/v2/pages?per_page=100` → 200, **7.1 MB** of full page content;
  `/wp-json/wp/v2/posts?per_page=100` → 200, 1.05 MB. Published content only, so
  no unpublished data leaks — but it is a cheap full-content scrape and a heavy
  origin request.
- **`mcp/v1` and `wp-abilities/v1` namespaces are exposed.** These are
  agent/automation control surfaces. **What they expose and whether they require
  authentication is UNVERIFIED** — no route under them was called. Given
  `AGENTS.md` defers the client agent to post-launch, confirm from wp-admin which
  plugin registers `mcp/v1` and whether it should be active on a production
  storefront at all.

### F-25 — Minor source disclosures `CONFIRMED`

Yoast advertises its version in an HTML comment on 28 pages
(`<!-- This site is optimized with the Yoast SEO plugin v28.1 -->`). Layout
comments in the page source are descriptive and professional (`<!-- LEFT: Zonder
WaterAccu -->`, `<!-- Card 1: Zonnepanelen -->`) — **no credentials, internal
hostnames, staging notes or TODO markers were found in any comment.** Only two
email addresses appear anywhere in source: `info@solyxenergy.nl` and the form
placeholder `naam@voorbeeld.nl`.

### F-26 — Content details worth a second look `CONFIRMED`

- Homepage hero carries the chip **"Nieuwe website · 2026"**
  (`<p class="hb-chip">`). Confirm this is intended production copy and not a
  staging marker.
- Homepage states *"De salderingsregeling eindigt vanaf 2027, oftewel, over 6
  maanden."* On 2026-08-03 that is ~5 months, and the phrasing goes stale on its
  own. Prefer an absolute date ("vanaf 1 januari 2027").
- `€0,00` appears on `/wateraccu/` and `/shop-complete-wateraccu/` as the
  "Toebehoren" (accessories) line in a price breakdown. **This looks correct, not
  a dummy price** — flagged only so it is consciously confirmed.
- **No lorem ipsum, "TODO", "FIXME", "test content", "standalone export",
  template-variable leaks (`{{ }}`, `%s`), or stray `undefined`/`NaN` were found
  on any of the 30 pages.**

### F-27 — External links returning non-200 `CONFIRMED`

| Status | URL | From |
| --- | --- | --- |
| DNS error | `https://www.omnieuweenergie.nl/` | `/installateurs/` |
| 500 | `https://www.eerstekamer.nl/nieuws/20241217/wet_beeindiging_salderingsregeling` | `/nieuws-blogs-de-afschaffing-van-de-salderingsregeling/` |
| 403 | `https://www.bnr.nl/podcast/…/hoe-breng-je-een-nieuw-apparaat-naar-de-markt` | `/over-ons/` |
| 403 | `https://support.homey.app/hc/en-us/articles/23160471520540-…` | `/handleidingen/` |
| 999 ×2 | `https://www.linkedin.com/in/emma-snaak-…`, `…/hans-snaak-…` | `/over-ons/` |
| 303 | `https://youtu.be/vPN9nE1pvSI` | `/over-ons/` |
| 308 | `https://business.gov.nl/amendment/netting-scheme-solar-panels-ends/` | `/nieuws-blogs-wateraccu-vs-slimme-schakelaar/` |

Only two need action: the **DNS failure** (partner site gone — remove or replace
the link) and the **eerstekamer.nl 500** (find the current URL). The 403s and
`999`s are anti-bot responses from BNR, Homey and LinkedIn and are almost
certainly fine in a real browser (**UNVERIFIED** — confirm by clicking). The 303
and 308 are normal redirects.

### F-28 — Zero-dimension images that are NOT broken `UNVERIFIED`

After a slow full-page scroll and a 4-second settle, **39 `<img>` elements
measured 0 × 0**. Of these, **12 are genuinely broken** and are reported under
F-10 and F-14. The remaining **27 all return HTTP 200** when fetched directly:

| Page | Count | Files |
| --- | --- | --- |
| `/zonnepanelen-dynamisch-contract/` | 10 | `Afbeelding1/3/4/5.png`, `Scherm­afbeelding-2025-03-26-*.png`, `Solyx-Energy-Nymo-Renders-07-1-min-*.png` |
| `/klantverhalen/` | 6 | `iboost-Serge-Duursma-min.jpg` ×3, `installed.jpg` ×3 |
| `/installatie/` | 4 | `…Opstelling1-a…`, `…Opstelling2…`, `…Opstelling3b…`, `…Opstelling4…` |
| `/installateurs/` | 7 | remaining logo slots |

**These are almost certainly not broken images.** The pattern (duplicated
sources, "Opstelling 1–4" which are tabbed variants) indicates images inside
carousels/tabs/accordions that never enter the viewport, so the browser never
decodes them. **UNVERIFIED as a defect** — confirming requires opening each tab
and carousel slide manually and watching them render. Worth a quick manual pass
on `/installatie/` (the Opstelling switcher) and `/klantverhalen/` during Lane 5
responsive QA.

---

## Notable clean results

Stated explicitly so they are not re-investigated:

- **No secrets exposed.** 12 secret patterns (AWS/Google/Stripe/Mollie keys,
  private-key blocks, bearer tokens, `api_key`/`password` assignments, DB
  credentials, SMTP passwords) scanned across 30 pages of rendered HTML — **zero
  hits**.
- **No personal data exposed.** Gravity Forms entries are not readable
  (`/wp-json/gf/v2/entries` → 404), the upload directory has no listing
  (200, 0 bytes) and its subdirectories are not guessable (404).
- **No directory listings anywhere.** All 9 listing probes returned 403 or an
  empty index.
- **No config or backup file exposed.** `.env`, `.git/config`, `.htaccess`,
  `wp-config.*` variants, `debug.log`, `error_log` — all 403.
- **Authenticated WooCommerce API is properly protected** (`/wp-json/wc/v3/products`
  → 401).
- **TLS is correctly configured**: valid Let's Encrypt wildcard through
  2026-10-18, TLS 1.2/1.3 only, TLS 1.0/1.1 disabled.
- **No outdated component found.** Core 7.0.2, WooCommerce 10.9.4 and CookieYes
  3.5.4 are each the current release per the WordPress.org API.
- **`/wp-admin/` correctly redirects to login when logged out** (302).
- **Console output is nearly clean**: 12 console errors total across 30 pages,
  **11 of them on `/installateurs/`** (F-10) and 1 on `/hoe-werkt-het/` (F-14).
  The homepage produced **0** console errors and **0** failed requests.
- **`fonts.cdnfonts.com` was not observed at all.** It does not appear in the
  homepage source and produced no request or 500 on any of the 30 pages. The
  known issue appears to be already resolved, or it lives on a surface outside
  this audit's scope.
- **Page titles are all present and unique** — 0 duplicates across 30 pages.
- **Every `<img>` on the site has an `alt` attribute** — 0 of 297 images are
  missing the attribute (23 use `alt=""`, correct for decorative images).
- **No link or button is missing an accessible name**, except 2 buttons on
  `/besparen/` (F-15).

---

## Suggested order of work

| Order | Findings | Rationale |
| --- | --- | --- |
| 1 — before anything else | F-1, F-2 | Cleartext transport and pre-consent tracking; both are live legal/security exposure |
| 2 — content, can run in parallel | F-4, F-5, F-6, F-17, F-10, F-14 | Everything a visitor or partner would see as unfinished |
| 3 — hardening | F-9, F-7, F-20, F-23 | Header and account-surface hardening |
| 4 — cutover gates | **F-3**, F-8, F-21 | Must be executed *at* the domain switch, then re-verified |
| 5 — quality | F-11 … F-19, F-24 … F-28 | SEO, accessibility and hygiene |

Findings F-3, F-8 and F-21 should be added to `work/launch/CUTOVER.md` as
blocking steps with an explicit post-switch verification run, since each is
either correct-for-staging-but-wrong-for-production (F-3) or only breaks at the
moment legacy is stopped (F-8, F-21).

---

## Accept gate E — Confirmed vs unverified

**CONFIRMED (directly observed, evidence quoted above):** F-1, F-2, F-3, F-4,
F-5, F-6, F-7, F-8, F-9, F-10, F-11, F-12, F-13, F-14, F-15, F-16, F-17, F-18,
F-19, F-20, F-21, F-24, F-25, F-26, F-27.

**UNVERIFIED — and what would confirm each:**

| Finding | Unverified element | Needed to confirm |
| --- | --- | --- |
| F-22 | Login rate limiting; 2FA enforcement | wp-admin → SiteGround Security → Login Security; per-user 2FA state. Cannot be tested externally without submitting credentials. |
| F-22 | `?author=2..5` enumeration | WAF returned 403 for the query pattern. Requires server-side confirmation that author archives are globally disabled. |
| F-23 | `/xmlrpc.php` disabled vs merely edge-blocked | Server config / SiteGround Security XML-RPC toggle. |
| F-24 | What `mcp/v1` and `wp-abilities/v1` expose and whether they are authenticated | wp-admin plugin list; review of the registering plugin's routes. |
| F-11 | Currency of GreenShift theme 2.6.5, greenshiftwoo 1.7, embedpress | wp-admin → Updates (non-repository plugins have no public version API). |
| F-27 | The four 403/999 external links | Manual click-through in a normal browser. |
| F-28 | 27 zero-dimension images that return HTTP 200 | Manual pass opening each tab/carousel on `/installatie/`, `/klantverhalen/`, `/zonnepanelen-dynamisch-contract/`, `/installateurs/`. |

---

*Read-only reconnaissance. No exploitation, authentication, or write attempt was
made at any point.*
