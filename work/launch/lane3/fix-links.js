#!/usr/bin/env node
/**
 * Repair dead and legacy links inside published page content on staging.
 *
 * Only links whose target is confirmed are touched:
 *  - the five footer legal links, whose targets are already present and correct
 *    in ten other pages' footers
 *  - the Google reviews badge, whose URL appears verbatim in three static pages
 *  - legacy `*.html` links, mapped to the live slug
 *
 * Social icons and page CTAs are deliberately NOT touched: no real URLs exist
 * for the former, and the latter are product decisions.
 *
 * Every URL written is root-relative with a trailing slash so it survives the
 * domain change untouched.
 *
 * Usage: node fix-links.js            (dry run, reports counts, writes nothing)
 *        node fix-links.js --apply    (writes)
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";
const APPLY = process.argv.includes("--apply");

// Anchor text -> target. Confirmed from pages that are already wired correctly.
const LABEL_MAP = {
  Zonnestroomboiler: "/zonnestroomboiler/",
  "Werken bij": "/werken-bij/",
  "Algemene voorwaarden": "/algemene-voorwaarden/",
  "Privacy policy": "/privacy/",
  "Levering en retourbeleid": "/levering-en-retourbeleid/",
};

// Legacy static filenames -> live paths.
const HTML_MAP = {
  "home.html": "/",
  "hoe-werkt-het.html": "/hoe-werkt-het/",
  "besparen.html": "/besparen/",
  "how-to-get-it.html": "/how-to-get-it/",
  "faq.html": "/faq/",
  "shop.html": "/solyx-shop/",
  "shop-nymo.html": "/shop-nymo/",
  "shop-complete-wateraccu.html": "/shop-complete-wateraccu/",
  "wateraccu.html": "/wateraccu/",
  "zonnestroomboiler.html": "/zonnestroomboiler/",
  "installatie.html": "/installatie/",
  "installatie-formulier.html": "/installatie-formulier/",
  "installatie-formulier-boilergarant.html": "/installatie-formulier-boilergarant/",
  "installateurs.html": "/installateurs/",
  "klantverhalen.html": "/klantverhalen/",
  "over-ons.html": "/over-ons/",
  "werken-bij.html": "/werken-bij/",
  "handleidingen.html": "/handleidingen/",
  "blog-news.html": "/blog-news/",
  "landingspagina.html": "/landingspagina/",
  "privacy.html": "/privacy/",
  "algemene-voorwaarden.html": "/algemene-voorwaarden/",
  "levering-en-retourbeleid.html": "/levering-en-retourbeleid/",
};

const GOOGLE_REVIEWS = "https://www.google.com/search?q=Solyx+Energy+reviews";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page =
    ctx.pages().find((p) => p.url().includes(`${HOST}/wp-admin`)) ||
    ctx.pages().find((p) => p.url().includes(HOST) && !p.url().includes("wp-login"));
  if (!page) throw new Error("no usable staging tab");

  await page.goto(`https://${HOST}/wp-admin/edit.php?post_type=page`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  if (!(await page.evaluate(() => !!document.querySelector("#wpadminbar")))) {
    throw new Error("STAGING_SESSION_EXPIRED");
  }

  const result = await page.evaluate(
    async ({ LABEL_MAP, HTML_MAP, GOOGLE_REVIEWS, APPLY }) => {
      const nonce = window.wpApiSettings.nonce;
      const api = async (m, r, b) => {
        const res = await fetch(`/wp-json${r}`, {
          method: m,
          credentials: "same-origin",
          headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
          body: b ? JSON.stringify(b) : undefined,
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`${m} ${r} -> ${res.status}`);
        return j;
      };
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const pages = await api("GET", "/wp/v2/pages?status=publish&per_page=100&context=edit&_fields=id,slug,content");
      const rows = [];
      let totals = { labels: 0, google: 0, html: 0, deadBefore: 0, deadAfter: 0 };

      for (const p of pages) {
        let html = (p.content && p.content.raw) || "";
        if (!html) continue;
        const before = (html.match(/href="#"/g) || []).length;
        let labels = 0,
          google = 0,
          htmlLinks = 0;

        // 1. Footer legal links: only anchors whose visible text is the label.
        for (const [label, target] of Object.entries(LABEL_MAP)) {
          const re = new RegExp(`(<a\\b[^>]*?)href="#"([^>]*?>\\s*${esc(label)}\\s*<\\/a>)`, "g");
          html = html.replace(re, (_m, a, b) => {
            labels++;
            return `${a}href="${target}"${b}`;
          });
        }

        // 2. Google reviews badge: anchor containing that phrase anywhere inside.
        const gre = /(<a\b[^>]*?)href="#"([^>]*?>(?:(?!<\/a>)[\s\S])*?Google reviews(?:(?!<\/a>)[\s\S])*?<\/a>)/g;
        html = html.replace(gre, (_m, a, b) => {
          google++;
          return `${a}href="${GOOGLE_REVIEWS}"${b}`;
        });

        // 3. Legacy .html links -> live paths (preserving any #anchor).
        for (const [file, target] of Object.entries(HTML_MAP)) {
          const re = new RegExp(`href="${esc(file)}(#[^"]*)?"`, "g");
          html = html.replace(re, (_m, frag) => {
            htmlLinks++;
            return `href="${target}${frag || ""}"`;
          });
        }

        const after = (html.match(/href="#"/g) || []).length;
        if (labels || google || htmlLinks) {
          if (APPLY) await api("POST", `/wp/v2/pages/${p.id}`, { content: html });
          rows.push({ id: p.id, slug: p.slug, labels, google, htmlLinks, deadBefore: before, deadAfter: after });
          totals.labels += labels;
          totals.google += google;
          totals.html += htmlLinks;
        }
        totals.deadBefore += before;
        totals.deadAfter += after;
      }
      return { applied: APPLY, pagesChanged: rows.length, totals, rows };
    },
    { LABEL_MAP, HTML_MAP, GOOGLE_REVIEWS, APPLY }
  );

  console.log(JSON.stringify(result, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
