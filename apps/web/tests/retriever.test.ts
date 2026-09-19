import { describe, expect, it } from 'vitest';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import { MockKnowledgeRetriever, canRead } from '@/lib/tania/rag/mock-retriever';

const retriever = new MockKnowledgeRetriever();

describe('permission-aware retrieval', () => {
  it('returns evidence for a matching query', async () => {
    const evidence = await retriever.search(
      { query: 'kebijakan tata kelola AI', limit: 3 },
      DEMO_ACTOR,
    );
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].title).toContain('AI');
  });

  it('never returns documents above the actor clearance', async () => {
    const evidence = await retriever.search(
      { query: 'compensation band salary', limit: 5 },
      DEMO_ACTOR,
    );
    expect(evidence.some((item) => item.classification === 'RESTRICTED')).toBe(false);
  });

  it('respects the requested limit', async () => {
    const evidence = await retriever.search({ query: 'dokumen produk delivery', limit: 2 }, DEMO_ACTOR);
    expect(evidence.length).toBeLessThanOrEqual(2);
  });

  it('checks clearance ordering', () => {
    expect(canRead({ ...DEMO_ACTOR, clearance: 'INTERNAL' }, 'CONFIDENTIAL')).toBe(false);
    expect(canRead({ ...DEMO_ACTOR, clearance: 'INTERNAL' }, 'PUBLIC')).toBe(true);
  });
});
