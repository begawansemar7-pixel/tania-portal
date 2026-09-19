import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { TaniaError, describeError, newCorrelationId, toApiFailure } from '@tania/config';
import { isApiErrorCode, type ApiErrorCode, type ApiFailure } from '@tania/types';
import type { Request, Response } from 'express';
import { requestIdOf } from './correlation.middleware.js';
import { StructuredLogger } from './logger.service.js';

/**
 * Centralized error handling: every failure leaves as the shared envelope,
 * carrying the request's correlation id. Unexpected errors are logged with
 * their cause and reported as a bare INTERNAL — the detail stays in the log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = requestIdOf(request) || newCorrelationId();

    const normalized = toTaniaError(exception);
    const body: ApiFailure = toApiFailure(normalized, requestId);
    const log = this.logger.forRequest(requestId);
    const where = { method: request.method, path: request.url };

    if (normalized.status >= 500) {
      log.error('api.unhandled_error', {
        ...where,
        code: normalized.code,
        cause: describeError(normalized.cause ?? exception),
      });
    } else {
      log.warn('api.error', { ...where, code: normalized.code, message: normalized.message });
    }

    response.status(normalized.status).json(body);
  }
}

/** Normalizes anything thrown — Nest exception, TaniaError, or a raw value. */
export function toTaniaError(exception: unknown): TaniaError {
  if (exception instanceof TaniaError) return exception;

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const message = extractMessage(payload, exception.message);

    return new TaniaError(codeForStatus(status), message, {
      status,
      cause: exception,
      ...(isValidationPayload(payload) ? { details: { issues: payload.message } } : {}),
    });
  }

  return TaniaError.internal('Unexpected error.', { cause: exception });
}

function isValidationPayload(payload: unknown): payload is { message: string[] } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { message?: unknown }).message)
  );
}

function extractMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return fallback;
}

export function codeForStatus(status: number): ApiErrorCode {
  const byStatus: Record<number, ApiErrorCode> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'UPSTREAM_UNAVAILABLE',
  };

  const mapped = byStatus[status];
  if (mapped && isApiErrorCode(mapped)) return mapped;
  return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
}
