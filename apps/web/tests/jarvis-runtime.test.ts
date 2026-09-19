import { describe, expect, it } from 'vitest';
import type { JarvisCapability, JarvisCommand, JarvisResult } from '@tania/types';
import { JARVIS_CAPABILITIES, isJarvisCapability } from '@tania/types';
import type { JarvisCapabilityAdapter } from '@tania/core/runtime';
import { CapabilityRoutingAdapter } from '@/lib/tania/runtime/adapter';
import { createMockCapabilityAdapters } from '@/lib/tania/runtime/capabilities/mock';
import { buildCommand, failed, succeeded } from '@/lib/tania/runtime/commands';

function command(overrides: Partial<JarvisCommand> = {}): JarvisCommand {
  return {
    ...buildCommand({
      capability: 'tools',
      action: 'tools.invoke',
      task: 'Menjalankan tool uji',
      parameters: { toolId: 'analytics.query', toolName: 'Analytics Query', effect: 'baca-saja' },
      risk: 'LOW',
    }),
    ...overrides,
  };
}

/** A capability whose behaviour each test dictates. */
class ProgrammableAdapter implements JarvisCapabilityAdapter {
  readonly id = 'programmable';
  readonly live = false;
  calls = 0;

  constructor(
    readonly capability: JarvisCapability,
    private readonly handler: (command: JarvisCommand, signal?: AbortSignal) => Promise<JarvisResult>,
  ) {}

  async handle(cmd: JarvisCommand, signal?: AbortSignal): Promise<JarvisResult> {
    this.calls += 1;
    return this.handler(cmd, signal);
  }
}

function router(adapter: JarvisCapabilityAdapter, options = {}) {
  return new CapabilityRoutingAdapter({
    adapters: [adapter],
    sleep: async () => {},
    ...options,
  });
}

describe('structured command envelope', () => {
  it('carries the agreed fields', () => {
    const cmd = buildCommand(
      {
        capability: 'browser',
        action: 'browser.open',
        task: 'Membuka halaman',
        parameters: { url: 'https://example.test' },
        risk: 'LOW',
        requiresApproval: false,
      },
      { correlationId: 'req-1', sessionId: 'conv-1', actorId: 'usr_henri' },
    );

    expect(Object.keys(cmd).sort()).toEqual([
      'action',
      'actorId',
      'capability',
      'correlationId',
      'parameters',
      'requestId',
      'requiresApproval',
      'risk',
      'sessionId',
      'task',
    ]);
    expect(cmd.requestId).toBeTruthy();
  });

  it('names exactly the ten capabilities', () => {
    expect([...JARVIS_CAPABILITIES]).toEqual([
      'voice.input',
      'voice.output',
      'vision',
      'browser',
      'computer',
      'files',
      'tools',
      'skills',
      'session',
      'verification',
    ]);
    expect(isJarvisCapability('files')).toBe(true);
    expect(isJarvisCapability('telepathy')).toBe(false);
  });
});

describe('capability routing', () => {
  it('serves every capability with the simulated adapters', () => {
    const adapter = new CapabilityRoutingAdapter({ adapters: createMockCapabilityAdapters() });

    expect(adapter.capabilities().sort()).toEqual([...JARVIS_CAPABILITIES].sort());
    for (const capability of JARVIS_CAPABILITIES) {
      expect(adapter.supports(capability), capability).toBe(true);
    }
  });

  it('reports which capabilities are simulated rather than hiding it', () => {
    const adapter = new CapabilityRoutingAdapter({ adapters: createMockCapabilityAdapters() });
    const described = adapter.describe();

    expect(described).toHaveLength(JARVIS_CAPABILITIES.length);
    expect(described.every((status) => status.live === false)).toBe(true);
    expect(described[0]?.detail).toContain('simulasi');
  });

  it('answers UNSUPPORTED for a capability it does not have', async () => {
    const adapter = new CapabilityRoutingAdapter({ adapters: [] });

    const result = await adapter.dispatch(command({ capability: 'computer' }));

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.error?.code).toBe('CAPABILITY_UNAVAILABLE');
    expect(result.error?.retryable).toBe(false);
  });
});

describe('failure handling', () => {
  it('never lets an adapter throw at the caller', async () => {
    const adapter = router(
      new ProgrammableAdapter('tools', async () => {
        throw new Error('adapter meledak');
      }),
      { maxAttempts: 1 },
    );

    const result = await adapter.dispatch(command());

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('ADAPTER_ERROR');
    expect(result.error?.message).toBe('adapter meledak');
  });

  it('measures how long the call took', async () => {
    let clock = 1_000;
    const adapter = new CapabilityRoutingAdapter({
      adapters: [new ProgrammableAdapter('tools', async (cmd) => succeeded(cmd, { summary: 'ok' }))],
      now: () => (clock += 40),
    });

    const result = await adapter.dispatch(command());

    expect(result.status).toBe('SUCCEEDED');
    expect(result.executionTime).toBeGreaterThan(0);
    expect(result.attempts).toBe(1);
  });
});

describe('retry', () => {
  it('retries a failure the runtime marked retryable', async () => {
    let attempts = 0;
    const capability = new ProgrammableAdapter('tools', async (cmd) => {
      attempts += 1;
      return attempts === 1
        ? failed(cmd, { code: 'BUSY', message: 'Runtime sibuk.', retryable: true })
        : succeeded(cmd, { summary: 'berhasil pada percobaan kedua' });
    });

    const result = await router(capability, { maxAttempts: 3 }).dispatch(command());

    expect(result.status).toBe('SUCCEEDED');
    expect(result.attempts).toBe(2);
    expect(capability.calls).toBe(2);
  });

  it('does not retry a failure the runtime called permanent', async () => {
    const capability = new ProgrammableAdapter('tools', async (cmd) =>
      failed(cmd, { code: 'BAD_INPUT', message: 'Parameter tidak sah.', retryable: false }),
    );

    const result = await router(capability, { maxAttempts: 3 }).dispatch(command());

    expect(result.status).toBe('FAILED');
    expect(capability.calls).toBe(1);
  });

  it('gives up once the attempts are spent', async () => {
    const capability = new ProgrammableAdapter('tools', async (cmd) =>
      failed(cmd, { code: 'BUSY', message: 'Runtime sibuk.', retryable: true }),
    );

    const result = await router(capability, { maxAttempts: 2 }).dispatch(command());

    expect(result.status).toBe('FAILED');
    expect(result.attempts).toBe(2);
    expect(capability.calls).toBe(2);
  });
});

describe('timeout', () => {
  it('returns TIMEOUT and aborts the call that outlived its budget', async () => {
    let sawAbort = false;
    const capability = new ProgrammableAdapter('tools', async (cmd, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      sawAbort = signal?.aborted === true;
      return succeeded(cmd, { summary: 'terlambat' });
    });

    const result = await router(capability, { maxAttempts: 1 }).dispatch(command(), {
      timeoutMs: 10,
    });

    expect(result.status).toBe('TIMEOUT');
    expect(result.error?.retryable).toBe(true);

    // The underlying call is told to stop rather than left running.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(sawAbort).toBe(true);
  });

  it('retries after a timeout, because a timeout may be transient', async () => {
    let attempts = 0;
    const capability = new ProgrammableAdapter('tools', async (cmd) => {
      attempts += 1;
      if (attempts === 1) await new Promise((resolve) => setTimeout(resolve, 60));
      return succeeded(cmd, { summary: 'akhirnya berhasil' });
    });

    const result = await router(capability, { maxAttempts: 2 }).dispatch(command(), {
      timeoutMs: 15,
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.attempts).toBe(2);
  });

  it('honours the budget carried on the command itself', async () => {
    const capability = new ProgrammableAdapter('tools', async (cmd) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return succeeded(cmd, { summary: 'terlambat' });
    });

    const result = await router(capability, { maxAttempts: 1 }).dispatch(
      command({ timeoutMs: 10 }),
    );

    expect(result.status).toBe('TIMEOUT');
  });
});

describe('cancellation', () => {
  it('returns CANCELLED when an aborted call stops without finishing', async () => {
    const controller = new AbortController();
    const capability = new ProgrammableAdapter('tools', async (cmd, signal) => {
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return signal?.aborted
        ? failed(cmd, { code: 'ABORTED', message: 'dihentikan', retryable: false })
        : succeeded(cmd, { summary: 'seharusnya tidak dipakai' });
    });

    const result = await router(capability, { maxAttempts: 3 }).dispatch(command(), {
      signal: controller.signal,
    });

    expect(result.status).toBe('CANCELLED');
    expect(result.error?.retryable).toBe(false);
  });

  it('still reports success when the work finished before the abort landed', async () => {
    const controller = new AbortController();
    const capability = new ProgrammableAdapter('tools', async (cmd) => {
      // The side effect already happened. Calling this "cancelled" would hide
      // a change the enterprise now has, and nothing would compensate it.
      const result = succeeded(cmd, { summary: 'sudah terlanjur dijalankan' });
      controller.abort();
      return result;
    });

    const result = await router(capability, { maxAttempts: 3 }).dispatch(command(), {
      signal: controller.signal,
    });

    expect(result.status).toBe('SUCCEEDED');
  });

  it('does not dispatch at all when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const capability = new ProgrammableAdapter('tools', async (cmd) =>
      succeeded(cmd, { summary: 'tidak boleh terjadi' }),
    );

    const result = await router(capability).dispatch(command(), { signal: controller.signal });

    expect(result.status).toBe('CANCELLED');
    expect(capability.calls).toBe(0);
  });

  it('stops retrying once the caller has walked away', async () => {
    const controller = new AbortController();
    const capability = new ProgrammableAdapter('tools', async (cmd) => {
      controller.abort();
      return failed(cmd, { code: 'BUSY', message: 'sibuk', retryable: true });
    });

    const result = await router(capability, { maxAttempts: 5 }).dispatch(command(), {
      signal: controller.signal,
    });

    expect(result.status).toBe('CANCELLED');
    expect(capability.calls).toBe(1);
  });
});

describe('approval at the runtime boundary', () => {
  it('refuses a command that claims to need approval but carries none', async () => {
    const capability = new ProgrammableAdapter('tools', async (cmd) =>
      succeeded(cmd, { summary: 'tidak boleh berjalan' }),
    );

    const result = await router(capability).dispatch(
      command({ risk: 'HIGH', requiresApproval: true }),
    );

    expect(result.status).toBe('REJECTED');
    expect(result.error?.code).toBe('APPROVAL_REQUIRED');
    expect(capability.calls).toBe(0);
  });

  it('runs the same command once a decision is attached', async () => {
    const capability = new ProgrammableAdapter('tools', async (cmd) =>
      succeeded(cmd, { summary: 'berjalan setelah disetujui' }),
    );

    const result = await router(capability).dispatch(
      command({ risk: 'HIGH', requiresApproval: true, approvalId: 'apr-1' }),
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(capability.calls).toBe(1);
  });
});
