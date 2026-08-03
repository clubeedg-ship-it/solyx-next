#!/usr/bin/env node
/**
 * Lane 2 — make WooCommerce treat catalogue prices as BTW-inclusive.
 *
 * The static HTML states every price "inclusief 21% btw", so WooCommerce must
 * be told prices already contain tax and a 21% NL standard rate must exist,
 * otherwise checkout would add 21% on top of e.g. EUR 649.
 *
 * Reports the before/after state; only writes what is actually wrong.
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST)) || ctx.pages()[0];
  await page.goto(`https://${HOST}/wp-admin/edit.php?post_type=product`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");

  const out = await page.evaluate(async () => {
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
    const val = (group, id) => (group.find((s) => s.id === id) || {}).value;

    const log = {};
    const taxSettings = await api("GET", "/settings/tax");
    log.before = {
      pricesIncludeTax: val(taxSettings, "woocommerce_prices_include_tax"),
      taxBasedOn: val(taxSettings, "woocommerce_tax_based_on"),
      displayShop: val(taxSettings, "woocommerce_tax_display_shop"),
      displayCart: val(taxSettings, "woocommerce_tax_display_cart"),
    };

    log.writes = [];
    if (log.before.pricesIncludeTax !== "yes") {
      await api("PUT", "/settings/tax/woocommerce_prices_include_tax", { value: "yes" });
      log.writes.push("prices_include_tax -> yes");
    }
    // Customers should see the same BTW-inclusive figure the pages advertise.
    if (log.before.displayShop !== "incl") {
      await api("PUT", "/settings/tax/woocommerce_tax_display_shop", { value: "incl" });
      log.writes.push("tax_display_shop -> incl");
    }
    if (log.before.displayCart !== "incl") {
      await api("PUT", "/settings/tax/woocommerce_tax_display_cart", { value: "incl" });
      log.writes.push("tax_display_cart -> incl");
    }

    const rates = await api("GET", "/taxes?per_page=100");
    log.existingRates = rates.map((r) => `${r.id} ${r.country || "*"} ${r.rate}% "${r.name}" class=${r.class}`);
    const nl21 = rates.find((r) => r.country === "NL" && parseFloat(r.rate) === 21 && r.class === "standard");
    if (!nl21) {
      const created = await api("POST", "/taxes", {
        country: "NL",
        rate: "21.0000",
        name: "BTW 21%",
        shipping: true,
        class: "standard",
      });
      log.writes.push(`created NL 21% rate id ${created.id}`);
    }

    const afterTax = await api("GET", "/settings/tax");
    log.after = {
      pricesIncludeTax: val(afterTax, "woocommerce_prices_include_tax"),
      displayShop: val(afterTax, "woocommerce_tax_display_shop"),
      displayCart: val(afterTax, "woocommerce_tax_display_cart"),
    };
    log.ratesAfter = (await api("GET", "/taxes?per_page=100")).map(
      (r) => `${r.id} ${r.country || "*"} ${r.rate}% "${r.name}"`
    );

    // What a customer would actually be charged.
    const set = (await api("GET", "/products?sku=NYMO-SET"))[0];
    const nymo = (await api("GET", "/products?sku=NYMO"))[0];
    log.priceRanges = {
      nymo: nymo ? `${nymo.name}: ${nymo.price_html.replace(/<[^>]*>/g, "")}` : null,
      set: set ? `${set.name}: ${set.price_html.replace(/<[^>]*>/g, "")}` : null,
    };

    // Payment gateways currently enabled.
    const gateways = await api("GET", "/payment_gateways");
    log.gateways = gateways.map((g) => `${g.id}: ${g.enabled ? "ON " : "off"} ${g.title}`);
    return log;
  });

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
