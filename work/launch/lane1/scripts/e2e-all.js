#!/usr/bin/env node
/**
 * Lane 1 — end-to-end proof that all four approved form UIs submit for real.
 *
 * Walks each UI the way a visitor would, then reads the resulting Gravity Forms
 * entry back from wp-admin. Every entry is tagged with a run id so it can be
 * found and cleaned up. Drives the user's authenticated Arc session over CDP;
 * staging only.
 *
 * Usage: node e2e-all.js [--only 800|807|721|781]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));

const HOST = "2026.solyxenergy.nl";
const BASE = `https://${HOST}`;
const RUN = "E2E-" + Date.now();
const ONLY = (process.argv.includes("--only") && process.argv[process.argv.indexOf("--only") + 1]) || null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "solyx-e2e-"));

// Smallest valid PNG; the point is the upload path, not the pixels.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
["test-meterkast.png", "test-cv.png"].forEach((f) => fs.writeFileSync(path.join(TMP, f), PNG));

async function main() {
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
    await page.goto(url, { waitUntil: "networkidle", timeout: 150000 });
    await page.waitForTimeout(settle);
    if (new URL(page.url()).hostname !== HOST) throw new Error(`aborted: landed on ${page.url()}`);
    if (page.url().includes("wp-login.php")) throw new Error("SESSION_EXPIRED");
  };

  const results = [];

  // ------------------------------------------------------------- the wizard
  async function wizard(pageId, boilerType) {
    await go(`${BASE}/?page_id=${pageId}&preview=true`, 3000);
    for (let guard = 0; guard < 40; guard++) {
      const state = await page.evaluate(() => {
        const step = document.querySelector("#installForm .step.active");
        if (!step) return { none: true };
        return { id: step.id, files: [...step.querySelectorAll('input[type="file"]')].map((i) => i.name) };
      });
      if (state.none || state.id === "form-step-17") break;

      await page.evaluate(({ run, boilerType }) => {
        const step = document.querySelector("#installForm .step.active");
        const V = {
          firstName: "Testaanvraag", lastName: run, email: "info@solyxenergy.nl",
          phone: "0612345678", address: "Teststraat 1", city: "Utrecht", boilerOther: "",
          notes: "Automatische lane 1 test — " + run + ". Mag verwijderd worden.",
        };
        step.querySelectorAll("input[type=text],input[type=email],input[type=tel],textarea").forEach((el) => {
          if (V[el.name] !== undefined) el.value = V[el.name];
        });
        const PREFER = { cvConnection: "ja", splitter: "ja", separateGroup: "ja", spaceNextToCV: "ja", boilerType: boilerType };
        const seen = new Set();
        step.querySelectorAll("input[type=radio]").forEach((el) => {
          if (seen.has(el.name)) return;
          const want = PREFER[el.name];
          const t = want ? step.querySelector(`input[type=radio][name="${el.name}"][value="${want}"]`) : el;
          if (t) { t.checked = true; t.dispatchEvent(new Event("change", { bubbles: true })); seen.add(el.name); }
        });
        step.querySelectorAll("input[type=checkbox]").forEach((el) => {
          el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }, { run: RUN, boilerType });

      for (const name of state.files) {
        const f = name === "meterkast" ? "test-meterkast.png" : "test-cv.png";
        await page.setInputFiles(`#installForm input[type="file"][name="${name}"]`, path.join(TMP, f));
        await page.waitForTimeout(250);
      }

      const isLast = await page.evaluate(() => {
        const b = document.querySelector("#submitBtn");
        return !!b && getComputedStyle(b).display !== "none";
      });
      if (isLast) { await page.evaluate(() => document.querySelector("#submitBtn").click()); break; }
      await page.evaluate(() => {
        const n = document.querySelector("#navRow [data-next]") || document.querySelector("[data-next]");
        if (n) n.click();
      });
      await page.waitForTimeout(350);
    }
    return page.waitForFunction(
      () => {
        const done = document.querySelector("#form-step-17");
        if (done && done.classList.contains("active")) return { ok: true };
        const err = document.querySelector("#solyx-form-error");
        if (err) return { ok: false, error: err.innerText.replace(/\s+/g, " ").slice(0, 200) };
        return false;
      },
      { timeout: 190000 }
    ).then((h) => h.jsonValue());
  }

  // ------------------------------------------------------- FAQ contact form
  async function contact() {
    await go(`${BASE}/?page_id=721&preview=true`, 3000);
    await page.evaluate((run) => {
      const f = document.querySelector("#contactForm");
      const set = (n, v) => { const el = f.querySelector(`[name="${n}"]`); if (el) el.value = v; };
      set("naam", "Testaanvraag " + run);
      set("email", "info@solyxenergy.nl");
      set("woonplaats", "Utrecht");
      set("telefoon", "0612345678");
      set("personen", "3");
      set("zonnepanelen", "12");
      set("tapwater", "CV-combiketel");
      set("bericht", "Automatische lane 1 test — " + run + ". Mag verwijderd worden.");
    }, RUN);
    await page.evaluate(() => document.querySelector("#contactForm .cf-submit").click());
    return page.waitForFunction(
      () => {
        const f = document.querySelector("#contactForm");
        if (f && f.classList.contains("sent")) return { ok: true };
        const err = document.querySelector("#solyx-form-error");
        if (err) return { ok: false, error: err.innerText.replace(/\s+/g, " ").slice(0, 200) };
        return false;
      },
      { timeout: 190000 }
    ).then((h) => h.jsonValue());
  }

  // --------------------------------------------- installer purchase-info form
  async function hero() {
    await go(`${BASE}/?page_id=781&preview=true`, 3000);
    await page.evaluate(() => {
      const el = document.querySelector("form.hero-form .hero-form-input");
      el.value = "info@solyxenergy.nl";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate(() => document.querySelector("form.hero-form .hero-form-btn").click());
    return page.waitForFunction(
      () => {
        const b = document.querySelector("form.hero-form .hero-form-btn");
        if (b && /Verzonden/.test(b.textContent)) return { ok: true };
        const err = document.querySelector("#solyx-form-error");
        if (err) return { ok: false, error: err.innerText.replace(/\s+/g, " ").slice(0, 200) };
        return false;
      },
      { timeout: 190000 }
    ).then((h) => h.jsonValue());
  }

  try {
    const plan = [
      { id: "800", label: "wizard 800 -> form 1", fid: 1, run: () => wizard(800, "150L") },
      { id: "807", label: "wizard 807 -> form 4 (horizontal)", fid: 4, run: () => wizard(807, "horizontal") },
      { id: "721", label: "FAQ contact -> form 5", fid: 5, run: contact },
      { id: "781", label: "installer hero -> form 6", fid: 6, run: hero },
    ].filter((c) => !ONLY || c.id === ONLY);

    for (const c of plan) {
      let outcome;
      try { outcome = await c.run(); } catch (e) { outcome = { ok: false, error: "TIMEOUT/" + e.message.slice(0, 120) }; }
      results.push({ case: c.label, fid: c.fid, ui: outcome });
      console.log(`UI  ${c.label}: ${JSON.stringify(outcome)}`);
    }

    // ------------------------------------------------ read the entries back
    for (const c of plan) {
      await go(`${BASE}/wp-admin/admin.php?page=gf_entries&id=${c.fid}`, 3000);
      const entry = await page.evaluate(() => {
        const row = document.querySelector("#the-list tr");
        const a = row ? row.querySelector("a[href*='lid=']") : null;
        return a ? { href: a.getAttribute("href"), text: row.innerText.replace(/\s+/g, " ").slice(0, 120) } : null;
      });
      if (!entry) { console.log(`GF  form ${c.fid}: NO ENTRY`); continue; }
      const lid = (entry.href.match(/lid=(\d+)/) || [])[1];
      await go(`${BASE}/wp-admin/admin.php?page=gf_entries&view=entry&id=${c.fid}&lid=${lid}`, 3000);
      const detail = await page.evaluate(() => {
        const body = (document.querySelector("#wpbody-content")?.innerText || "").replace(/\n{2,}/g, "\n");
        const notes = [...document.querySelectorAll(".postbox")]
          .filter((b) => /Notes/i.test(b.querySelector("h2, .hndle")?.innerText || ""))
          .map((b) => b.innerText.replace(/\s+/g, " ").slice(0, 400));
        return { body: body.slice(0, 1400), notes };
      });
      console.log(`\nGF  form ${c.fid} entry ${lid}\n${detail.body}\nNOTES: ${JSON.stringify(detail.notes)}`);
    }
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
    await browser.close();
  }

  console.log("\nRUN ID:", RUN);
  const bad = results.filter((r) => !r.ui || !r.ui.ok);
  if (bad.length) process.exitCode = 1;
}

main().catch((e) => { console.error("FAIL:", e.stack || String(e)); process.exit(1); });
