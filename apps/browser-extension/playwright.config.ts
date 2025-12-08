import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for browser extension E2E tests.
 *
 * These tests load the real extension and interact with it using Playwright.
 * The extension must be built first using `npm run build:chrome`.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Load extension in persistent context
        contextOptions: {
          // Extension path will be set in test fixtures
        },
      },
    },
  ],
});
