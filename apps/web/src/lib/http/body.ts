import { ApiError } from './api-error';

/**
 * Largest JSON body any portal route will accept.
 *
 * Next's route handlers impose no limit of their own — `request.json()` will
 * happily buffer whatever arrives — while the NestJS backend inherits Express's
 * 100 kB default. Two tiers of one system disagreeing about this is the gap
 * worth closing, not the exact number.
 *
 * 256 kB is comfortably above the largest legitimate request (a 4 000-character
 * message plus bounded context) and far below what would pressure a container.
 */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * Reads and parses a JSON request body, bounded.
 *
 * Replaces the identical four-line `try { await request.json() }` that stood in
 * ten route handlers, none of which bounded anything. Two limits apply, because
 * one is not enough:
 *
 * 1. `Content-Length`, when present, is rejected before a single byte is read.
 * 2. The stream is then counted as it arrives, which is what catches a chunked
 *    request that declares no length at all — the case a header check alone
 *    would wave straight through.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw ApiError.payloadTooLarge(
      `Request body must be at most ${MAX_BODY_BYTES} bytes.`,
      { details: { limit: MAX_BODY_BYTES, declared } },
    );
  }

  const raw = await readBounded(request);

  if (raw.trim().length === 0) {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }
}

async function readBounded(request: Request): Promise<string> {
  if (request.body === null) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;

      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        // Stop pulling rather than finish buffering something already refused.
        await reader.cancel();
        throw ApiError.payloadTooLarge(`Request body must be at most ${MAX_BODY_BYTES} bytes.`, {
          details: { limit: MAX_BODY_BYTES },
        });
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}
