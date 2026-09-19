import type { DocumentChunk, EnterpriseDocument } from '@tania/core/knowledge';

export interface ChunkOptions {
  /** Target characters per chunk; sections shorter than this stay whole. */
  maxChars: number;
  /** Characters repeated from the previous chunk, to keep sentences readable. */
  overlapChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { maxChars: 700, overlapChars: 80 };

/**
 * Splits a document into retrievable passages.
 *
 * Chunks never cross a section boundary: a citation has to point somewhere a
 * reader can actually verify, and "section 3, page 4" only means something if
 * the passage came from exactly there.
 */
export function chunkDocument(
  document: EnterpriseDocument,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let ordinal = 0;

  for (const section of document.sections) {
    for (const piece of splitText(section.body, options)) {
      chunks.push({
        id: `${document.id}#${section.id}:${ordinal}`,
        documentId: document.id,
        sectionId: section.id,
        heading: section.heading,
        text: piece,
        ordinal,
        ...(section.page === undefined ? {} : { page: section.page }),
      });
      ordinal += 1;
    }
  }

  return chunks;
}

function splitText(text: string, options: ChunkOptions): string[] {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= options.maxChars) return normalized.length > 0 ? [normalized] : [];

  const sentences = normalized.match(/[^.!?]+[.!?]*\s*/g) ?? [normalized];
  const pieces: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > options.maxChars && current.length > 0) {
      pieces.push(current.trim());
      current = current.slice(-options.overlapChars);
    }
    current += sentence;
  }

  if (current.trim().length > 0) pieces.push(current.trim());
  return pieces;
}
