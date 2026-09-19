import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { getIdentityProvider, getJarvisClient } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 4000;

/**
 * Text-to-speech through the JARVIS voice runtime.
 *
 * Returns the audio artifact's URI when the runtime produced one. A simulated
 * capability produces none, and the response says so rather than pretending
 * there is audio to play.
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
    guardRequest(request, { bucket: 'tania.voice', subject: actor.id });

    const payload = await readJsonBody(request);

    const body = payload as { text?: unknown; language?: unknown; voice?: unknown };

    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      throw ApiError.badRequest('`text` is required and must be a non-empty string.');
    }
    if (body.text.length > MAX_TEXT_LENGTH) {
      throw ApiError.badRequest(`\`text\` must be at most ${MAX_TEXT_LENGTH} characters.`);
    }
    if (body.voice !== undefined && typeof body.voice !== 'string') {
      throw ApiError.badRequest('`voice` must be a string when provided.');
    }

    const result = await getJarvisClient()
      .forRequest({ correlationId: requestId, actorId: actor.id })
      .speak({
        text: body.text,
        ...(typeof body.voice === 'string' ? { voice: body.voice } : {}),
      });

    if (result.status !== 'SUCCEEDED') {
      throw new ApiError(
        result.status === 'UNSUPPORTED' ? 'NOT_IMPLEMENTED' : 'UPSTREAM_UNAVAILABLE',
        result.error?.message ?? 'Runtime tidak dapat mengucapkan teks ini.',
      );
    }

    const audio = result.artifacts.find((artifact) => artifact.kind === 'audio');

    return ok(
      {
        text: body.text,
        ...(audio?.uri === undefined ? {} : { audioUri: audio.uri }),
        /** False when the runtime produced cues but no audio to play. */
        hasAudio: audio?.uri !== undefined,
      },
      requestId,
      { simulated: result.output?.simulated === true },
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
