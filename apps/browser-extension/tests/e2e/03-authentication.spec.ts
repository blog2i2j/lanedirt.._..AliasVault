import type { Page } from '@playwright/test';

import { test, expect, openPopup, configureApiUrl, login, waitForLoggedIn } from '../fixtures';

/**
 * Category 3: Authentication Flow (Requires API)
 *
 * These tests verify login/authentication works correctly.
 * They require an API server to be running at localhost:5092.
 * Tests run sequentially and share the same popup page.
 */
test.describe.serial('3. Authentication Flow', () => {
  let popup: Page;

  test.afterAll(async () => {
    // Close popup to start fresh for next test group
    await popup?.close();
  });

  test('3.1 should display error for invalid credentials', async ({ context, extensionId, apiUrl }) => {
    // Open popup (first test opens it)
    popup = await openPopup(context, extensionId);

    // Configure API URL
    await configureApiUrl(popup, apiUrl);

    // Try to login with invalid credentials
    await popup.fill('input[type="text"]', 'nonexistent@example.tld');
    await popup.fill('input[type="password"]', 'wrongpassword');
    await popup.click('button:has-text("Log in")');

    // Wait for error message to appear
    await expect(popup.locator('text=Invalid username or password')).toBeVisible({ timeout: 10000 });

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/3.1-login-failed.png' });

    // Clear the form for the next test
    await popup.fill('input[type="text"]', '');
    await popup.fill('input[type="password"]', '');
  });

  test('3.2 should successfully login with valid credentials', async ({ testUser }) => {
    // Login with valid credentials
    await login(popup, testUser.username, testUser.password);

    // Verify we're logged in
    await waitForLoggedIn(popup);

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/3.2-login-success.png' });
  });
});
