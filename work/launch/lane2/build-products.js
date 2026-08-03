#!/usr/bin/env node
/**
 * Lane 2 — rebuild the staging catalogue as the two launch products.
 *
 * Trashes the previous 13-product component catalogue (recoverable from
 * Products > Trash) and creates:
 *   1. Nymo WaterAccu            — variable on uitvoering (Standaard / Homey)
 *   2. Nymo WaterAccu met boiler — variable on uitvoering x boiler
 *
 * Prices come from the static HTML configurator, which the user confirmed is
 * authoritative over the previous WooCommerce values. All prices include 21%
 * BTW. Set prices are Nymo + boiler, matching refreshPrice() in
 * shop-complete-wateraccu.html.
 *
 * Drives the WooCommerce REST API through the user's authenticated Arc session
 * over CDP (cookie + X-WP-Nonce), so no API keys are created or stored.
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";

const NYMO = { Standaard: 649, Homey: 611 };
const BOILERS = [
  { label: "Staal verticaal 100L", price: 540, sku: "STEEL-V-100" },
  { label: "Staal verticaal 120L", price: 610, sku: "STEEL-V-120" },
  { label: "Staal verticaal 150L", price: 680, sku: "STEEL-V-150" },
  { label: "Staal horizontaal 100L", price: 465, sku: "STEEL-H-100" },
  { label: "Staal horizontaal 120L", price: 495, sku: "STEEL-H-120" },
  { label: "Staal horizontaal 150L", price: 540, sku: "STEEL-H-150" },
  { label: "RVS verticaal 200L", price: 1119, sku: "RVS-V-200" },
];

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST)) || ctx.pages()[0];
  await page.goto(`https://${HOST}/wp-admin/edit.php?post_type=product`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");

  const result = await page.evaluate(
    async ({ NYMO, BOILERS }) => {
      const nonce = window.wpApiSettings && window.wpApiSettings.nonce;
      if (!nonce) throw new Error("no REST nonce");
      const api = async (method, route, body) => {
        const r = await fetch(`/wp-json/wc/v3${route}`, {
          method,
          credentials: "same-origin",
          headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`${method} ${route} -> ${r.status} ${JSON.stringify(json).slice(0, 200)}`);
        return json;
      };

      const log = { trashed: [], created: [], variations: {} };

      // 1. Trash every existing product (recoverable; force omitted).
      const existing = await api("GET", "/products?per_page=100&status=any");
      for (const p of existing) {
        await api("DELETE", `/products/${p.id}`);
        log.trashed.push(`${p.id} ${p.sku || ""} ${p.name}`.trim());
      }

      const base = {
        type: "variable",
        status: "publish",
        catalog_visibility: "visible",
        tax_status: "taxable",
        tax_class: "",
        manage_stock: false,
        stock_status: "instock",
      };

      // 2. Nymo WaterAccu — uitvoering only.
      const nymo = await api("POST", "/products", {
        ...base,
        name: "Nymo WaterAccu",
        sku: "NYMO",
        short_description: "De Nymo WaterAccu-controller. Prijzen inclusief 21% btw.",
        attributes: [
          { name: "Uitvoering", position: 0, visible: true, variation: true, options: Object.keys(NYMO) },
        ],
      });
      log.created.push(`${nymo.id} Nymo WaterAccu`);
      log.variations[nymo.id] = [];
      for (const [uitvoering, price] of Object.entries(NYMO)) {
        const v = await api("POST", `/products/${nymo.id}/variations`, {
          regular_price: String(price),
          sku: `NYMO-${uitvoering.toUpperCase()}`,
          attributes: [{ name: "Uitvoering", option: uitvoering }],
        });
        log.variations[nymo.id].push(`${v.sku} EUR ${price}`);
      }

      // 3. Nymo WaterAccu met boiler — uitvoering x boiler, price is the sum.
      const set = await api("POST", "/products", {
        ...base,
        name: "Nymo WaterAccu met boiler",
        sku: "NYMO-SET",
        short_description:
          "De Nymo WaterAccu inclusief boiler. Prijzen inclusief 21% btw. " +
          "Andere boilerformaten leveren we op factuurbasis — vraag een offerte aan.",
        attributes: [
          { name: "Uitvoering", position: 0, visible: true, variation: true, options: Object.keys(NYMO) },
          { name: "Boiler", position: 1, visible: true, variation: true, options: BOILERS.map((b) => b.label) },
        ],
      });
      log.created.push(`${set.id} Nymo WaterAccu met boiler`);
      log.variations[set.id] = [];
      for (const [uitvoering, nymoPrice] of Object.entries(NYMO)) {
        for (const b of BOILERS) {
          const total = nymoPrice + b.price;
          const v = await api("POST", `/products/${set.id}/variations`, {
            regular_price: String(total),
            sku: `SET-${uitvoering.toUpperCase()}-${b.sku}`,
            attributes: [
              { name: "Uitvoering", option: uitvoering },
              { name: "Boiler", option: b.label },
            ],
          });
          log.variations[set.id].push(`${v.sku} EUR ${total}`);
        }
      }

      // 4. Read back what is actually live.
      const after = await api("GET", "/products?per_page=100&status=any");
      log.live = after.map((p) => `${p.id} ${p.type} ${p.status} ${p.sku} "${p.name}" ${p.price_html ? "" : ""}`.trim());
      return log;
    },
    { NYMO, BOILERS }
  );

  console.log(JSON.stringify(result, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
