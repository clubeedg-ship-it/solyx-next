import { describe, expect, it, vi } from "vitest";
import { DraftFetchError, InvalidPostIdError, buildDraftRequest, fetchDraftHtml, fetchDraftList } from "../src/proxy/draftProxy.js";

const config = {
  wordpressOrigin: "https://2026.solyxenergy.nl",
  wordpressUser: "agent",
  wordpressAppPassword: "abcd efgh ijkl mnop",
};

describe("buildDraftRequest", () => {
  it("builds the draft metadata URL with Basic auth from the application password", () => {
    const request = buildDraftRequest("42", config);
    // This fetches the draft's JSON, not HTML: the preview itself is served
    // from the source page's own permalink, and only the plugin can mint the
    // signed URL for it. See fetchDraftHtml below.
    expect(request.url).toBe("https://2026.solyxenergy.nl/wp-json/solyx-agent/v1/drafts/42");
    const expectedAuth = `Basic ${Buffer.from("agent:abcd efgh ijkl mnop").toString("base64")}`;
    expect(request.headers.Authorization).toBe(expectedAuth);
  });

  it("strips a trailing slash on the configured origin before building the URL", () => {
    const request = buildDraftRequest("1", { ...config, wordpressOrigin: "https://2026.solyxenergy.nl/" });
    expect(request.url).toBe("https://2026.solyxenergy.nl/wp-json/solyx-agent/v1/drafts/1");
  });

  it("rejects non-numeric post ids", () => {
    expect(() => buildDraftRequest("42; DROP TABLE", config)).toThrow(InvalidPostIdError);
    expect(() => buildDraftRequest("../../etc/passwd", config)).toThrow(InvalidPostIdError);
    expect(() => buildDraftRequest("", config)).toThrow(InvalidPostIdError);
  });
});

describe("fetchDraftHtml", () => {
  const previewUrl =
    "https://2026.solyxenergy.nl/besparen/?solyx_preview=7&solyx_preview_expires=99&solyx_preview_signature=deadbeef";

  const respond = (body: string, contentType: string) => ({
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    text: async () => body,
  });

  it("reads the signed preview URL from the draft, then fetches the page itself", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(respond(JSON.stringify({ draftId: 7, previewUrl }), "application/json"))
      .mockResolvedValueOnce(respond("<html><head></head><body>real page</body></html>", "text/html"));

    const html = await fetchDraftHtml("7", config, fakeFetch);

    // 1. the draft's JSON, authenticated
    expect(fakeFetch.mock.calls[0]?.[0]).toBe("https://2026.solyxenergy.nl/wp-json/solyx-agent/v1/drafts/7");
    expect(fakeFetch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) }),
    );
    // 2. the page URL the plugin signed. Deliberately WITHOUT the application
    //    password: WordPress only honours it on REST requests, the signature is
    //    what authorises this one, and the credential has no business being
    //    attached to an ordinary page request.
    expect(fakeFetch.mock.calls[1]?.[0]).toBe(previewUrl);
    expect(fakeFetch.mock.calls[1]?.[1]?.headers).not.toHaveProperty("Authorization");
    expect(html).toContain('<base href="https://2026.solyxenergy.nl/">');
    expect(html).toContain("real page");
  });

  it("throws DraftFetchError with the upstream status when the draft lookup fails", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
      text: async () => "",
    });

    await expect(fetchDraftHtml("7", config, fakeFetch)).rejects.toMatchObject(
      new DraftFetchError("WordPress returned 403 for draft 7", 403),
    );
  });

  it("throws DraftFetchError when the page render itself fails", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(respond(JSON.stringify({ draftId: 7, previewUrl }), "application/json"))
      .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null }, text: async () => "" });

    await expect(fetchDraftHtml("7", config, fakeFetch)).rejects.toMatchObject(
      new DraftFetchError("WordPress returned 500 rendering the preview page for draft 7", 500),
    );
  });

  it("refuses a preview URL that is not on the configured WordPress origin", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        respond(JSON.stringify({ draftId: 7, previewUrl: "https://attacker.example/steal" }), "application/json"),
      );

    await expect(fetchDraftHtml("7", config, fakeFetch)).rejects.toThrow(DraftFetchError);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("throws when the draft JSON carries no preview URL", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(respond(JSON.stringify({ draftId: 7 }), "application/json"));
    await expect(fetchDraftHtml("7", config, fakeFetch)).rejects.toThrow(DraftFetchError);
  });

  it("never calls fetch for an invalid post id", async () => {
    const fakeFetch = vi.fn();
    await expect(fetchDraftHtml("not-a-number", config, fakeFetch)).rejects.toThrow(InvalidPostIdError);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

// Shapes below are VERBATIM from the live plugin API (2026-08-18):
//   GET /wp-json/solyx-agent/v1/pages       -> {pages:[{id,title,slug,status,hasDraft}]}
//   GET /wp-json/solyx-agent/v1/pages/:id   -> {...,hasDraft,draftId}
// The list carries hasDraft but NOT draftId, so the id has to be read from the
// per-page call — which is why this walks only the pages that claim a draft.
describe("fetchDraftList", () => {
  const PAGES = [
    { id: 801, title: "Aan de slag — NYMO", slug: "how-to-get-it", status: "publish", hasDraft: false },
    { id: 626, title: "Home", slug: "gs-home-fse", status: "publish", hasDraft: true },
    { id: 784, title: "Besparen", slug: "besparen", status: "publish", hasDraft: true },
  ];

  function fakeFetch(pageDetail: Record<number, unknown>, failFor: number[] = []) {
    return vi.fn(async (url: string) => {
      const match = /\/pages\/(\d+)$/.exec(url);
      if (match) {
        const id = Number(match[1]);
        if (failFor.includes(id)) {
          return { ok: false, status: 500, headers: { get: () => null }, text: async () => "boom" };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify(pageDetail[id]) };
      }
      return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ pages: PAGES }) };
    });
  }

  it("returns one entry per page that actually has a draft", async () => {
    const fetchImpl = fakeFetch({
      626: { id: 626, title: "Home", slug: "gs-home-fse", hasDraft: true, draftId: 1405 },
      784: { id: 784, title: "Besparen", slug: "besparen", hasDraft: true, draftId: 1403 },
    });
    const drafts = await fetchDraftList(config, fetchImpl as never);
    expect(drafts).toEqual([
      { draftId: "1405", pageId: 626, title: "Home", slug: "gs-home-fse" },
      { draftId: "1403", pageId: 784, title: "Besparen", slug: "besparen" },
    ]);
  });

  it("never fetches pages that report no draft", async () => {
    const fetchImpl = fakeFetch({ 626: { draftId: 1405 }, 784: { draftId: 1403 } });
    await fetchDraftList(config, fetchImpl as never);
    const urls = fetchImpl.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.endsWith("/pages/801"))).toBe(false);
  });

  it("skips a page whose detail call fails instead of losing the whole list", async () => {
    const fetchImpl = fakeFetch({ 784: { draftId: 1403 } }, [626]);
    const drafts = await fetchDraftList(config, fetchImpl as never);
    expect(drafts.map((d) => d.draftId)).toEqual(["1403"]);
  });

  it("authenticates every call with the application password", async () => {
    const fetchImpl = fakeFetch({ 626: { draftId: 1405 }, 784: { draftId: 1403 } });
    await fetchDraftList(config, fetchImpl as never);
    const expected = `Basic ${Buffer.from("agent:abcd efgh ijkl mnop").toString("base64")}`;
    for (const call of fetchImpl.mock.calls) {
      expect((call[1] as { headers: Record<string, string> }).headers.Authorization).toBe(expected);
    }
  });
});
