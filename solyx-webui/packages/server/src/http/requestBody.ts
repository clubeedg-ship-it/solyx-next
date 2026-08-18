import type { IncomingMessage } from "node:http";

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Reads a full request body as a UTF-8 string, rejecting once more than
 * `maxBytes` has arrived rather than buffering an unbounded,
 * attacker-controlled amount of data in memory. Used only for the small,
 * fixed-shape POST /login body (username + password) — see loginRoutes.ts.
 */
export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(error);
    };

    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
  });
}
