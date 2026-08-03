#!/usr/bin/env node
/**
 * Lane 2 — set EU standard VAT rates to their destination-country values.
 *
 * Staging had DE/AT/SE/FI/LU/DK all at 21% (the Dutch rate). That is only
 * correct for a seller below the EUR 10,000 EU distance-selling threshold who
 * has not registered for OSS. Once OSS applies, each destination country's own
 * standard rate must be charged, which is what this sets.
 *
 * NL 21% / 9% and BE 21% were already correct and are left alone. NO and CH are
 * non-EU exports at 0% and are left alone.
 *
 * Verify these percentages with the accountant before go-live; VAT rates change.
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";

// Standard VAT rates as of 2026.
const TARGET = {
  DE: { rate: "19.0000", name: "USt 19%" },
  AT: { rate: "20.0000", name: "USt 20%" },
  SE: { rate: "25.0000", name: "Moms 25%" },
  FI: { rate: "25.5000", name: "ALV 25,5%" },
  LU: { rate: "17.0000", name: "TVA 17%" },
  DK: { rate: "25.0000", name: "Moms 25%" },
};

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST)) || ctx.pages()[0];
  await page.goto(`https://${HOST}/wp-admin/edit.php?post_type=product`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");

  const out = await page.evaluate(async (TARGET) => {
    const nonce = window.wpApiSettings.nonce;
    const api = async (method, route, body) => {
      const r = await fetch(`/wp-json/wc/v3${route}`, {
        method,
        credentials: "same-origin",
        headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`${method} ${route} -> ${r.status} ${JSON.stringify(json).slice(0, 160)}`);
      return json;
    };

    const before = await api("GET", "/taxes?per_page=100");
    const changes = [];
    for (const rate of before) {
      const want = TARGET[rate.country];
      if (!want || rate.class !== "standard") continue;
      if (parseFloat(rate.rate) === parseFloat(want.rate)) continue;
      await api("PUT", `/taxes/${rate.id}`, { rate: want.rate, name: want.name });
      changes.push(`${rate.country}: ${parseFloat(rate.rate)}% -> ${parseFloat(want.rate)}%`);
    }
    const after = await api("GET", "/taxes?per_page=100");
    return {
      changes,
      rates: after
        .sort((a, b) => (a.country || "").localeCompare(b.country || ""))
        .map((r) => `${r.country || "*"} ${parseFloat(r.rate)}% "${r.name}" [${r.class}] shipping=${r.shipping}`),
    };
  }, TARGET);

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
