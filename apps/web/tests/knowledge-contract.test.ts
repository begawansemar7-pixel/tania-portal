import { beforeAll, describe, expect, it } from 'vitest';
import { DOCUMENT_KINDS, type DocumentKind } from '@tania/core/knowledge';
import { createKnowledgeStack, ENTERPRISE_DOCUMENTS } from '@/lib/knowledge';
import { MockLlmProvider } from '@/lib/tania/llm';
import { loadConfig } from '@/lib/config/env';
import type { RagService } from '@/lib/knowledge/rag-service';
import { CHAPTER_LEAD, STAFF } from '@/lib/knowledge/evaluation/fixtures';

/**
 * Contract-level coverage for retrieval: the document kinds the corpus claims
 * to support, and the kind filter callers are offered.
 *
 * The evaluation suite already measures answer quality. These are narrower —
 * they hold the declared surface to what it actually does, which is where the
 * gaps in this codebase have consistently been.
 */

const cfg = loadConfig({ TANIA_RAG_TOP_K: '6' });

let rag: RagService;

beforeAll(async () => {
  const stack = createKnowledgeStack({ llm: new MockLlmProvider('tania-mock-v1', 0), cfg });
  await stack.ensureIndexed();
  rag = stack.rag;
}, 30_000);

describe('supported document kinds', () => {
  /**
   * `DOCUMENT_KINDS` is a promise about what TANIA can be asked about. A kind
   * declared but never present in the corpus is untested in every other suite
   * here: nothing retrieves it, so nothing checks its permissions or citations.
   */
  it('has at least one document of every declared kind', () => {
    const present = new Set(ENTERPRISE_DOCUMENTS.map((document) => document.kind));
    const missing = DOCUMENT_KINDS.filter((kind) => !present.has(kind));

    expect(missing).toEqual([]);
  });

  it('declares no kind the type does not know', () => {
    const declared = new Set<string>(DOCUMENT_KINDS);
    const unknown = [...new Set(ENTERPRISE_DOCUMENTS.map((d) => d.kind))].filter(
      (kind) => !declared.has(kind),
    );

    expect(unknown).toEqual([]);
  });
});

describe('document kind filter', () => {
  async function kindsOf(query: string, kinds?: DocumentKind[]) {
    const retrieval = await rag.retrieve(
      { query, limit: 6, ...(kinds === undefined ? {} : { kinds }) },
      CHAPTER_LEAD,
    );
    return retrieval.chunks.map((chunk) => chunk.descriptor.kind);
  }

  it('returns every kind when none is requested', async () => {
    const kinds = await kindsOf('persetujuan dan tata kelola');

    expect(kinds.length).toBeGreaterThan(0);
  });

  it('returns only the requested kind', async () => {
    const kinds = await kindsOf('persetujuan dan tata kelola', ['SOP']);

    expect(kinds.length).toBeGreaterThan(0);
    expect([...new Set(kinds)]).toEqual(['SOP']);
  });

  it('honours several kinds at once', async () => {
    const kinds = await kindsOf('produk dan portofolio', ['PRD', 'PRODUCT_DOC']);

    for (const kind of kinds) {
      expect(['PRD', 'PRODUCT_DOC']).toContain(kind);
    }
  });

  it('returns nothing rather than falling back when the kind does not match', async () => {
    // Narrowing to an unrelated kind must not quietly widen back to the whole
    // corpus — that would turn a scoped search into an unscoped one.
    const kinds = await kindsOf('prosedur eskalasi insiden runtime', ['BRD']);

    for (const kind of kinds) {
      expect(kind).toBe('BRD');
    }
  });

  it('applies the kind filter on top of permissions, never instead of them', async () => {
    // STAFF is INTERNAL; asking for a kind must not reach a document their
    // clearance excludes.
    const retrieval = await rag.retrieve(
      { query: 'kompensasi dan band gaji', limit: 6, kinds: ['REPORT'] },
      STAFF,
    );

    for (const chunk of retrieval.chunks) {
      expect(chunk.descriptor.kind).toBe('REPORT');
      expect(['PUBLIC', 'INTERNAL']).toContain(chunk.descriptor.acl.classification);
    }
  });
});

describe('the classification ceiling', () => {
  /**
   * The ceiling is caller-supplied, and `validation.ts` promises it "can only
   * ever narrow what a caller sees". That promise rests on one ordering in
   * `visibilityFilter`: `canRead` is checked first and unconditionally, then
   * the ceiling is applied as an extra filter. Swap those and a client could
   * name its own clearance.
   */
  it('cannot widen beyond the actor own clearance', async () => {
    const ceilinged = await rag.retrieve(
      { query: 'kompensasi dan band gaji', limit: 6, classificationCeiling: 'RESTRICTED' },
      STAFF,
    );

    for (const chunk of ceilinged.chunks) {
      expect(['PUBLIC', 'INTERNAL']).toContain(chunk.descriptor.acl.classification);
    }
  });

  it('does narrow when asked for less than the clearance allows', async () => {
    const open = await rag.retrieve({ query: 'portofolio produk DPS', limit: 6 }, CHAPTER_LEAD);
    const narrowed = await rag.retrieve(
      { query: 'portofolio produk DPS', limit: 6, classificationCeiling: 'PUBLIC' },
      CHAPTER_LEAD,
    );

    for (const chunk of narrowed.chunks) {
      expect(chunk.descriptor.acl.classification).toBe('PUBLIC');
    }
    expect(narrowed.chunks.length).toBeLessThanOrEqual(open.chunks.length);
  });
});

describe('the RAG response contract', () => {
  it('returns exactly the four documented fields', async () => {
    const response = await rag.answer(
      { query: 'Apa prosedur persetujuan untuk aksi berisiko tinggi?', limit: 4 },
      CHAPTER_LEAD,
    );

    expect(Object.keys(response).sort()).toEqual([
      'answer',
      'citations',
      'confidence',
      'retrievedDocuments',
    ]);
  });

  it('never reports a document the actor may not read', async () => {
    // `retrievedDocuments` lists what was *considered*. If filtering happened
    // after ranking rather than during it, an excluded document would surface
    // here by title alone — a disclosure without a single citation.
    const response = await rag.answer({ query: 'kompensasi band gaji', limit: 6 }, STAFF);

    const restricted = ENTERPRISE_DOCUMENTS.filter(
      (document) => document.acl.classification === 'RESTRICTED',
    ).map((document) => document.title);

    for (const document of response.retrievedDocuments) {
      expect(restricted).not.toContain(document.title);
    }
  });
});
