import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Executable enforcement of the one architectural rule the foundation rests on:
 *
 *     aplikasi → port → kontrak
 *
 * Documented in `docs/architecture/foundation.md` §1, and until now enforced
 * only by prose. A layering rule that nothing checks is a rule that decays at
 * the first deadline, and the decay is invisible: everything still compiles,
 * because TypeScript is perfectly happy to let `@tania/types` import an app.
 *
 * This lives in `@tania/core` because the port layer is the one this rule
 * exists to protect — a port that reaches sideways into an application stops
 * being a port.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Directory name → published package name. `packages/tania` ships as `@tania/core`. */
const PACKAGES: Record<string, string> = {
  types: '@tania/types',
  config: '@tania/config',
  tania: '@tania/core',
};

/**
 * What each package may import from the workspace.
 *
 * Read it as a staircase: contracts depend on nothing, the platform primitives
 * and the ports depend only on contracts, and applications sit on top. Widening
 * any row here is an architectural decision, which is exactly why it should
 * require editing this table rather than happening by autocomplete.
 */
const ALLOWED_WORKSPACE_IMPORTS: Record<string, readonly string[]> = {
  '@tania/types': [],
  '@tania/config': ['@tania/types'],
  '@tania/core': ['@tania/types'],
};

/** Applications are never a dependency — only ever a dependent. */
const APPLICATION_PACKAGES = ['@tania/web', '@tania/api'];

const IGNORED_SEGMENTS = new Set(['node_modules', 'dist', '.next', 'generated', '.turbo']);

interface SourceFile {
  /** Path relative to the repo root, for readable failure messages. */
  path: string;
  absolutePath: string;
  imports: string[];
}

function listSourceFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // A workspace that is not checked out is not a violation.
    }

    for (const entry of entries) {
      if (IGNORED_SEGMENTS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts|cts)$/.test(entry) && !entry.endsWith('.d.ts')) found.push(full);
    }
  };

  walk(root);
  return found;
}

/**
 * Removes comments, so a specifier merely *discussed* in prose is not counted
 * as a dependency. Without this the rule reports its own documentation — and,
 * worse, any file that names a package in a comment.
 *
 * Strings and template literals are walked rather than skipped so a `//` inside
 * `'https://…'` never opens a comment. Regex literals are tracked too: a
 * pattern like `/['"]/` would otherwise look like an opening quote and swallow
 * the rest of the file. Whether `/` opens a regex or divides is decided by the
 * previous significant character — the standard heuristic, and unambiguous for
 * the code in this workspace.
 */
function stripComments(source: string): string {
  const REGEX_MAY_FOLLOW = new Set([
    ...'(,=:[!&|?{};+-*%~^<>',
    '', // start of input
  ]);

  let out = '';
  let previousSignificant = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        // Keep newlines so reported line numbers stay meaningful.
        if (source[index] === '\n') out += '\n';
        index += 1;
      }
      index += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      out += char;
      index += 1;
      while (index < source.length) {
        const inner = source[index] ?? '';
        out += inner;
        index += 1;
        if (inner === '\\') {
          out += source[index] ?? '';
          index += 1;
          continue;
        }
        if (inner === quote) break;
      }
      previousSignificant = quote;
      continue;
    }

    if (char === '/' && REGEX_MAY_FOLLOW.has(previousSignificant)) {
      index += 1;
      let inClass = false;
      while (index < source.length) {
        const inner = source[index] ?? '';
        index += 1;
        if (inner === '\\') {
          index += 1;
          continue;
        }
        if (inner === '[') inClass = true;
        else if (inner === ']') inClass = false;
        else if (inner === '/' && !inClass) break;
        else if (inner === '\n') break; // Unterminated: not a regex after all.
      }
      previousSignificant = '/';
      continue;
    }

    out += char;
    if (!/\s/.test(char)) previousSignificant = char;
    index += 1;
  }

  return out;
}

/**
 * Pulls every module specifier out of a file.
 *
 * Covers static imports, re-exports, and dynamic imports — a rule that only
 * looked at `import … from` would be sidestepped by an awaited dynamic one.
 */
function importSpecifiers(source: string): string[] {
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  const code = stripComments(source);
  const specifiers: string[] = [];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/**
 * This file is the one exemption, and it is exempt by exact path rather than by
 * a pattern: it has to name the forbidden packages — in the allow-table above
 * and in the scanner's own fixtures — to be able to forbid them. Every other
 * spec file is policed like any source file, because a test that reaches across
 * a boundary breaks it just as thoroughly as production code does.
 */
const SELF = fileURLToPath(import.meta.url);

function readSourceFiles(root: string): SourceFile[] {
  return listSourceFiles(root)
    .filter((absolutePath) => absolutePath !== SELF)
    .map((absolutePath) => ({
      absolutePath,
      path: relative(REPO_ROOT, absolutePath),
      imports: importSpecifiers(readFileSync(absolutePath, 'utf8')),
    }));
}

/** `@tania/core/governance` counts as an import of `@tania/core`. */
function workspaceImport(specifier: string): string | undefined {
  if (!specifier.startsWith('@tania/')) return undefined;
  const [scope, name] = specifier.split('/');
  return name === undefined ? undefined : `${scope}/${name}`;
}

describe('import scanner', () => {
  // The rule is only as trustworthy as the scanner under it, and a scanner that
  // under-reports fails silently: every boundary assertion would simply pass.
  it('finds static imports, re-exports and dynamic imports', () => {
    expect(
      importSpecifiers(
        [
          "import { a } from '@tania/types';",
          "import '@tania/config';",
          "export * from './local.js';",
          "export { b } from '@tania/core';",
          "const c = await import('@tania/web');",
          "const d = require('@tania/api');",
        ].join('\n'),
      ),
    ).toEqual(
      expect.arrayContaining([
        '@tania/types',
        '@tania/config',
        './local.js',
        '@tania/core',
        '@tania/web',
        '@tania/api',
      ]),
    );
  });

  it('ignores specifiers that appear only in comments', () => {
    expect(
      importSpecifiers(
        [
          "// import { x } from '@tania/web';",
          '/* export * from "@tania/api"; */',
          "/** Prose mentioning import('@tania/web'). */",
          "import { real } from '@tania/types';",
        ].join('\n'),
      ),
    ).toEqual(['@tania/types']);
  });

  it('does not mistake a URL inside a string for a comment', () => {
    expect(importSpecifiers("const url = 'https://tania.example/a';\nimport 'x';")).toEqual(['x']);
  });

  it('does not let a regex containing quotes swallow the file', () => {
    expect(importSpecifiers(`const q = /['"]([^'"]+)['"]/g;\nimport 'after-regex';`)).toEqual([
      'after-regex',
    ]);
  });

  it('keeps division from being read as a regex', () => {
    expect(importSpecifiers("const half = total / 2;\nimport 'after-division';")).toEqual([
      'after-division',
    ]);
  });
});

describe('architectural boundaries', () => {
  const packageSources = Object.entries(PACKAGES).map(([directory, packageName]) => ({
    packageName,
    root: join(REPO_ROOT, 'packages', directory),
    files: readSourceFiles(join(REPO_ROOT, 'packages', directory, 'src')),
  }));

  it('finds the workspace it is meant to police', () => {
    // Guards the whole suite: a walk that silently found nothing would turn
    // every assertion below into a vacuous pass.
    for (const { packageName, files } of packageSources) {
      expect(files.length, `no sources scanned for ${packageName}`).toBeGreaterThan(0);
    }
  });

  describe.each(packageSources)('$packageName', ({ packageName, root, files }) => {
    const allowed = ALLOWED_WORKSPACE_IMPORTS[packageName] ?? [];

    it(`imports only ${allowed.length === 0 ? 'outside the workspace' : allowed.join(', ')}`, () => {
      const violations = files.flatMap((file) =>
        file.imports
          .map(workspaceImport)
          .filter(
            (imported): imported is string =>
              imported !== undefined && imported !== packageName && !allowed.includes(imported),
          )
          .map((imported) => `${file.path} imports ${imported}`),
      );

      expect(violations).toEqual([]);
    });

    it('never reaches outside its own package by relative path', () => {
      const violations = files.flatMap((file) =>
        file.imports
          .filter((specifier) => specifier.startsWith('.'))
          .filter((specifier) => {
            const target = resolve(dirname(file.absolutePath), specifier);
            return target !== root && !target.startsWith(root + sep);
          })
          .map((specifier) => `${file.path} imports ${specifier}`),
      );

      expect(violations).toEqual([]);
    });
  });

  it('no package depends on an application', () => {
    const violations = packageSources.flatMap(({ files }) =>
      files.flatMap((file) =>
        file.imports
          .filter((specifier) => APPLICATION_PACKAGES.includes(workspaceImport(specifier) ?? ''))
          .map((specifier) => `${file.path} imports ${specifier}`),
      ),
    );

    expect(violations).toEqual([]);
  });

  it('declares every workspace dependency it imports', () => {
    // Catches the import that works locally because npm hoisted the package
    // into the root `node_modules`, and breaks the moment it is built alone.
    const violations = packageSources.flatMap(({ packageName, root, files }) => {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const declared = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
      ]);

      return [
        ...new Set(
          files.flatMap((file) =>
            file.imports
              .map(workspaceImport)
              .filter(
                (imported): imported is string =>
                  imported !== undefined && imported !== packageName && !declared.has(imported),
              ),
          ),
        ),
      ].map((imported) => `${packageName} imports undeclared ${imported}`);
    });

    expect(violations).toEqual([]);
  });
});
