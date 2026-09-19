import type { TaskStore } from '@tania/core/orchestration';
import type { TaskReport } from '@tania/types';
import type { Actor } from '@/lib/identity/types';

/**
 * Process-local task records.
 *
 * Keyed by task and owner, so one actor can never read another's execution
 * trace. Records are copied in and out: a caller holding a report must not see
 * it mutate later, and a later write must not be able to reach back into a
 * report already handed out. A durable adapter gives that for free by
 * serialising; here it has to be deliberate.
 */
export class InMemoryTaskStore implements TaskStore {
  readonly id = 'memory';
  private readonly tasks = new Map<string, { actorId: string; report: TaskReport }>();

  async save(report: TaskReport, actor: Actor): Promise<void> {
    this.tasks.set(report.taskId, { actorId: actor.id, report: structuredClone(report) });
  }

  async get(taskId: string, actor: Actor): Promise<TaskReport | undefined> {
    const entry = this.tasks.get(taskId);
    return entry && entry.actorId === actor.id ? structuredClone(entry.report) : undefined;
  }

  async findByApproval(approvalId: string, actor: Actor): Promise<TaskReport | undefined> {
    for (const entry of this.tasks.values()) {
      if (entry.actorId !== actor.id) continue;
      const owns = entry.report.plan.some((action) => action.approvalId === approvalId);
      if (owns) return structuredClone(entry.report);
    }
    return undefined;
  }

  async list(actor: Actor, limit: number): Promise<TaskReport[]> {
    return [...this.tasks.values()]
      .filter((entry) => entry.actorId === actor.id)
      .map((entry) => structuredClone(entry.report))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}
