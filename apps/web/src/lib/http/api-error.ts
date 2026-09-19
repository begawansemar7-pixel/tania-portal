import { TaniaError, describeError, statusOf, toApiFailure } from '@tania/config';
import { statusForErrorCode, type ApiErrorCode, type ApiSuccess } from '@tania/types';
import { logger } from '@/lib/logger';
import { TaniaApiError } from '@/lib/tania/api/client';

/**
 * Structured errors for the portal's route handlers.
 *
 * `ApiError` is the shared `TaniaError`: one error type, one set of codes, and
 * one response envelope across portal, API, and runtime.
 */
export { TaniaError as ApiError, statusForErrorCode };
export type { ApiErrorCode };

/** Success envelope helper, so handlers never assemble the shape by hand. */
export function ok<T>(data: T, requestId: string, meta?: ApiSuccess<T>['meta']): Response {
  const body: ApiSuccess<T> = meta === undefined ? { data, requestId } : { data, requestId, meta };
  return Response.json(body, { status: 200 });
}

/**
 * Centralized error handling for every route handler.
 *
 * A backend failure is reported as such rather than as a generic 500, and an
 * unexpected error never leaks its message to the caller.
 */
export function toErrorResponse(error: unknown, requestId: string): Response {
  const normalized = normalizeError(error);
  logFailure(normalized, requestId, error);

  return Response.json(toApiFailure(normalized, requestId), {
    status: statusOf(normalized),
    headers: retryHeaders(normalized),
  });
}

/**
 * Reduces anything thrown to the one error type, scrubbing what must not leave.
 *
 * Exported because a response is not the only way a failure reaches a caller:
 * the streaming path has to say the same thing over Server-Sent Events. When
 * both paths normalise here, an unexpected error cannot be verbose in one and
 * generic in the other.
 */
export function normalizeError(error: unknown): TaniaError {
  return normalize(error);
}

/**
 * Records a failure once, at the severity it deserves.
 *
 * A 5xx is logged with its cause, because an operator needs the detail the
 * caller must not receive; anything else is a warning carrying only the
 * user-safe message. Exported for the same reason as `normalizeError`: a
 * failure that leaves over SSE was previously never logged at all, so nothing
 * tied it back to its correlation id.
 */
export function logFailure(normalized: TaniaError, requestId: string, original?: unknown): void {
  const log = logger.child({ requestId });

  if (statusOf(normalized) >= 500) {
    log.error('api.unhandled_error', {
      code: normalized.code,
      cause: describeError(normalized.cause ?? original ?? normalized),
    });
  } else {
    log.warn('api.error', { code: normalized.code, message: normalized.message });
  }
}

/**
 * `Retry-After` for a throttled caller.
 *
 * A 429 without it leaves the client to guess, and a client that guesses
 * usually retries immediately — which is the behaviour the limit exists to
 * stop.
 */
function retryHeaders(error: TaniaError): Record<string, string> {
  if (error.code !== 'RATE_LIMITED') return {};

  const retryAfter = error.details?.retryAfter;
  return typeof retryAfter === 'number' && retryAfter > 0
    ? { 'retry-after': String(retryAfter) }
    : {};
}

function normalize(error: unknown): TaniaError {
  if (error instanceof TaniaError) return error;

  // A failure reaching us from the backend keeps its meaning.
  if (error instanceof TaniaApiError) {
    return new TaniaError(error.code as ApiErrorCode, error.message, {
      status: error.status >= 500 ? 503 : error.status,
      cause: error,
    });
  }

  return TaniaError.internal('Unexpected error.', { cause: error });
}
