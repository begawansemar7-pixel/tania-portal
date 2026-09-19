import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JARVIS_CAPABILITIES } from '@tania/types';
import { createMockCapabilityAdapters } from '@/lib/tania/runtime/capabilities/mock';
import { MockJarvisRuntime } from '@/lib/tania/runtime/jarvis';

/**
 * The runtime boundary, enforced structurally.
 *
 * The constitution says TANIA is the intelligence layer and JARVIS is the
 * execution layer, and that TANIA never reaches enterprise systems directly.
 * `jarvis-runtime` and `jarvis-integration` hold the current code to that:
 * timeout, retry, cancellation, and a last-mile refusal of any L3 command
 * arriving without its approval.
 *
 * Every one of those protections lives in `CapabilityRoutingAdapter`. A module
 * that constructed `HttpCapabilityAdapter` itself, or simply fetched the
 * configured JARVIS address, would get none of them — no budget, no retry
 * policy, no abort, no approval check — and not one existing test would fail,
 * because they all exercise calls that do go through the adapter.
 *
 * So this checks what behaviour cannot: whether a second door exists.
 */

const SRC = resolve(__dirname, '..', 'src');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The runtime itself legitimately knows how to talk to JARVIS. */
const RUNTIME_DIR = join(SRC, 'lib', 'tania', 'runtime');

function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) found.push(full);
    }
  };

  walk(SRC);
  return found.filter((file) => !file.startsWith(RUNTIME_DIR));
}

/** Import specifiers, ignoring comment lines so prose about JARVIS is safe. */
function importsOf(source: string): string[] {
  const code = source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');

  return [
    ...[...code.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm)],
    ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)],
  ].map((match) => match[1] as string);
}

describe('the JARVIS boundary', () => {
  const files = sourceFiles();

  it('finds the sources it is meant to police', () => {
    // A walk that found nothing would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(100);
  });

  it('constructs the HTTP transport only inside the runtime', () => {
    const violations = files
      .filter((file) => readFileSync(file, 'utf8').includes('HttpCapabilityAdapter'))
      .map((file) => relative(REPO_ROOT, file));

    expect(violations).toEqual([]);
  });

  it('imports nothing from the runtime internals from outside it', () => {
    // `runtime/jarvis` and `runtime/client` are the published doors; the
    // capability adapters and the command builder beneath them are not.
    const internals = /runtime\/(capabilities|adapter|commands)/;

    const violations = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8'))
        .filter((specifier) => internals.test(specifier))
        .map((specifier) => `${relative(REPO_ROOT, file)} imports ${specifier}`),
    );

    expect(violations).toEqual([]);
  });

  it('reads the JARVIS address nowhere but the runtime', () => {
    /**
     * Two exemptions, asserted rather than assumed.
     *
     * `config/env.ts` *declares* the setting — something has to. Settings
     * renders whether a runtime is configured, and displaying that is not
     * calling it. Anything else naming the address is reaching for JARVIS.
     */
    const EXEMPT = [join('lib', 'config', 'env.ts'), join('lib', 'portal', 'mock', 'services.ts')];

    const violations = files
      .filter((file) => /config\.runtime\.baseUrl|JARVIS_BASE_URL/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file))
      .filter((file) => !EXEMPT.some((exempt) => file.includes(exempt)));

    expect(violations).toEqual([]);
  });

  it('describes JARVIS in prose without reaching for it', () => {
    // Guards the guard. Many modules mention JARVIS in comments, and a scanner
    // that counted those would fail files for documenting themselves.
    const mentions = files.filter((file) => /jarvis/i.test(readFileSync(file, 'utf8')));

    expect(mentions.length).toBeGreaterThan(0);
    for (const file of mentions) {
      const reaching = importsOf(readFileSync(file, 'utf8')).filter((specifier) =>
        /runtime\/(capabilities|adapter|commands)/.test(specifier),
      );
      expect(reaching, relative(REPO_ROOT, file)).toEqual([]);
    }
  });
});

describe('capability coverage', () => {
  it('simulates every capability the contract names', () => {
    // `describe()` reports which capabilities are live. A capability with no
    // simulated adapter would be missing from that report rather than shown as
    // unavailable, and an omission reads as "fine" — the wrong default.
    const simulated = new Set(createMockCapabilityAdapters().map((adapter) => adapter.capability));
    const missing = JARVIS_CAPABILITIES.filter((capability) => !simulated.has(capability));

    expect(missing).toEqual([]);
  });

  it('adds no capability the contract does not name', () => {
    const declared = new Set<string>(JARVIS_CAPABILITIES);
    const extra = createMockCapabilityAdapters()
      .map((adapter) => adapter.capability)
      .filter((capability) => !declared.has(capability));

    expect(extra).toEqual([]);
  });

  it('reports every simulated capability as not live', () => {
    // `live` is reported by the routing adapter, which is what Settings and
    // /api/ready read. A simulated capability shown as live would have them
    // both announce a runtime that is not there.
    const statuses = new MockJarvisRuntime().describe();

    expect(statuses).toHaveLength(JARVIS_CAPABILITIES.length);
    for (const status of statuses) {
      expect(status.live, status.capability).toBe(false);
    }
  });
});
