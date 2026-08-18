import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import type { ServerResponse } from "node:http";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * Serves the built frontend (packages/web/dist) as a single-page app: any
 * path that doesn't match a real file falls back to index.html, so the
 * client-side router (there isn't much of one — three fixed columns — but
 * a direct reload on any path still needs this) always gets the app shell.
 */
export function serveStaticFile(staticDir: string, requestPath: string, res: ServerResponse): void {
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(staticDir, safePath === "/" ? "index.html" : safePath);

  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(staticDir, "index.html");

  if (!existsSync(filePath)) {
    res.writeHead(404).end("Not found");
    return;
  }

  const contentType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
}
