import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSIGHT_KINDS } from '@tania/types';
import {
  KpiAnomalyDetector,
  NewDocumentDetector,
  OverdueTaskDetector,
  PerformanceChangeDetector,
  ProjectRiskDetector,
} from '@/lib/insights/detectors';

/**
 * The one component that runs without anybody asking.
 *
 * Every other path through TANIA starts from a request: someone types, or
 * presses the microphone, or decides an approval. Proactive insights do not —
 * they scan on their own schedule. That makes them the only place where
 * "uncontrolled autonomous execution" could actually begin, and the reason the
 * brief forbids it by name.
 *
 * Today detectors observe and propose: they return a suggested prompt for a
 * human to send, and the work then re-enters through the ordinary task path
 * with the policy engine, the risk ceiling and the approval gate all in front
 * of it. `employee.test.ts` proves that of the detectors that exist.
 *
 * What it cannot prove is that the next one behaves. A detector that imported
 * the composition root could call the orchestrator directly, and no behavioural
 * test would notice, because they assert on the output of the detectors they
 * know about. This checks what a detector is able to reach at all.
 */

const INSIGHTS_DIR = resolve(__dirname, '..', 'src', 'lib', 'insights');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** What an insight module may import: facts and contracts, nothing that acts. */
const ALLOWED = [
  '@tania/types',
  '@tania/core/insight',
  '@tania/core/knowledge',
  '@/lib/identity/types',
  '@/lib/portal/types',
  '@/lib/logger',
  'node:crypto',
  './detectors',
];

/** Modules that would let a detector do something rather than notice something. */
const FORBIDDEN = [
  { pattern: /container/, why: 'it could reach the orchestrator and start work unprompted' },
  { pattern: /orchestration/, why: 'it could open a task nobody asked for' },
  { pattern: /runtime|jarvis/i, why: 'it could reach the execution layer directly' },
  { pattern: /tools\//, why: 'it could invoke a tool outside the policy engine' },
  { pattern: /approvals?\//, why: 'it could decide the approval for its own proposal' },
];

function insightFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) found.push(full);
    }
  };

  walk(INSIGHTS_DIR);
  return found;
}

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

describe('insight isolation', () => {
  const files = insightFiles();

  it('finds the modules it is meant to police', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('lets an insight import facts and contracts, nothing that acts', () => {
    const violations = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8'))
        .filter((specifier) => !ALLOWED.includes(specifier))
        .map((specifier) => `${relative(REPO_ROOT, file)} imports ${specifier}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps every detector away from anything that can execute', () => {
    const violations = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8')).flatMap((specifier) =>
        FORBIDDEN.filter(({ pattern }) => pattern.test(specifier)).map(
          ({ why }) => `${relative(REPO_ROOT, file)} imports ${specifier} — ${why}`,
        ),
      ),
    );

    expect(violations).toEqual([]);
  });
});

describe('the declared insight kinds', () => {
  /**
   * Read from the detectors themselves rather than from a list.
   *
   * A hand-kept registry is the thing that goes stale: someone adds a kind to
   * the contract, writes the detector, and forgets the list — and the test
   * still passes because it is checking the list against itself.
   */
  const detectors = [
    new KpiAnomalyDetector(),
    new OverdueTaskDetector(),
    new ProjectRiskDetector(),
    new NewDocumentDetector(),
    new PerformanceChangeDetector(),
  ];

  const produced = new Set<string>(detectors.map((detector) => detector.kind));

  it('has a detector for every kind the contract names', () => {
    // A kind declared but that nothing raises is dead: it sits in the type
    // looking handled, and a reader assumes the system watches for it.
    const unwatched = INSIGHT_KINDS.filter((kind) => !produced.has(kind));

    expect(unwatched).toEqual([]);
  });

  it('raises no kind the contract does not name', () => {
    const declared = new Set<string>(INSIGHT_KINDS);
    const extra = [...produced].filter((kind) => !declared.has(kind));

    expect(extra).toEqual([]);
  });

  it('gives every detector an id and a kind', () => {
    for (const detector of detectors) {
      expect(detector.id.length, detector.kind).toBeGreaterThan(0);
      expect(detector.kind.length, detector.id).toBeGreaterThan(0);
    }
  });
});
