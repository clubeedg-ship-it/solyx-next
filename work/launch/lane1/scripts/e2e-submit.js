#!/usr/bin/env node
/**
 * Lane 1 — end-to-end proof that the wizard submits for real.
 *
 * Walks the approved wizard UI step by step like a visitor, attaches photos,
 * submits, and then reads the resulting Gravity Forms entry back from wp-admin.
 * Marks the entry with a run id so it can be found and cleaned up.
 *
 * Usage: node e2e-submit.js [pageId] [formId] [--invalid-email]
 *   --invalid-email submits a value the wizard accepts but Gravity Forms
 *   rejects, proving a real failure stays visible instead of showing "Bedankt!".
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));

const HOST = "2026.solyxenergy.nl";
const BASE = `https://${HOST}`;
const AUTH = path.join(MIG, "wp-auth-state.json");
const SCRATCH = "/private/tmp/claude-501/-Users-ottogen-solyx-next/60218531-99c9-4701-9132-735f4d3d854f/scratchpad";

const pageId = process.argv[2] || "800";
const formId = process.argv[3] || "1";
const RUN = "E2E-" + Date.now();
const INVALID_EMAIL = process.argv.includes("--invalid-email");
// Each photo zone accepts 2 images; this checks both map to their own GF field.
const TWO_PHOTOS = process.argv.includes("--two-photos");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(`${BASE}/?page_id=${pageId}&preview=true`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const trail = [];
  for (let guard = 0; guard < 40; guard++) {
    const state = await page.evaluate(() => {
      const step = document.querySelector("#installForm .step.active");
      if (!step) return { none: true };
      return {
        id: step.id,
        text: (step.innerText || "").split("\n")[1] || (step.innerText || "").slice(0, 40),
        fileInputs: Array.from(step.querySelectorAll('input[type="file"]')).map((i) => i.name),
        textInputs: Array.from(step.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],textarea')).map(
          (i) => ({ name: i.name, required: i.required })
        ),
        radios: Array.from(step.querySelectorAll('input[type="radio"]')).map((i) => ({ name: i.name, value: i.value })),
        checks: Array.from(step.querySelectorAll('input[type="checkbox"]')).map((i) => ({ name: i.name, value: i.value })),
        hasNext: !!step.parentElement.querySelector("[data-next]"),
      };
    });
    if (state.none) break;
    trail.push(state.id);
    if (state.id === "form-step-17") break;

    // Fill this step the way a visitor would.
    await page.evaluate(
      ({ run, invalidEmail }) => {
        const step = document.querySelector("#installForm .step.active");
        const VALUES = {
          firstName: "Testaanvraag",
          lastName: run,
          email: invalidEmail ? "kapot@" : "info@solyxenergy.nl",
          phone: "0612345678",
          address: "Teststraat 1",
          city: "Utrecht",
          boilerOther: "",
          notes: "Automatische lane 1 test — " + run + ". Mag verwijderd worden.",
        };
        step.querySelectorAll("input[type=text],input[type=email],input[type=tel],textarea").forEach((el) => {
          if (VALUES[el.name] !== undefined) el.value = VALUES[el.name];
        });
        // cvConnection: take the branch that also asks for CV photos.
        const PREFER = { cvConnection: "ja", splitter: "ja", separateGroup: "ja", spaceNextToCV: "ja", boilerType: "150L" };
        const seen = new Set();
        step.querySelectorAll("input[type=radio]").forEach((el) => {
          if (seen.has(el.name)) return;
          const want = PREFER[el.name];
          const target = want
            ? step.querySelector(`input[type=radio][name="${el.name}"][value="${want}"]`)
            : el;
          if (target) {
            target.checked = true;
            target.dispatchEvent(new Event("change", { bubbles: true }));
            seen.add(el.name);
          }
        });
        step.querySelectorAll("input[type=checkbox]").forEach((el) => {
          el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
      },
      { run: RUN, invalidEmail: INVALID_EMAIL }
    );

    // Photos, where the step asks for them.
    for (const name of state.fileInputs) {
      const file = name === "meterkast" ? "test-meterkast.png" : "test-cv.png";
      const picks =
        TWO_PHOTOS && name === "meterkast"
          ? [path.join(SCRATCH, "test-meterkast.png"), path.join(SCRATCH, "test-cv.png")]
          : path.join(SCRATCH, file);
      await page.setInputFiles(`#installForm input[type="file"][name="${name}"]`, picks);
      await page.waitForTimeout(250);
    }

    const isLast = await page.evaluate(() => {
      const btn = document.querySelector("#submitBtn");
      return !!btn && btn.style.display !== "none" && getComputedStyle(btn).display !== "none";
    });

    if (isLast) {
      await page.evaluate(() => document.querySelector("#submitBtn").click());
      break;
    }
    await page.evaluate(() => {
      const next = document.querySelector("#navRow [data-next]") || document.querySelector("[data-next]");
      if (next) next.click();
    });
    await page.waitForTimeout(350);
  }

  // Wait for a real outcome: done step, or the bridge's visible error.
  const outcome = await page
    .waitForFunction(
      () => {
        const done = document.querySelector("#form-step-17.active");
        const err = document.querySelector("#solyx-form-error");
        if (done) return { ok: true };
        if (err) return { ok: false, error: err.innerText.slice(0, 300) };
        return null;
      },
      { timeout: 90000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => ({ ok: false, error: "timed out with no done step and no error shown" }));

  const pendingLabel = await page.evaluate(() => {
    const b = document.querySelector("#submitBtn");
    return b ? b.textContent.trim() : null;
  });

  // Read the entry back from wp-admin.
  await page.goto(`${BASE}/wp-admin/admin.php?page=gf_entries&id=${formId}`, { waitUntil: "networkidle" });
  const entryHref = await page.evaluate(() => {
    const a = document.querySelector("#the-list tr a[href*='view=entry']");
    return a ? a.href : null;
  });

  let entry = null;
  if (entryHref) {
    await page.goto(entryHref, { waitUntil: "networkidle" });
    entry = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".entry-view-field-name, .detail-view td, .entry-detail-view tr"));
      const text = (document.querySelector("#poststuff") || document.body).innerText;
      const files = Array.from(document.querySelectorAll("#poststuff a[href*='/uploads/gravity_forms/']")).map((a) => a.href);
      const notif = (document.body.innerText.match(/Notifications?[\s\S]{0,200}/) || [""])[0];
      return { text: text.slice(0, 2500), files, notif: notif.replace(/\s+/g, " ").slice(0, 200), rowCount: rows.length };
    });
  }

  console.log(
    JSON.stringify(
      { run: RUN, pageId, formId, stepsWalked: trail, outcome, pendingLabel, jsErrors: errors, entryHref, entry },
      null,
      2
    )
  );
  await browser.close();
}
main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
