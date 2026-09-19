import type { VerificationInput, VerificationManager } from '@tania/core/orchestration';
import type { TaskVerification } from '@tania/types';
import { requiresHumanApproval } from '@tania/types';

/**
 * Checks that what happened matches what was promised.
 *
 * Every rule here answers a way a task could look successful while being
 * wrong: a tool nobody declared, a high-risk action that ran without a gate, or
 * a step that never finished.
 *
 * Answer quality is deliberately *not* checked here. A task reports what it
 * ran; it does not assert facts. A knowledge search that legitimately found
 * nothing is an outcome to state plainly, not a verification breach — failing
 * it would punish TANIA for refusing to invent an answer.
 */
export class PlanVerificationManager implements VerificationManager {
  readonly id = 'plan';

  async verify(input: VerificationInput): Promise<TaskVerification> {
    const { context, outcome } = input;
    const issues: string[] = [];

    // A task asked for a document and finishing without one is not success,
    // however cleanly every step ran.
    if (input.wantsArtifact && outcome.status === 'SUCCEEDED' && outcome.artifacts.length === 0) {
      issues.push('Artefak diminta tetapi tidak ada yang dihasilkan.');
    }

    const empty = outcome.artifacts.filter(
      (artifact) => (artifact.content ?? '').trim().length === 0 && artifact.uri === undefined,
    );
    if (empty.length > 0) {
      issues.push(
        `Artefak tanpa isi maupun lokasi: ${empty.map((item) => item.title).join(', ')}.`,
      );
    }

    const declared = new Set(context.agent.requiredTools);
    const undeclared = [
      ...new Set(outcome.tools.map((tool) => tool.toolId).filter((id) => !declared.has(id))),
    ];
    if (undeclared.length > 0) {
      issues.push(`Tool di luar deklarasi agen dipakai: ${undeclared.join(', ')}.`);
    }

    const ungated = outcome.actions.filter(
      (action) =>
        action.status === 'SUCCEEDED' && requiresHumanApproval(action.risk) && !action.approvalId,
    );
    if (ungated.length > 0) {
      issues.push(
        `Aksi berisiko tinggi berjalan tanpa persetujuan tercatat: ${ungated
          .map((action) => action.toolId)
          .join(', ')}.`,
      );
    }

    const unfinished = outcome.actions.filter(
      (action) => action.status === 'PLANNED' || action.status === 'RUNNING',
    );
    if (unfinished.length > 0 && outcome.status !== 'AWAITING_APPROVAL') {
      issues.push(`${unfinished.length} aksi tidak pernah selesai dijalankan.`);
    }

    return { ok: issues.length === 0, issues, checkedAt: new Date().toISOString() };
  }
}
