import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Nobar vanilla JS app.
 *
 * Audit point 4 — these tests verify the actual user-facing flows that
 * previous commits claimed were "Playwright verified" but had no test files.
 *
 * The Go backend is not started by Playwright — tests mock /api/* via
 * page.route() so they run without TMDB network access or a live Go server.
 *
 * Run:   cd tests/playwright && npx playwright install chromium && npm test
 */

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8080',
    actionTimeout: 5_000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // We don't use the built-in webServer because the Go backend may not be
  // available (Go not installed in some CI envs). Tests serve docs/ via a
  // tiny static server in a beforeEach hook, plus mock /api/* routes.
});
