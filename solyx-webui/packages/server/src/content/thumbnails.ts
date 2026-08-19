import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Page thumbnails for the content cards.
 *
 * WordPress has no image to give us: of this site's 27 pages and 43 posts,
 * exactly zero carry a featured image, so a card either shows nothing or we
 * make the picture ourselves. This renders the published page in headless
 * Chromium and keeps the PNG on disk.
 *
 * Rendered at a 1280-wide viewport and downscaled by the device scale factor
 * rather than by shrinking the window: a narrow window would make the site
 * serve its mobile layout, and a thumbnail of the phone version is not a
 * thumbnail of the page. Chromium clamps the factor at 0.5, which lands on
 * 640x400 — about 128KB a page, roughly 9MB for the whole site.
 */
export interface ThumbnailOptions {
  /** Directory the PNGs live in. Created on demand. */
  cacheDir: string;
  /** Only URLs on this origin are ever rendered. */
  allowedOrigin: string;
  /** Chromium binary. Defaults to whatever is on PATH. */
  chromiumPath?: string;
  /** How long a cached image stays fresh. */
  maxAgeMs?: number;
  runner?: Runner;
}

export type Runner = (bin: string, args: readonly string[], timeoutMs: number) => Promise<void>;

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RENDER_TIMEOUT_MS = 45_000;
const VIEWPORT = "1280,800";
const SCALE = "0.5";

/**
 * Floor for "this is a real screenshot".
 *
 * Chromium exits 0 and writes a valid PNG when it never actually painted the
 * page — a navigation timeout, a DNS failure, an origin that answered 502 —
 * and a blank 640x400 frame compresses to a few KB. The previous check only
 * rejected a zero-byte file, so one such render was cached and then served
 * for a day: a permanently blank card with no error anywhere. A real page from
 * this site lands at 100-130KB, so anything under 12KB is the blank frame.
 */
const MIN_IMAGE_BYTES = 12_000;

/**
 * How many Chromium processes may render at once.
 *
 * One at a time was the safe first answer, but a page takes ~30s here, so a
 * cold cache of 73 pages took over half an hour and the grid stayed empty for
 * all of it. Three is what this laptop absorbs while also serving the site and
 * hosting the agent.
 */
const MAX_CONCURRENT_RENDERS = 3;

export class OffOriginError extends Error {}

export class ThumbnailStore {
  private readonly options: Required<Omit<ThumbnailOptions, "chromiumPath" | "runner">> &
    Pick<ThumbnailOptions, "chromiumPath"> & { runner: Runner };

  /**
   * A few renders at a time, never all of them. Chromium is not cheap and this
   * runs on the same laptop that serves the site and hosts the agent, so a grid
   * mounting must not fire seventy-three of them at once — but one at a time
   * left the cache cold for half an hour, which is its own kind of broken.
   */
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(options: ThumbnailOptions) {
    this.options = {
      cacheDir: options.cacheDir,
      allowedOrigin: options.allowedOrigin.replace(/\/+$/, ""),
      maxAgeMs: options.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
      chromiumPath: options.chromiumPath,
      runner: options.runner ?? defaultRunner,
    };
  }

  /**
   * Path to the thumbnail for `url`, rendering it first if it is missing or
   * stale. Callers pass a URL derived from the content list, never one the
   * browser supplied — and this checks the origin anyway, because a render is
   * a real outbound request made by a process holding WordPress credentials,
   * and "the caller was careful" is not a control.
   */
  async pathFor(url: string, options: { force?: boolean } = {}): Promise<string> {
    if (!this.isAllowed(url)) {
      throw new OffOriginError(`Refusing to render a URL outside ${this.options.allowedOrigin}`);
    }

    const file = join(this.options.cacheDir, `${createHash("sha256").update(url).digest("hex")}.png`);
    if (!options.force && (await this.isFresh(file))) return file;

    // Collapse concurrent requests for the same page. A grid mounting shows
    // every card at once, and without this each duplicate would queue its own
    // Chromium behind the others.
    const existing = this.inFlight.get(file);
    if (existing) return existing;

    const work = this.enqueue(async () => {
      // Re-check inside the queue: by the time this reaches the front, an
      // earlier entry may already have produced the file.
      if (!options.force && (await this.isFresh(file))) return file;
      await this.render(url, file);
      return file;
    }).finally(() => this.inFlight.delete(file));

    this.inFlight.set(file, work);
    return work;
  }

  private isAllowed(url: string): boolean {
    return url === this.options.allowedOrigin || url.startsWith(`${this.options.allowedOrigin}/`);
  }

  private async isFresh(file: string): Promise<boolean> {
    try {
      const info = await stat(file);
      // Size floor here as well as after rendering: a blank frame cached by an
      // older build must not be treated as fresh forever.
      return info.size >= MIN_IMAGE_BYTES && Date.now() - info.mtimeMs < this.options.maxAgeMs;
    } catch {
      return false;
    }
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT_RENDERS) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      // Release exactly one waiter, and do it in the finally so a failed
      // render can never strand the queue behind it.
      this.waiting.shift()?.();
    }
  }

  /**
   * Render everything missing, in the background, without anyone waiting.
   *
   * The grid asks for every card at once on a cold cache; with a 30s page that
   * is a long stretch of placeholders. Kicking this off when the content list
   * is first read means the images arrive while the user is still looking at
   * the first screen. Failures are swallowed on purpose — this is a warm-up,
   * not a request, and a page that will not render must not surface as an
   * error nobody asked for.
   */
  warm(urls: readonly string[]): void {
    for (const url of urls) {
      if (!this.isAllowed(url)) continue;
      void this.pathFor(url, {}).catch(() => {});
    }
  }

  private async render(url: string, file: string): Promise<void> {
    await mkdir(this.options.cacheDir, { recursive: true });
    // Rendered to a sibling first and moved into place, so a reader can never
    // observe a half-written PNG and cache it as the real thing. The suffix
    // still ends in .png on purpose: Chromium picks its output format from the
    // extension and silently writes nothing at all for an unfamiliar one.
    const temp = `${file}.${process.pid}.tmp.png`;
    try {
      await this.options.runner(
        this.options.chromiumPath ?? "chromium",
        [
          "--headless",
          "--disable-gpu",
          "--no-sandbox",
          "--hide-scrollbars",
          `--window-size=${VIEWPORT}`,
          `--force-device-scale-factor=${SCALE}`,
          // Lets the page's own fonts and lazy images settle before the shot
          // without waiting on a real clock.
          "--virtual-time-budget=8000",
          `--screenshot=${temp}`,
          url,
        ],
        RENDER_TIMEOUT_MS,
      );
      const info = await stat(temp).catch(() => {
        throw new Error(`Chromium wrote no image for ${url}`);
      });
      if (info.size < MIN_IMAGE_BYTES) {
        throw new Error(`Chromium produced a blank image for ${url} (${info.size} bytes)`);
      }
      await rename(temp, file);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }
}

const defaultRunner: Runner = (bin, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    // execFile, never a shell: the URL is an argument, so nothing in it can
    // be read as a command however it is spelled.
    execFile(bin, [...args], { timeout: timeoutMs }, (error) => {
      // Chromium exits non-zero on plenty of pages that screenshot perfectly
      // well (a failed third-party subresource is enough). The image on disk
      // is the real result, so the caller checks that rather than the code —
      // this only surfaces the spawn itself failing.
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`Chromium not found at "${bin}"`));
        return;
      }
      resolve();
    });
  });
