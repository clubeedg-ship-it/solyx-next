#!/usr/bin/env node
/**
 * Import the blog posts captured from legacy production into staging.
 *
 * Only the 43 Dutch posts are imported. The 32 English ones live under an /en/
 * path that WordPress cannot reproduce as a slug without a multilingual plugin;
 * importing them now would mint wrong URLs that the 301 map would then have to
 * undo. They stay on disk until WPML is in place.
 *
 * Slugs and publish dates are preserved exactly, so the old URLs keep working
 * once the domain switches and no ranking history is thrown away.
 *
 * Images still point at the legacy domain and must be sideloaded before legacy
 * is switched off — tracked separately; this script does not touch media.
 *
 * Usage: node import-blog.js            dry run
 *        node import-blog.js --apply    writes
 */
const fs = require("node:fs");
const path = require("node:path");
const MIG = "/Users/ottogen/solyx-next/work/greenshift-migration";
const { chromium } = require(path.join(MIG, "node_modules", "playwright"));
const HOST = "2026.solyxenergy.nl";
const BLOG = path.resolve(__dirname, "blog");
const APPLY = process.argv.includes("--apply");

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(BLOG, "index.json"), "utf8"));
  const dutch = index.filter((p) => !p.slug.startsWith("en/"));

  const posts = dutch.map((entry) => {
    const file = path.join(BLOG, entry.slug.replace(/\//g, "__") + ".json");
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      slug: d.slug,
      title: d.title,
      date: d.date,
      content: d.contentHtml || "",
      excerpt: (d.excerpt || "").slice(0, 300),
      chars: d.chars,
    };
  });

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page =
    ctx.pages().find((p) => p.url().includes(`${HOST}/wp-admin`)) ||
    ctx.pages().find((p) => p.url().includes(HOST) && !p.url().includes("wp-login"));
  if (!page) throw new Error("no usable staging tab");

  await page.goto(`https://${HOST}/wp-admin/edit.php`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);
  if (!(await page.evaluate(() => !!document.querySelector("#wpadminbar")))) throw new Error("SESSION_EXPIRED");

  const result = await page.evaluate(
    async ({ posts, APPLY }) => {
      const nonce = window.wpApiSettings.nonce;
      const api = async (m, r, b) => {
        const res = await fetch(`/wp-json${r}`, {
          method: m,
          credentials: "same-origin",
          headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
          body: b ? JSON.stringify(b) : undefined,
        });
        const j = await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, body: j };
      };

      const existing = await api("GET", "/wp/v2/posts?per_page=100&status=any&_fields=id,slug");
      const bySlug = {};
      (existing.body || []).forEach((p) => (bySlug[p.slug] = p.id));

      const out = { created: [], updated: [], failed: [], skipped: 0 };
      for (const p of posts) {
        const payload = {
          title: p.title,
          slug: p.slug,
          content: p.content,
          excerpt: p.excerpt,
          status: "publish",
        };
        if (p.date) payload.date = p.date;

        if (!APPLY) {
          out.skipped++;
          continue;
        }
        const id = bySlug[p.slug];
        const res = id ? await api("POST", `/wp/v2/posts/${id}`, payload) : await api("POST", "/wp/v2/posts", payload);
        if (res.ok) (id ? out.updated : out.created).push(`${res.body.id} ${p.slug}`);
        else out.failed.push(`${p.slug} -> ${res.status} ${JSON.stringify(res.body).slice(0, 90)}`);
      }

      const after = await api("GET", "/wp/v2/posts?per_page=100&status=publish&_fields=id,slug,date");
      out.livePostCount = (after.body || []).length;
      return out;
    },
    { posts, APPLY }
  );

  console.log(
    JSON.stringify(
      {
        applied: APPLY,
        dutchPosts: posts.length,
        englishHeld: index.length - posts.length,
        created: result.created.length,
        updated: result.updated.length,
        failed: result.failed,
        livePostCount: result.livePostCount,
        sample: result.created.slice(0, 5),
      },
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
