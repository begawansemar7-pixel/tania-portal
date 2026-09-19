import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  isApiErrorCode,
  isApiFailure,
  isApiSuccess,
  statusForErrorCode,
  type ApiResponse,
} from './api.js';

describe('API envelope', () => {
  it('maps every error code to an HTTP status', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('discriminates success from failure', () => {
    const ok: ApiResponse<{ id: string }> = { data: { id: '1' }, requestId: 'r1' };
    const bad: ApiResponse<{ id: string }> = {
      error: { code: 'NOT_FOUND', message: 'missing' },
      requestId: 'r1',
    };

    expect(isApiSuccess(ok)).toBe(true);
    expect(isApiFailure(ok)).toBe(false);
    expect(isApiFailure(bad)).toBe(true);
  });

  it('resolves statuses and validates codes', () => {
    expect(statusForErrorCode('POLICY_DENIED')).toBe(403);
    expect(statusForErrorCode('RATE_LIMITED')).toBe(429);
    expect(isApiErrorCode('INTERNAL')).toBe(true);
    expect(isApiErrorCode('TEAPOT')).toBe(false);
  });
});
