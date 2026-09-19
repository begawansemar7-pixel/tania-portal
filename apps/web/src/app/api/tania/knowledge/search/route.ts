import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import type { RagResponse } from '@tania/types';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { parseKnowledgeSearchRequest } from '@/lib/http/validation';
import { logger } from '@/lib/logger';
import { getIdentityProvider, getKnowledge } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * Grounded knowledge search.
 *
 * Returns the RAG contract directly — answer, citations, confidence, and the
 * documents considered — so a caller can inspect the grounding rather than
 * take the answer on trust. Results are always filtered for the asking actor.
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
    guardRequest(request, { bucket: 'tania.read', subject: actor.id });

    const payload = await readJsonBody(request);

    const search = parseKnowledgeSearchRequest(payload);
    const response: RagResponse = await getKnowledge().rag.answer(
      {
        query: search.query,
        limit: search.limit,
        ...(search.classificationCeiling === undefined
          ? {}
          : { classificationCeiling: search.classificationCeiling }),
      },
      actor,
    );

    logger.info('knowledge.searched', {
      requestId,
      actorId: actor.id,
      citations: response.citations.length,
      confidence: response.confidence.score,
      documents: response.retrievedDocuments.length,
    });

    return ok(response, requestId, {
      grounded: response.citations.length > 0,
      clearance: actor.clearance,
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
