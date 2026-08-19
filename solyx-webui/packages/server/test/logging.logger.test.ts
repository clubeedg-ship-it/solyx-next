import { beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/logging/logger.js";

function fakeStream() {
  const chunks: string[] = [];
  return { chunks, write: (chunk: string) => { chunks.push(chunk); return true; } };
}

const FROZEN = () => new Date("2026-08-18T09:00:00.000Z");

describe("createLogger", () => {
  let stream: ReturnType<typeof fakeStream>;
  beforeEach(() => {
    stream = fakeStream();
    delete process.env.LOG_LEVEL;
  });

  it("info() writes exactly one newline-terminated JSON line carrying ts, level, msg and merged fields", () => {
    const logger = createLogger({ stream, now: FROZEN });
    logger.info("server listening", { host: "127.0.0.1", port: 8099 });

    expect(stream.chunks).toHaveLength(1);
    expect(stream.chunks[0].endsWith("\n")).toBe(true);
    expect(JSON.parse(stream.chunks[0])).toEqual({
      ts: "2026-08-18T09:00:00.000Z",
      level: "info",
      msg: "server listening",
      host: "127.0.0.1",
      port: 8099,
    });
  });

  it("LOG_LEVEL=warn drops info lines and keeps warn and error", () => {
    process.env.LOG_LEVEL = "warn";
    const logger = createLogger({ stream, now: FROZEN });
    logger.info("dropped");
    logger.warn("kept warn");
    logger.error("kept error");

    expect(stream.chunks).toHaveLength(2);
    expect(stream.chunks.map((c) => JSON.parse(c).level)).toEqual(["warn", "error"]);
  });

  it("defaults to info level when LOG_LEVEL is unset", () => {
    const logger = createLogger({ stream, now: FROZEN });
    logger.info("kept");
    expect(stream.chunks).toHaveLength(1);
  });

  it("LOG_FORMAT=text writes a human line that still carries ts, level and msg", () => {
    const logger = createLogger({ stream, now: FROZEN, format: "text" });
    logger.info("server listening", { port: 8099 });

    expect(stream.chunks).toHaveLength(1);
    expect(stream.chunks[0]).toBe("2026-08-18T09:00:00.000Z INFO server listening {\"port\":8099}\n");
  });

  it("a field containing a circular reference logs a degraded line instead of throwing", () => {
    const logger = createLogger({ stream, now: FROZEN });
    const self: Record<string, unknown> = { name: "loop" };
    self.self = self;

    expect(() => logger.info("x", { self })).not.toThrow();
    expect(stream.chunks).toHaveLength(1);
    expect(stream.chunks[0]).toContain("\"x\"");
  });
  it("msg itself goes through redact(), so a credential passed as the message never reaches the journal", () => {
    const logger = createLogger({ stream, now: FROZEN });
    logger.info("Bearer SENTINEL-TOKEN-VALUE");

    expect(stream.chunks).toHaveLength(1);
    expect(stream.chunks[0]).not.toContain("SENTINEL-TOKEN-VALUE");
    expect(JSON.parse(stream.chunks[0]).msg).toBe("[redacted]");
  });

  it("debug() emits under LOG_LEVEL=debug and is dropped at the default info level", () => {
    const quiet = createLogger({ stream, now: FROZEN });
    quiet.debug("not at info level");
    expect(stream.chunks).toHaveLength(0);

    process.env.LOG_LEVEL = "debug";
    const verbose = createLogger({ stream, now: FROZEN });
    verbose.debug("gateway frame", { frame: "hello" });

    expect(stream.chunks).toHaveLength(1);
    expect(JSON.parse(stream.chunks[0])).toEqual({
      ts: "2026-08-18T09:00:00.000Z",
      level: "debug",
      msg: "gateway frame",
      frame: "hello",
    });
  });

  it("caller fields named ts/level/msg cannot override the real ones", () => {
    const logger = createLogger({ stream, now: FROZEN });
    logger.info("real", { ts: "HIJACK", level: "error", msg: "fake", ok: 1 });

    expect(stream.chunks).toHaveLength(1);
    expect(JSON.parse(stream.chunks[0])).toEqual({
      ts: "2026-08-18T09:00:00.000Z",
      level: "info",
      msg: "real",
      ok: 1,
    });
  });
});
