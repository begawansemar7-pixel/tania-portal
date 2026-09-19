import { describe, expect, it } from 'vitest';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { TaniaApiError } from '@/lib/tania/api/client';
import { isApiFailure, type ApiResponse } from '@tania/types';

const REQUEST_ID = '3f6d0b1e-6f1a-4a7e-9f1b-2c9a0d1e4b77';

async function body<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

describe('route handler envelope', () => {
  it('wraps success with the request id', async () => {
    const response = ok({ answer: 'halo' }, REQUEST_ID, { page: { limit: 1, returned: 1 } });
    const payload = await body<{ answer: string }>(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ data: { answer: 'halo' }, requestId: REQUEST_ID });
  });

  it('maps a structured error to its canonical status', async () => {
    const response = toErrorResponse(ApiError.forbidden('Missing scope'), REQUEST_ID);
    const payload = await body(response);

    expect(response.status).toBe(403);
    expect(isApiFailure(payload)).toBe(true);
    if (isApiFailure(payload)) {
      expect(payload.error).toEqual({ code: 'FORBIDDEN', message: 'Missing scope' });
      expect(payload.requestId).toBe(REQUEST_ID);
    }
  });

  it('keeps a backend failure meaningful instead of turning it into a 500', async () => {
    const response = toErrorResponse(
      new TaniaApiError(409, 'CONFLICT', 'Approval is already APPROVED.'),
      REQUEST_ID,
    );
    const payload = await body(response);

    expect(response.status).toBe(409);
    if (isApiFailure(payload)) {
      expect(payload.error.code).toBe('CONFLICT');
    }
  });

  it('reports an unreachable backend as 503', async () => {
    const response = toErrorResponse(
      new TaniaApiError(503, 'UPSTREAM_UNAVAILABLE', 'TANIA backend is unreachable.'),
      REQUEST_ID,
    );

    expect(response.status).toBe(503);
  });

  it('never leaks an unexpected error message', async () => {
    const response = toErrorResponse(new Error('password=hunter2'), REQUEST_ID);
    const payload = await body(response);

    expect(response.status).toBe(500);
    if (isApiFailure(payload)) {
      expect(payload.error.message).toBe('Unexpected error.');
    }
    expect(JSON.stringify(payload)).not.toContain('hunter2');
  });
});
