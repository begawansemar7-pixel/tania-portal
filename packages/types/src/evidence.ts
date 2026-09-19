import type { Classification } from './classification.js';

/**
 * A citation. Every answer grounded in enterprise knowledge carries these, or
 * states plainly that it has none.
 */
export interface Evidence {
  id: string;
  title: string;
  source: string;
  snippet: string;
  classification: Classification;
  /** ISO date of the source's last update. */
  updatedAt: string;
  /** Relevance in [0,1] as reported by the retriever. */
  score: number;
  url?: string;
}
