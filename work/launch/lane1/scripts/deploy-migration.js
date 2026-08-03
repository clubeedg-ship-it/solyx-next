#!/usr/bin/env node
/**
 * Lane 1 — deploy, run and remove the one-shot Gravity Forms migration.
 *
 * Drives the user's authenticated Arc session over CDP. Staging only: every
 * navigation is hostname-guarded and the script aborts if it lands anywhere
 * other than 2026.solyxenergy.nl.
 *
 * Usage:
 *   node deploy-migration.js            deploy, run, report, remove
 *   node deploy-migration.js --dry      deploy, run read-only, report, remove
 *   node deploy-migration.js --keep     leave the snippet in place
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));

const HOST = "2026.solyxenergy.nl";
const BASE = `https://${HOST}`;
const LANE = path.resolve(__dirname, "..");
const TITLE = "Solyx Lane 1 — form migration (temporary)";
const DRY = process.argv.includes("--dry");
const KEEP = process.argv.includes("--keep");

function buildPhp(token) {
  const php = fs.readFileSync(path.join(LANE, "migrate.php"), "utf8");
  const body = php.replace("__MIGRATE_TOKEN__", token);
  if (body.includes("__MIGRATE_TOKEN__")) throw new Error("token placeholder not replaced");
  // WPCode stores the snippet body without the opening PHP tag.
  return body.replace(/^<\?php\s*/, "");
}

async function main() {
  const token = crypto.randomBytes(16).toString("hex");
  const code = buildPhp(token);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      try { if (new URL(p.url()).hostname === HOST) { page = p; break; } } catch (_) {}
    }
    if (page) break;
  }
  if (!page) throw new Error("no staging tab open in Arc");

  const go = async (url, settle = 2500) => {
    if (new URL(url).hostname !== HOST) throw new Error(`refusing: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(settle);
    if (new URL(page.url()).hostname !== HOST) throw new Error(`aborted: landed on ${page.url()}`);
    if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");
  };

  const findSnippet = async () => {
    await go(`${BASE}/wp-admin/admin.php?page=wpcode`, 3000);
    return page.evaluate((title) => {
      const rows = [...document.querySelectorAll("table.wp-list-table tbody tr")];
      const row = rows.find((r) => (r.innerText || "").includes(title));
      if (!row) return null;
      const a = [...row.querySelectorAll("a")].find((x) => /snippet_id=\d+/.test(x.href));
      return a ? a.href : null;
    }, TITLE);
  };

  try {
    // ---- 1. create or update the temporary snippet ----
    const existing = await findSnippet();
    await go(existing || `${BASE}/wp-admin/admin.php?page=wpcode-snippet-manager&custom=1`, 3500);

    await page.evaluate(
      ({ code, title, isNew }) => {
        const form = document.getElementById("wpcode-snippet-manager-form");
        const cm = document.querySelector(".CodeMirror")?.CodeMirror;
        const codeField = document.querySelector("[name=wpcode_snippet_code]");
        const textField = document.querySelector("[name=wpcode_snippet_text]");
        if (!form || (!cm && !codeField)) throw new Error("WPCode editor unavailable");

        if (isNew) {
          const t = form.querySelector("[name=wpcode_snippet_title]");
          if (t) t.value = title;
          const type = form.querySelector("[name=wpcode_snippet_type]");
          if (type) { type.value = "php"; type.dispatchEvent(new Event("change", { bubbles: true })); }
        }
        const everywhere = document.querySelector('input[name="wpcode_auto_insert_location"][value="everywhere"]');
        if (everywhere) everywhere.checked = true;
        const autoInsert = document.querySelector('input[name="wpcode_auto_insert"]');
        if (autoInsert) autoInsert.value = "1";
        const active = document.querySelector("#wpcode_active");
        if (active) active.checked = true;

        if (cm) { cm.setValue(code); if (cm.save) cm.save(); }
        if (codeField) codeField.value = code;
        if (textField) textField.value = code;

        const save = [...form.querySelectorAll('button[type=submit][name="button"]')].find((b) => b.value === "publish");
        if (!save) throw new Error("WPCode save button not found");
        form.requestSubmit(save);
      },
      { code, title: TITLE, isNew: !existing }
    );
    await page.waitForTimeout(4000);
    console.log(JSON.stringify({ step: "deploy", mode: existing ? "update" : "create", ok: !!(await findSnippet()) }));

    // ---- 2. run it ----
    const runUrl = `${BASE}/wp-admin/index.php?solyx_lane1_migrate=${token}${DRY ? "&dry=1" : ""}`;
    await go(runUrl, 3000);
    const result = await page.evaluate(() => {
      try { return JSON.parse(document.body.innerText); }
      catch (_) { return { ok: false, raw: (document.body.innerText || "").slice(0, 600) }; }
    });
    console.log(JSON.stringify({ step: "run", result }, null, 1));

    // ---- 3. remove the temporary snippet ----
    if (!KEEP) {
      const href = await findSnippet();
      if (href) {
        const id = (href.match(/snippet_id=(\d+)/) || [])[1];
        await go(href, 3500);
        await page.evaluate(() => {
          const form = document.getElementById("wpcode-snippet-manager-form");
          const active = document.querySelector("#wpcode_active");
          if (active) active.checked = false;
          const save = [...form.querySelectorAll('button[type=submit][name="button"]')].find((b) => b.value === "publish");
          form.requestSubmit(save);
        });
        await page.waitForTimeout(3500);
        console.log(JSON.stringify({ step: "deactivate", snippetId: id, ok: true }));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error("FAIL:", e.stack || String(e)); process.exit(1); });
