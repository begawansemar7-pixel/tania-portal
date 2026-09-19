/** What the user is asking TANIA to do, decided before any tool is planned. */

export const INTENTS = ['ANALYZE', 'CREATE', 'SEARCH', 'AUTOMATE', 'CONVERSE'] as const;

export type Intent = (typeof INTENTS)[number];

export function isIntent(value: unknown): value is Intent {
  return typeof value === 'string' && (INTENTS as readonly string[]).includes(value);
}
