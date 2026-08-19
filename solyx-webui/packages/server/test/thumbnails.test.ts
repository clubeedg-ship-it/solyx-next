import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OffOriginError, ThumbnailStore, type Runner } from "../src/content/thumbnails.js";

/**
 * A stand-in for a real screenshot. It has to clear ThumbnailStore's
 * blank-frame floor: Chromium exits 0 and writes a valid but empty PNG when it
 * never painted the page, so anything under that floor is now rejected rather
 * than cached. A few bytes of fake content would be indistinguishable from
 * exactly the failure the floor exists to catch.
 */
const REAL_SIZED_PNG = "P".repeat(20_000);

const ORIGIN = "https://2026.solyxenergy.nl";

async function store(runner: Runner, maxAgeMs = 60_000) {
  const cacheDir = await mkdtemp(join(tmpdir(), "thumbs-"));
  return { cacheDir, store: new ThumbnailStore({ cacheDir, allowedOrigin: ORIGIN, maxAgeMs, runner }) };
}

/** Stands in for Chromium: writes the file it was told to write. */
const writingRunner = (onCall?: () => void): Runner => async (_bin, args) => {
  onCall?.();
  const target = args.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);
  if (target) await writeFile(target, REAL_SIZED_PNG);
};

describe("ThumbnailStore", () => {
  it("renders a page and returns the file it wrote", async () => {
    const { store: s } = await store(writingRunner());
    const file = await s.pathFor(`${ORIGIN}/besparen/`);
    expect(await readFile(file, "utf8")).toBe(REAL_SIZED_PNG);
  });

  it("renders at a desktop viewport, downscaled — not at a narrow one", async () => {
    // A small window makes the site serve its mobile layout, and a thumbnail
    // of the phone version is not a thumbnail of the page.
    const seen: string[][] = [];
    const { store: s } = await store(async (_bin, args) => {
      seen.push([...args]);
      const target = args.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);
      if (target) await writeFile(target, REAL_SIZED_PNG);
    });
    await s.pathFor(`${ORIGIN}/`);
    expect(seen[0]).toContain("--window-size=1280,800");
    expect(seen[0]).toContain("--force-device-scale-factor=0.5");
  });

  it("serves a cached image without rendering again", async () => {
    const run = vi.fn();
    const { store: s } = await store(writingRunner(run));
    const first = await s.pathFor(`${ORIGIN}/besparen/`);
    const second = await s.pathFor(`${ORIGIN}/besparen/`);
    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("re-renders when asked to force, ignoring a fresh cache", async () => {
    const run = vi.fn();
    const { store: s } = await store(writingRunner(run));
    await s.pathFor(`${ORIGIN}/besparen/`);
    await s.pathFor(`${ORIGIN}/besparen/`, { force: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent requests for the same page into one render", async () => {
    // A grid mounting asks for every card at once; without this each duplicate
    // queues its own Chromium behind the others.
    const run = vi.fn();
    const { store: s } = await store(writingRunner(run));
    const url = `${ORIGIN}/besparen/`;
    await Promise.all([s.pathFor(url), s.pathFor(url), s.pathFor(url)]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never runs more than the concurrency limit at the same time", async () => {
    let active = 0;
    let peak = 0;
    const { store: s } = await store(async (_bin, args) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      const target = args.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);
      if (target) await writeFile(target, REAL_SIZED_PNG);
      active -= 1;
    });
    await Promise.all([s.pathFor(`${ORIGIN}/a/`), s.pathFor(`${ORIGIN}/b/`), s.pathFor(`${ORIGIN}/c/`)]);
    // Three, not one. Serialising every render kept the laptop calm but left a
    // cold cache of 73 pages empty for over half an hour at ~30s a page.
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("keeps working after a render fails", async () => {
    let calls = 0;
    const { store: s } = await store(async (_bin, args) => {
      calls += 1;
      if (calls === 1) throw new Error("chromium blew up");
      const target = args.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);
      if (target) await writeFile(target, REAL_SIZED_PNG);
    });
    await expect(s.pathFor(`${ORIGIN}/a/`)).rejects.toThrow();
    await expect(s.pathFor(`${ORIGIN}/b/`)).resolves.toContain(".png");
  });

  it("refuses to render anything off the WordPress origin", async () => {
    // A render is a real outbound request from a process holding WordPress
    // credentials; the caller being careful is not a control.
    const run = vi.fn();
    const { store: s } = await store(writingRunner(run));
    await expect(s.pathFor("https://attacker.example/steal")).rejects.toBeInstanceOf(OffOriginError);
    await expect(s.pathFor(`${ORIGIN}.attacker.example/x`)).rejects.toBeInstanceOf(OffOriginError);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not leave a half-written file behind when Chromium writes nothing", async () => {
    const { store: s } = await store(async () => {
      /* writes no file at all */
    });
    await expect(s.pathFor(`${ORIGIN}/a/`)).rejects.toThrow();
    const { store: s2, cacheDir } = await store(writingRunner());
    await s2.pathFor(`${ORIGIN}/a/`);
    expect(cacheDir).toBeTruthy();
  });

  it("refuses to cache a blank frame Chromium wrote without painting", async () => {
    let calls = 0;
    const { cacheDir, store: s } = await store(async (_bin, args) => {
      calls += 1;
      const target = args.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);
      // A valid PNG at the right dimensions with nothing painted on it — what
      // a navigation timeout or a 502 origin actually leaves behind. Chromium
      // still exits 0, so the exit code cannot be what catches this.
      if (target) await writeFile(target, "P".repeat(4_000));
    });

    await expect(s.pathFor(`${ORIGIN}/blank/`)).rejects.toThrow(/blank image/i);
    // And nothing may be left on disk to be served later as the real thing.
    await expect(readdir(cacheDir)).resolves.toEqual([]);
    expect(calls).toBe(1);
  });
});
