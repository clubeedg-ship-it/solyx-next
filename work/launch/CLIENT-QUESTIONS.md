# Client questions

Everything that cannot be resolved from the code, the staging site, or the
static pages. Two kinds: credentials we must be given, and decisions only the
business can make. Nothing here is blocked on us.

Staging is a clone of an old production site, so no setting found there counts
as an answer — it is inherited until the client confirms it.

---

## A — Credentials and access

### A1. SMTP password — blocking
- **What:** the mailbox password for `noreply@solyxenergy.nl` on
  `mail.solyxenergy.nl` (SSL, port 465, authentication on).
- **Why:** WordPress otherwise sends through the server's unauthenticated mail
  function, which Gmail and Outlook routinely discard.
- **Blocked without it:** proof that quotation-form notifications reach
  `info@solyxenergy.nl`, and every WooCommerce order email — order confirmation,
  processing, invoice attachment.
- **State:** everything else is configured and verified on staging; only this
  field is empty. The client should type it into the staging WP Mail SMTP
  settings directly — it should not travel through chat, email, or the repo.

### A2. Google Tag Manager container ID
- **What:** the `GTM-XXXXXXX` container ID, plus access to the Tag Manager
  account if tags must be built rather than just fired.
- **Why:** production runs Tag Manager; the new site has no tracking at all.
- **Blocked without it:** the whole tracking lane, including the eight required
  events (quote started, quote step completed, lead generated, item viewed, add
  to cart, cart viewed, checkout begun, purchase).

### A3. Meta Pixel ID
- **What:** the pixel ID. Separately, a Conversions API token if server-side
  tracking is wanted rather than browser-only.
- **Blocked without it:** Meta conversion tracking.

### A4. Google Analytics measurement ID
- **What:** the `G-XXXXXXX` ID, unless analytics is fired entirely from inside
  the Tag Manager container — the client should confirm which.

### A5. WPML licence key
- **What:** a site key for `2026.solyxenergy.nl`. WPML is paid, and a key is
  tied to a domain.
- **Why:** production uses the full WPML stack for Dutch/English.
- **Blocked without it:** the English half of every lane — pages, forms,
  checkout, emails.
- **Note:** the client should confirm the domain the key is registered to; a
  second activation may be needed for the production hostname at cutover.

### A6. Services running in production but not yet in the launch scope
Confirm for each whether it is wanted on the new site; each needs its own
credentials if so.
- **MailerLite** — marketing email, connected to both the forms and the shop in
  production. Needs an API key.
- **WooCommerce WeFact** — Dutch accounting integration. Needs API credentials.
- **Hotjar** — behaviour analytics. Needs a site ID.
- **Google for WooCommerce** — product feed and ads. Needs an account link.

### A7. Cutover access — later, not now
- Domain, DNS and SSL control for the switch to the live hostname.
- Hosting panel access to stop the legacy site afterwards.

### Needs no credentials — confirmed
- **PDF invoices.** Replicated from production and fully working on the free
  plugin. No licence or API key involved.
- **Gravity Forms.** Staging already carries a valid Elite licence, active until
  June 2027.
- **Gravity Forms Zero Spam.** Free, installed, verified.
- **Mollie.** The live API key is already in place on staging.

---

## B — Business decisions

### B1. Belgium shipping cost
Staging charges a €14.95 flat rate to Belgium while the Netherlands is free, but
every shop page advertises free shipping with no country caveat. The figure is
inherited from the old site, so it is not a decision. Either make Belgium free,
or keep a charge and add the caveat to the shop copy.

### B2. Price of the Homey unit — €611 or €625
The static pages say **€611**. Legacy production and the old staging catalogue
both say **€625**. The client confirmed the static pages are authoritative, so
€611 is live — but the two sources disagreeing by €14 is worth an explicit yes.

### B3. What is in the €1,725 installed package
Does not reconcile with €1,189 plus roughly €400 for installation. It works only
if the package assumes the 150-litre tank (€1,329 + ~€400). Needed before that
tier is advertised.

### B4. Legal pages are all empty — HARD BLOCKER for going live
Not just delivery and returns. **All three legal pages are placeholders** that
read "this page will be filled in shortly":

| Page | Status |
|---|---|
| Privacy policy | placeholder, 733 characters |
| Levering en retourbeleid (delivery & returns) | placeholder, 751 characters |
| Algemene voorwaarden (terms & conditions) | placeholder, 778 characters |

A Dutch webshop taking real payments must publish terms, a privacy policy, and
delivery/returns including the 14-day right of withdrawal. Going live without
them is a compliance failure, not a content gap.

**Two of the three are solved.** The real text was pulled off live production
and saved to `work/launch/lane3/legal/`, ready to import:

| Page | Source | Size | Status |
|---|---|---|---|
| Algemene voorwaarden (terms) | `/algemene-voorwaarden/` | 21,891 chars | captured, ready |
| Levering en retourbeleid | `/levering-en-retourbeleid/` | 3,599 chars | captured, ready |
| Privacy policy | **no page exists** | — | see below |

The delivery text does cover the legally required point: a 15-day return window
plus an explicit "Europese Unie 14 dagen bedenktijd" section — the EU 14-day
right of withdrawal. It also states return postage is at the customer's cost
unless the item is faulty, which sits alongside the free *outbound* shipping the
shop pages advertise. Not contradictory, but worth the client confirming.

**Privacy policy — still an open question.** Production has no privacy page at
all. Its footer links to a PDF, `Privacy-Verklaring-Solyx-Energy.pdf`, uploaded
in **May 2022**. Two problems: a PDF is a poor home for a policy the site must
link from cookie banners, forms and checkout, and a 2022 document predates the
current shop, the forms, and any tracking now planned. The client needs to
decide: convert and update the PDF into a real page, or supply new copy.

**To import the two captured pages:** a working staging admin session.

### B5. Product routing on the "Aan de slag" page
All five quiz outcomes still link nowhere. Three targets are obvious. The two
shop outcomes both point at the plain Nymo, which leaves the second launch
product — Nymo with boiler — with no purchase route from the quiz. Fixing that
may require an approved change to the quiz layout.

### B6. Invoice counter at cutover
Production is past invoice **656** and still issuing. Staging's counter was
deliberately left alone; it must be set to production's final number on cutover
day, or the accounting gets duplicate invoice numbers.

### B7. Publishing the home page
The front-page setting still points at the old home page, now trashed. It needs
to point at migrated Home (page 626), which means publishing 626 — a publish
decision, not a technical one.
