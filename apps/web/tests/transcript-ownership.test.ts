import { describe, expect, it } from 'vitest';
import { InMemoryTranscriptStore } from '@/lib/tania/transcript/store';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { Actor } from '@/lib/identity/types';
import type { AskResponse } from '@/lib/tania/types';

/**
 * Ownership in the process-local transcript.
 *
 * The durable store behind `apps/api` refuses another actor's session with a
 * `ForbiddenException`; this one used to ignore the actor entirely and hand any
 * conversation to whoever named its id. Two implementations of one interface
 * with different security semantics is the kind of gap that reaches production
 * quietly — it is invisible while a single mock actor holds every scope, and
 * becomes an IDOR the day real identity arrives.
 */

const OWNER = DEMO_ACTOR;
const INTRUDER: Actor = { ...DEMO_ACTOR, id: 'usr_intruder', subject: 'usr_intruder' };

function answer(text = 'Jawaban.'): AskResponse {
  return {
    messageId: 'msg-1',
    sessionId: 'conv-1',
    createdAt: '2026-09-19T10:00:00.000Z',
    intent: 'SEARCH',
    answer: text,
    model: 'tania-mock-v1',
    risk: 'INFORMATIONAL',
    evidence: [],
    trace: [],
    tools: [],
  } as unknown as AskResponse;
}

async function seeded(): Promise<{ store: InMemoryTranscriptStore; conversationId: string }> {
  const store = new InMemoryTranscriptStore();
  const conversationId = 'conv-owned-by-demo';

  await store.ensureSession(conversationId, OWNER);
  await store.recordTurn(
    conversationId,
    { messageId: 'msg-1', question: 'Rahasia milik pemilik', response: answer() },
    OWNER,
  );

  return { store, conversationId };
}

describe('in-memory transcript ownership', () => {
  it('lets the owner read their own conversation', async () => {
    const { store, conversationId } = await seeded();

    const conversation = await store.loadConversation(conversationId, OWNER);

    expect(conversation.messages.map((message) => message.role)).toEqual(['user', 'tania']);
    expect(conversation.messages[0]?.content).toBe('Rahasia milik pemilik');
  });

  it('does not hand a conversation to another actor', async () => {
    const { store, conversationId } = await seeded();

    const conversation = await store.loadConversation(conversationId, INTRUDER);

    expect(conversation.messages).toEqual([]);
  });

  it('answers an intruder exactly as it answers an unknown id', async () => {
    // No existence oracle: a distinguishable response would confirm that a
    // conversation exists to anyone holding a stolen id.
    const { store, conversationId } = await seeded();

    const stolen = await store.loadConversation(conversationId, INTRUDER);
    const unknown = await store.loadConversation('conv-does-not-exist', INTRUDER);

    expect(stolen.messages).toEqual(unknown.messages);
    expect(stolen.title).toBe(unknown.title);
  });

  it('refuses to reopen someone else conversation', async () => {
    const { store, conversationId } = await seeded();

    await expect(store.ensureSession(conversationId, INTRUDER)).rejects.toThrow(/another actor/);
  });

  it('refuses to write into someone else conversation', async () => {
    const { store, conversationId } = await seeded();

    await expect(
      store.recordTurn(
        conversationId,
        { messageId: 'msg-2', question: 'Disisipkan', response: answer('Palsu.') },
        INTRUDER,
      ),
    ).rejects.toThrow(/another actor/);

    // And the owner's history is untouched by the attempt.
    const conversation = await store.loadConversation(conversationId, OWNER);
    expect(conversation.messages).toHaveLength(2);
  });

  it('keeps two actors conversations apart', async () => {
    const store = new InMemoryTranscriptStore();

    await store.recordTurn(
      'conv-a',
      { messageId: 'a', question: 'Milik A', response: answer() },
      OWNER,
    );
    await store.recordTurn(
      'conv-b',
      { messageId: 'b', question: 'Milik B', response: answer() },
      INTRUDER,
    );

    expect((await store.loadConversation('conv-a', OWNER)).messages).toHaveLength(2);
    expect((await store.loadConversation('conv-a', INTRUDER)).messages).toEqual([]);
    expect((await store.loadConversation('conv-b', INTRUDER)).messages).toHaveLength(2);
    expect((await store.loadConversation('conv-b', OWNER)).messages).toEqual([]);
  });
});
