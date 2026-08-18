import { describe, expect, it } from "vitest";
import { injectBaseTag } from "../src/proxy/htmlRewrite.js";

describe("injectBaseTag", () => {
  const base = { baseHref: "https://2026.solyxenergy.nl" };

  it("inserts a base tag as the first child of <head>", () => {
    const html = "<html><head><title>Over ons</title></head><body>hi</body></html>";
    const out = injectBaseTag(html, base);
    expect(out).toContain('<head><base href="https://2026.solyxenergy.nl/"><title>Over ons</title></head>');
  });

  it("adds a trailing slash to the base href so relative paths resolve as a directory", () => {
    const html = "<html><head></head><body></body></html>";
    const out = injectBaseTag(html, base);
    expect(out).toContain('href="https://2026.solyxenergy.nl/"');
  });

  it("preserves attributes already on the <head> tag", () => {
    const html = '<html><head data-theme="light"><meta charset="utf-8"></head></html>';
    const out = injectBaseTag(html, base);
    expect(out).toContain('<head data-theme="light"><base href="https://2026.solyxenergy.nl/">');
  });

  it("replaces an existing base tag rather than leaving two", () => {
    const html = '<html><head><base href="/wp-content/"></head></html>';
    const out = injectBaseTag(html, base);
    const matches = out.match(/<base\b/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(out).toContain('href="https://2026.solyxenergy.nl/"');
    expect(out).not.toContain("/wp-content/");
  });

  it("falls back to inserting a <head> after <html> when the document has none", () => {
    const html = "<html><body>fragment only</body></html>";
    const out = injectBaseTag(html, base);
    expect(out).toContain('<html><head><base href="https://2026.solyxenergy.nl/"></head><body>');
  });

  it("falls back to prepending when the document has neither <html> nor <head>", () => {
    const html = "<div>not even a document</div>";
    const out = injectBaseTag(html, base);
    expect(out.startsWith('<head><base href="https://2026.solyxenergy.nl/"></head>')).toBe(true);
  });

  it("escapes double quotes and ampersands in the base href", () => {
    const html = "<html><head></head></html>";
    const out = injectBaseTag(html, { baseHref: 'https://example.com/a"b&c' });
    expect(out).toContain('href="https://example.com/a&quot;b&amp;c/"');
  });

  it("is case-insensitive about the <HEAD> tag", () => {
    const html = "<HTML><HEAD><title>x</title></HEAD></HTML>";
    const out = injectBaseTag(html, base);
    expect(out).toContain('<HEAD><base href="https://2026.solyxenergy.nl/">');
  });
});
