# Cutover checklist

Everything that must happen when staging takes over the live domain. Items were
scattered across the lane notes; this is the single list.

Order matters where noted.

---

## Before the switch

- [x] **301 redirect table built and verified** — `lane6/redirects.csv`
      (171 rows) with the reasoning in `lane6/REDIRECTS.md`. Independently
      re-checked, not taken on trust: all 171 production URLs covered exactly
      once, zero absolute targets, and every 301 lands on a route that actually
      exists. 55 exact, 60 renamed, 50 judgement, 6 needing a client decision
      (CLIENT-QUESTIONS B13). Ten URLs get a 410 rather than a redirect —
      author archives and a WooCommerce shipping-class archive — deliberately
      de-indexed instead of soft-404'd to the homepage.
      **Every `/en/` rule is temporary** and must be deleted once WPML restores
      the English pages, or the new English site will redirect to Dutch.
- [x] **Absolute staging URLs swept — none left.** Page content, posts, both
      template parts, every WPCode snippet and the header/footer fields now
      contain zero hard-coded `2026.solyxenergy.nl` links. The Nymo widget on
      `/hoe-werkt-het/` held ten of them, and two pointed at routes that do not
      exist on this site at all — `/winkel/` and `/ik-wil-de-wateraccu/`, both
      pre-migration names on the widget's buy buttons, so they were 404ing for
      customers today, not just at cutover. Now `/shop/` and `/how-to-get-it/`.
      Absolute URLs still appear in rendered pages, but those are WordPress's own
      `home_url()` output and follow the site URL automatically.
- [x] **Blog decision executed.** 43 Dutch posts are imported and live. The ~32
      English ones are held for the WPML phase after cutover.
- [x] **Migrate the manuals and datasheets** — done. 9 PDFs (the Nymo and Solar
      iBoost manuals in NL/UK/DE/FR, plus the privacy statement linked by both
      forms) and one video are now hosted on the new site; 18 references across
      7 pages and posts were rewritten, and all ten serve 200. Nothing on the
      site loads from the legacy domain any more, so switching it off breaks
      nothing.
      A server-side sideload cannot do this — the legacy host answers
      non-browser requests with a 202 challenge, which is what made the earlier
      PHP attempt record them as permanent failures. The files were fetched
      same-origin from a browser tab on the legacy domain instead.
      One casualty: the Gawalo publisher logo in post 969 was already 404 on the
      legacy site in all three sizes, so there was nothing to migrate. The dead
      `<img>` was removed; the article text is untouched.
- [x] **Blog images resolved.** A full re-scan of all 70 pages and posts finds
      **zero** remaining references to the legacy domain. The earlier "115 of
      119 images" figure is stale — those images were pulled across by the
      sideload passes; only the files listed above were left, and they are done.
- [ ] Record production's **final invoice number**. Staging's counter was
      deliberately left alone to avoid duplicate numbers across two live systems.

## At the switch

- [ ] **Search-and-replace the media URLs.** WordPress stores upload URLs
      absolutely, so images and PDFs still carry the old hostname. One pass over
      `wp_posts` and `wp_postmeta` replacing the staging host with the live host.
      This is the only thing the root-relative link rule does not solve — every
      internal page link already works on any domain without change.
- [ ] Switch **domain and SSL** to the new site.
- [ ] **Turn off Under Construction** so the public can reach the site.
- [ ] **Switch search engine indexing back ON.** It is currently discouraged
      because staging is a clone. Leave it off and the new site is invisible in
      search, and nobody notices for weeks. This is the highest-consequence item
      on this list.
- [ ] Set the **invoice counter** to production's final number.
- [ ] Load the **301 redirect table**.

## After the switch

- [ ] Verify the domain in **Search Console**, submit the sitemap, and watch
      coverage for two weeks.
- [ ] **Send a real test email** from the live domain and confirm delivery —
      the mail server is the same, but the sending host changes.
- [ ] **Place a real order** end to end: cart, checkout, Mollie payment,
      order status, confirmation email, invoice attachment.
- [x] **The bot challenge does not block callbacks or crawlers — tested, not
      assumed.** A plain server-to-server POST shaped like Mollie's webhook
      reaches WordPress: 404/400/401 come back from WordPress and the plugin, not
      a captcha. Googlebot, Bingbot, a curl-style agent and a browser all receive
      the full page with a 200. The 202 challenges seen earlier — which is what
      made the server-side media migration fail — are rate-triggered, not policy,
      so they can still appear under bursts of automated traffic. Re-check after
      the domain switch, since the challenge is configured per site.
- [ ] Spot-check the redirect table against real old URLs.
- [ ] **Stop the legacy site** only once the above pass.

---

---

## English, after the switch — client observation, not a question

The site launches in Dutch only. That is a decision, not a gap: nothing is
half-translated and no visitor sees an empty English page. English becomes a
separate phase once the site is live on its real domain.

**What we need from the client: one line of text — the WPML site key.**

Not an API key, not their WordPress login, and nothing to buy.

How it actually works, so the ask is clear in the meeting:

1. WPML is a paid plugin the client already owns. Their subscription lives in an
   account on **wpml.org**, and it is already registered to `solyxenergy.nl`,
   because that is what production runs today.
2. A WPML **site key** is a short string tied to a domain. Because the new site
   launches on that same domain, the registration they already have is the one
   we use. The old install being switched off does not affect it — the key
   belongs to the domain, not to the installation.
3. The client logs in at wpml.org, opens their site `solyxenergy.nl`, copies the
   site key, and sends it to us. If the old install still holds it, they reset
   the key from that same screen and send the new one.
4. We paste it into WordPress. From that point WordPress can download and update
   the WPML components by itself — no file transfers, no further logins.

If the client would rather not handle it, the alternative is that they give us
the wpml.org account login and we take the key ourselves. Either route works;
the key is the only thing that has to travel.

**Then a second, separate decision — who translates.** Registering WPML only
provides the machinery. The Dutch content still has to become English one of
three ways: the client writes it, a translator is hired, or WPML's automatic
translation does it. Only the third has an extra cost — it runs on credits that
are bought on top of the subscription. This decision can wait until the site is
live; it changes nothing about the launch.

Held for this phase: the **32 English blog posts** in
`work/launch/lane3/blog/`, captured and ready. Their `/en/` paths cannot become
WordPress slugs until WPML is registered.

---

## Not migrating, by decision

Customers, orders, stock and the database do not move from legacy. Production's
656 orders stay where they are.
