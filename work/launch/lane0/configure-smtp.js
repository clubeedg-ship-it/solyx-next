#!/usr/bin/env node
/**
 * Replicate production's WP Mail SMTP configuration onto staging.
 *
 * Production sends through the company's own mail server, so every setting is
 * copyable except the account password, which is deliberately left blank for
 * the user to enter by hand. This script never reads or writes a credential.
 *
 * Values mirrored from production (read-only inspection):
 *   mailer smtp · mail.solyxenergy.nl · SSL · 465 · auth on · autoTLS on
 *   user/from noreply@solyxenergy.nl · from name "Solyx Energy" · force from on
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";

const CFG = {
  "wp-mail-smtp[mail][from_email]": "noreply@solyxenergy.nl",
  "wp-mail-smtp[mail][from_name]": "Solyx Energy",
  "wp-mail-smtp[smtp][host]": "mail.solyxenergy.nl",
  "wp-mail-smtp[smtp][port]": "465",
  "wp-mail-smtp[smtp][user]": "noreply@solyxenergy.nl",
};

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST));
  if (!page) throw new Error("no staging tab open in Arc");

  await page.goto(`https://${HOST}/wp-admin/admin.php?page=wp-mail-smtp`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  if (page.url().includes("wp-login.php")) throw new Error("STAGING_SESSION_EXPIRED");
  await page.waitForTimeout(1500);

  const applied = await page.evaluate((CFG) => {
    const log = { set: [], missing: [] };

    // Choose the custom-SMTP mailer first; its fields only activate once picked.
    const mailer = document.querySelector('input[name="wp-mail-smtp[mail][mailer]"][value="smtp"]');
    if (mailer) {
      mailer.checked = true;
      mailer.dispatchEvent(new Event("change", { bubbles: true }));
      mailer.click();
      log.set.push("mailer=smtp");
    } else {
      log.missing.push("mailer radio");
    }

    const setField = (name, value) => {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return log.missing.push(name);
      el.disabled = false;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      log.set.push(`${name}=${value}`);
    };
    Object.entries(CFG).forEach(([k, v]) => setField(k, v));

    const check = (name, on) => {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return log.missing.push(name);
      el.disabled = false;
      el.checked = on;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      log.set.push(`${name}=${on}`);
    };
    check("wp-mail-smtp[mail][from_email_force]", true);
    check("wp-mail-smtp[smtp][auth]", true);
    check("wp-mail-smtp[smtp][autotls]", true);

    // Encryption is a radio group: ssl (port 465).
    const enc = document.querySelector('input[name="wp-mail-smtp[smtp][encryption]"][value="ssl"]');
    if (enc) {
      enc.checked = true;
      enc.dispatchEvent(new Event("change", { bubbles: true }));
      log.set.push("encryption=ssl");
    } else {
      log.missing.push("encryption ssl radio");
    }

    // Password intentionally untouched — the user enters it themselves.
    const form = document.querySelector("form.wp-mail-smtp-connection-settings-form, #wp-mail-smtp-settings-form, form[method=post]");
    if (!form) {
      log.missing.push("settings form");
      return log;
    }
    const submit = form.querySelector('button[type=submit], input[type=submit]');
    if (!submit) {
      log.missing.push("submit button");
      return log;
    }
    form.requestSubmit ? form.requestSubmit(submit) : submit.click();
    log.submitted = true;
    return log;
  }, CFG);

  await page.waitForTimeout(4000);

  // Read back what actually persisted.
  await page.goto(`https://${HOST}/wp-admin/admin.php?page=wp-mail-smtp`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(1200);
  const verify = await page.evaluate(() => {
    const v = (n) => {
      const el = document.querySelector(`[name="${n}"]`);
      if (!el) return null;
      if (el.type === "checkbox") return el.checked;
      return el.value;
    };
    const radio = (n) => {
      const el = document.querySelector(`input[name="${n}"]:checked`);
      return el ? el.value : null;
    };
    const pass = document.querySelector('[name="wp-mail-smtp[smtp][pass]"], #wp-mail-smtp-setting-smtp-pass');
    return {
      mailer: radio("wp-mail-smtp[mail][mailer]"),
      fromEmail: v("wp-mail-smtp[mail][from_email]"),
      fromName: v("wp-mail-smtp[mail][from_name]"),
      forceFrom: v("wp-mail-smtp[mail][from_email_force]"),
      host: v("wp-mail-smtp[smtp][host]"),
      port: v("wp-mail-smtp[smtp][port]"),
      encryption: radio("wp-mail-smtp[smtp][encryption]"),
      auth: v("wp-mail-smtp[smtp][auth]"),
      autotls: v("wp-mail-smtp[smtp][autotls]"),
      user: v("wp-mail-smtp[smtp][user]"),
      passwordSet: pass ? String(pass.value || "").length > 0 : null,
    };
  });

  console.log(JSON.stringify({ applied, verify }, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
