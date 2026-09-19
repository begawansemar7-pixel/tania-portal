import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, readJsonBody } from '@/lib/http/body';
import { TaniaError } from '@tania/config';

/**
 * Bounds on the request body.
 *
 * Next's route handlers buffer whatever arrives; the NestJS backend inherits
 * Express's 100 kB default. The portal previously had no limit at all, so the
 * two tiers of one system disagreed about how much a caller may send.
 */

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/tania/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

/** A body with no `Content-Length`, the way a chunked client sends one. */
function chunkedRequest(body: string): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Several chunks, so the counter has to accumulate rather than look once.
      for (let offset = 0; offset < body.length; offset += 8192) {
        controller.enqueue(encoder.encode(body.slice(offset, offset + 8192)));
      }
      controller.close();
    },
  });

  return new Request('http://localhost/api/tania/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    // @ts-expect-error duplex is required by undici for a stream body and is
    // not yet in the DOM lib types.
    duplex: 'half',
  });
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof TaniaError ? error.code : `not a TaniaError: ${String(error)}`;
  }
  return 'no error thrown';
}

describe('readJsonBody', () => {
  it('parses an ordinary body', async () => {
    const payload = await readJsonBody(jsonRequest(JSON.stringify({ message: 'halo' })));

    expect(payload).toEqual({ message: 'halo' });
  });

  it('accepts a body just under the limit', async () => {
    const message = 'x'.repeat(MAX_BODY_BYTES - 64);
    const payload = await readJsonBody(jsonRequest(JSON.stringify({ message })));

    expect((payload as { message: string }).message).toHaveLength(message.length);
  });

  it('refuses an oversized body by its declared length', async () => {
    const body = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES + 1024) });

    expect(await codeOf(() => readJsonBody(jsonRequest(body)))).toBe('PAYLOAD_TOO_LARGE');
  });

  it('refuses an oversized body that declares no length', async () => {
    // The case a Content-Length check alone waves straight through.
    const body = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES + 1024) });

    expect(await codeOf(() => readJsonBody(chunkedRequest(body)))).toBe('PAYLOAD_TOO_LARGE');
  });

  it('does not trust a Content-Length that undersells the body', async () => {
    const body = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES + 1024) });

    // A lying header must not buy passage: the stream is counted regardless.
    expect(await codeOf(() => readJsonBody(jsonRequest(body, { 'content-length': '10' })))).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });

  it('carries the limit so a client can act on the refusal', async () => {
    const body = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES + 1024) });

    try {
      await readJsonBody(jsonRequest(body));
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect((error as TaniaError).status).toBe(413);
      expect((error as TaniaError).details?.limit).toBe(MAX_BODY_BYTES);
    }
  });

  it('reports malformed JSON as a bad request, not a server error', async () => {
    expect(await codeOf(() => readJsonBody(jsonRequest('{ not json')))).toBe('BAD_REQUEST');
  });

  it('treats an empty body as malformed rather than as null', async () => {
    expect(await codeOf(() => readJsonBody(jsonRequest('')))).toBe('BAD_REQUEST');
  });
});
