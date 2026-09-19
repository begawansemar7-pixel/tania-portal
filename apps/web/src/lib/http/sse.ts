import type { ChatStreamEvent } from '@tania/types';
import { CORRELATION_HEADER } from '@tania/config';
import { logFailure, normalizeError } from './api-error';

/**
 * Encodes chat events as Server-Sent Events.
 *
 * One named event per payload, so a client can switch on `event.type` without
 * parsing the body first. Buffering is disabled explicitly — a proxy that
 * batches these would defeat the point.
 *
 * Failures take the same route as they would over JSON: normalised through
 * `normalizeError`, logged once against the correlation id, and reported with
 * the code they actually carry. This path used to forward `error.message`
 * verbatim under a hardcoded `INTERNAL`, and log nothing at all — so an
 * unexpected error was scrubbed when it left as JSON and quoted in full when it
 * left as an event, and an operator had no record of it either way.
 */
export function toSseResponse(
  events: AsyncIterable<ChatStreamEvent>,
  requestId: string,
): Response {
  const encoder = new TextEncoder();

  /**
   * A stream the client has already walked away from.
   *
   * Set by `cancel`, and checked before each write: once the consumer is gone,
   * `enqueue` throws, and throwing from inside the error handler would replace
   * a reportable failure with an unhandled one.
   */
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /** Writes an event, reporting whether the stream is still open. */
      const write = (event: ChatStreamEvent): boolean => {
        if (cancelled) return false;
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
          return true;
        } catch {
          // The consumer disconnected between the check and the write.
          cancelled = true;
          return false;
        }
      };

      try {
        for await (const event of events) {
          // Stops pulling the generator when nobody is listening, which also
          // lets it run its own cleanup instead of being abandoned mid-turn.
          if (!write(event)) break;
        }
      } catch (error) {
        const normalized = normalizeError(error);
        logFailure(normalized, requestId, error);
        write({ type: 'error', code: normalized.code, message: normalized.message });
      } finally {
        if (!cancelled) {
          try {
            controller.close();
          } catch {
            // Already closed by the runtime; nothing left to do.
          }
        }
      }
    },

    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      [CORRELATION_HEADER]: requestId,
    },
  });
}

/** Exported for tests: the exact bytes a client will parse. */
export function formatSseEvent(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
