import { describe, expect, it } from 'vitest';
import { AsyncEventQueue } from '@/lib/tania/services/event-queue';

async function drain<T>(queue: AsyncEventQueue<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of queue) items.push(item);
  return items;
}

describe('AsyncEventQueue', () => {
  it('delivers items pushed before iteration starts', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.close();

    await expect(drain(queue)).resolves.toEqual([1, 2]);
  });

  it('delivers items pushed while a consumer is waiting', async () => {
    const queue = new AsyncEventQueue<string>();
    const collected = drain(queue);

    setTimeout(() => {
      queue.push('a');
      queue.push('b');
      queue.close();
    }, 5);

    await expect(collected).resolves.toEqual(['a', 'b']);
  });

  it('ends cleanly when closed with nothing buffered', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.close();

    await expect(drain(queue)).resolves.toEqual([]);
  });

  it('surfaces a failure to the consumer', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.fail(new Error('upstream gone'));

    await expect(drain(queue)).rejects.toThrow('upstream gone');
  });

  it('ignores pushes after close, so a late callback cannot resurrect it', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.close();
    queue.push(2);

    await expect(drain(queue)).resolves.toEqual([1]);
  });
});
