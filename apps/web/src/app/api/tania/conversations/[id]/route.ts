import { correlationFrom } from '@tania/config';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { getChatService, getIdentityProvider } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/** Reads a conversation back, so a reload can resume the thread. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    const { id } = await params;
    const conversation = await getChatService().loadConversation(id, actor);

    return ok(conversation, requestId, { messages: conversation.messages.length });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
