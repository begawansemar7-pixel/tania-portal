import { describe, expect, it } from 'vitest';
import { ContextService, describeContext } from '@/lib/tania/services/context-service';
import { InMemoryTranscriptStore } from '@/lib/tania/transcript/store';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { AskResponse } from '@/lib/tania/types';

const CORRELATION = 'req-1';

function answer(text: string): AskResponse {
  return {
    messageId: crypto.randomUUID(),
    sessionId: 'c1',
    createdAt: new Date().toISOString(),
    intent: 'SEARCH',
    answer: text,
    model: 'tania-mock-v1',
    risk: 'INFORMATIONAL',
    evidence: [],
    trace: [],
    toolsUsed: [],
    suggestions: [],
  };
}

describe('describeContext', () => {
  it('returns nothing when no context was supplied', () => {
    expect(describeContext(undefined)).toEqual([]);
  });

  it('renders surface, focus, and attributes as short labelled lines', () => {
    expect(
      describeContext({
        surface: '/dashboard',
        focus: { type: 'initiative', id: 'DPS-118' },
        attributes: { kuartal: 'Q3 2026' },
      }),
    ).toEqual(['layar /dashboard', 'fokus initiative:DPS-118', 'kuartal=Q3 2026']);
  });

  it('truncates a long value instead of passing it into the prompt whole', () => {
    const [line] = describeContext({ surface: 'x'.repeat(400) });

    expect(line?.length).toBeLessThan(140);
    expect(line?.endsWith('…')).toBe(true);
  });

  it('caps how many attributes a screen can push', () => {
    const attributes = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`k${index}`, 'v']),
    );

    expect(describeContext({ attributes })).toHaveLength(8);
  });
});

describe('ContextService', () => {
  it('starts a new conversation when no id is supplied', async () => {
    const service = new ContextService(new InMemoryTranscriptStore());
    const context = await service.resolve({ actor: DEMO_ACTOR, correlationId: CORRELATION });

    expect(context.isNew).toBe(true);
    expect(context.conversationId).toHaveLength(36);
    expect(context.history).toEqual([]);
  });

  it('loads prior turns when resuming a conversation', async () => {
    const store = new InMemoryTranscriptStore();
    const service = new ContextService(store);

    const first = await service.resolve({ actor: DEMO_ACTOR, correlationId: CORRELATION });
    await store.recordTurn(
      first.conversationId,
      { messageId: 'm1', question: 'Halo', response: answer('Halo juga') },
      DEMO_ACTOR,
    );

    const resumed = await service.resolve({
      conversationId: first.conversationId,
      actor: DEMO_ACTOR,
      correlationId: CORRELATION,
    });

    expect(resumed.isNew).toBe(false);
    expect(resumed.history.map((message) => message.content)).toEqual(['Halo', 'Halo juga']);
    expect(service.toLlmHistory(resumed)).toEqual([
      { role: 'user', content: 'Halo' },
      { role: 'assistant', content: 'Halo juga' },
    ]);
  });

  it('keeps answering when the store cannot be reached', async () => {
    const broken = {
      id: 'broken',
      durable: false,
      ensureSession: async () => {
        throw new Error('store down');
      },
      recordTurn: async () => {},
      loadConversation: async () => {
        throw new Error('store down');
      },
    };

    const service = new ContextService(broken);
    const context = await service.resolve({
      conversationId: 'c-1',
      actor: DEMO_ACTOR,
      correlationId: CORRELATION,
    });

    expect(context.conversationId).toBe('c-1');
    expect(context.history).toEqual([]);
  });
});
