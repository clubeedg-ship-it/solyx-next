#!/usr/bin/env node
/**
 * Lane 1 — same end-to-end wizard submission as e2e-submit.js, but driven
 * through the user's authenticated Arc session over CDP instead of a stored
 * auth-state file. Use when the headless auth state has expired.
 *
 * Usage: node e2e-submit-cdp.js [pageId] [formId]
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";
const SCRATCH = "/private/tmp/claude-501/-Users-ottogen-solyx-next/60218531-99c9-4701-9132-735f4d3d854f/scratchpad";

const pageId = process.argv[2] || "800";
const formId = process.argv[3] || "1";
const RUN = "E2E-" + Date.now();

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(HOST));
  if (!page) throw new Error("no staging tab open in Arc");

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));

  await page.goto(`https://${HOST}/?page_id=${pageId}&preview=true`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);

  const trail = [];
  for (let guard = 0; guard < 40; guard++) {
    const state = await page.evaluate(() => {
      const step = document.querySelector("#installForm .step.active");
      if (!step) return { none: true };
      return {
        id: step.id,
        fileInputs: Array.from(step.querySelectorAll('input[type="file"]')).map((i) => i.name),
      };
    });
    if (state.none) break;
    trail.push(state.id);
    if (state.id === "form-step-17") break;

    await page.evaluate(
      ({ run }) => {
        const step = document.querySelector("#installForm .step.active");
        const VALUES = {
          firstName: "Testaanvraag",
          lastName: run,
          email: "info@solyxenergy.nl",
          phone: "0612345678",
          address: "Teststraat 1",
          city: "Utrecht",
          notes: "Zero Spam regression check " + run + " - mag verwijderd worden.",
        };
        step.querySelectorAll("input[type=text],input[type=email],input[type=tel],textarea").forEach((el) => {
          if (VALUES[el.name] !== undefined) el.value = VALUES[el.name];
        });
        const PREFER = { cvConnection: "ja", splitter: "ja", separateGroup: "ja", spaceNextToCV: "ja", boilerType: "150L" };
        const seen = new Set();
        step.querySelectorAll("input[type=radio]").forEach((el) => {
          if (seen.has(el.name)) return;
          const want = PREFER[el.name];
          const target = want ? step.querySelector(`input[type=radio][name="${el.name}"][value="${want}"]`) : el;
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
      { run: RUN }
    );

    for (const name of state.fileInputs) {
      const file = name === "meterkast" ? "test-meterkast.png" : "test-cv.png";
      await page.setInputFiles(`#installForm input[type="file"][name="${name}"]`, path.join(SCRATCH, file));
      await page.waitForTimeout(200);
    }

    const isLast = await page.evaluate(() => {
      const b = document.querySelector("#submitBtn");
      return !!b && b.style.display !== "none" && getComputedStyle(b).display !== "none";
    });
    if (isLast) {
      await page.evaluate(() => document.querySelector("#submitBtn").click());
      break;
    }
    await page.evaluate(() => {
      const n = document.querySelector("#navRow [data-next]") || document.querySelector("[data-next]");
      if (n) n.click();
    });
    await page.waitForTimeout(300);
  }

  const outcome = await page
    .waitForFunction(
      () => {
        if (document.querySelector("#form-step-17.active")) return { ok: true };
        const err = document.querySelector("#solyx-form-error");
        if (err) return { ok: false, error: err.innerText.slice(0, 260) };
        return null;
      },
      { timeout: 90000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => ({ ok: false, error: "no done step and no error shown within 90s" }));

  // Did an entry actually land?
  await page.goto(`https://${HOST}/wp-admin/admin.php?page=gf_entries&id=${formId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const entries = await page.evaluate(() => {
    const empty = !!document.querySelector(".no-items");
    const rows = [...document.querySelectorAll("#the-list tr")].map((r) =>
      r.innerText.replace(/\s+/g, " ").trim().slice(0, 90)
    );
    return { empty, count: empty ? 0 : rows.length, rows: rows.slice(0, 3) };
  });

  console.log(JSON.stringify({ run: RUN, steps: trail.length, outcome, jsErrors: errors, entries }, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
