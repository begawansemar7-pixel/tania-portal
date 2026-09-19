import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/http/api-error';
import { parseApprovalDecision, parseAskRequest } from '@/lib/http/validation';

describe('API boundary validation', () => {
  it('rejects a non-object body', () => {
    expect(() => parseAskRequest('hello')).toThrow(ApiError);
  });

  it('rejects an empty message', () => {
    expect(() => parseAskRequest({ message: '   ' })).toThrow(ApiError);
  });

  it('rejects an unknown intent', () => {
    expect(() => parseAskRequest({ message: 'hi', intent: 'HACK' })).toThrow(ApiError);
  });

  it('generates a session id when omitted', () => {
    const parsed = parseAskRequest({ message: ' halo TANIA ' });
    expect(parsed.message).toBe('halo TANIA');
    expect(parsed.sessionId).toHaveLength(36);
  });

  it('validates approval decisions', () => {
    expect(() => parseApprovalDecision({ approvalId: 'a', decision: 'MAYBE' })).toThrow(ApiError);
    expect(parseApprovalDecision({ approvalId: 'a', decision: 'APPROVED' })).toEqual({
      approvalId: 'a',
      decision: 'APPROVED',
    });
  });
});
