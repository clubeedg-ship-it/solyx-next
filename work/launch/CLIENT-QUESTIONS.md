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

### A2. Google Tag Manager — answered and installed
Container **GTM-PXFF53F** is live, loaded with Google Consent Mode set to denied
by default so no tag inside it can store anything until the visitor chooses.
Verified from a clean profile: before consent every signal reads denied and no
Google cookie is set; on accept they all flip to granted.

**Nothing further is needed from the client for this.** Analytics runs from
GA4 configured on the site, and the Meta pixel fires directly, so neither
depends on anyone building tags inside the container. The container is live
and receiving the commerce events if they ever want to use it; until then it
simply sits there doing no harm.

### A3. Meta Pixel — who owns it?
Not a request for an ID. There already is one, and it is live.

Pixel **2264362454021133** was pasted into the site's head code and, until
today, fired on the very first page view — dropping Meta's `_fbp` tracking
cookie while the visitor's own consent record still said advertising: no. It is
now gated: nothing loads until someone accepts advertising cookies.

The open question is ownership. That pixel belongs to *some* Meta Business
account, and every visitor it sees builds an audience inside that account. If it
was set up by a previous agency or a partner, they may still be collecting from
Solyx customers today.

- Does the client control the Meta Business account this pixel belongs to?
- If yes, keep it — history and audiences are preserved.
- If no, or nobody knows, replace it with a pixel in an account they own. The
  swap is one line.
- Separately: a Conversions API token, if they want server-side tracking as well
  as browser-side.

**The same question applies to Google.** A2 asks for a Tag Manager container ID,
A4 for an Analytics ID — but the more useful question is who holds those
accounts. A container someone else administers can push any tag onto the site at
any time, without touching WordPress.

### A4. Google Analytics — answered
Measurement ID **G-644YBV3GY2**.

Where it should live is now the only open point. It must be configured in
exactly one place, never both:
- **Inside GTM-PXFF53F**, as a GA4 configuration tag — the tidier option, and
  the one to choose if whoever administers that container is going to build the
  conversion tags anyway.
- **On the site directly**, which works today without waiting for container
  access.

Whichever is picked, the other must stay empty. Two GA4 configurations with the
same measurement ID double every page view and every conversion, and the
resulting numbers look plausible, which is what makes it dangerous.

### A5. WPML — account access, not a purchase
- **What:** the login for the existing **wpml.org account**. Nothing needs to be
  bought.
- **Why:** production already runs the paid WPML stack on `solyxenergy.nl`, and
  that is the domain this site launches on — the new build replaces it, it does
  not move to a different hostname. The licence that covers production covers
  the launched site.
- **Staging:** `2026.solyxenergy.nl` is a temporary hostname that disappears at
  cutover. WPML subscriptions include development/staging registrations under
  the same account, so staging costs nothing extra. It is registered from the
  account, not bought.
- **Blocked without it:** the English half of every lane — pages, forms,
  checkout, emails.
- **Not yet verified:** which WPML components production runs (CMS, String
  Translation, Translation Management are usually separate) and the renewal
  date. The production admin session had expired at the time of writing, so this
  needs one look at **Plugins → active** on production to make sure staging ends
  up with the same set.

### A6. Services running in production but not yet on the new site

**In scope — answered**

- **WooCommerce WeFact** — wanted. The API key has been supplied.
  **The key is deliberately not written into this repository.** It arrived over
  chat, which means it should be treated as exposed: paste it into the plugin
  settings and then regenerate it in WeFact, so the value that was in a message
  no longer works.
  Still to do: the WeFact plugin is not installed on the new site — production
  has it, staging never did.

- **MailerLite — dropped as a tool, but the newsletter stays described.** No
  MailerLite account is connected. The client chose to keep the newsletter
  wording in the privacy policy anyway, knowing it describes processing that is
  not currently running. The `marketingOptIn` field on the contact form (form 5)
  is therefore left in place: the form and the policy agree, and removing the
  field would have broken that agreement. If a newsletter is ever actually sent,
  nothing needs changing.

**Each of the two below is a yes/no, with a recommendation**

- **Hotjar** — records anonymised sessions and builds heatmaps of where people
  click and how far they scroll. It is a diagnostic tool for improving a page,
  not something customers benefit from.
  *Recommendation: leave it off at launch. It needs its own consent category,
  it slows pages down, and nobody reads the recordings unless there is a
  specific question to answer. Easy to add later if a page underperforms.*

- **Google for WooCommerce** — pushes the product catalogue to Google Merchant
  Center so the two products can appear in Google Shopping, both as free
  listings and as paid ads.
  *Recommendation: only worth connecting if the client intends to advertise on
  Google. It is a marketing decision with an ad budget attached, not launch
  infrastructure. The catalogue is two products; it can be connected any time
  after launch without rework.*

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

### B1. Belgium shipping — answered: free
Belgium ships free, same as the Netherlands. Needs setting on the Belgium
shipping zone in WooCommerce.

<!-- original question -->
Staging charges a €14.95 flat rate to Belgium while the Netherlands is free, but
every shop page advertises free shipping with no country caveat. The figure is
inherited from the old site, so it is not a decision. Either make Belgium free,
or keep a charge and add the caveat to the shop copy.

### B2. Homey price — answered: €611
The Homey variation is €611; the standard controller is €649.

<!-- original question -->
The static pages say **€611**. Legacy production and the old staging catalogue
both say **€625**. The client confirmed the static pages are authoritative, so
€611 is live — but the two sources disagreeing by €14 is worth an explicit yes.

### B3. The €1,725 package — not a question, closed
There is no separate package to itemise. The catalogue is two products:
Nymo without a boiler and Nymo with one, each with its own variations. The
most expensive variation is the all-inclusive one, and what it contains is
already described on the static product pages the site was built from.

This entry came from an earlier reading of a price that no longer exists in
the catalogue. Nothing is blocked by it.

### B4. Legal pages — privacy answered 7 Aug 2026 and live
She supplied a complete 12-section AVG policy dated 5 August 2026. It is live at
`/privacy/`, transcribed verbatim from her PDF with one approved addition: Meta
is named alongside Google in section 6, because the site runs an advertising
pixel that sends visitor data to Meta once marketing cookies are accepted.

She left the newsletter and MailerLite references in on purpose, having been
told they describe processing that is not currently running.

<!-- original entry -->

All three legal pages are now published with real text. The compliance blocker
is cleared; what remains is accuracy, not absence.

| Page | Source | Live size |
|---|---|---|
| Algemene voorwaarden | production `/algemene-voorwaarden/` | 21,461 chars, 16 articles |
| Levering en retourbeleid | production `/levering-en-retourbeleid/` | 3,146 chars |
| Privacy policy | transcribed from the May 2022 PDF | 3,818 chars |

The delivery page carries the legally required "Europese Unie 14 dagen
bedenktijd" — the EU 14-day right of withdrawal.

Both were rebuilt as WordPress core blocks after the first import: production's
Elementor markup carried fixed 1470px containers that clipped roughly 75% of the
terms text beyond reach on a 360px phone. Text was transcribed unchanged.

**The privacy policy needs four additions from the client.** It dates from May
2022 and predates most of what the site now does. Nothing in it is wrong; it is
incomplete. No legal wording was invented — the PDF was transcribed as-is.

1. **Address and photo data.** The policy lists name, town, phone, email and
   site activity. The installation form also collects a **home installation
   address and up to eight photographs of the customer's home** — meter
   cupboard, boiler, installation space. Neither is mentioned.
2. **Sharing with installers.** The form's required consent box says the
   submission is shared with the installer in the customer's region and points
   at this policy as the explanation. The policy only says data is shared where
   necessary to perform the agreement — it never names installers as recipients.
3. **Payment processing.** The webshop takes real payments through Mollie. The
   2022 policy predates the shop entirely and says nothing about payment data.
4. **Tracking.** Google Tag Manager, Analytics and the Meta Pixel are planned.
   The cookie section describes tracking cookies generically but names no
   provider and covers no transfer outside the EU.

**Also worth an explicit confirmation:** the returns text says return postage is
at the customer's cost unless the item is faulty, while the shop pages advertise
free shipping. Free outbound and paid return is a normal arrangement — it just
needs to be deliberate.

### B5. Product routing on the "Aan de slag" page
All five quiz outcomes still link nowhere. Three targets are obvious. The two
shop outcomes both point at the plain Nymo, which leaves the second launch
product — Nymo with boiler — with no purchase route from the quiz. Fixing that
may require an approved change to the quiz layout.

### B6. Invoice counter at cutover
Production is past invoice **656** and still issuing. Staging's counter was
deliberately left alone; it must be set to production's final number on cutover
day, or the accounting gets duplicate invoice numbers.

### B7. Publishing the home page — done, no longer a question
Migrated Home (626) is published and is the front page; `/` serves it. Nothing
to decide.

### B11. Three small content questions found while repairing dead links

- **No installation video exists.** A link on `/shop-complete-wateraccu/` reads
  "installatievideo". The site has exactly one video and it is the
  savings-process explainer, not an installation video. It now points at
  `/installatie/`, which is what a person clicking it actually wants, but the
  label still promises a video. Either the client supplies one, or the wording
  changes.
- **The Google reviews link is a search, not their profile.** "★★★★★ 4,7 op
  Google · Bekijk al onze reviews" points at
  `google.com/search?q=Solyx+Energy+reviews` — the same URL `/besparen/` already
  uses, so at least it is consistent. A direct link to their Google Business
  profile would be better, and only they can supply it.
- **Confirm the home page "Explainer video" link.** It now opens the
  savings-process video, the only one on the site. If a different video was
  intended, we need the file.

### B12. Shipping currently costs nothing
A real walk through checkout shows **verzending GRATIS** and a €649 total for a
standard Nymo. So free shipping is already configured for the Netherlands.
That is either the intended policy or a leftover — worth confirming in the same
breath as the Belgium question in B1, since a customer sees this number at the
moment they decide to pay.

### B13. Six old URLs have no obvious new home
The redirect table covers all 171 old URLs, but six need a decision. Interim
rules are already in place, so nothing 404s while she thinks.

- `/sitemap/` and `/en/sitemap-2/` — the old site had an HTML sitemap page; the
  new one does not. Currently sent to `/`.
- `/thank-you/` and `/en/thank-you-2/` — an old confirmation page. It is unclear
  whether it followed a form submission or a purchase. Currently sent to
  `/installatie-formulier/`.
- `/contact/` and `/en/contact-2/` — currently sent to `/over-ons/`, and the
  real answer depends on B10.

### B10. Contact page — answered: there isn't one, send it to the FAQ
Decision: no contact page is built. `/contact/` and `/en/contact-2/` redirect to
`/faq/`, which carries the working contact form, and the footer's "Contact" link
already points there.

Redirect table updated accordingly — the interim `/over-ons/` rule is gone.

Worth keeping an eye on after launch: the FAQ page has to actually read as the
place to reach Solyx. If the contact form sits far down the page, someone
arriving from a `/contact/` bookmark may not find it. An anchor on the redirect
target would fix that in one line if it turns out to be a problem.

### B8. The two unwritten pages — answered 7 Aug 2026, and done
Client's answers, applied:

- **Zonnestroomboiler** → the landing page she supplied is the existing
  `landingspagina`. `/zonnestroomboiler/` now 301s to `/landingspagina/` and the
  footer link points straight there.
- **Werken bij** → the vacancies section of Over ons. `/werken-bij/` now 301s to
  `/over-ons/#vacatures`, and the footer link goes there directly. That page's
  rail scrolls by index rather than by anchor, so the hash is translated into the
  rail's own action instead of a second scrolling mechanism being invented.

Both old paths are kept alive rather than deleted, so existing links still work.
No page on the site says "onder constructie" any more.

### B9. The savings figure shown on the home page
The home calculator was migrated as a static mock and has been made to work
again. Its numbers now follow the `/besparen/` calculator exactly, so the two
pages agree — €342 for the default 8 panels and 3 people.

Worth a client sanity check: the old static home page carried a *different*
formula that returned €130 for that same input, while the panel directly above
it claims €338 for 3 people with 10 panels. Those three numbers never agreed
with each other in the source material. The site is now self-consistent, but
the client should confirm the `/besparen/` model is the one they stand behind,
because it is what customers now see everywhere.
