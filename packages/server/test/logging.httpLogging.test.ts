import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/logging/logger.js";
import { withRequestLogging, MAX_PATH_LENGTH, type RequestListenerLike } from "../src/logging/httpLogging.js";

function fakeStream() {
  const chunks: string[] = [];
  return { chunks, write: (chunk: string) => { chunks.push(chunk); return true; } };
}

let server: Server | undefined;

async function listen(listener: RequestListenerLike): Promise<string> {
  server = createServer((req, res) => void listener(req, res));
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server!.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("withRequestLogging", () => {
  it("a completed request logs exactly one line with method, path, status and numeric durationMs", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    }));

    const response = await fetch(`${base}/api/draft/626`);
    await response.text();

    expect(stream.chunks).toHaveLength(1);
    const line = JSON.parse(stream.chunks[0]);
    expect(line).toMatchObject({ event: "http.request", method: "GET", path: "/api/draft/626", status: 200 });
    expect(typeof line.durationMs).toBe("number");
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("the request line carries no query string, no cookie and no authorization header", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      res.writeHead(200).end("ok");
    }));

    const response = await fetch(`${base}/api/draft/626?token=QUERY-SENTINEL`, {
      headers: {
        Cookie: "solyx_session=COOKIE-SENTINEL",
        Authorization: "Basic QkFTSUMtU0VOVElORUw=",
      },
    });
    await response.text();

    expect(stream.chunks).toHaveLength(1);
    const raw = stream.chunks[0];
    expect(raw).not.toContain("QUERY-SENTINEL");
    expect(raw).not.toContain("COOKIE-SENTINEL");
    expect(raw).not.toContain("QkFTSUMtU0VOVElORUw=");
    expect(JSON.parse(raw).path).toBe("/api/draft/626");
  });

  it("a listener that rejects is logged at error level and the response still completes", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      // Mirrors router.ts:68 having already written a response before the
      // rejection propagates: the wrapper must observe, never swallow or hang.
      res.writeHead(500, { "Content-Type": "text/plain" }).end("Internal error");
      return Promise.reject(new Error("boom"));
    }));

    const response = await fetch(`${base}/api/draft/626`);
    expect(response.status).toBe(500);
    await response.text();

    const errorLines = stream.chunks.map((c) => JSON.parse(c)).filter((l) => l.level === "error");
    expect(errorLines).toHaveLength(1);
    expect(JSON.stringify(errorLines[0])).toContain("boom");
  });

  it("/healthz produces no log line", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    }));

    await (await fetch(`${base}/healthz`)).text();
    expect(stream.chunks).toHaveLength(0);

    // Same wrapper, same server: proves the silence is the /healthz rule and
    // not a logger that writes nothing at all.
    await (await fetch(`${base}/api/draft/626`)).text();
    expect(stream.chunks).toHaveLength(1);
    expect(JSON.parse(stream.chunks[0]).path).toBe("/api/draft/626");
  });
  it("a client that aborts mid-response still produces exactly one line, at event http.aborted", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      // Headers and a partial body, then nothing: the shape of a proxy hop that
      // hangs. Without a "close" handler this request is invisible in the journal.
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.write("partial");
      return new Promise<void>(() => {});
    }));

    const controller = new AbortController();
    const response = await fetch(`${base}/api/draft/626`, { signal: controller.signal });
    await response.body!.getReader().read();
    controller.abort();

    const deadline = Date.now() + 2000;
    while (stream.chunks.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(stream.chunks).toHaveLength(1);
    const line = JSON.parse(stream.chunks[0]);
    expect(line).toMatchObject({ event: "http.aborted", method: "GET", path: "/api/draft/626" });
    expect(typeof line.durationMs).toBe("number");
  });

  it("a completed request logs no second line when its socket later closes", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    }));

    // Connection: close makes the socket close right after "finish", which is
    // exactly the sequence that would double-log.
    const response = await fetch(`${base}/api/draft/626`, { headers: { Connection: "close" } });
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(stream.chunks).toHaveLength(1);
    expect(JSON.parse(stream.chunks[0]).event).toBe("http.request");
  });

  it("a request path far over the cap is truncated in the logged line", async () => {
    const stream = fakeStream();
    const logger = createLogger({ stream });
    const base = await listen(withRequestLogging(logger, (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    }));

    const longPath = `/api/draft/${"a".repeat(5000)}`;
    await (await fetch(`${base}${longPath}`)).text();

    expect(stream.chunks).toHaveLength(1);
    const { path } = JSON.parse(stream.chunks[0]);
    expect(path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH + 1);
    expect(path.startsWith("/api/draft/aaa")).toBe(true);
    expect(path.endsWith("\u2026")).toBe(true);
  });
});
