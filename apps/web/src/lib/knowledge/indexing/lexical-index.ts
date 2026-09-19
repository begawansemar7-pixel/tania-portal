import type { DocumentChunk, DocumentDescriptor, ScoredChunk } from '@tania/core/knowledge';
import { tokenize } from './embedding';

interface LexicalEntry {
  chunk: DocumentChunk;
  descriptor: DocumentDescriptor;
  terms: Map<string, number>;
  length: number;
}

const K1 = 1.2;
const B = 0.75;

/** BM25 score at which a passage is considered a half-strength match. */
const SATURATION = 6;

/**
 * BM25-style keyword index.
 *
 * Kept alongside the vector index because exact terms — a document code, a
 * product name, "SLA" — are precisely where dense retrieval is weakest, and
 * those are the terms enterprise questions are built from.
 */
export class LexicalIndex {
  private entries: LexicalEntry[] = [];
  private documentFrequency = new Map<string, number>();
  private averageLength = 0;

  build(items: Array<{ chunk: DocumentChunk; descriptor: DocumentDescriptor }>): void {
    this.entries = items.map(({ chunk, descriptor }) => {
      const tokens = tokenize(`${descriptor.title} ${chunk.heading} ${chunk.text} ${(descriptor.tags ?? []).join(' ')}`);
      const terms = new Map<string, number>();
      for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
      return { chunk, descriptor, terms, length: tokens.length };
    });

    this.documentFrequency = new Map();
    for (const entry of this.entries) {
      for (const term of entry.terms.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
    }

    this.averageLength =
      this.entries.length === 0
        ? 0
        : this.entries.reduce((sum, entry) => sum + entry.length, 0) / this.entries.length;
  }

  search(
    query: string,
    limit: number,
    filter: (descriptor: DocumentDescriptor) => boolean,
  ): ScoredChunk[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0 || this.entries.length === 0) return [];

    const total = this.entries.length;
    const scored: ScoredChunk[] = [];

    for (const entry of this.entries) {
      // Permission filter first: an invisible document is never scored.
      if (!filter(entry.descriptor)) continue;

      let score = 0;
      for (const term of queryTerms) {
        const frequency = entry.terms.get(term);
        if (!frequency) continue;

        const df = this.documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
        const denominator =
          frequency + K1 * (1 - B + (B * entry.length) / (this.averageLength || 1));
        score += idf * ((frequency * (K1 + 1)) / denominator);
      }

      if (score > 0) {
        scored.push({
          chunk: entry.chunk,
          descriptor: entry.descriptor,
          score,
          signals: { lexical: score },
        });
      }
    }

    // Saturate onto 0–1 with an *absolute* scale. Normalising by the best hit
    // of the same query would make the top result perfect even when every
    // candidate is weak, which is exactly how irrelevant questions get answered.
    return scored
      .map((item) => ({
        ...item,
        score: item.score / (item.score + SATURATION),
        signals: { lexical: item.score / (item.score + SATURATION) },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Inverse document frequency for a single term.
   *
   * Exposed so ranking can weigh *which* words a passage covers: matching
   * "chapter" in a corpus where every document says it means far less than
   * matching "kompensasi", which appears in one.
   */
  idf(term: string): number {
    if (this.entries.length === 0) return 0;

    const df = this.documentFrequency.get(term) ?? 0;
    return Math.log(1 + (this.entries.length - df + 0.5) / (df + 0.5));
  }

  size(): number {
    return this.entries.length;
  }
}
