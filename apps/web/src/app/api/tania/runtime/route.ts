import { correlationFrom } from '@tania/config';
import { JARVIS_CAPABILITY_LABELS } from '@tania/types';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { getIdentityProvider, getJarvisRuntime } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * What the runtime can actually do right now.
 *
 * Deliberately says which capabilities are live and which are simulated: an
 * operator who cannot tell the difference will eventually trust a mock.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    const runtime = getJarvisRuntime();
    const capabilities = runtime.describe().map((status) => ({
      ...status,
      label: JARVIS_CAPABILITY_LABELS[status.capability],
    }));

    return ok(
      { adapter: runtime.id, capabilities },
      requestId,
      { live: capabilities.filter((item) => item.live).length, total: capabilities.length },
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
