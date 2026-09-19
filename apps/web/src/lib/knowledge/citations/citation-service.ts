import type { Citation, RetrievedDocument } from '@tania/types';
import type { CitationService, CitationVerification, ScoredChunk } from '@tania/core/knowledge';

const SNIPPET_LENGTH = 240;

/**
 * Builds the numbered citations an answer points at.
 *
 * A citation is only useful if a reader can open the source and find the
 * sentence, so each one carries the document, the section heading, and the
 * page when the source has one.
 */
export class MarkerCitationService implements CitationService {
  readonly id = 'marker';

  build(chunks: ScoredChunk[]): Citation[] {
    return chunks.map((candidate, index) => ({
      id: candidate.chunk.id,
      documentId: candidate.chunk.documentId,
      title: candidate.descriptor.title,
      source: candidate.descriptor.source,
      snippet: snippet(candidate.chunk.text),
      classification: candidate.descriptor.acl.classification,
      updatedAt: candidate.descriptor.updatedAt,
      score: Number(Math.min(1, candidate.score).toFixed(2)),
      locator: locatorOf(candidate),
      marker: index + 1,
      ...(candidate.descriptor.url === undefined ? {} : { url: candidate.descriptor.url }),
    }));
  }

  /**
   * Checks that an answer only points at passages retrieval actually returned.
   * Anything else is an unsupported claim, and the caller must drop it.
   */
  verify(citedIds: string[], retrieved: ScoredChunk[]): CitationVerification {
    const available = new Set(retrieved.map((candidate) => candidate.chunk.id));
    const unsupported = citedIds.filter((id) => !available.has(id));

    return { ok: unsupported.length === 0, unsupported };
  }
}

function locatorOf(candidate: ScoredChunk): string {
  const page = candidate.chunk.page;
  return page === undefined
    ? candidate.chunk.heading
    : `${candidate.chunk.heading} · hlm. ${page}`;
}

function snippet(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.length <= SNIPPET_LENGTH
    ? normalized
    : `${normalized.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}

/** Rolls ranked passages up to the documents they came from. */
export function toRetrievedDocuments(
  candidates: ScoredChunk[],
  citedChunkIds: Set<string>,
): RetrievedDocument[] {
  const byDocument = new Map<string, RetrievedDocument>();

  for (const candidate of candidates) {
    const id = candidate.chunk.documentId;
    const existing = byDocument.get(id);
    const cited = citedChunkIds.has(candidate.chunk.id);

    if (existing) {
      existing.passages += 1;
      existing.score = Math.max(existing.score, Number(Math.min(1, candidate.score).toFixed(2)));
      existing.cited = existing.cited || cited;
      continue;
    }

    byDocument.set(id, {
      documentId: id,
      title: candidate.descriptor.title,
      kind: candidate.descriptor.kind,
      source: candidate.descriptor.source,
      classification: candidate.descriptor.acl.classification,
      updatedAt: candidate.descriptor.updatedAt,
      score: Number(Math.min(1, candidate.score).toFixed(2)),
      passages: 1,
      cited,
    });
  }

  return [...byDocument.values()].sort((a, b) => b.score - a.score);
}
