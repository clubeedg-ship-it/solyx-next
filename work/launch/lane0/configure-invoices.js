#!/usr/bin/env node
/**
 * Replicate production's PDF invoice configuration onto staging.
 *
 * Reads the full company/footer text from production (read-only), then applies
 * it to staging along with the document rules: invoice attached to the new-order
 * and processing-order emails, "WS" number prefix, 30-day due date.
 *
 * The invoice counter is deliberately NOT copied. Production keeps issuing
 * invoices until cutover, so cloning today's number would create duplicates in
 * the accounting. It has to be set to production's final number at cutover.
 */
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const PROD = "www.solyxenergy.nl";
const STAGE = "2026.solyxenergy.nl";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const prodTab = ctx.pages().find((p) => p.url().includes(PROD));
  const stageTab = ctx.pages().find((p) => p.url().includes(STAGE));
  if (!prodTab || !stageTab) throw new Error("need a production and a staging tab open in Arc");
  const prodStart = prodTab.url();

  // ---- read the full values from production ----
  await prodTab.goto(`https://${PROD}/wp-admin/admin.php?page=wpo_wcpdf_options_page&tab=general`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await prodTab.waitForTimeout(1200);
  if (prodTab.url().includes("wp-login.php")) throw new Error("PRODUCTION_SESSION_EXPIRED");

  const source = await prodTab.evaluate(() => {
    const v = (n) => {
      const el = document.querySelector(`[name="${n}"]`);
      return el ? el.value : null;
    };
    return {
      shopName: v("wpo_wcpdf_settings_general[shop_name][default]"),
      address: v("wpo_wcpdf_settings_general[shop_address_additional][default]"),
      vat: v("wpo_wcpdf_settings_general[vat_number]"),
      coc: v("wpo_wcpdf_settings_general[coc_number]"),
      footer: v("wpo_wcpdf_settings_general[footer][default]"),
      paper: v("wpo_wcpdf_settings_general[paper_size]"),
      template: v("wpo_wcpdf_settings_general[template_path]"),
      color: v("wpo_wcpdf_settings_general[template_color]"),
      logoHeight: v("wpo_wcpdf_settings_general[header_logo_height]"),
      checkoutLabel: v("wpo_wcpdf_settings_general[checkout_field_label]"),
    };
  });
  await prodTab.goto(prodStart, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});

  // ---- apply to staging: general tab ----
  const applyTab = async (url, fn, arg) => {
    await stageTab.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (stageTab.url().includes("wp-login.php")) throw new Error("STAGING_SESSION_EXPIRED");
    await stageTab.waitForTimeout(1200);
    const r = await stageTab.evaluate(fn, arg);
    await stageTab.waitForTimeout(3000);
    return r;
  };

  const general = await applyTab(
    `https://${STAGE}/wp-admin/admin.php?page=wpo_wcpdf_options_page&tab=general`,
    (src) => {
      const log = { set: [], missing: [] };
      const set = (name, value) => {
        const el = document.querySelector(`[name="${name}"]`);
        if (!el || value == null) return log.missing.push(name);
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        log.set.push(name);
      };
      set("wpo_wcpdf_settings_general[shop_name][default]", src.shopName);
      set("wpo_wcpdf_settings_general[shop_address_additional][default]", src.address);
      set("wpo_wcpdf_settings_general[vat_number]", src.vat);
      set("wpo_wcpdf_settings_general[coc_number]", src.coc);
      set("wpo_wcpdf_settings_general[footer][default]", src.footer);
      set("wpo_wcpdf_settings_general[paper_size]", src.paper);
      set("wpo_wcpdf_settings_general[template_path]", src.template);
      set("wpo_wcpdf_settings_general[template_color]", src.color);
      set("wpo_wcpdf_settings_general[header_logo_height]", src.logoHeight);
      set("wpo_wcpdf_settings_general[checkout_field_label]", src.checkoutLabel);
      const form = document.querySelector("form[method=post]");
      const submit = form && form.querySelector('input[type=submit], button[type=submit]');
      if (submit) {
        form.requestSubmit ? form.requestSubmit(submit) : submit.click();
        log.submitted = true;
      } else log.missing.push("submit");
      return log;
    },
    source
  );

  // ---- apply to staging: invoice document tab ----
  const document_ = await applyTab(
    `https://${STAGE}/wp-admin/admin.php?page=wpo_wcpdf_options_page&tab=documents&section=invoice`,
    () => {
      const log = { set: [], missing: [] };
      const check = (name, on) => {
        const el = document.querySelector(`[name="${name}"]`);
        if (!el) return log.missing.push(name);
        el.checked = on;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        log.set.push(`${name}=${on}`);
      };
      const set = (name, value) => {
        const el = document.querySelector(`[name="${name}"]`);
        if (!el) return log.missing.push(name);
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        log.set.push(`${name}=${value}`);
      };
      check("wpo_wcpdf_documents_settings_invoice[enabled]", true);
      check("wpo_wcpdf_documents_settings_invoice[attach_to_email_ids][new_order]", true);
      check("wpo_wcpdf_documents_settings_invoice[attach_to_email_ids][customer_processing_order]", true);
      check("wpo_wcpdf_documents_settings_invoice[display_customer_notes]", true);
      set("wpo_wcpdf_documents_settings_invoice[my_account_buttons]", "available");
      set("wpo_wcpdf_documents_settings_invoice[display_shipping_address]", "when_different");
      set("wpo_wcpdf_documents_settings_invoice[display_number]", "invoice_number");
      set("wpo_wcpdf_documents_settings_invoice[number_format][prefix]", "WS");
      set("wpo_wcpdf_documents_settings_invoice[due_date_days]", "30");
      const form = document.querySelector("form[method=post]");
      const submit = form && form.querySelector('input[type=submit], button[type=submit]');
      if (submit) {
        form.requestSubmit ? form.requestSubmit(submit) : submit.click();
        log.submitted = true;
      } else log.missing.push("submit");
      return log;
    }
  );

  // ---- verify ----
  await stageTab.goto(`https://${STAGE}/wp-admin/admin.php?page=wpo_wcpdf_options_page&tab=general`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await stageTab.waitForTimeout(1000);
  const verifyGeneral = await stageTab.evaluate(() => {
    const v = (n) => {
      const el = document.querySelector(`[name="${n}"]`);
      return el ? String(el.value).slice(0, 60) : null;
    };
    return {
      shopName: v("wpo_wcpdf_settings_general[shop_name][default]"),
      vat: v("wpo_wcpdf_settings_general[vat_number]"),
      coc: v("wpo_wcpdf_settings_general[coc_number]"),
      address: v("wpo_wcpdf_settings_general[shop_address_additional][default]"),
      footerStart: v("wpo_wcpdf_settings_general[footer][default]"),
    };
  });

  await stageTab.goto(`https://${STAGE}/wp-admin/admin.php?page=wpo_wcpdf_options_page&tab=documents&section=invoice`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await stageTab.waitForTimeout(1000);
  const verifyInvoice = await stageTab.evaluate(() => {
    const c = (n) => {
      const el = document.querySelector(`[name="${n}"]`);
      return el ? el.checked : null;
    };
    const v = (n) => {
      const el = document.querySelector(`[name="${n}"]`);
      return el ? el.value : null;
    };
    return {
      enabled: c("wpo_wcpdf_documents_settings_invoice[enabled]"),
      attachNewOrder: c("wpo_wcpdf_documents_settings_invoice[attach_to_email_ids][new_order]"),
      attachProcessing: c("wpo_wcpdf_documents_settings_invoice[attach_to_email_ids][customer_processing_order]"),
      prefix: v("wpo_wcpdf_documents_settings_invoice[number_format][prefix]"),
      dueDays: v("wpo_wcpdf_documents_settings_invoice[due_date_days]"),
      nextNumber: v("next_invoice_number"),
    };
  });

  console.log(
    JSON.stringify(
      { sourceFromProduction: { ...source, footer: (source.footer || "").slice(0, 120) }, general, document: document_, verifyGeneral, verifyInvoice },
      null,
      1
    )
  );
  await browser.close();
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
