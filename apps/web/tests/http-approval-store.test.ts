import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import { TaniaApiClient, TaniaApiError } from '@/lib/tania/api/client';
import { HttpApprovalStore } from '@/lib/tania/approvals/http-store';
import type { ApprovalRequest } from '@/lib/tania/types';

const BASE_URL = 'http://backend.test';

const backendApproval = {
  id: 'approval-1',
  sessionId: 'session-1',
  messageId: null,
  toolId: 'workflow.execute',
  action: 'Workflow Execution',
  risk: 'HIGH',
  reason: 'HIGH risk action requires human approval before execution.',
  effect: null,
  status: 'PENDING',
  requestedById: 'actor-1',
  requestedAt: '2026-09-18T10:00:00.000Z',
  decidedById: null,
  decidedAt: null,
};

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(input.toString(), init ?? {}),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function makeStore() {
  return new HttpApprovalStore(new TaniaApiClient({ baseUrl: BASE_URL, serviceToken: 'tkn', timeoutMs: 1000 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpApprovalStore', () => {
  it('declares itself durable', () => {
    expect(makeStore().durable).toBe(true);
  });

  it('sends the service token and the actor assertion', async () => {
    const spy = mockFetch(() => Response.json({ data: backendApproval }));

    await makeStore().save(
      {
        id: 'approval-1',
        sessionId: 'session-1',
        toolId: 'workflow.execute',
        action: 'Workflow Execution',
        risk: 'HIGH',
        reason: 'HIGH risk action requires human approval before execution.',
        requestedBy: DEMO_ACTOR.id,
        requestedAt: backendApproval.requestedAt,
        status: 'PENDING',
      } satisfies ApprovalRequest,
      DEMO_ACTOR,
    );

    const [url, init] = spy.mock.calls[0];
    expect(url.toString()).toBe(`${BASE_URL}/v1/approvals`);

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tkn');

    const assertion = JSON.parse(Buffer.from(headers['x-tania-actor'], 'base64url').toString('utf8'));
    expect(assertion).toMatchObject({
      subject: DEMO_ACTOR.id,
      email: DEMO_ACTOR.email,
      clearance: DEMO_ACTOR.clearance,
    });
    expect(assertion.scopes).toContain('workflow:approve');
  });

  it('maps a backend approval onto the portal model', async () => {
    mockFetch(() =>
      Response.json({
        data: { ...backendApproval, status: 'APPROVED', decidedById: 'actor-2', decidedAt: '2026-09-18T11:00:00.000Z' },
      }),
    );

    const decided = await makeStore().decide('approval-1', 'APPROVED', DEMO_ACTOR);
    expect(decided?.status).toBe('APPROVED');
    expect(decided?.decidedBy).toBe('actor-2');
    expect(decided?.decidedAt).toBe('2026-09-18T11:00:00.000Z');
  });

  it('treats a missing approval as undefined', async () => {
    mockFetch(() =>
      Response.json({ error: { code: 'NOT_FOUND', message: 'nope' } }, { status: 404 }),
    );
    await expect(makeStore().get('missing', DEMO_ACTOR)).resolves.toBeUndefined();
  });

  it('surfaces a conflicting decision as an API error', async () => {
    mockFetch(() =>
      Response.json(
        { error: { code: 'CONFLICT', message: 'Approval approval-1 is already APPROVED.' } },
        { status: 409 },
      ),
    );

    await expect(makeStore().decide('approval-1', 'REJECTED', DEMO_ACTOR)).rejects.toThrow(
      TaniaApiError,
    );
  });

  it('reports an unreachable backend instead of failing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );

    await expect(makeStore().list(DEMO_ACTOR)).rejects.toMatchObject({
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });
});
