import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Interop tests: TANIA's adapter against a real runtime process.
 *
 * Separate from the unit run because they need `apps/runtime` built and
 * listening on a socket. Kept out of `npm run test` deliberately — a test that
 * silently skips when a prerequisite is missing is worse than no test, because
 * a green board then means nothing.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.interop.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
