import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';

/**
 * NestJS relies on `emitDecoratorMetadata` for constructor injection, which the
 * default esbuild transform does not emit. SWC does — so the dependency graph
 * resolves the same way under test as it does at runtime, regardless of which
 * Vite version a workspace install happens to hoist.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
