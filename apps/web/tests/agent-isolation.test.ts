import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAgentStack } from '@/lib/agents';

/**
 * The constitutional rule for agents, enforced structurally.
 *
 * "Do not implement autonomous unrestricted agents. Agents must operate
 * through controlled tools." Every behavioural test in `agent-execution` holds
 * the *current* agents to that — they refuse undeclared tools, stop at
 * approval gates, and verify their own runs.
 *
 * None of them would notice a new agent that simply imported the composition
 * root and called the runtime itself. It would never reach `ToolInvoker`, so
 * no allow-list, no policy check and no approval gate would apply, and every
 * existing test would still pass: they exercise the agents that *do* go
 * through the invoker.
 *
 * So this checks the one thing behaviour cannot: what an agent is even able to
 * reach. An agent that imports nothing but its contracts cannot bypass the
 * governance plane, whatever its `execute` does.
 */

const AGENTS_DIR = resolve(__dirname, '..', 'src', 'lib', 'agents');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * What an agent implementation may import.
 *
 * Contracts and its own base class. Not the container, not the runtime, not
 * the tool registry, not `fetch`-shaped anything. Widening this list is an
 * architectural decision, which is why it has to be edited by hand.
 */
const ALLOWED_IMPORTS = [
  '@tania/types',
  '@tania/core/orchestration',
  '@tania/core/knowledge',
  '../base/base-agent',
];

/** Modules an agent must never reach, named so a failure explains itself. */
const FORBIDDEN = [
  { pattern: /container/, why: 'the composition root would hand it the live runtime' },
  { pattern: /runtime\/|jarvis/i, why: 'it would reach JARVIS without passing the policy layer' },
  { pattern: /tools\/registry/, why: 'it would resolve tools outside its own allow-list' },
  { pattern: /approvals?\//, why: 'it would be able to decide its own approval' },
  { pattern: /^node:/, why: 'an agent has no business touching the filesystem or network' },
];

function agentFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // `base/` holds the invoker itself, which legitimately knows more.
        if (entry !== 'base') walk(full);
      } else if (entry.endsWith('-agent.ts')) {
        found.push(full);
      }
    }
  };

  walk(AGENTS_DIR);
  return found;
}

/**
 * Import specifiers, ignoring comment lines.
 *
 * Several agents describe the runtime in prose — "menjalankan workflow pada
 * JARVIS runtime" — and counting that as an import would fail the file for
 * explaining itself.
 */
function importsOf(source: string): string[] {
  const code = source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');

  return [
    ...[...code.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map(
      (m) => m[1] as string,
    ),
    ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] as string),
    ...[...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] as string),
  ];
}

describe('agent isolation', () => {
  const files = agentFiles();

  it('finds the agent implementations it is meant to police', () => {
    // A walk that silently found nothing would make every assertion vacuous.
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('gives every registered agent a file here', () => {
    const { registry } = createAgentStack();

    expect(files.length).toBe(registry.list().length);
  });

  it('lets an agent import only its contracts and its base class', () => {
    const violations = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8'))
        .filter((specifier) => !ALLOWED_IMPORTS.includes(specifier))
        .map((specifier) => `${relative(REPO_ROOT, file)} imports ${specifier}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps every agent away from the runtime and the composition root', () => {
    const violations = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8')).flatMap((specifier) =>
        FORBIDDEN.filter(({ pattern }) => pattern.test(specifier)).map(
          ({ why }) => `${relative(REPO_ROOT, file)} imports ${specifier} — ${why}`,
        ),
      ),
    );

    expect(violations).toEqual([]);
  });

  it('describes the runtime in prose without reaching for it', () => {
    // Guards the guard: the automation agent's comments mention JARVIS, and a
    // scanner that counted those would be failing files for documenting
    // themselves — so this asserts the distinction is real.
    const automation = files.find((file) => file.includes('automation'));
    expect(automation).toBeDefined();

    const source = readFileSync(automation as string, 'utf8');
    expect(source.toLowerCase()).toContain('jarvis');
    expect(importsOf(source).some((specifier) => /jarvis/i.test(specifier))).toBe(false);
  });
});

describe('the specialist roster', () => {
  const REQUIRED = [
    'agent.knowledge',
    'agent.research',
    'agent.product',
    'agent.solution',
    'agent.market-intelligence',
    'agent.business-case',
    'agent.documentation',
    'agent.performance',
  ];

  it('registers every specialist the architecture calls for', () => {
    const { registry } = createAgentStack();
    const ids = registry.list().map((agent) => agent.id);

    for (const required of REQUIRED) {
      expect(ids, required).toContain(required);
    }
  });

  it('gives each one a name, a domain, and an owner', () => {
    // An agent nobody owns is an agent nobody will retire.
    const { registry } = createAgentStack();

    for (const agent of registry.list()) {
      expect(agent.name.length, agent.id).toBeGreaterThan(0);
      expect(agent.domain.length, agent.id).toBeGreaterThan(0);
      expect(agent.owner.length, agent.id).toBeGreaterThan(0);
      expect(agent.capabilities.length, agent.id).toBeGreaterThan(0);
    }
  });
});
