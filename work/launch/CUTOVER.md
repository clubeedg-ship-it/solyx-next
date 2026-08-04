# Cutover checklist

Everything that must happen when staging takes over the live domain. Items were
scattered across the lane notes; this is the single list.

Order matters where noted.

---

## Before the switch

- [ ] **Build the 301 redirect table** from production's real URL inventory
      (76 pages, 75 posts). Write every rule root-relative — `/old/ → /new/`,
      never with a hostname — so it survives the domain change untouched.
      See `REDIRECT-MAP.md` §5.
- [ ] **Confirm the blog decision is executed.** Production has 75 published
      posts; staging has none. `blog-news` links 35 of them. See `SEO-PLAN.md` §2.1.
- [ ] **Migrate the manuals and datasheets** into the new media library — 6 PDFs
      from the guides page plus the privacy statement linked by both forms.
      They currently point at the legacy site and die with it.
      See `REDIRECT-MAP.md` §4a.
- [ ] **Sideload the blog images.** 43 Dutch posts are imported and live, but
      **115 of their 119 images still load from the legacy domain**. They render
      today only because legacy is still up; they break the instant it stops.
      WordPress must pull each image into its own media library and the post
      content be rewritten to the new URLs.
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
- [ ] Confirm **Mollie's webhook** reaches the new domain.
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
