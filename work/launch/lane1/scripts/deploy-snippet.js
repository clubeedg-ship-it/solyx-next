#!/usr/bin/env node
/**
 * Lane 1 — deploy the form-backend WPCode snippet to staging.
 *
 * Builds snippet.php with bridge.js inlined, then creates or updates the
 * snippet by title. Drives the user's authenticated Arc session over CDP;
 * staging only, and every navigation is hostname-guarded.
 */
const fs = require("node:fs");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));

const HOST = "2026.solyxenergy.nl";
const BASE = `https://${HOST}`;
const LANE = path.resolve(__dirname, "..");
const TITLE = "Solyx Lane 1 — installation form backend";

function buildPhp() {
  const bridge = fs.readFileSync(path.join(LANE, "bridge.js"), "utf8");
  const php = fs.readFileSync(path.join(LANE, "snippet.php"), "utf8");
  const b64 = Buffer.from(bridge).toString("base64");
  const body = php.replace("__BRIDGE_B64__", b64).replace("__BUILD_ID__", String(Date.now()));
  // WPCode stores the snippet body without the opening PHP tag.
  return body.replace(/^<\?php\s*/, "");
}

async function main() {
  const code = buildPhp();
  if (code.includes("__BRIDGE_B64__")) throw new Error("bridge placeholder not replaced");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      try { if (new URL(p.url()).hostname === HOST) { page = p; break; } } catch (_) {}
    }
    if (page) break;
  }
  if (!page) throw new Error("no staging tab open in Arc");

  const go = async (url, settle = 3000) => {
    if (new URL(url).hostname !== HOST) throw new Error(`refusing: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(settle);
    if (new URL(page.url()).hostname !== HOST) throw new Error(`aborted: landed on ${page.url()}`);
    if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");
  };

  try {
    await go(`${BASE}/wp-admin/admin.php?page=wpcode`);
    const existing = await page.evaluate((title) => {
      const rows = [...document.querySelectorAll("table.wp-list-table tbody tr")];
      const row = rows.find((r) => (r.innerText || "").includes(title));
      if (!row) return null;
      const a = [...row.querySelectorAll("a")].find((x) => /snippet_id=\d+/.test(x.href));
      return a ? a.href : null;
    }, TITLE);

    await go(existing || `${BASE}/wp-admin/admin.php?page=wpcode-snippet-manager&custom=1`, 3500);

    await page.evaluate(
      ({ code, title, isNew }) => {
        const form = document.getElementById("wpcode-snippet-manager-form");
        const cm = document.querySelector(".CodeMirror")?.CodeMirror;
        const codeField = document.querySelector("[name=wpcode_snippet_code]");
        const textField = document.querySelector("[name=wpcode_snippet_text]");
        if (!form || (!cm && !codeField)) throw new Error("WPCode editor unavailable.");

        if (isNew) {
          const titleField = form.querySelector("[name=wpcode_snippet_title]");
          if (titleField) titleField.value = title;
          const type = form.querySelector("[name=wpcode_snippet_type]");
          if (type) {
            type.value = "php";
            type.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        // PHP snippets registering add_action must run Everywhere.
        const everywhere = document.querySelector('input[name="wpcode_auto_insert_location"][value="everywhere"]');
        if (everywhere) everywhere.checked = true;
        const autoInsert = document.querySelector('input[name="wpcode_auto_insert"]');
        if (autoInsert) autoInsert.value = "1";
        const active = document.querySelector("#wpcode_active");
        if (active) active.checked = true;

        if (cm) {
          cm.setValue(code);
          if (cm.save) cm.save();
        }
        if (codeField) codeField.value = code;
        if (textField) textField.value = code;

        // "Save Snippet" is <button name="button" value="publish">; a bare
        // form.submit() drops that value and WPCode saves nothing.
        const save = [...form.querySelectorAll('button[type=submit][name="button"]')].find((b) => b.value === "publish");
        if (!save) throw new Error("WPCode save button not found.");
        form.requestSubmit(save);
      },
      { code, title: TITLE, isNew: !existing }
    );

    await page.waitForTimeout(4000);
    await go(`${BASE}/wp-admin/admin.php?page=wpcode`);
    const row = await page.evaluate((title) => {
      const rows = [...document.querySelectorAll("table.wp-list-table tbody tr")];
      const r = rows.find((x) => (x.innerText || "").includes(title));
      if (!r) return null;
      const toggle = r.querySelector("input.wpcode-status-toggle");
      return { text: r.innerText.replace(/\s+/g, " ").trim().slice(0, 120), active: toggle ? toggle.checked : null };
    }, TITLE);

    console.log(JSON.stringify({ ok: !!row, mode: existing ? "update" : "create", row }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
