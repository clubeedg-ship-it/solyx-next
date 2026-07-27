#!/usr/bin/env node
/**
 * Lane 1 — deploy the installation-form backend WPCode snippet to staging.
 * Builds snippet.php with bridge.js inlined, then creates or updates the
 * snippet by title. Staging only.
 */
const fs = require("node:fs");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));

const HOST = "2026.solyxenergy.nl";
const BASE = `https://${HOST}`;
const AUTH = path.join(MIG, "wp-auth-state.json");
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

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/wp-admin/admin.php?page=wpcode`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");

    const existing = await page.evaluate((title) => {
      const links = [...document.querySelectorAll("a")].filter((n) => n.textContent.trim() === title);
      const pick = links.find((n) => /snippet_id=\d+/.test(n.href)) || links[0];
      return pick ? pick.href : null;
    }, TITLE);

    const target = existing || `${BASE}/wp-admin/admin.php?page=wpcode-snippet-manager&custom=1`;
    await page.goto(target, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

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
        const save = [...form.querySelectorAll('button[type=submit][name="button"]')].find(
          (b) => b.value === "publish"
        );
        if (!save) throw new Error("WPCode save button not found.");
        form.requestSubmit(save);
      },
      { code, title: TITLE, isNew: !existing }
    );

    await page.waitForTimeout(3500);
    await page.goto(`${BASE}/wp-admin/admin.php?page=wpcode`, { waitUntil: "domcontentloaded" });
    const row = await page.evaluate((title) => {
      const rows = [...document.querySelectorAll("#the-list tr")];
      const r = rows.find((x) => x.innerText.includes(title));
      return r ? r.innerText.replace(/\s+/g, " ").trim().slice(0, 160) : null;
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
