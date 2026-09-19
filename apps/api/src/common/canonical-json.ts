/**
 * Deterministic JSON serialisation: object keys sorted recursively.
 * The audit hash chain depends on byte-for-byte reproducibility.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    result[key] = normalize(source[key]);
  }
  return result;
}
