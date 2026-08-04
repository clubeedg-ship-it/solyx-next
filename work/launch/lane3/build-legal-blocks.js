#!/usr/bin/env node
/**
 * Rebuild the terms and delivery pages as clean WordPress core blocks.
 *
 * The first import copied production's raw Elementor markup verbatim. That
 * markup carries fixed-width Elementor containers, and without Elementor's own
 * stylesheet they compute to 1470px — so on a 360px phone roughly 75% of the
 * terms text was clipped and unreachable, on a legally required page.
 *
 * Core blocks inherit the theme's responsive widths, so this removes the cause
 * rather than patching the symptom with overflow rules.
 *
 * The text itself is transcribed unchanged. No legal wording is invented,
 * reordered or summarised.
 */
const fs = require("node:fs");
const path = require("node:path");
const LEGAL = path.resolve(__dirname, "legal");

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const para = (s) => `<!-- wp:paragraph -->\n<p>${esc(s.trim())}</p>\n<!-- /wp:paragraph -->\n`;
const head = (s, lvl = 2) =>
  `<!-- wp:heading {"level":${lvl}} -->\n<h${lvl}>${esc(s.trim())}</h${lvl}>\n<!-- /wp:heading -->\n`;

function clean(file) {
  return fs.readFileSync(path.join(LEGAL, file), "utf8").replace(/[ \t]+/g, " ").replace(/ /g, " ").trim();
}

// ---------------------------------------------------------------- terms
function buildTerms() {
  let t = clean("terms.txt");
  let out = "";

  // Preamble: everything before "Artikel 1."
  const firstArt = t.search(/Artikel\s+1\./);
  if (firstArt > 0) out += para(t.slice(0, firstArt));

  // Each "Artikel N. TITLE" starts a section; clauses are "N.M ".
  const re = /Artikel\s+(\d+)\.\s*([A-ZÉËÈÀ-Ü /\-]+?)(?=\d+\.\d)/g;
  const marks = [];
  let m;
  while ((m = re.exec(t)) !== null) marks.push({ num: m[1], title: m[2].trim(), start: m.index, end: re.lastIndex });

  marks.forEach((mark, i) => {
    const bodyEnd = i + 1 < marks.length ? marks[i + 1].start : t.length;
    const body = t.slice(mark.end, bodyEnd).trim();
    out += head(`Artikel ${mark.num}. ${mark.title}`);
    // Split on clause numbers (5.1, 12.3) and on lettered sub-points (a. b. c.)
    const parts = body.split(/(?=\b\d{1,2}\.\d{1,2}\s)/).map((x) => x.trim()).filter(Boolean);
    (parts.length ? parts : [body]).forEach((p) => {
      if (p) out += para(p);
    });
  });
  return { html: out, sections: marks.length };
}

// ------------------------------------------------------------- delivery
function buildDelivery() {
  let t = clean("delivery.txt");
  // Drop the duplicated page title line the theme already renders.
  t = t.replace(/^Levering en Retourbeleid\s*(Van Solyx Energy)?\s*/i, "").trim();

  const HEADINGS = [
    "Algemeen",
    "Schade en problemen",
    "Uitzonderingen / niet-retourneerbare artikelen",
    "Ruilen",
    "Europese Unie 14 dagen bedenktijd",
    "Terugbetalingen",
  ];
  // Locate each heading, then take the text up to the next one.
  const found = [];
  HEADINGS.forEach((h) => {
    const i = t.indexOf(h);
    if (i !== -1) found.push({ h, i });
  });
  found.sort((a, b) => a.i - b.i);

  let out = "";
  if (found.length && found[0].i > 0) out += para(t.slice(0, found[0].i));
  found.forEach((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].i : t.length;
    const body = t.slice(f.i + f.h.length, end).trim();
    out += head(f.h);
    // Break long bodies into sentences-grouped paragraphs for readability.
    const chunks = body.split(/(?<=\.)\s+(?=[A-Z])/).reduce((acc, s) => {
      if (!acc.length) return [s];
      const last = acc[acc.length - 1];
      if (last.length < 260) acc[acc.length - 1] = `${last} ${s}`;
      else acc.push(s);
      return acc;
    }, []);
    chunks.forEach((c) => {
      if (c.trim()) out += para(c);
    });
  });
  return { html: out, sections: found.length };
}

const terms = buildTerms();
const delivery = buildDelivery();
fs.writeFileSync(path.join(LEGAL, "terms.blocks.html"), terms.html);
fs.writeFileSync(path.join(LEGAL, "delivery.blocks.html"), delivery.html);

const stripTags = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
console.log(
  JSON.stringify(
    {
      terms: { sections: terms.sections, blockChars: terms.html.length, textChars: stripTags(terms.html).length },
      delivery: { sections: delivery.sections, blockChars: delivery.html.length, textChars: stripTags(delivery.html).length },
      sourceChars: { terms: clean("terms.txt").length, delivery: clean("delivery.txt").length },
    },
    null,
    1
  )
);
