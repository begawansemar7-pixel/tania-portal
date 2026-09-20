import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { isIntent, isRiskLevel } from '@tania/types';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import {
  getIdentityProvider,
  getOrchestrator,
  getTaskStore,
  getTranscriptStore,
  recordTaskGovernance,
} from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

const MAX_QUESTION_LENGTH = 4000;
const DEFAULT_LIST_LIMIT = 20;

/**
 * Starts a task and returns its execution trace.
 *
 * The response is the whole record: status, plan, agents, tools, evidence,
 * verification and result. A task that stopped at an approval gate comes back
 * with `status: "APPROVAL"` and the approval to decide — it has not run.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    await guardRequest(request, { bucket: 'tania.tasks', subject: actor.id });

    const payload = await readJsonBody(request);

    const body = payload as {
      question?: unknown;
      sessionId?: unknown;
      intent?: unknown;
      maxRisk?: unknown;
      wantsArtifact?: unknown;
    };

    if (typeof body.question !== 'string' || body.question.trim().length === 0) {
      throw ApiError.badRequest('`question` is required and must be a non-empty string.');
    }
    if (body.question.length > MAX_QUESTION_LENGTH) {
      throw ApiError.badRequest(`\`question\` must be at most ${MAX_QUESTION_LENGTH} characters.`);
    }
    if (body.sessionId !== undefined && typeof body.sessionId !== 'string') {
      throw ApiError.badRequest('`sessionId` must be a string when provided.');
    }
    if (body.maxRisk !== undefined && !isRiskLevel(body.maxRisk)) {
      throw ApiError.badRequest('`maxRisk` must be a valid risk level when provided.');
    }
    if (body.wantsArtifact !== undefined && typeof body.wantsArtifact !== 'boolean') {
      throw ApiError.badRequest('`wantsArtifact` must be a boolean when provided.');
    }

    const sessionId = body.sessionId ?? requestId;

    // Approvals and audit records hang off a session, so it has to exist
    // before a gate can be written against it.
    await getTranscriptStore().ensureSession(sessionId, actor);

    const report = await getOrchestrator().start(
      {
        question: body.question,
        sessionId,
        ...(isIntent(body.intent) ? { intent: body.intent } : {}),
        ...(isRiskLevel(body.maxRisk) ? { maxRisk: body.maxRisk } : {}),
        // Asking for a document is real work with a real cost, so it is
        // carried explicitly rather than inferred from the wording.
        ...(body.wantsArtifact === true ? { wantsArtifact: true } : {}),
      },
      actor,
      requestId,
    );

    // One record per meaningful action, written where the task settles.
    await recordTaskGovernance(report, requestId, actor);

    return ok(report, requestId, {
      status: report.status,
      riskCode: report.riskCode,
      actions: report.plan.length,
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

/** Lists this actor's tasks, newest first. */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    await guardRequest(request, { bucket: 'tania.tasks', subject: actor.id });

    const raw = new URL(request.url).searchParams.get('limit');
    const parsed = raw === null ? DEFAULT_LIST_LIMIT : Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      throw ApiError.badRequest('`limit` must be an integer between 1 and 100.');
    }

    const tasks = await getTaskStore().list(actor, parsed);

    return ok(tasks, requestId, { count: tasks.length });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
