import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Two kinds of test, one runner.
 *
 * Logic tests run in `node` because that is what they exercise and it is
 * faster. Component tests declare `// @vitest-environment jsdom` at the top of
 * the file, which is per-file rather than per-glob — a glob is another
 * hand-maintained list, and this review already found one that had gone stale.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    /**
     * Component tests render a React tree and drive it through simulated
     * streaming. Comfortably under a second each when the machine is idle, and
     * past the 5s default when a build is running beside them — observed here
     * as three tests timing out at 6s, 10s and 12s during a parallel build,
     * then passing on every isolated rerun.
     *
     * Raised rather than papered over: the limit exists to catch a test that
     * hangs, not to assert how fast a loaded CI runner is. A genuine hang still
     * fails, fifteen seconds later.
     */
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Generated, or a declaration with nothing to execute.
        'src/**/*.d.ts',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/lib/portal/mock/fixtures.ts',
        'src/lib/knowledge/corpus/**',
      ],
    },
  },
});
