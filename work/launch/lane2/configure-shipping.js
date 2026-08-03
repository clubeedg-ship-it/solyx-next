#!/usr/bin/env node
/**
 * Lane 2 — free shipping for the Netherlands and Belgium.
 *
 * The site advertises free delivery within 3 working days on every shop page,
 * so shipping is a zero-cost method rather than a priced one. Installation is
 * deliberately NOT a shipping option: the site prices it per situation, so it
 * runs through the quotation forms, not the cart.
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";

const ZONE_NAME = "Nederland & Belgie";
const COUNTRIES = ["NL", "BE"];

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST)) || ctx.pages()[0];
  await page.goto(`https://${HOST}/wp-admin/edit.php?post_type=product`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");

  const out = await page.evaluate(
    async ({ ZONE_NAME, COUNTRIES }) => {
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

      const log = { actions: [] };
      const zones = await api("GET", "/shipping/zones");
      log.zonesBefore = zones.map((z) => `${z.id}:${z.name}`);

      let zone = zones.find((z) => z.name === ZONE_NAME);
      if (!zone) {
        zone = await api("POST", "/shipping/zones", { name: ZONE_NAME, order: 1 });
        log.actions.push(`created zone ${zone.id} "${ZONE_NAME}"`);
      }

      await api("PUT", `/shipping/zones/${zone.id}/locations`, COUNTRIES.map((c) => ({ code: c, type: "country" })));
      log.actions.push(`locations set: ${COUNTRIES.join(", ")}`);

      const methods = await api("GET", `/shipping/zones/${zone.id}/methods`);
      if (!methods.some((m) => m.method_id === "free_shipping")) {
        const m = await api("POST", `/shipping/zones/${zone.id}/methods`, {
          method_id: "free_shipping",
          enabled: true,
          settings: { title: "Free shipping (3 working days)", requires: "" },
        });
        log.actions.push(`added free_shipping method ${m.id}`);
      } else {
        log.actions.push("free_shipping already present");
      }

      // Read back the live state.
      const after = await api("GET", "/shipping/zones");
      log.zonesAfter = [];
      for (const z of after) {
        const locs = await api("GET", `/shipping/zones/${z.id}/locations`);
        const ms = await api("GET", `/shipping/zones/${z.id}/methods`);
        log.zonesAfter.push(
          `${z.id} "${z.name}" [${locs.map((l) => l.code).join(",") || "-"}] methods: ${
            ms.map((m) => `${m.method_title}${m.enabled ? "" : " (disabled)"}`).join(", ") || "NONE"
          }`
        );
      }
      return log;
    },
    { ZONE_NAME, COUNTRIES }
  );

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
