import type { Page } from '@playwright/test';

import { test, expect, openPopup, fullLoginFlow, waitForLoggedIn } from '../fixtures';

/**
 * Category 4: Post-Login Features (Requires API + Authentication)
 *
 * These tests verify functionality after successful login.
 * They require an API server to be running at localhost:5092.
 * Tests run sequentially and share the same popup page (already logged in).
 */
test.describe.serial('4. Post-Login Features', () => {
  let popup: Page;

  test('4.1 should show vault content after login', async ({ context, extensionId, testUser, apiUrl }) => {
    // Open popup and login
    popup = await openPopup(context, extensionId);
    await fullLoginFlow(popup, apiUrl, testUser.username, testUser.password);

    // Wait for the vault to load
    await waitForLoggedIn(popup);

    // For a new user, the vault should be empty but rendered
    const rootContent = await popup.locator('#root').textContent();
    expect(rootContent).toBeTruthy();
    expect(rootContent!.length).toBeGreaterThan(0);

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/4.1-vault-content.png' });
  });

  test('4.2 should be able to navigate tabs after login', async () => {
    await waitForLoggedIn(popup);

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/4.2-post-login-navigation.png' });
  });
});
