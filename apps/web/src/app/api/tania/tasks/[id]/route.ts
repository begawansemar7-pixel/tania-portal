import { correlationFrom } from '@tania/config';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { getIdentityProvider, getOrchestrator } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/** Reads a task back — the same execution trace the caller received on start. */
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
    const report = await getOrchestrator().get(id, actor);
    if (!report) {
      throw ApiError.notFound(`Tugas ${id} tidak ditemukan.`);
    }

    return ok(report, requestId, { status: report.status, riskCode: report.riskCode });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
