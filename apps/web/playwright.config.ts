import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the golden path.
 *
 * Deliberately few. Component tests already cover the chat path's behaviour in
 * detail and run in milliseconds; what only a browser can answer is whether the
 * whole thing boots, renders, and survives a real navigation — so that is all
 * these do.
 *
 * `channel: 'chrome'` uses the browser already installed rather than
 * downloading one. CI that has no Chrome should set `PLAYWRIGHT_CHANNEL=''` and
 * run `npx playwright install chromium`.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './e2e',
  // A flaky browser test that passes on retry teaches nothing; fail instead.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://127.0.0.1:3399',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(channel === '' ? {} : { channel }),
  },

  webServer: {
    command: 'npx next dev -p 3399',
    url: 'http://127.0.0.1:3399/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // In-memory stores: the golden path must not need a backend to pass.
      TANIA_API_BASE_URL: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
