import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { PayloadTooLargeError, readBody } from "../src/http/requestBody.js";

function fakeRequest(chunks: string[]): IncomingMessage {
  return Readable.from(chunks.map((c) => Buffer.from(c))) as unknown as IncomingMessage;
}

describe("readBody", () => {
  it("resolves the full body when under the byte limit", async () => {
    const req = fakeRequest(["username=owner&", "password=hunter2"]);
    const body = await readBody(req, 1024);
    expect(body).toBe("username=owner&password=hunter2");
  });

  it("rejects with PayloadTooLargeError once the byte limit is exceeded", async () => {
    const req = fakeRequest(["a".repeat(10), "b".repeat(10)]);
    await expect(readBody(req, 15)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
});
