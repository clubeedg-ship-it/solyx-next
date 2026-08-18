/**
 * A minimal async-iterable queue: producers push/end/fail, consumers
 * `for await` over it. Used to bridge BackendSocket's callback-style push
 * events into the AsyncGenerator shape assistant-ui's ChatModelAdapter.run()
 * expects, without polling.
 */
export class AsyncQueue<T> {
  private readonly buffer: T[] = [];
  private waiter: (() => void) | undefined;
  private ended = false;
  private error: Error | undefined;

  push(item: T): void {
    if (this.ended) return;
    this.buffer.push(item);
    this.wake();
  }

  end(): void {
    this.ended = true;
    this.wake();
  }

  fail(error: Error): void {
    this.error = error;
    this.ended = true;
    this.wake();
  }

  private wake(): void {
    this.waiter?.();
    this.waiter = undefined;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
    for (;;) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as T;
        continue;
      }
      if (this.ended) {
        if (this.error) throw this.error;
        return;
      }
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}
