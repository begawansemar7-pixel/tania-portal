/** Request correlation: one id follows a request across portal, API, and runtime. */

/** UUID v4 string. Kept as a nominal-ish alias for readability at call sites. */
export type CorrelationId = string;

/** Header carrying the correlation id between TANIA services. */
export const CORRELATION_HEADER = 'x-request-id';

/** Header carrying a first-party actor assertion (service auth mode). */
export const ACTOR_ASSERTION_HEADER = 'x-tania-actor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCorrelationId(value: unknown): value is CorrelationId {
  return typeof value === 'string' && UUID_RE.test(value);
}
