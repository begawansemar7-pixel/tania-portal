/**
 * Bridges callback-style progress into an async iterable.
 *
 * The chat pipeline reports progress through hooks; a Server-Sent Events
 * response needs something to iterate. This is the adapter between the two.
 */
export class AsyncEventQueue<T> {
  private readonly buffer: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private rejecter: ((error: unknown) => void) | null = null;
  private closed = false;
  private failure: unknown;

  push(item: T): void {
    if (this.closed) return;

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: item, done: false });
      return;
    }
    this.buffer.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as never, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.closed) return;
    this.failure = error;
    this.closed = true;

    if (this.rejecter) {
      this.rejecter(error);
      this.rejecter = null;
    }
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as T;
        continue;
      }

      if (this.closed) {
        if (this.failure !== undefined) throw this.failure;
        return;
      }

      const next = await new Promise<IteratorResult<T>>((resolve, reject) => {
        this.waiters.push(resolve);
        this.rejecter = reject;
      });

      if (next.done) {
        if (this.failure !== undefined) throw this.failure;
        return;
      }
      yield next.value;
    }
  }
}
