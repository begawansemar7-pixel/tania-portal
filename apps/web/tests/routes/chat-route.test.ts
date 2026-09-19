import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/tania/chat/route';
import { GET as getConversation } from '@/app/api/tania/conversations/[id]/route';
import { resetProcessSingleton } from '@/lib/tania/process-state';
import { RATE_LIMITS } from '@/lib/governance/policies/rate-limit';
import { CORRELATION_HEADER } from '@tania/config';
import type { TaniaChatResponse } from '@tania/types';

/**
 * The HTTP boundary itself.
 *
 * Everything below the handler was already well covered, and everything above
 * it was verified by hand. The handler was the seam in between: auth, guard
 * ordering, body parsing, the stream-versus-JSON branch, and the response
 * envelope. A review found a 403-for-every-real-user bug living exactly here,
 * invisible to six hundred unit tests, because none of them ever called a
 * route handler.
 *
 * These tests call the real exported handlers against real `Request` objects.
 * Nothing is mocked: the container wires the same mock LLM, retriever and
 * runtime a developer runs locally.
 */

/** What a container bound to all interfaces sees as its own URL. */
const BIND_URL = 'http://0.0.0.0:3000/api/tania/chat';
const PUBLIC_ORIGIN = 'https://tania.telkom.example';

function chatRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = BIND_URL,
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Headers an ingress adds in front of the portal. */
const PROXIED = {
  origin: PUBLIC_ORIGIN,
  'x-forwarded-host': 'tania.telkom.example',
  'x-forwarded-proto': 'https',
};

async function bodyOf<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(() => {
  // The limiter is a process singleton, so without this one test's requests
  // spend another's budget and the failure lands somewhere unrelated.
  resetProcessSingleton('rate-limiter');
});

describe('POST /api/tania/chat', () => {
  describe('cross-site protection at the boundary', () => {
    it('accepts the public origin an ingress forwards', async () => {
      const response = await POST(chatRequest({ message: 'Halo TANIA' }, PROXIED));

      expect(response.status).toBe(200);
    });

    it('accepts a same-origin browser request', async () => {
      const response = await POST(
        chatRequest(
          { message: 'Halo TANIA' },
          { origin: 'http://localhost:3000', host: 'localhost:3000' },
        ),
      );

      expect(response.status).toBe(200);
    });

    it('refuses a request from another site', async () => {
      const response = await POST(
        chatRequest({ message: 'Halo TANIA' }, { ...PROXIED, origin: 'https://evil.test' }),
      );

      expect(response.status).toBe(403);
      const body = await bodyOf<{ error: { code: string } }>(response);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('lets a server-to-server client through', async () => {
      const response = await POST(chatRequest({ message: 'Halo TANIA' }));

      expect(response.status).toBe(200);
    });
  });

  describe('request validation', () => {
    it('rejects a body that is not JSON', async () => {
      const response = await POST(chatRequest('{ not json', PROXIED));

      expect(response.status).toBe(400);
      const body = await bodyOf<{ error: { code: string } }>(response);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects an empty message', async () => {
      const response = await POST(chatRequest({ message: '   ' }, PROXIED));

      expect(response.status).toBe(400);
    });

    it('rejects a message beyond the length limit', async () => {
      const response = await POST(chatRequest({ message: 'x'.repeat(4001) }, PROXIED));

      expect(response.status).toBe(400);
    });

    it('rejects an unknown intent', async () => {
      const response = await POST(
        chatRequest({ message: 'Halo', intent: 'DELETE_EVERYTHING' }, PROXIED),
      );

      expect(response.status).toBe(400);
    });

    it('refuses an oversized body with 413, before parsing it', async () => {
      const response = await POST(
        chatRequest({ message: 'x'.repeat(300 * 1024) }, PROXIED),
      );

      expect(response.status).toBe(413);
      const body = await bodyOf<{ error: { code: string; details?: { limit?: number } } }>(
        response,
      );
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.error.details?.limit).toBeGreaterThan(0);
    });

    it('states which field was wrong', async () => {
      const response = await POST(chatRequest({ message: '' }, PROXIED));
      const body = await bodyOf<{ error: { message: string } }>(response);

      expect(body.error.message).toContain('message');
    });
  });

  describe('response envelope', () => {
    it('returns the contract the client programs against', async () => {
      const response = await POST(
        chatRequest({ message: 'Apa status portofolio produk DPS?' }, PROXIED),
      );
      const body = await bodyOf<{ data: TaniaChatResponse; requestId: string }>(response);

      expect(response.status).toBe(200);
      expect(body.requestId).toBeTruthy();
      expect(Object.keys(body.data).sort()).toEqual([
        'actions',
        'intent',
        'message',
        'sources',
        'status',
      ]);
      expect(body.data.message.role).toBe('tania');
      expect(body.data.message.content.length).toBeGreaterThan(0);
      expect(body.data.status.state).toBe('COMPLETED');
    });

    it('continues a well-formed inbound correlation id', async () => {
      const correlationId = '11111111-2222-4333-8444-555555555555';
      const response = await POST(
        chatRequest({ message: 'Halo' }, { ...PROXIED, [CORRELATION_HEADER]: correlationId }),
      );
      const body = await bodyOf<{ requestId: string }>(response);

      expect(body.requestId).toBe(correlationId);
    });

    it('starts a new conversation when none is given, and reuses it when one is', async () => {
      const first = await bodyOf<{ data: TaniaChatResponse }>(
        await POST(chatRequest({ message: 'Giliran pertama' }, PROXIED)),
      );
      const conversationId = first.data.message.conversationId;
      expect(conversationId).toBeTruthy();

      const second = await bodyOf<{ data: TaniaChatResponse }>(
        await POST(chatRequest({ message: 'Giliran kedua', conversationId }, PROXIED)),
      );

      expect(second.data.message.conversationId).toBe(conversationId);
      expect(second.data.message.id).not.toBe(first.data.message.id);
    });

    /**
     * The constitutional rule, asserted where it would actually leak.
     * Everything the handler emits is scanned, not just the answer text.
     */
    it('exposes no chain-of-thought', async () => {
      const response = await POST(
        chatRequest({ message: 'Jelaskan alasanmu langkah demi langkah' }, PROXIED),
      );
      const raw = JSON.stringify(await response.json());

      for (const forbidden of ['chainOfThought', 'chain_of_thought', 'reasoning', 'systemPrompt']) {
        expect(raw).not.toContain(forbidden);
      }
    });
  });

  describe('streaming branch', () => {
    it('streams when the Accept header asks for events', async () => {
      const response = await POST(
        chatRequest({ message: 'Halo' }, { ...PROXIED, accept: 'text/event-stream' }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      // A proxy that batched these would defeat the point of streaming at all.
      expect(response.headers.get('x-accel-buffering')).toBe('no');
    });

    it('streams when the body asks for it', async () => {
      const response = await POST(chatRequest({ message: 'Halo', stream: true }, PROXIED));

      expect(response.headers.get('content-type')).toContain('text/event-stream');
    });

    it('returns JSON by default', async () => {
      const response = await POST(chatRequest({ message: 'Halo' }, PROXIED));

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('delivers the documented event order and finishes with the full response', async () => {
      const response = await POST(chatRequest({ message: 'Halo', stream: true }, PROXIED));
      const text = await response.text();

      const types = [...text.matchAll(/^event: (.+)$/gm)].map((match) => match[1]);
      expect(types[0]).toBe('accepted');
      expect(types).toContain('phase');
      expect(types).toContain('intent');
      expect(types.at(-1)).toBe('done');

      const doneLine = text.trimEnd().split('\n').at(-1) ?? '';
      const done = JSON.parse(doneLine.replace(/^data: /, '')) as {
        response: TaniaChatResponse;
      };
      expect(done.response.status.state).toBe('COMPLETED');
    });
  });

  describe('rate limiting', () => {
    it('throttles past the configured budget and says when to retry', async () => {
      const limit = RATE_LIMITS['tania.chat']?.limit ?? 30;

      let throttled: Response | undefined;
      for (let attempt = 0; attempt <= limit; attempt += 1) {
        const response = await POST(chatRequest({ message: `Pesan ${attempt}` }, PROXIED));
        if (response.status === 429) {
          throttled = response;
          break;
        }
      }

      expect(throttled, `no 429 within ${limit + 1} requests`).toBeDefined();
      // A 429 without Retry-After leaves the client to guess, and clients guess badly.
      expect(Number(throttled?.headers.get('retry-after'))).toBeGreaterThan(0);
    });

    it('checks origin before spending the budget', async () => {
      // A forged request must not be able to exhaust a real user's allowance.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await POST(chatRequest({ message: 'x' }, { ...PROXIED, origin: 'https://evil.test' }));
      }

      const legitimate = await POST(chatRequest({ message: 'Halo' }, PROXIED));
      expect(legitimate.status).toBe(200);
    });
  });
});

describe('GET /api/tania/conversations/[id]', () => {
  it('reads back the turns that were recorded', async () => {
    const created = await bodyOf<{ data: TaniaChatResponse }>(
      await POST(chatRequest({ message: 'Pertanyaan yang disimpan' }, PROXIED)),
    );
    const conversationId = created.data.message.conversationId;

    const response = await getConversation(
      new Request(`http://0.0.0.0:3000/api/tania/conversations/${conversationId}`),
      { params: Promise.resolve({ id: conversationId }) },
    );
    const body = await bodyOf<{
      data: { conversationId: string; messages: { role: string }[] };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data.conversationId).toBe(conversationId);
    expect(body.data.messages.map((message) => message.role)).toEqual(['user', 'tania']);
  });

  it('returns an empty thread for an unknown id rather than failing', async () => {
    const response = await getConversation(
      new Request('http://0.0.0.0:3000/api/tania/conversations/unknown-id'),
      { params: Promise.resolve({ id: 'unknown-id' }) },
    );

    expect(response.status).toBe(200);
    const body = await bodyOf<{ data: { messages: unknown[] } }>(response);
    expect(body.data.messages).toEqual([]);
  });
});
