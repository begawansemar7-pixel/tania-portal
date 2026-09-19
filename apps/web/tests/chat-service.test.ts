import { describe, expect, it, vi } from 'vitest';
import { TaniaChatService } from '@/lib/tania/services/chat-service';
import { ContextService } from '@/lib/tania/services/context-service';
import { IntentService, KeywordIntentClassifier } from '@/lib/tania/services/intent-service';
import { InMemoryTranscriptStore } from '@/lib/tania/transcript/store';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { TaniaBrain, AskOptions } from '@/lib/tania/brain';
import type { AskRequest, AskResponse } from '@/lib/tania/types';
import type { ChatStreamEvent } from '@tania/types';

const CORRELATION = 'req-chat-1';

function baseAnswer(overrides: Partial<AskResponse> = {}): AskResponse {
  return {
    messageId: 'msg-1',
    sessionId: 'conv-1',
    createdAt: '2026-09-19T10:00:00.000Z',
    intent: 'SEARCH',
    answer: 'Jawaban lengkap.',
    model: 'tania-mock-v1',
    risk: 'INFORMATIONAL',
    evidence: [
      {
        id: 'doc.ai-governance',
        title: 'AI Usage & Governance Guideline',
        source: 'Chapter DPS',
        snippet: 'Aturan penggunaan AI.',
        classification: 'INTERNAL',
        updatedAt: '2026-09-01',
        score: 0.8,
      },
    ],
    trace: [
      { id: 't1', label: 'Memahami', stage: 'UNDERSTAND', status: 'SUCCEEDED' },
      { id: 't2', label: 'Verifikasi', stage: 'VERIFY', status: 'SUCCEEDED', detail: 'tania-mock-v1' },
    ],
    toolsUsed: [
      {
        toolId: 'knowledge.search',
        name: 'Knowledge Search',
        risk: 'INFORMATIONAL',
        status: 'SUCCEEDED',
        summary: '1 dokumen relevan',
      },
    ],
    suggestions: ['Ringkas dokumen teratas'],
    ...overrides,
  };
}

/** Minimal brain double: records what it was asked and replays hooks. */
function fakeBrain(answer: AskResponse, chunks: string[] = []) {
  const calls: Array<{ request: AskRequest; options: AskOptions }> = [];

  const brain = {
    async ask(request: AskRequest, _actor: unknown, options: AskOptions = {}) {
      calls.push({ request, options });
      options.hooks?.onPhase?.('RETRIEVING');
      options.hooks?.onEvidence?.(answer.evidence);
      for (const chunk of chunks) options.hooks?.onAnswerChunk?.(chunk);
      return answer;
    },
  } as unknown as TaniaBrain;

  return { brain, calls };
}

function makeService(answer: AskResponse, chunks: string[] = []) {
  const transcript = new InMemoryTranscriptStore();
  const { brain, calls } = fakeBrain(answer, chunks);

  const service = new TaniaChatService({
    brain,
    context: new ContextService(transcript),
    intent: new IntentService(new KeywordIntentClassifier()),
    transcript,
  });

  return { service, transcript, calls };
}

describe('TaniaChatService.chat', () => {
  it('maps the brain answer onto the conversational contract', async () => {
    const { service } = makeService(baseAnswer());

    const response = await service.chat(
      { message: 'Cari kebijakan tata kelola AI' },
      DEMO_ACTOR,
      CORRELATION,
    );

    expect(response.message.role).toBe('tania');
    expect(response.message.content).toBe('Jawaban lengkap.');
    expect(response.message.conversationId).toHaveLength(36);
    expect(response.intent.value).toBe('SEARCH');
    expect(response.sources).toHaveLength(1);
    expect(response.status.state).toBe('COMPLETED');
    expect(response.status.grounded).toBe(true);
    expect(response.status.model).toBe('tania-mock-v1');
    expect(response.status.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('exposes tools and suggestions as actions', async () => {
    const { service } = makeService(baseAnswer());
    const response = await service.chat({ message: 'Cari kebijakan' }, DEMO_ACTOR, CORRELATION);

    expect(response.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'TOOL', label: 'Knowledge Search' }),
        expect.objectContaining({ type: 'SUGGESTION', prompt: 'Ringkas dokumen teratas' }),
      ]),
    );
  });

  it('reports an open approval gate as AWAITING_APPROVAL with an action', async () => {
    const { service } = makeService(
      baseAnswer({
        risk: 'HIGH',
        approval: {
          id: 'apr-1',
          sessionId: 'conv-1',
          toolId: 'workflow.execute',
          action: 'Workflow Execution',
          risk: 'HIGH',
          reason: 'HIGH risk action requires human approval before execution.',
          requestedBy: DEMO_ACTOR.id,
          requestedAt: '2026-09-19T10:00:00.000Z',
          status: 'PENDING',
        },
      }),
    );

    const response = await service.chat({ message: 'Jalankan workflow' }, DEMO_ACTOR, CORRELATION);

    expect(response.status.state).toBe('AWAITING_APPROVAL');
    expect(response.actions[0]).toMatchObject({
      type: 'APPROVAL',
      approvalId: 'apr-1',
      risk: 'HIGH',
      status: 'PENDING',
    });
  });

  it('reports a policy block as BLOCKED', async () => {
    const { service } = makeService(
      baseAnswer({
        toolsUsed: [
          {
            toolId: 'system.broadcast',
            name: 'Enterprise Broadcast',
            risk: 'CRITICAL',
            status: 'BLOCKED',
            summary: 'Missing required scope(s): system:admin.',
          },
        ],
      }),
    );

    const response = await service.chat({ message: 'Kirim pengumuman' }, DEMO_ACTOR, CORRELATION);
    expect(response.status.state).toBe('BLOCKED');
  });

  it('continues a conversation and feeds prior turns to the brain', async () => {
    const { service, calls } = makeService(baseAnswer());

    const first = await service.chat({ message: 'Pertanyaan pertama' }, DEMO_ACTOR, CORRELATION);
    await service.chat(
      { message: 'Pertanyaan kedua', conversationId: first.message.conversationId },
      DEMO_ACTOR,
      CORRELATION,
    );

    expect(calls[1]?.request.sessionId).toBe(first.message.conversationId);
    expect(calls[1]?.options.history).toEqual([
      { role: 'user', content: 'Pertanyaan pertama' },
      { role: 'assistant', content: 'Jawaban lengkap.' },
    ]);
  });

  it('passes sanitised screen context, never raw client text', async () => {
    const { service, calls } = makeService(baseAnswer());

    await service.chat(
      { message: 'Apa status inisiatif ini?', context: { surface: '/dashboard', focus: { type: 'initiative', id: 'DPS-118' } } },
      DEMO_ACTOR,
      CORRELATION,
    );

    expect(calls[0]?.options.hints).toEqual(['layar /dashboard', 'fokus initiative:DPS-118']);
  });

  it('persists the turn so the conversation can be resumed', async () => {
    const { service, transcript } = makeService(baseAnswer());

    const response = await service.chat({ message: 'Halo TANIA' }, DEMO_ACTOR, CORRELATION);
    const stored = await transcript.loadConversation(response.message.conversationId, DEMO_ACTOR);

    expect(stored.messages.map((message) => message.role)).toEqual(['user', 'tania']);
    expect(stored.messages[1]?.content).toBe('Jawaban lengkap.');
  });

  it('still answers when persistence fails', async () => {
    const transcript = new InMemoryTranscriptStore();
    vi.spyOn(transcript, 'recordTurn').mockRejectedValue(new Error('store down'));
    const { brain } = fakeBrain(baseAnswer());

    const service = new TaniaChatService({
      brain,
      context: new ContextService(transcript),
      intent: new IntentService(new KeywordIntentClassifier()),
      transcript,
    });

    await expect(service.chat({ message: 'Halo' }, DEMO_ACTOR, CORRELATION)).resolves.toMatchObject(
      { status: { state: 'COMPLETED' } },
    );
  });
});

describe('TaniaChatService.stream', () => {
  it('emits progress, then the answer, then the final response', async () => {
    const { service } = makeService(baseAnswer(), ['Jawaban ', 'lengkap.']);
    const events: ChatStreamEvent[] = [];

    for await (const event of service.stream({ message: 'Cari kebijakan' }, DEMO_ACTOR, CORRELATION)) {
      events.push(event);
    }

    const types = events.map((event) => event.type);
    expect(types).toContain('phase');
    expect(types).toContain('intent');
    expect(types).toContain('sources');
    expect(types.filter((type) => type === 'delta')).toHaveLength(2);
    expect(types.at(-1)).toBe('done');

    const done = events.at(-1);
    expect(done?.type === 'done' && done.response.message.content).toBe('Jawaban lengkap.');
  });

  it('emits an error event instead of throwing at the transport', async () => {
    const transcript = new InMemoryTranscriptStore();
    const brain = {
      async ask() {
        throw new Error('model gone');
      },
    } as unknown as TaniaBrain;

    const service = new TaniaChatService({
      brain,
      context: new ContextService(transcript),
      intent: new IntentService(new KeywordIntentClassifier()),
      transcript,
    });

    const events: ChatStreamEvent[] = [];
    for await (const event of service.stream({ message: 'Halo' }, DEMO_ACTOR, CORRELATION)) {
      events.push(event);
    }

    const last = events.at(-1);
    expect(last?.type).toBe('error');
    // The raw cause stays in the log, never in the payload.
    expect(last?.type === 'error' && last.message).not.toContain('model gone');
  });
});
