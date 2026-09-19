import type { Actor } from '@/lib/identity/types';
import type { ApprovalRequest } from '@/lib/tania/types';

/**
 * In-memory approval store for development.
 * Swap for a persistent store (PostgreSQL via Prisma) by implementing
 * `ApprovalStore`; the Brain depends only on this interface.
 */
export interface ApprovalStore {
  readonly id: string;
  /** True when decisions survive a restart; false for the in-memory fallback. */
  readonly durable: boolean;
  save(request: ApprovalRequest, actor: Actor): Promise<ApprovalRequest>;
  get(id: string, actor: Actor): Promise<ApprovalRequest | undefined>;
  list(actor: Actor): Promise<ApprovalRequest[]>;
  decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    actor: Actor,
  ): Promise<ApprovalRequest | undefined>;
  /** Records what the runtime actually did once an action was approved. */
  recordExecution(
    id: string,
    result: { status: 'SUCCEEDED' | 'FAILED'; summary: string },
    actor: Actor,
  ): Promise<void>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  readonly id = 'memory';
  readonly durable = false;
  private readonly items = new Map<string, ApprovalRequest>();

  async save(request: ApprovalRequest, _actor?: Actor): Promise<ApprovalRequest> {
    this.items.set(request.id, request);
    return request;
  }

  async get(id: string, _actor?: Actor): Promise<ApprovalRequest | undefined> {
    return this.items.get(id);
  }

  async list(_actor?: Actor): Promise<ApprovalRequest[]> {
    return [...this.items.values()].sort((a, b) =>
      b.requestedAt.localeCompare(a.requestedAt),
    );
  }

  async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    actor: Actor,
  ): Promise<ApprovalRequest | undefined> {
    const existing = this.items.get(id);
    if (!existing || existing.status !== 'PENDING') return existing;

    const updated: ApprovalRequest = {
      ...existing,
      status: decision,
      decidedBy: actor.id,
      decidedAt: new Date().toISOString(),
    };
    this.items.set(id, updated);
    return updated;
  }

  async recordExecution(): Promise<void> {
    // The in-memory fallback keeps no execution history.
  }
}
