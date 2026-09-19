import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CapabilityRoutingAdapter } from '@/lib/tania/runtime/adapter';
import { HttpCapabilityAdapter } from '@/lib/tania/runtime/capabilities/http';
import { AdapterBackedJarvisRuntime } from '@/lib/tania/runtime/jarvis';
import { JARVIS_CAPABILITIES, type JarvisCommand } from '@tania/types';

/**
 * TANIA's real adapter against the real runtime, over a socket.
 *
 * Every other JARVIS test in this suite uses a simulated adapter or an injected
 * fetch. This one starts `apps/runtime` as a process and lets
 * `HttpCapabilityAdapter` talk to it, which is the only way to find out whether
 * the two halves of the contract actually agree — serialisation, status
 * vocabulary, error shape and all.
 *
 * Both sides compile against `@tania/types`, so a mismatch here would mean the
 * wire format drifted from the declarations rather than the declarations
 * disagreeing.
 */

const PORT = 4199;
const TOKEN = 'interop-test-token';
const BASE = `http://127.0.0.1:${PORT}`;
const RUNTIME_ROOT = resolve(__dirname, '..', '..', 'runtime');

let server: ChildProcess;

function runtime() {
  const adapters = JARVIS_CAPABILITIES.map(
    (capability) =>
      new HttpCapabilityAdapter({
        capability,
        baseUrl: BASE,
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
  );

  return new AdapterBackedJarvisRuntime(
    new CapabilityRoutingAdapter({ id: 'jarvis', adapters }),
    { dispatch: { timeoutMs: 8000 } },
  );
}

function command(overrides: Partial<JarvisCommand> = {}): JarvisCommand {
  return {
    requestId: `req-${Math.random().toString(36).slice(2)}`,
    capability: 'tools',
    action: 'tools.invoke',
    task: 'Menjalankan Knowledge Search',
    parameters: { toolId: 'knowledge.search' },
    risk: 'INFORMATIONAL',
    requiresApproval: false,
    ...overrides,
  };
}

beforeAll(async () => {
  /**
   * The built artefact, not the sources.
   *
   * Node's type stripping cannot emit the decorator metadata Nest relies on,
   * and running `dist` is what a deployment does anyway — so this exercises the
   * same bytes that would ship.
   */
  const entry = resolve(RUNTIME_ROOT, 'dist', 'src', 'main.js');
  if (!existsSync(entry)) {
    throw new Error(`Runtime not built. Run: npm run build --workspace @tania/runtime`);
  }

  server = spawn('node', [entry], {
    cwd: RUNTIME_ROOT,
    env: { ...process.env, PORT: String(PORT), TANIA_RUNTIME_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await sleep(250);
    }
  }

  throw new Error('runtime did not start');
}, 45_000);

afterAll(async () => {
  server?.kill('SIGTERM');
  await sleep(200);
  if (server && server.exitCode === null) server.kill('SIGKILL');
});

describe('TANIA adapter against the real runtime', () => {
  it('carries a command there and a result back', async () => {
    const result = await runtime().adapter.dispatch(command());

    expect(result.status).toBe('SUCCEEDED');
    expect(result.executionTime).toBeGreaterThan(0);
    expect(result.requestId).toBeTruthy();
  });

  it('agrees on the approval refusal', async () => {
    // The property both sides implement independently. If they disagreed, a
    // high-risk command could run on a technicality of wire format.
    const result = await runtime().adapter.dispatch(
      command({ risk: 'HIGH', requiresApproval: true, parameters: { toolId: 'workflow.execute' } }),
    );

    expect(result.status).toBe('REJECTED');
    expect(result.error?.code).toBe('APPROVAL_REQUIRED');
  });

  it('executes once a decision is attached', async () => {
    const result = await runtime().adapter.dispatch(
      command({
        risk: 'HIGH',
        requiresApproval: true,
        approvalId: 'apr-interop',
        parameters: { toolId: 'workflow.execute' },
      }),
    );

    expect(result.status).toBe('SUCCEEDED');
  });

  it('reports an unsupported capability as such, not as a failure', async () => {
    const result = await runtime().adapter.dispatch(
      command({ capability: 'browser', action: 'browser.open' }),
    );

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.error?.retryable).toBe(false);
  });

  it('runs the tool-shaped door end to end', async () => {
    const result = await runtime().execute({
      tool: {
        id: 'document.draft',
        name: 'Document Draft',
        description: 'Draft',
        risk: 'MEDIUM',
        effect: 'Creates a draft',
        reversible: true,
        requiredScopes: ['document:create'],
      } as never,
      input: { content: 'isi draf' },
      actor: { id: 'usr-1' } as never,
      correlationId: 'req-interop',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('cancels an in-flight command', async () => {
    const controller = new AbortController();
    const pending = runtime().adapter.dispatch(command(), { signal: controller.signal });
    controller.abort();

    expect((await pending).status).toBe('CANCELLED');
  });

  it('reports the runtime as live once it is actually answering', async () => {
    const statuses = runtime().describe();

    expect(statuses).toHaveLength(JARVIS_CAPABILITIES.length);
    expect(statuses.every((status) => status.live)).toBe(true);
  });
});
