import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import type { TaniaChatResponse } from '@tania/types';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { parseChatRequest } from '@/lib/http/validation';
import { toSseResponse } from '@/lib/http/sse';
import { logger } from '@/lib/logger';
import { getChatService, getIdentityProvider } from '@/lib/tania/container';

/** Conversations depend on request state; never prerender or cache. */
export const dynamic = 'force-dynamic';

/**
 * The conversational entry point.
 *
 * Returns a single JSON envelope by default, or Server-Sent Events when the
 * caller asks for them with `stream: true` or `Accept: text/event-stream`.
 * Either way the pipeline, the governance checks, and the persistence are the
 * same — streaming changes the delivery, not the decisions.
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
    await guardRequest(request, { bucket: 'tania.chat', subject: actor.id });

    const payload = await readJsonBody(request);

    const chatRequest = parseChatRequest(payload);
    const wantsStream =
      chatRequest.stream === true ||
      (request.headers.get('accept')?.includes('text/event-stream') ?? false);

    logger.info('chat.received', {
      requestId,
      conversationId: chatRequest.conversationId ?? 'new',
      stream: wantsStream,
      surface: chatRequest.context?.surface,
    });

    const service = getChatService();

    if (wantsStream) {
      return toSseResponse(service.stream(chatRequest, actor, requestId), requestId);
    }

    const response: TaniaChatResponse = await service.chat(chatRequest, actor, requestId);
    return ok(response, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
