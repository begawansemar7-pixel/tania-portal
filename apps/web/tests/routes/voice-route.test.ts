import { beforeEach, describe, expect, it } from 'vitest';
import { POST as transcribe } from '@/app/api/tania/voice/transcribe/route';
import { POST as speak } from '@/app/api/tania/voice/speak/route';
import { resetProcessSingleton } from '@/lib/tania/process-state';

/**
 * The HTTP boundary between the voice layer and the runtime.
 *
 * Newly worth testing: the runtime in `apps/runtime` answers `voice.input` and
 * `voice.output` with `UNSUPPORTED`, because a service has no microphone and no
 * speaker. So a deployment that wires TANIA to a real runtime reaches this path
 * on the very first press of the mic button — it is the default, not an edge.
 *
 * What matters is that "this runtime has no audio hardware" arrives as a clear,
 * distinguishable answer rather than as a generic upstream failure. A user
 * should be told voice is unavailable here; they should not be told
 * transcription failed, which invites them to try again forever.
 */

const PROXIED = {
  origin: 'https://tania.telkom.example',
  'x-forwarded-host': 'tania.telkom.example',
  'x-forwarded-proto': 'https',
};

function request(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://0.0.0.0:3000/api/tania/voice/${path}`, {
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

describe('POST /api/tania/voice/transcribe', () => {
  it('transcribes against the simulated runtime', async () => {
    const response = await transcribe(request('transcribe', { transcript: 'halo TANIA' }));
    const body = await bodyOf<{ data: { transcript: string }; meta: { simulated: boolean } }>(
      response,
    );

    expect(response.status).toBe(200);
    expect(body.data.transcript).toBe('halo TANIA');
    // Says plainly that no real speech engine was involved.
    expect(body.meta.simulated).toBe(true);
  });

  it('refuses an empty request rather than transcribing silence', async () => {
    const response = await transcribe(request('transcribe', {}));

    expect(response.status).toBe(400);
  });

  it('rejects a body that is not JSON', async () => {
    expect((await transcribe(request('transcribe', '{ not json'))).status).toBe(400);
  });

  it('refuses a request from another site', async () => {
    const response = await transcribe(
      request('transcribe', { transcript: 'halo' }, { origin: 'https://evil.test' }),
    );

    expect(response.status).toBe(403);
  });
});

describe('POST /api/tania/voice/speak', () => {
  it('prepares speech as an artifact without playing audio', async () => {
    const response = await speak(request('speak', { text: 'Halo, ada yang bisa saya bantu?' }));

    expect(response.status).toBe(200);
  });

  it('requires something to say', async () => {
    expect((await speak(request('speak', { text: '   ' }))).status).toBe(400);
  });

  it('bounds how much it will say at once', async () => {
    expect((await speak(request('speak', { text: 'x'.repeat(20_000) }))).status).toBe(400);
  });

  it('rejects a malformed voice selection', async () => {
    expect((await speak(request('speak', { text: 'halo', voice: 42 }))).status).toBe(400);
  });
});

describe('when the runtime has no audio hardware', () => {
  /**
   * The shape `apps/runtime` actually returns. Injected here rather than
   * started as a process — the interop suite covers the real socket; this
   * covers how the route translates the answer.
   */
  const UNSUPPORTED = {
    status: 'UNSUPPORTED' as const,
    evidence: [],
    artifacts: [],
    executionTime: 1,
    error: {
      code: 'CAPABILITY_UNSUPPORTED',
      message: 'Runtime ini tidak memiliki perangkat masukan audio.',
      retryable: false,
    },
  };

  it('maps an unsupported capability to 501, not to a 5xx outage', async () => {
    // 503 would say "try later"; 501 says "not here". The difference decides
    // whether a user retries forever or is told voice is unavailable.
    const { getJarvisClient } = await import('@/lib/tania/container');
    const client = getJarvisClient();
    const original = client.forRequest.bind(client);

    try {
      (client as unknown as { forRequest: unknown }).forRequest = () => ({
        transcribe: async () => UNSUPPORTED,
        speak: async () => UNSUPPORTED,
      });

      const response = await transcribe(request('transcribe', { transcript: 'halo' }));
      const body = await bodyOf<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(501);
      expect(body.error.code).toBe('NOT_IMPLEMENTED');
      // The runtime's own reason reaches the user, not a generic substitute.
      expect(body.error.message).toContain('audio');
    } finally {
      (client as unknown as { forRequest: unknown }).forRequest = original;
    }
  });

  it('does the same for speech output', async () => {
    const { getJarvisClient } = await import('@/lib/tania/container');
    const client = getJarvisClient();
    const original = client.forRequest.bind(client);

    try {
      (client as unknown as { forRequest: unknown }).forRequest = () => ({
        transcribe: async () => UNSUPPORTED,
        speak: async () => UNSUPPORTED,
      });

      expect((await speak(request('speak', { text: 'halo' }))).status).toBe(501);
    } finally {
      (client as unknown as { forRequest: unknown }).forRequest = original;
    }
  });
});
