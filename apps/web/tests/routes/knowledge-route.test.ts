import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/tania/knowledge/search/route';
import { resetProcessSingleton } from '@/lib/tania/process-state';
import { ENTERPRISE_DOCUMENTS } from '@/lib/knowledge';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { RagResponse } from '@tania/types';

/**
 * The HTTP boundary for grounded search.
 *
 * This is where the central promise of the whole layer is kept or broken — a
 * user must never retrieve a document they are not authorised to read — and it
 * takes a `classificationCeiling` straight from the request body. Until now
 * nothing exercised the handler at all.
 */

const PROXIED = {
  origin: 'https://tania.telkom.example',
  'x-forwarded-host': 'tania.telkom.example',
  'x-forwarded-proto': 'https',
};

function search(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://0.0.0.0:3000/api/tania/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...PROXIED, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function bodyOf<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(() => {
  resetProcessSingleton('rate-limiter');
});

describe('POST /api/tania/knowledge/search', () => {
  it('returns the four documented fields and nothing else', async () => {
    const response = await POST(
      search({ query: 'Apa prosedur persetujuan untuk aksi berisiko tinggi?', limit: 4 }),
    );
    const body = await bodyOf<{ data: RagResponse; requestId: string }>(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual([
      'answer',
      'citations',
      'confidence',
      'retrievedDocuments',
    ]);
    expect(body.requestId).toBeTruthy();
  });

  it('answers a grounded question with citations that carry a locator', async () => {
    const response = await POST(
      search({ query: 'Apa prosedur persetujuan untuk aksi berisiko tinggi?', limit: 4 }),
    );
    const { data } = await bodyOf<{ data: RagResponse }>(response);

    expect(data.citations.length).toBeGreaterThan(0);
    for (const citation of data.citations) {
      expect(citation.title).toBeTruthy();
      expect(citation.locator).toBeTruthy();
      expect(citation.marker).toBeGreaterThan(0);
    }
  });

  it('says it has no source rather than inventing one', async () => {
    const response = await POST(
      search({ query: 'Berapa harga saham Telkom hari ini di bursa Tokyo?', limit: 4 }),
    );
    const { data } = await bodyOf<{ data: RagResponse }>(response);

    expect(data.citations).toEqual([]);
    expect(data.confidence.level).toBe('NONE');
  });

  describe('permission filtering', () => {
    it('never returns a document above the actor clearance', async () => {
      // The demo actor is CONFIDENTIAL; RESTRICTED material must not appear,
      // not even as a considered-but-uncited title.
      const response = await POST(search({ query: 'kompensasi band gaji', limit: 8 }));
      const { data } = await bodyOf<{ data: RagResponse }>(response);

      const forbidden = ENTERPRISE_DOCUMENTS.filter(
        (document) => document.acl.classification === 'RESTRICTED',
      ).map((document) => document.title);

      for (const document of data.retrievedDocuments) {
        expect(forbidden).not.toContain(document.title);
      }
      for (const citation of data.citations) {
        expect(forbidden).not.toContain(citation.title);
      }
    });

    it('cannot be widened by a ceiling above the actor own clearance', async () => {
      // The caller names RESTRICTED; the actor's own clearance still decides.
      const response = await POST(
        search({ query: 'kompensasi band gaji', limit: 8, classificationCeiling: 'RESTRICTED' }),
      );
      const { data } = await bodyOf<{ data: RagResponse }>(response);

      const forbidden = ENTERPRISE_DOCUMENTS.filter(
        (document) => document.acl.classification === 'RESTRICTED',
      ).map((document) => document.title);

      for (const document of data.retrievedDocuments) {
        expect(forbidden).not.toContain(document.title);
      }
    });

    it('does narrow when the ceiling asks for less', async () => {
      const response = await POST(
        search({ query: 'portofolio produk DPS', limit: 8, classificationCeiling: 'PUBLIC' }),
      );
      const { data } = await bodyOf<{ data: RagResponse }>(response);

      const publicTitles = ENTERPRISE_DOCUMENTS.filter(
        (document) => document.acl.classification === 'PUBLIC',
      ).map((document) => document.title);

      for (const document of data.retrievedDocuments) {
        expect(publicTitles).toContain(document.title);
      }
    });

    it('reports the clearance the answer was filtered against', async () => {
      const response = await POST(search({ query: 'portofolio produk DPS' }));
      const body = await bodyOf<{ meta: { clearance: string } }>(response);

      expect(body.meta.clearance).toBe(DEMO_ACTOR.clearance);
    });
  });

  describe('document kind filter', () => {
    it('scopes the search to the requested kinds', async () => {
      const response = await POST(
        search({ query: 'persetujuan dan tata kelola', limit: 6, kinds: ['SOP'] }),
      );
      const { data } = await bodyOf<{ data: RagResponse }>(response);

      const sopTitles = ENTERPRISE_DOCUMENTS.filter((d) => d.kind === 'SOP').map((d) => d.title);
      expect(data.retrievedDocuments.length).toBeGreaterThan(0);
      for (const document of data.retrievedDocuments) {
        expect(sopTitles).toContain(document.title);
      }
    });

    it('rejects an unknown kind rather than ignoring it', async () => {
      // Dropping it would widen the search back to the whole corpus — the
      // opposite of what the caller asked for.
      const response = await POST(search({ query: 'apa saja', kinds: ['SLIDE_DECK'] }));

      expect(response.status).toBe(400);
      const body = await bodyOf<{ error: { message: string } }>(response);
      expect(body.error.message).toContain('kinds');
    });

    it('rejects an empty kinds array', async () => {
      expect((await POST(search({ query: 'apa saja', kinds: [] }))).status).toBe(400);
    });
  });

  describe('input validation', () => {
    it('rejects an empty query', async () => {
      expect((await POST(search({ query: '   ' }))).status).toBe(400);
    });

    it('rejects a limit outside the allowed range', async () => {
      expect((await POST(search({ query: 'apa saja', limit: 0 }))).status).toBe(400);
      expect((await POST(search({ query: 'apa saja', limit: 99 }))).status).toBe(400);
    });

    it('rejects an unknown classification ceiling', async () => {
      expect(
        (await POST(search({ query: 'apa saja', classificationCeiling: 'COSMIC' }))).status,
      ).toBe(400);
    });

    it('rejects a body that is not JSON', async () => {
      expect((await POST(search('{ not json'))).status).toBe(400);
    });
  });

  it('refuses a request from another site', async () => {
    const response = await POST(search({ query: 'apa saja' }, { origin: 'https://evil.test' }));

    expect(response.status).toBe(403);
  });

  it('exposes no chain-of-thought', async () => {
    const response = await POST(
      search({ query: 'Jelaskan langkah demi langkah alasanmu', limit: 4 }),
    );
    const raw = JSON.stringify(await response.json());

    for (const forbidden of ['chainOfThought', 'systemPrompt', 'reasoning']) {
      expect(raw).not.toContain(forbidden);
    }
  });
});
