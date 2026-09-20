#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * `npm audit --audit-level=high` is all-or-nothing: with an unfixable
 * transitive advisory in the tree it stays red forever, and a job that is
 * always red is a job nobody reads. The first genuinely new advisory would
 * then land in a build that was already failing, and nobody would notice.
 *
 * So this gate narrows the claim. Advisories recorded in
 * security/audit-exceptions.json — each with a reason, a note on why no fix
 * exists, and an expiry — are allowed to pass. Everything else fails, and a
 * lapsed exception fails too. The result is a job whose red means something.
 *
 * Scope is --omit=dev: a vulnerability in a test runner is not a
 * vulnerability in the deployed artifact, and conflating the two is what
 * pushed the old gate into permanent red.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKING = new Set(['high', 'critical']);

function audit() {
  try {
    // npm audit exits non-zero when it finds anything; that is data, not failure.
    return execFileSync('npm', ['audit', '--json', '--omit=dev'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.trim()) return error.stdout;
    throw error;
  }
}

const report = JSON.parse(audit());
const exceptions = JSON.parse(readFileSync(resolve(root, 'security/audit-exceptions.json'), 'utf8'));
const allowed = new Map(exceptions.exceptions.map((entry) => [entry.id, entry]));

/** Advisory ids that actually block, mapped to the packages carrying them. */
const found = new Map();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!BLOCKING.has(vuln.severity)) continue;
  for (const via of vuln.via ?? []) {
    // A string `via` is propagation from another package, counted at its source.
    if (typeof via !== 'object' || !via.url) continue;
    const id = via.url.split('/').pop();
    if (!found.has(id)) found.set(id, { id, severity: via.severity ?? vuln.severity, packages: new Set() });
    found.get(id).packages.add(name);
  }
}

const today = new Date().toISOString().slice(0, 10);
const unlisted = [];
const lapsed = [];

for (const advisory of found.values()) {
  const entry = allowed.get(advisory.id);
  if (!entry) {
    unlisted.push(advisory);
  } else if (entry.expires < today) {
    lapsed.push({ ...advisory, expires: entry.expires });
  }
}

/** Exceptions kept for advisories that are no longer in the tree: stale, worth removing. */
const stale = [...allowed.values()].filter((entry) => !found.has(entry.id));

for (const advisory of unlisted) {
  console.error(
    `UNLISTED  ${advisory.id}  ${advisory.severity}  (${[...advisory.packages].join(', ')})\n` +
      `          Not in security/audit-exceptions.json. Upgrade it, or record the decision with a reason and an expiry.`,
  );
}
for (const advisory of lapsed) {
  console.error(
    `EXPIRED   ${advisory.id}  accepted until ${advisory.expires}, which has passed.\n` +
      `          Re-check whether a fix now exists before renewing.`,
  );
}
for (const entry of stale) {
  console.warn(`stale     ${entry.id} (${entry.package}) is no longer in the tree — drop it from the exceptions file.`);
}

const accepted = found.size - unlisted.length - lapsed.length;
if (unlisted.length || lapsed.length) {
  console.error(`\nDependency audit failed: ${unlisted.length} unlisted, ${lapsed.length} expired.`);
  process.exit(1);
}

console.log(
  `Dependency audit passed: no unlisted high or critical advisories in production dependencies` +
    (accepted ? ` (${accepted} accepted, see security/audit-exceptions.json).` : '.'),
);
