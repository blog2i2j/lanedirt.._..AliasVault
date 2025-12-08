import type { Page } from '@playwright/test';

import { test, expect, openPopup, configureApiUrl } from '../fixtures';

/**
 * Category 2: UI Navigation (No API required)
 *
 * These tests verify UI navigation works without needing authentication.
 * They don't require an API server to be running.
 * Tests run sequentially and share the same popup page.
 */
test.describe.serial('2. UI Navigation', () => {
  let popup: Page;

  test.afterAll(async () => {
    // Close popup to start fresh for next test group
    await popup?.close();
  });

  test('2.1 should have working settings button', async ({ context, extensionId }) => {
    // Open popup (first test opens it)
    popup = await openPopup(context, extensionId);

    // Click settings button
    const settingsButton = popup.locator('button#settings');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Should navigate to settings page
    // Check for settings-related elements (like the server selection dropdown)
    await expect(popup.locator('select')).toBeVisible();

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/2.1-settings-navigation.png' });

    // Should have a back button
    const backButton = popup.locator('button#back');
    await expect(backButton).toBeVisible();

    // Click back and verify we return to login
    await backButton.click();
    await expect(popup.locator('input[type="text"]')).toBeVisible();
  });

  test('2.2 should allow configuring custom API URL', async ({ apiUrl }) => {
    // Reuse popup from previous test
    // Configure the API URL
    await configureApiUrl(popup, apiUrl);

    // After going back, we should still be on the login page
    await expect(popup.locator('input[type="text"]')).toBeVisible();
    await expect(popup.locator('input[type="password"]')).toBeVisible();

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/2.2-api-configured.png' });
  });
});
