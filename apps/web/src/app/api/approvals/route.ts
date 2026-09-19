import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { parseApprovalDecision } from '@/lib/http/validation';
import {
  getApprovalStore,
  getBrain,
  getIdentityProvider,
  getOrchestrator,
  getTaskStore,
  recordTaskGovernance,
} from '@/lib/tania/container';

/** Lists approval gates raised by the Brain in this runtime instance. */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor();
    if (!actor) {
      throw new ApiError('UNAUTHORIZED', 'No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    guardRequest(request, { bucket: 'tania.approvals', subject: actor.id });

    const approvals = await getApprovalStore().list(actor);
    return ok(approvals, requestId, { page: { limit: 50, returned: approvals.length } });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

/** Records a human decision on a high-risk action and executes it if approved. */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw new ApiError('UNAUTHORIZED', 'No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    guardRequest(request, { bucket: 'tania.approvals', subject: actor.id });
    if (!actor.scopes.includes('workflow:approve')) {
      throw new ApiError('FORBIDDEN', 'Actor lacks the workflow:approve scope.');
    }

    const payload = await readJsonBody(request);

    const { approvalId, decision } = parseApprovalDecision(payload);
    const existing = await getApprovalStore().get(approvalId, actor);
    if (!existing) {
      throw new ApiError('NOT_FOUND', `Approval ${approvalId} was not found.`);
    }

    // A gate raised by a task must be settled by the orchestrator, not by the
    // conversational path. Letting the Brain execute it here would run the
    // action once now and once more when the task resumes.
    const task = await getTaskStore().findByApproval(approvalId, actor);
    if (task) {
      await getApprovalStore().decide(approvalId, decision, actor);
      const report = await getOrchestrator().resume(task.taskId, actor, requestId);
      await recordTaskGovernance(report, requestId, actor);

      return ok(report, requestId, {
        taskId: report.taskId,
        status: report.status,
        riskCode: report.riskCode,
      });
    }

    const result = await getBrain().resolveApproval(approvalId, decision, actor);
    return ok(result, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
