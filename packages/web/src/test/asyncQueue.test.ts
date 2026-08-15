import { describe, expect, it } from "vitest";
import { AsyncQueue } from "../runtime/asyncQueue.js";

async function drain<T>(queue: AsyncQueue<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of queue) items.push(item);
  return items;
}

describe("AsyncQueue", () => {
  it("yields items pushed before iteration starts", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.push("b");
    queue.end();

    await expect(drain(queue)).resolves.toEqual(["a", "b"]);
  });

  it("yields items pushed after iteration has started", async () => {
    const queue = new AsyncQueue<string>();
    const resultPromise = drain(queue);

    await Promise.resolve();
    queue.push("a");
    await Promise.resolve();
    queue.push("b");
    queue.end();

    await expect(resultPromise).resolves.toEqual(["a", "b"]);
  });

  it("throws the failure error to the consumer once buffered items are drained", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.fail(new Error("boom"));

    await expect(drain(queue)).rejects.toThrow("boom");
  });

  it("ignores pushes after end()", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.end();
    queue.push("b");

    await expect(drain(queue)).resolves.toEqual(["a"]);
  });
});
