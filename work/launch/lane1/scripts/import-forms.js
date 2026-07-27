#!/usr/bin/env node
/**
 * Lane 1 — import the generated Gravity Forms into staging.
 * Staging only. Refuses to run against any other host.
 */
const fs = require("node:fs");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));

const HOST = "2026.solyxenergy.nl";
const BASE = `https://${HOST}`;
const AUTH = path.join(MIG, "wp-auth-state.json");
const LANE = path.resolve(__dirname, "..");

async function main() {
  const files = ["gf-installatie.json", "gf-boilergarant.json"].map((f) => path.join(LANE, f));
  files.forEach((f) => {
    if (!fs.existsSync(f)) throw new Error(`missing ${f} — run build-forms.js`);
  });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const results = [];

  for (const file of files) {
    // GF 2.10 uses subview=, not view=.
    const url = `${BASE}/wp-admin/admin.php?page=gf_export&subview=import_form`;
    if (new URL(url).hostname !== HOST) throw new Error("refusing: not staging");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");

    await page.setInputFiles("#gf_import_file", file);
    // The GF admin panel never settles for Playwright's actionability check, so
    // submit directly. requestSubmit(button) keeps the submitter's name/value,
    // which the import handler checks for.
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 90000 }),
      page.evaluate(() => {
        const btn = document.querySelector('[name="import_forms"]');
        btn.form.requestSubmit(btn);
      }),
    ]);
    const notice = await page.locator("#gform_tab_container_1 .alert, .gforms_note_success, .alert.success, #gf_import_form_message, .notice")
      .first()
      .innerText()
      .catch(() => "");
    const body = await page.locator("#wpbody-content").innerText().catch(() => "");
    results.push({ file: path.basename(file), notice: notice.trim(), bodyHint: body.slice(0, 300).replace(/\s+/g, " ") });
  }

  // Read back the resulting forms list
  await page.goto(`${BASE}/wp-admin/admin.php?page=gf_edit_forms`, { waitUntil: "domcontentloaded" });
  const forms = await page.$$eval("#the-list tr", (rows) =>
    rows
      .map((r) => {
        const a = r.querySelector(".row-title, .column-title a");
        const href = a ? a.getAttribute("href") : null;
        return {
          id: href && /id=(\d+)/.exec(href) ? /id=(\d+)/.exec(href)[1] : null,
          title: a ? a.textContent.trim() : null,
        };
      })
      .filter((f) => f.id)
  );

  console.log(JSON.stringify({ results, forms }, null, 2));
  await browser.close();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
