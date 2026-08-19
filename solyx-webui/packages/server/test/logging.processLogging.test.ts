import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logging/logger.js";
import { installProcessLogging, type ProcessLike } from "../src/logging/processLogging.js";

function harness() {
  const calls: string[] = [];
  const chunks: string[] = [];
  const stream = { write: (chunk: string) => { chunks.push(chunk); calls.push("write"); return true; } };
  const exitCodes: number[] = [];
  const exit = (code: number) => { exitCodes.push(code); calls.push("exit"); };
  const proc = new EventEmitter();
  installProcessLogging({ logger: createLogger({ stream }), proc: proc as unknown as ProcessLike, exit });
  return { calls, chunks, exitCodes, proc };
}

// setImmediate lets a pipe-backed stdout flush before the process dies.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

describe("installProcessLogging", () => {
  it("an unhandledRejection is logged at error level with reason and stack", async () => {
    const h = harness();
    h.proc.emit("unhandledRejection", new Error("gateway promise died"));
    await settle();

    expect(h.chunks).toHaveLength(1);
    const line = JSON.parse(h.chunks[0]) as Record<string, unknown>;
    expect(line.level).toBe("error");
    expect(JSON.stringify(line)).toContain("gateway promise died");
    expect(typeof line.stack).toBe("string");
    expect(line.stack as string).not.toBe("");
  });

  it("the process still exits non-zero after the unhandledRejection line is written", async () => {
    const h = harness();
    h.proc.emit("unhandledRejection", new Error("gateway promise died"));
    await settle();

    expect(h.exitCodes).toEqual([1]);
    expect(h.calls).toEqual(["write", "exit"]);
  });

  it("an uncaughtException is logged then exits 1", async () => {
    const h = harness();
    h.proc.emit("uncaughtException", new Error("socket exploded"));
    await settle();

    expect(h.chunks).toHaveLength(1);
    expect(JSON.parse(h.chunks[0]).level).toBe("error");
    expect(JSON.stringify(JSON.parse(h.chunks[0]))).toContain("socket exploded");
    expect(h.exitCodes).toEqual([1]);
    expect(h.calls).toEqual(["write", "exit"]);
  });
});
