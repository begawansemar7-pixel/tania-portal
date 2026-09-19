import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { getIdentityProvider, getJarvisClient } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/** Roughly 10 MB of base64 audio — well beyond one spoken turn. */
const MAX_AUDIO_LENGTH = 14_000_000;

/**
 * Speech-to-text through the JARVIS voice runtime.
 *
 * The portal never transcribes anything itself; it forwards the audio as a
 * `voice.transcribe` command so the audio only reaches the runtime a deployment
 * configured. When that capability is simulated, this returns a failure rather
 * than inventing words nobody said.
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

    const body = payload as { audio?: unknown; transcript?: unknown; language?: unknown };

    if (body.audio !== undefined && typeof body.audio !== 'string') {
      throw ApiError.badRequest('`audio` must be a base64 data URI when provided.');
    }
    if (typeof body.audio === 'string' && body.audio.length > MAX_AUDIO_LENGTH) {
      throw ApiError.badRequest('`audio` exceeds the maximum size for one turn.');
    }
    if (body.audio === undefined && typeof body.transcript !== 'string') {
      throw ApiError.badRequest('Either `audio` or `transcript` is required.');
    }

    const language = typeof body.language === 'string' ? body.language : 'id-ID';

    const result = await getJarvisClient()
      .forRequest({ correlationId: requestId, actorId: actor.id })
      .transcribe({
        language,
        ...(typeof body.audio === 'string' ? { audioUri: body.audio } : {}),
        ...(typeof body.transcript === 'string' ? { transcript: body.transcript } : {}),
      });

    if (result.status !== 'SUCCEEDED') {
      throw new ApiError(
        result.status === 'UNSUPPORTED' ? 'NOT_IMPLEMENTED' : 'UPSTREAM_UNAVAILABLE',
        result.error?.message ?? 'Runtime tidak dapat mentranskrip audio.',
      );
    }

    return ok(
      {
        transcript: String(result.output?.transcript ?? ''),
        language,
        ...(typeof result.output?.confidence === 'number'
          ? { confidence: result.output.confidence }
          : {}),
      },
      requestId,
      { simulated: result.output?.simulated === true },
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
