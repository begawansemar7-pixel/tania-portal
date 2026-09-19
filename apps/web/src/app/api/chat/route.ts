import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { parseAskRequest } from '@/lib/http/validation';
import { logger } from '@/lib/logger';
import { getBrain, getIdentityProvider, getTranscriptStore } from '@/lib/tania/container';
import type { Actor } from '@/lib/identity/types';
import type { AskResponse } from '@/lib/tania/types';

/**
 * Legacy single-turn endpoint.
 *
 * @deprecated Superseded by `POST /api/tania/chat`, which adds conversation
 * continuity, screen context, streaming, and the `{message, intent, sources,
 * actions, status}` contract. Kept working for any existing caller; the portal
 * UI no longer uses it.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw new ApiError('UNAUTHORIZED', 'No authenticated actor for this request.');
    }

    // Origin check then rate limit. Missed in the first sweep: this is a
    // mutating endpoint and was reaching the Brain unguarded.
    guardRequest(request, { bucket: 'tania.chat', subject: actor.id });

    const payload = await readJsonBody(request);

    const askRequest = parseAskRequest(payload);

    // The session row must exist before the Brain can attach an approval to it.
    await ensureSession(askRequest.sessionId, actor, requestId);

    const answer = await getBrain().ask(askRequest, actor);

    await recordTurn(askRequest.sessionId, askRequest.message, answer, actor, requestId);

    return ok(answer, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

/**
 * Transcript persistence is best effort: losing history must never cost the
 * user their answer. Approval persistence is not — that failure propagates.
 */
async function ensureSession(sessionId: string, actor: Actor, requestId: string): Promise<void> {
  try {
    await getTranscriptStore().ensureSession(sessionId, actor);
  } catch (error) {
    logger.warn('transcript.session_not_persisted', {
      requestId,
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function recordTurn(
  sessionId: string,
  question: string,
  response: AskResponse,
  actor: Actor,
  requestId: string,
): Promise<void> {
  try {
    await getTranscriptStore().recordTurn(
      sessionId,
      { messageId: response.messageId, question, response },
      actor,
    );
  } catch (error) {
    logger.warn('transcript.turn_not_persisted', {
      requestId,
      sessionId,
      messageId: response.messageId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
