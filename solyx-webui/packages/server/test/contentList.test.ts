import { describe, expect, it, vi } from "vitest";
import { fetchContentList } from "../src/content/contentList.js";
import { DraftFetchError } from "../src/proxy/draftProxy.js";

const config = {
  wordpressOrigin: "https://2026.solyxenergy.nl",
  wordpressUser: "agent",
  wordpressAppPassword: "abcd efgh",
};

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  text: async () => JSON.stringify(body),
});

const page = (id: number, title: string) => ({
  id,
  title: { rendered: title },
  slug: `s${id}`,
  link: `https://2026.solyxenergy.nl/s${id}/`,
});

describe("fetchContentList", () => {
  it("returns pages, products and posts as one list, in that order", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([page(1, "Home")]))
      .mockResolvedValueOnce(ok([page(2, "Nymo")]))
      .mockResolvedValueOnce(ok([page(3, "Nieuws")]));

    const items = await fetchContentList(config, fetchImpl);

    expect(items.map((i) => [i.type, i.title])).toEqual([
      ["page", "Home"],
      ["product", "Nymo"],
      ["post", "Nieuws"],
    ]);
    // Authenticated, and asking only for the fields the cards render.
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/wp-json/wp/v2/pages?");
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("_fields=id,title,link,slug");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers?.Authorization).toMatch(/^Basic /);
  });

  it("decodes the HTML entities WordPress puts in titles", async () => {
    // Live example: WordPress reports this page as "Blog &#038; Nieuws".
    const fetchImpl = vi.fn().mockResolvedValue(ok([page(1, "Blog &#038; Nieuws &quot;2026&quot;")]));
    const items = await fetchContentList(config, fetchImpl);
    expect(items[0]?.title).toBe('Blog & Nieuws "2026"');
  });

  it("treats a missing post type as absent, not as a failure", async () => {
    // A site without WooCommerce has no /product route. Its pages must still list.
    const missing = { ok: false, status: 404, headers: { get: () => null }, text: async () => "" };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([page(1, "Home")]))
      .mockResolvedValueOnce(missing)
      .mockResolvedValueOnce(ok([]));

    const items = await fetchContentList(config, fetchImpl);
    expect(items.map((i) => i.type)).toEqual(["page"]);
  });

  it("throws on any other upstream failure rather than returning a half list", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([page(1, "Home")]))
      .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null }, text: async () => "" });

    await expect(fetchContentList(config, fetchImpl)).rejects.toBeInstanceOf(DraftFetchError);
  });

  it("skips entries with no usable id or link instead of rendering a broken card", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([page(1, "Home"), { id: 0, link: "x" }, { id: 5 }, null, "nope"]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]));

    const items = await fetchContentList(config, fetchImpl);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(1);
  });
});
