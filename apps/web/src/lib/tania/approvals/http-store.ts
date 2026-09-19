import type { Actor } from '@/lib/identity/types';
import type { ApprovalRequest, RiskLevel } from '@/lib/tania/types';
import { TaniaApiError, type TaniaApiClient } from '@/lib/tania/api/client';
import type { ApprovalStore } from './store';

/** Shape returned by the backend approvals API. */
interface ApprovalResource {
  id: string;
  sessionId: string | null;
  messageId: string | null;
  toolId: string;
  action: string;
  risk: RiskLevel;
  reason: string;
  effect: string | null;
  status: ApprovalRequest['status'];
  requestedById: string;
  requestedAt: string;
  decidedById: string | null;
  decidedAt: string | null;
}

function toApprovalRequest(resource: ApprovalResource): ApprovalRequest {
  return {
    id: resource.id,
    sessionId: resource.sessionId ?? '',
    toolId: resource.toolId,
    action: resource.action,
    risk: resource.risk,
    reason: resource.reason,
    requestedBy: resource.requestedById,
    requestedAt: resource.requestedAt,
    status: resource.status,
    decidedBy: resource.decidedById ?? undefined,
    decidedAt: resource.decidedAt ?? undefined,
  };
}

/**
 * Durable approval store backed by the TANIA backend.
 *
 * Every gate, decision, and execution result lands in PostgreSQL and in the
 * hash-chained audit trail, so an approval survives a restart and cannot be
 * repudiated afterwards.
 */
export class HttpApprovalStore implements ApprovalStore {
  readonly id = 'backend';
  readonly durable = true;

  constructor(private readonly client: TaniaApiClient) {}

  async save(request: ApprovalRequest, actor: Actor): Promise<ApprovalRequest> {
    const resource = await this.client.request<ApprovalResource>('POST', '/v1/approvals', actor, {
      id: request.id,
      sessionId: request.sessionId || undefined,
      toolId: request.toolId,
      action: request.action,
      risk: request.risk,
      reason: request.reason,
    });
    return toApprovalRequest(resource);
  }

  async get(id: string, actor: Actor): Promise<ApprovalRequest | undefined> {
    try {
      const resource = await this.client.request<ApprovalResource>(
        'GET',
        `/v1/approvals/${encodeURIComponent(id)}`,
        actor,
      );
      return toApprovalRequest(resource);
    } catch (error) {
      if (error instanceof TaniaApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  async list(actor: Actor): Promise<ApprovalRequest[]> {
    const resources = await this.client.request<ApprovalResource[]>(
      'GET',
      '/v1/approvals?limit=50',
      actor,
    );
    return resources.map(toApprovalRequest);
  }

  async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    actor: Actor,
  ): Promise<ApprovalRequest | undefined> {
    const resource = await this.client.request<ApprovalResource>(
      'POST',
      `/v1/approvals/${encodeURIComponent(id)}/decision`,
      actor,
      { decision },
    );
    return toApprovalRequest(resource);
  }

  async recordExecution(
    id: string,
    result: { status: 'SUCCEEDED' | 'FAILED'; summary: string },
    actor: Actor,
  ): Promise<void> {
    await this.client.request(
      'POST',
      `/v1/approvals/${encodeURIComponent(id)}/execution`,
      actor,
      result,
    );
  }
}
