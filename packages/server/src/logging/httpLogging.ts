import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "./logger.js";

export type RequestListenerLike = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/** Health probes run every few seconds; logging them buries real traffic. */
const UNLOGGED_PATHS = new Set(["/healthz"]);

/**
 * The path is fully client-controlled and unbounded in length. Injection is not
 * a risk (JSON.stringify escapes everything), but an unbounded field is a
 * journal-volume risk: a loop requesting 8KB URLs would fill the disk systemd
 * logs to. Prefix is kept because that is the part that identifies the route.
 */
export const MAX_PATH_LENGTH = 256;

/**
 * Wraps the router in one access-log line per request.
 *
 * Strictly observation-only: it never touches headers, never writes to the
 * response and never short-circuits, so router.ts keeps sole ownership of what
 * the client receives — including its own catch-all at router.ts:68.
 *
 * The line carries the path WITHOUT its query string and never reads
 * req.headers. Both are deliberate: a draft URL can carry a token query
 * parameter and every request to this server carries the session cookie, and a
 * redacted-but-kept header bag is one missed key away from leaking a live
 * credential into the journal.
 */
export function withRequestLogging(logger: Logger, listener: RequestListenerLike): RequestListenerLike {
  return async function loggedRequestListener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = pathOf(req.url);

    if (UNLOGGED_PATHS.has(path)) {
      await listener(req, res);
      return;
    }

    const startedAt = performance.now();
    // "close" always fires, "finish" only on a response that completed. One
    // request must still produce one line, so whichever fires first claims it.
    let logged = false;

    res.on("finish", () => {
      // Never throw out of a "finish" handler: it runs on the socket's event
      // loop turn, where an exception becomes an uncaughtException and kills
      // the process. createLogger already swallows its own failures; this is
      // the second belt.
      logged = true;
      try {
        logger.info("http request", {
          event: "http.request",
          method: req.method ?? "",
          path,
          status: res.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
        });
      } catch {
        // nothing sane left to do here
      }
    });

    res.on("close", () => {
      // The failure this whole module exists to diagnose: a request that hangs
      // in a proxy hop or whose client walks away never emits "finish", so
      // before this handler it produced no journal line at all.
      if (logged || res.writableFinished) return;
      logged = true;
      try {
        logger.warn("http request aborted", {
          event: "http.aborted",
          method: req.method ?? "",
          path,
          status: res.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
        });
      } catch {
        // Same rule as "finish", and stricter: this runs on socket teardown,
        // where a throw becomes an uncaughtException and installProcessLogging
        // would then exit the live service.
      }
    });

    try {
      await listener(req, res);
    } catch (error) {
      // Observe and stop. Re-throwing would surface as an unhandledRejection
      // and take the process down for a request router.ts has already answered.
      logger.error("http request failed", {
        event: "http.error",
        method: req.method ?? "",
        path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  };
}

function pathOf(url: string | undefined): string {
  const raw = url ?? "/";
  const queryAt = raw.indexOf("?");
  const hashAt = raw.indexOf("#");
  const end = Math.min(queryAt === -1 ? raw.length : queryAt, hashAt === -1 ? raw.length : hashAt);
  const path = raw.slice(0, end) || "/";
  return path.length > MAX_PATH_LENGTH ? `${path.slice(0, MAX_PATH_LENGTH)}\u2026` : path;
}
