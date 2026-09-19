import { randomUUID } from 'node:crypto';
import type { ApprovalManager, TaskContext } from '@tania/core/orchestration';
import type { ApprovalStatus, PlannedAction } from '@tania/types';
import { requiresHumanApproval } from '@tania/types';
import type { Actor } from '@/lib/identity/types';
import { logger } from '@/lib/logger';
import type { ApprovalStore } from '@/lib/tania/approvals/store';
import { findTool } from '@/lib/tania/tools/registry';

/**
 * The human decision gate for L3 and L4 actions.
 *
 * Fail-closed by construction: a gate that cannot be written to the durable
 * store throws, so the task stops rather than proceeding on an approval nobody
 * could later audit.
 */
export class StoreApprovalManager implements ApprovalManager {
  readonly id = 'store';

  constructor(private readonly approvals: ApprovalStore) {}

  gatedActions(actions: PlannedAction[]): PlannedAction[] {
    return actions.filter(
      (action) => action.status === 'PLANNED' && requiresHumanApproval(action.risk),
    );
  }

  async request(action: PlannedAction, context: TaskContext): Promise<string> {
    const tool = findTool(action.toolId);

    const approval = await this.approvals.save(
      {
        id: randomUUID(),
        sessionId: context.sessionId,
        toolId: action.toolId,
        action: tool?.name ?? action.toolId,
        risk: action.risk,
        reason: `Aksi ${action.riskCode} memerlukan persetujuan manusia sebelum dieksekusi.`,
        requestedBy: context.actor.id,
        requestedAt: new Date().toISOString(),
        status: 'PENDING',
      },
      context.actor,
    );

    logger.audit('task.approval_requested', {
      taskId: context.taskId,
      correlationId: context.correlationId,
      approvalId: approval.id,
      actionId: action.id,
      toolId: action.toolId,
      risk: action.risk,
      riskCode: action.riskCode,
    });

    return approval.id;
  }

  async status(approvalId: string, actor: Actor): Promise<ApprovalStatus> {
    const approval = await this.approvals.get(approvalId, actor);
    return approval?.status ?? 'EXPIRED';
  }
}
