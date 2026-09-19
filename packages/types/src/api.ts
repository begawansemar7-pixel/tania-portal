/**
 * The single response envelope every TANIA HTTP surface returns.
 *
 * One shape for success, one for failure, and a correlation id on both — so a
 * caller can always find the matching log line without guessing.
 */

/** Machine-readable failure codes. Stable across services; never localised. */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'POLICY_DENIED',
  'VALIDATION_FAILED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'NOT_IMPLEMENTED',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Canonical HTTP status for each code, so services cannot drift apart. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  POLICY_DENIED: 403,
  VALIDATION_FAILED: 422,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** Human-readable, safe to show. Never contains secrets or stack traces. */
  message: string;
  /** Field-level or contextual detail, e.g. which validation rules failed. */
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
  meta?: ResponseMeta;
}

export interface ApiFailure {
  error: ApiErrorBody;
  requestId: string;
  meta?: ResponseMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ResponseMeta {
  /** ISO-8601 timestamp the response was produced. */
  at?: string;
  /** Present on list endpoints. */
  page?: PageInfo;
  [key: string]: unknown;
}

export interface PageInfo {
  limit: number;
  returned: number;
  /** Opaque cursor for the next page; absent when the list is exhausted. */
  nextCursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: PageInfo;
}

export function isApiFailure<T>(response: ApiResponse<T>): response is ApiFailure {
  return 'error' in response;
}

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return 'data' in response;
}

export function statusForErrorCode(code: ApiErrorCode): number {
  return API_ERROR_STATUS[code] ?? 500;
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}
