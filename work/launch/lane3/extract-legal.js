#!/usr/bin/env node
/**
 * Pull the real legal text off legacy production and save it for import.
 *
 * Staging's privacy, terms and delivery/returns pages are all placeholders
 * reading "this page will be filled in shortly". Production carries the real
 * copy. This reads the public pages through the user's Arc browser (production
 * answers automated fetches with a bot challenge, which a real browser passes
 * normally) and writes each one to work/launch/lane3/legal/.
 *
 * Read-only against production. Nothing is written to either site.
 */
const fs = require("node:fs");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const PROD = "www.solyxenergy.nl";
const OUT = path.resolve(__dirname, "legal");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(PROD)) || ctx.pages()[0];

  // 1. Find the legal links from the live footer, rather than guessing slugs.
  await page.goto(`https://${PROD}/algemene-voorwaarden/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const found = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll("a[href]").forEach((a) => {
      const t = (a.textContent || "").toLowerCase().trim();
      const h = a.href;
      if (!h.includes(location.hostname)) return;
      if (/privacy/.test(t) && !out.privacy) out.privacy = h;
      if (/algemene voorwaarden|voorwaarden/.test(t) && !out.terms) out.terms = h;
      if (/levering|retour/.test(t) && !out.delivery) out.delivery = h;
    });
    return out;
  });

  const targets = {
    terms: found.terms || `https://${PROD}/algemene-voorwaarden/`,
    privacy: found.privacy,
    delivery: found.delivery || `https://${PROD}/levering-en-retourbeleid/`,
  };

  const report = {};
  for (const [name, url] of Object.entries(targets)) {
    if (!url) {
      report[name] = { error: "no URL found in footer" };
      continue;
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    const extracted = await page.evaluate(() => {
      // Strip chrome that is not the legal text itself.
      const drop = [
        "header", "nav", "footer", "#cookiescript_injected", "[id*=cookie]", "[class*=cookie]",
        "script", "style", "noscript", ".elementor-location-header", ".elementor-location-footer",
      ];
      const clone = document.body.cloneNode(true);
      drop.forEach((sel) => clone.querySelectorAll(sel).forEach((el) => el.remove()));

      // Pick the densest plausible content container.
      const candidates = [
        ".entry-content", ".elementor-widget-theme-post-content", "article", "main",
        ".elementor-location-single", "#content",
      ];
      let best = null;
      for (const sel of candidates) {
        clone.querySelectorAll(sel).forEach((el) => {
          const len = (el.innerText || "").trim().length;
          if (!best || len > best.len) best = { el, len, sel };
        });
      }
      const el = best ? best.el : clone;
      return {
        selector: best ? best.sel : "body",
        chars: (el.innerText || "").trim().length,
        html: el.innerHTML,
        text: (el.innerText || "").trim(),
        title: document.title,
      };
    });

    const slug = new URL(url).pathname.replace(/\//g, "") || name;
    fs.writeFileSync(path.join(OUT, `${name}.html`), extracted.html);
    fs.writeFileSync(path.join(OUT, `${name}.txt`), extracted.text);
    report[name] = {
      url,
      slug,
      title: extracted.title,
      selector: extracted.selector,
      chars: extracted.chars,
      firstLine: extracted.text.split("\n").find((l) => l.trim().length > 20) || "",
    };
  }

  console.log(JSON.stringify(report, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
