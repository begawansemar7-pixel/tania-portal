import { CORRELATION_HEADER, correlationFrom } from '@tania/config';
import type { NextFunction, Request, Response } from 'express';

/**
 * Gives every request a correlation id and echoes it back, so a caller can
 * quote the id from a failed response and find the exact log lines.
 *
 * Registered with `app.use()` in `main.ts` — it must run before routing, and
 * before the exception filter needs an id.
 */
export function correlationMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const correlationId = correlationFrom(request.headers as Record<string, string | string[]>);

  request.headers[CORRELATION_HEADER] = correlationId;
  response.setHeader(CORRELATION_HEADER, correlationId);
  next();
}

/** Reads the correlation id assigned by the middleware. */
export function requestIdOf(request: Request): string {
  const header = request.headers[CORRELATION_HEADER];
  return Array.isArray(header) ? (header[0] ?? '') : (header ?? '');
}
