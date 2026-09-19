import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { getChatService, getIdentityProvider } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/** Starts an empty conversation, so the UI can offer "new conversation". */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit. Missed in the first sweep: this is a
    // mutating endpoint and was reaching the Brain unguarded.
    guardRequest(request, { bucket: 'tania.chat', subject: actor.id });

    const conversation = await getChatService().startConversation(actor, requestId);
    return ok(conversation, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
