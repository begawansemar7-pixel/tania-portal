import { afterEach, describe, expect, it, vi } from 'vitest';
import { toSseResponse } from '@/lib/http/sse';
import { logger } from '@/lib/logger';
import { TaniaError } from '@tania/config';
import type { ChatStreamEvent } from '@tania/types';

/**
 * How a failure leaves over Server-Sent Events.
 *
 * The JSON path deliberately reduces an unexpected error to a bare `INTERNAL`
 * with a generic message, because an unexpected message may carry detail the
 * caller must not see. The streaming path used to do the opposite: forward
 * `error.message` verbatim, label everything `INTERNAL` regardless of what was
 * thrown, and log nothing. These tests hold both paths to the same rule.
 */

async function collect(events: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const response = toSseResponse(events, 'req-sse-1');
  const text = await response.text();

  return text
    .trimEnd()
    .split('\n\n')
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const line = frame.split('\n').find((part) => part.startsWith('data: ')) ?? '';
      return JSON.parse(line.replace(/^data: /, '')) as ChatStreamEvent;
    });
}

function failingStream(error: unknown): AsyncIterable<ChatStreamEvent> {
  return (async function* () {
    yield { type: 'phase', phase: 'UNDERSTANDING' } as ChatStreamEvent;
    throw error;
  })();
}

function errorEventOf(events: ChatStreamEvent[]): Extract<ChatStreamEvent, { type: 'error' }> {
  const event = events.at(-1);
  if (event?.type !== 'error') throw new Error(`last event was ${String(event?.type)}`);
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streaming failures', () => {
  it('does not forward the message of an unexpected error', async () => {
    const leaky = new Error('connect ECONNREFUSED 10.0.0.7:5432 as user tania_admin');

    const event = errorEventOf(await collect(failingStream(leaky)));

    expect(event.message).not.toContain('10.0.0.7');
    expect(event.message).not.toContain('tania_admin');
    expect(event.code).toBe('INTERNAL');
  });

  it('keeps the code a known failure actually carries', async () => {
    // Previously every failure was relabelled INTERNAL, so a client could not
    // tell "slow down" from "something broke".
    const event = errorEventOf(
      await collect(failingStream(TaniaError.upstreamUnavailable('Penyedia model tidak dapat dihubungi.'))),
    );

    expect(event.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(event.message).toBe('Penyedia model tidak dapat dihubungi.');
  });

  it('keeps the events emitted before the failure', async () => {
    const events = await collect(failingStream(new Error('boom')));

    expect(events.map((event) => event.type)).toEqual(['phase', 'error']);
  });

  it('records the failure against the correlation id', async () => {
    // It was previously reported to the caller and to nobody else, leaving an
    // operator with a complaint and no trace of it.
    const child = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    vi.spyOn(logger, 'child').mockReturnValue(child as unknown as ReturnType<typeof logger.child>);

    await collect(failingStream(new Error('boom')));

    expect(logger.child).toHaveBeenCalledWith({ requestId: 'req-sse-1' });
    expect(child.error).toHaveBeenCalledWith('api.unhandled_error', expect.anything());
  });

  it('logs a client-caused failure as a warning, not as a server error', async () => {
    const child = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    vi.spyOn(logger, 'child').mockReturnValue(child as unknown as ReturnType<typeof logger.child>);

    await collect(failingStream(TaniaError.badRequest('Pesan tidak valid.')));

    expect(child.warn).toHaveBeenCalled();
    expect(child.error).not.toHaveBeenCalled();
  });

  it('stops pulling the generator once the consumer disconnects', async () => {
    let produced = 0;
    let cleanedUp = false;

    const endless = (async function* () {
      try {
        for (;;) {
          produced += 1;
          yield { type: 'delta', text: 'x' } as ChatStreamEvent;
        }
      } finally {
        cleanedUp = true;
      }
    })();

    const response = toSseResponse(endless, 'req-sse-2');
    const reader = response.body!.getReader();

    await reader.read();
    await reader.cancel();

    // Give the producer a turn to notice, then confirm it stopped rather than
    // spinning on a stream nobody is reading.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const settled = produced;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(produced).toBe(settled);
    expect(cleanedUp).toBe(true);
  });

  it('does not throw when the failure arrives after the consumer left', async () => {
    // The old catch enqueued unconditionally, so a disconnect turned a
    // reportable failure into an unhandled one inside the stream.
    const stream = (async function* () {
      yield { type: 'phase', phase: 'UNDERSTANDING' } as ChatStreamEvent;
      throw new Error('boom');
    })();

    const response = toSseResponse(stream, 'req-sse-3');
    const reader = response.body!.getReader();

    await reader.read();
    await expect(reader.cancel()).resolves.toBeUndefined();
  });
});
