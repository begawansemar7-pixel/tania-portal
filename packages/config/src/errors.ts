import {
  statusForErrorCode,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiFailure,
} from '@tania/types';

export interface TaniaErrorOptions {
  details?: Record<string, unknown>;
  cause?: unknown;
  /** Overrides the canonical status for the code. Use sparingly. */
  status?: number;
}

/**
 * The one error type crossing service boundaries.
 *
 * Anything thrown that is not a `TaniaError` is treated as unexpected: it is
 * logged with its stack and reported to the caller as a bare INTERNAL, because
 * an unexpected message may carry details the caller must not see.
 */
export class TaniaError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ApiErrorCode, message: string, options: TaniaErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'TaniaError';
    this.code = code;
    this.status = options.status ?? statusForErrorCode(code);
    this.details = options.details;
  }

  toBody(): ApiErrorBody {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }

  static badRequest(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('BAD_REQUEST', message, options);
  }

  static validation(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('VALIDATION_FAILED', message, options);
  }

  static unauthorized(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('UNAUTHORIZED', message, options);
  }

  static forbidden(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('FORBIDDEN', message, options);
  }

  static notFound(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('NOT_FOUND', message, options);
  }

  static conflict(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('CONFLICT', message, options);
  }

  static policyDenied(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('POLICY_DENIED', message, options);
  }

  static payloadTooLarge(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('PAYLOAD_TOO_LARGE', message, options);
  }

  static upstreamUnavailable(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('UPSTREAM_UNAVAILABLE', message, options);
  }

  static notImplemented(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('NOT_IMPLEMENTED', message, options);
  }

  static internal(message: string, options?: TaniaErrorOptions): TaniaError {
    return new TaniaError('INTERNAL', message, options);
  }
}

export function isTaniaError(error: unknown): error is TaniaError {
  return error instanceof TaniaError;
}

/** Status to answer with, for any thrown value. */
export function statusOf(error: unknown): number {
  return isTaniaError(error) ? error.status : 500;
}

/**
 * Converts any thrown value into the shared failure envelope. Unknown errors
 * never leak their message — that detail belongs in the log, not the response.
 */
export function toApiFailure(error: unknown, requestId: string): ApiFailure {
  if (isTaniaError(error)) {
    return { error: error.toBody(), requestId };
  }
  return {
    error: { code: 'INTERNAL', message: 'Unexpected error.' },
    requestId,
  };
}

/** Message safe for logs (never for responses). */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
