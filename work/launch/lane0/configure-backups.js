#!/usr/bin/env node
/**
 * Install UpdraftPlus on staging, set a daily schedule, and take a backup now.
 *
 * Staging has had irreversible-ish work done to it (catalogue replaced, pages
 * trashed, plugins removed) with no restore point at all. This creates one.
 *
 * Remote storage is left unset: every remote option needs an account
 * authorisation the client must grant. Local-only backups live on the same
 * server they protect, so this is a first step, not the finished answer.
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST));
  if (!page) throw new Error("no staging tab open in Arc");

  const log = {};

  // 1. Install + activate.
  await page.goto(`https://${HOST}/wp-admin/plugins.php`, { waitUntil: "networkidle", timeout: 90000 });
  if (page.url().includes("wp-login.php")) throw new Error("STAGING_SESSION_EXPIRED");
  await page.waitForTimeout(1500);

  log.install = await page.evaluate(async () => {
    const nonce = window.wpApiSettings.nonce;
    const api = async (m, r, b) => {
      const res = await fetch(`/wp-json${r}`, {
        method: m,
        credentials: "same-origin",
        headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
        body: b ? JSON.stringify(b) : undefined,
      });
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
    };
    const existing = await api("GET", "/wp/v2/plugins");
    const found = (existing.body || []).filter((p) => /updraft/i.test(p.name || ""));
    if (found.length) return { alreadyPresent: found.map((p) => `${p.name} [${p.status}]`) };
    await api("POST", "/wp/v2/plugins", { slug: "updraftplus", status: "active" });
    const after = await api("GET", "/wp/v2/plugins");
    return {
      installed: (after.body || []).filter((p) => /updraft/i.test(p.name || "")).map((p) => `${p.name} v${p.version} [${p.status}]`),
    };
  });

  // 2. Schedule: daily files + database, keep 7 of each.
  await page.goto(`https://${HOST}/wp-admin/options-general.php?page=updraftplus`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.waitForTimeout(3000);

  log.settings = await page.evaluate(() => {
    const out = { set: [], missing: [] };
    const setSelect = (name, value) => {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return out.missing.push(name);
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      out.set.push(`${name}=${value}`);
    };
    const setInput = (name, value) => {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return out.missing.push(name);
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      out.set.push(`${name}=${value}`);
    };
    setSelect("updraft_interval", "daily");
    setSelect("updraft_interval_database", "daily");
    setInput("updraft_retain", "7");
    setInput("updraft_retain_db", "7");
    ["updraft_include_plugins", "updraft_include_themes", "updraft_include_uploads", "updraft_include_others"].forEach(
      (n) => {
        const el = document.querySelector(`[name="${n}"]`);
        if (!el) return out.missing.push(n);
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        out.set.push(`${n}=on`);
      }
    );
    const save = document.querySelector("#updraftplus-settings-save, input[value='Save Changes'], button.updraft-save-button");
    if (save) {
      save.click();
      out.saveClicked = true;
    } else out.missing.push("save button");
    return out;
  });

  await page.waitForTimeout(6000);

  // 3. Take a backup now.
  log.backup = await page.evaluate(() => {
    const btn = document.querySelector("#updraft-backupnow-button");
    if (!btn) return { started: false, reason: "backup-now button not found" };
    btn.click();
    return { started: true };
  });
  await page.waitForTimeout(2500);

  // Confirm inside the modal.
  log.modal = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("button, input[type=button], .ui-button")].filter((b) =>
      /backup now/i.test(b.textContent || b.value || "")
    );
    const visible = candidates.filter((b) => b.offsetParent !== null && b.id !== "updraft-backupnow-button");
    if (!visible.length) return { confirmed: false, seen: candidates.map((b) => (b.textContent || b.value || "").trim().slice(0, 30)) };
    visible[visible.length - 1].click();
    return { confirmed: true };
  });

  // 4. Wait for it to finish and read the backup list.
  let status = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(5000);
    status = await page.evaluate(() => {
      const activity = document.querySelector("#updraft_activejobsrow, .updraft_row");
      const running = activity && activity.offsetParent !== null ? activity.innerText.replace(/\s+/g, " ").slice(0, 120) : null;
      const rows = [...document.querySelectorAll("#updraft-existing-backups-table tr, .updraft_existing_backups_row")].map(
        (r) => r.innerText.replace(/\s+/g, " ").trim().slice(0, 90)
      );
      return { running, backupRows: rows.filter(Boolean).slice(0, 5) };
    });
    if (!status.running && status.backupRows.length) break;
  }
  log.result = status;

  console.log(JSON.stringify(log, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
