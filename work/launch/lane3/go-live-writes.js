#!/usr/bin/env node
/**
 * Everything that needs a staging session, in one pass.
 *
 *  1. Deactivate Under Construction so the site is publicly reachable.
 *  2. Import the real legal text captured from production into the two
 *     placeholder pages (terms, delivery & returns).
 *
 * Idempotent: safe to re-run. Verifies each step and reports real numbers.
 * Aborts immediately if the session is not authenticated.
 */
const fs = require("node:fs");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";
const LEGAL = path.resolve(__dirname, "legal");

// Staging page IDs for the placeholder legal pages.
const TARGETS = [
  { id: 720, file: "terms.html", label: "Algemene voorwaarden" },
  { id: 729, file: "delivery.html", label: "Levering en retourbeleid" },
];

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  // Pick a tab already inside wp-admin. Grabbing pages()[0] blindly can land on
  // a tab parked at wp-login.php and look like an expired session when it isn't.
  const page =
    ctx.pages().find((p) => p.url().includes(`${HOST}/wp-admin`)) ||
    ctx.pages().find((p) => p.url().includes(HOST) && !p.url().includes("wp-login")) ||
    ctx.pages()[0];

  await page.goto(`https://${HOST}/wp-admin/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const authed = await page.evaluate(() => !!document.querySelector("#wpadminbar"));
  if (!authed) {
    console.log(JSON.stringify({ ok: false, reason: "STAGING_SESSION_EXPIRED — sign in first" }));
    await browser.close();
    process.exit(2);
  }

  const report = {};

  // --- 1. Make the site publicly reachable -------------------------------
  report.underConstruction = await page.evaluate(async () => {
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
    const all = await api("GET", "/wp/v2/plugins");
    const uc = (all.body || []).find((p) => /under construction/i.test(p.name || ""));
    if (!uc) return { found: false };
    if (uc.status === "inactive") return { found: true, alreadyInactive: true };
    const r = await api("PUT", `/wp/v2/plugins/${encodeURIComponent(uc.plugin)}`, { status: "inactive" });
    const after = await api("GET", "/wp/v2/plugins");
    const now = (after.body || []).find((p) => /under construction/i.test(p.name || ""));
    return { found: true, putStatus: r.status, statusNow: now ? now.status : "unknown" };
  });

  // --- 2. Import the legal text ------------------------------------------
  report.legal = [];
  for (const t of TARGETS) {
    const file = path.join(LEGAL, t.file);
    if (!fs.existsSync(file)) {
      report.legal.push({ id: t.id, error: `missing ${t.file}` });
      continue;
    }
    const html = fs.readFileSync(file, "utf8");
    const res = await page.evaluate(
      async ({ id, html }) => {
        const nonce = window.wpApiSettings.nonce;
        const r = await fetch(`/wp-json/wp/v2/pages/${id}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
          body: JSON.stringify({ content: html, status: "publish" }),
        });
        const j = await r.json().catch(() => null);
        return { status: r.status, chars: j && j.content ? (j.content.rendered || "").length : 0 };
      },
      { id: t.id, html }
    );
    report.legal.push({ id: t.id, label: t.label, sourceChars: html.length, ...res });
  }

  // --- 3. Verify what a visitor actually gets ----------------------------
  report.verify = [];
  for (const p of ["/algemene-voorwaarden/", "/levering-en-retourbeleid/", "/besparen/"]) {
    await page.goto(`https://${HOST}${p}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const v = await page.evaluate(() => ({
      title: document.title.slice(0, 50),
      chars: document.body.innerText.replace(/\s+/g, " ").trim().length,
      placeholder: /onder constructie|binnenkort ingevuld|coming soon/i.test(document.body.innerText),
    }));
    report.verify.push({ path: p, ...v });
  }

  console.log(JSON.stringify(report, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
