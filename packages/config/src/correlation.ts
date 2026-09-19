import { randomUUID } from 'node:crypto';
import { CORRELATION_HEADER, isCorrelationId, type CorrelationId } from '@tania/types';

export { CORRELATION_HEADER } from '@tania/types';

export function newCorrelationId(): CorrelationId {
  return randomUUID();
}

type HeaderLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null };

function readHeader(headers: HeaderLike, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(key: string): string | null }).get(name) ?? undefined;
  }
  const raw = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Continues an inbound correlation id when it is well-formed, otherwise starts
 * a new one. A caller may not inject arbitrary text into our log fields.
 */
export function correlationFrom(headers: HeaderLike): CorrelationId {
  const inbound = readHeader(headers, CORRELATION_HEADER);
  return isCorrelationId(inbound) ? inbound : newCorrelationId();
}
