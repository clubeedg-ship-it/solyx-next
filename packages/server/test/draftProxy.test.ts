import { describe, expect, it, vi } from "vitest";
import { DraftFetchError, InvalidPostIdError, buildDraftRequest, fetchDraftHtml, fetchDraftList } from "../src/proxy/draftProxy.js";

const config = {
  wordpressOrigin: "https://2026.solyxenergy.nl",
  wordpressUser: "agent",
  wordpressAppPassword: "abcd efgh ijkl mnop",
};

describe("buildDraftRequest", () => {
  it("builds a preview URL with Basic auth from the application password", () => {
    const request = buildDraftRequest("42", config);
    expect(request.url).toBe("https://2026.solyxenergy.nl/?p=42&preview=true");
    const expectedAuth = `Basic ${Buffer.from("agent:abcd efgh ijkl mnop").toString("base64")}`;
    expect(request.headers.Authorization).toBe(expectedAuth);
  });

  it("strips a trailing slash on the configured origin before building the URL", () => {
    const request = buildDraftRequest("1", { ...config, wordpressOrigin: "https://2026.solyxenergy.nl/" });
    expect(request.url).toBe("https://2026.solyxenergy.nl/?p=1&preview=true");
  });

  it("rejects non-numeric post ids", () => {
    expect(() => buildDraftRequest("42; DROP TABLE", config)).toThrow(InvalidPostIdError);
    expect(() => buildDraftRequest("../../etc/passwd", config)).toThrow(InvalidPostIdError);
    expect(() => buildDraftRequest("", config)).toThrow(InvalidPostIdError);
  });
});

describe("fetchDraftHtml", () => {
  it("fetches, authenticates, and rewrites the draft HTML with a base tag", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<html><head></head><body>draft</body></html>",
    });

    const html = await fetchDraftHtml("7", config, fakeFetch);

    expect(fakeFetch).toHaveBeenCalledWith(
      "https://2026.solyxenergy.nl/?p=7&preview=true",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) }),
    );
    expect(html).toContain('<base href="https://2026.solyxenergy.nl/">');
  });

  it("throws DraftFetchError with the upstream status on a non-OK response", async () => {
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

  it("never calls fetch for an invalid post id", async () => {
    const fakeFetch = vi.fn();
    await expect(fetchDraftHtml("not-a-number", config, fakeFetch)).rejects.toThrow(InvalidPostIdError);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

// Shapes below are VERBATIM from the live plugin API (2026-08-18):
//   GET /wp-json/solyx-agent/v1/pages       -> [{id,title,slug,status,hasDraft}]
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
      return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify(PAGES) };
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
