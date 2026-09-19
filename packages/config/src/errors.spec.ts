import { describe, expect, it } from 'vitest';
import { TaniaError, describeError, isTaniaError, statusOf, toApiFailure } from './errors.js';

describe('TaniaError', () => {
  it('derives the canonical status from the code', () => {
    expect(TaniaError.notFound('x').status).toBe(404);
    expect(TaniaError.policyDenied('x').status).toBe(403);
    expect(TaniaError.upstreamUnavailable('x').status).toBe(503);
    expect(TaniaError.validation('x').status).toBe(422);
  });

  it('carries details into the response body', () => {
    const error = TaniaError.validation('Invalid payload', { details: { field: 'message' } });
    expect(error.toBody()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Invalid payload',
      details: { field: 'message' },
    });
  });

  it('keeps the cause for logging without exposing it', () => {
    const cause = new Error('connection refused');
    const error = TaniaError.upstreamUnavailable('Backend unreachable', { cause });

    expect(error.cause).toBe(cause);
    expect(error.toBody().message).toBe('Backend unreachable');
  });
});

describe('toApiFailure', () => {
  it('maps a TaniaError faithfully', () => {
    const failure = toApiFailure(TaniaError.forbidden('No scope'), 'req-1');
    expect(failure).toEqual({ error: { code: 'FORBIDDEN', message: 'No scope' }, requestId: 'req-1' });
  });

  it('never leaks an unexpected error message', () => {
    const failure = toApiFailure(new Error('SELECT * FROM users failed: password=hunter2'), 'req-2');

    expect(failure.error.code).toBe('INTERNAL');
    expect(failure.error.message).toBe('Unexpected error.');
    expect(JSON.stringify(failure)).not.toContain('hunter2');
  });

  it('reports the right status for any thrown value', () => {
    expect(statusOf(TaniaError.conflict('x'))).toBe(409);
    expect(statusOf('a string')).toBe(500);
    expect(isTaniaError(new Error('plain'))).toBe(false);
  });

  it('describes errors for logs', () => {
    expect(describeError(new TypeError('bad'))).toBe('TypeError: bad');
    expect(describeError(42)).toBe('42');
  });
});
