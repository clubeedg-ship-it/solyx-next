import { describe, expect, it, vi } from "vitest";
import { DraftFetchError, InvalidPostIdError, buildDraftRequest, fetchDraftHtml } from "../src/proxy/draftProxy.js";

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
