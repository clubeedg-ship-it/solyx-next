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
- [ ] **Import the 32 English blog posts** once WPML is installed. They are
      captured in `work/launch/lane3/blog/` and were deliberately held back
      because their `/en/` paths cannot become WordPress slugs without it.
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
- [ ] **Re-activate the WPML licence** for the live hostname — licences are tied
      to a domain.
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

## Not migrating, by decision

Customers, orders, stock and the database do not move from legacy. Production's
656 orders stay where they are.
