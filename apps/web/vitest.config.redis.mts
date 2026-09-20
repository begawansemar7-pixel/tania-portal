import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Rate-limit tests against a real Redis.
 *
 * Separate from the unit run for the same reason the interop config is: they
 * need a server on a socket. The unit tests prove the limiter's logic against a
 * fake; only these prove the Lua script itself — that the commands exist, that
 * the reply has the shape the parser expects, that the expiry is really set.
 *
 * The suite fails rather than skips without `REDIS_URL`, so running it and
 * seeing green means the claim was actually checked.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.redis.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
