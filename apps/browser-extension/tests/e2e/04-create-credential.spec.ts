import type { Page } from '@playwright/test';

import {
  test,
  expect,
  openPopup,
  fullLoginFlow,
  waitForLoggedIn,
  navigateToVault,
  navigateToAddCredentialForm,
  verifyCredentialExists,
  FieldSelectors,
  ButtonSelectors,
} from '../fixtures';

/**
 * Category 4: Create Credential (Requires API + Authentication)
 *
 * These tests verify credential creation functionality after login.
 * They require an API server to be running at localhost:5092.
 * Tests run sequentially and share the same popup page (already logged in).
 */
test.describe.serial('4. Create Credential', () => {
  let popup: Page;
  const testCredentialName = `Test Login ${Date.now()}`;

  test.afterAll(async () => {
    // Close popup to start fresh for next test group
    await popup?.close();
  });

  test('4.1 should login and show vault content', async ({ context, extensionId, testUser, apiUrl }) => {
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

  test('4.2 should create a new credential', async () => {
    // Ensure we're logged in
    await waitForLoggedIn(popup);

    // Navigate to the Vault tab
    await navigateToVault(popup);

    // Navigate to the add credential form
    await navigateToAddCredentialForm(popup);

    // Enter the item name
    await popup.fill(FieldSelectors.ITEM_NAME, testCredentialName);

    // The default type is "Login", so we can proceed
    // Click Continue/Next button
    await popup.click(ButtonSelectors.NEXT);

    // Wait for the add/edit form to load
    await expect(popup.locator(FieldSelectors.LOGIN_USERNAME)).toBeVisible({ timeout: 10000 });

    // Fill in credentials
    await popup.fill(FieldSelectors.LOGIN_USERNAME, 'testuser@example.com');
    await popup.fill(FieldSelectors.LOGIN_PASSWORD, 'TestPassword123!');

    // Take a screenshot of the filled form
    await popup.screenshot({ path: 'tests/screenshots/4.2-credential-form.png' });

    // Click Save button
    await popup.click(ButtonSelectors.SAVE);

    // Wait for navigation to item details page (after save)
    await verifyCredentialExists(popup, testCredentialName);

    // Take a screenshot of the saved credential
    await popup.screenshot({ path: 'tests/screenshots/4.2-credential-saved.png' });
  });

  test('4.3 should show the created credential in the vault list', async () => {
    // Navigate back to the Vault tab
    await navigateToVault(popup);

    // Wait for credentials list to load
    await popup.waitForTimeout(500);

    // Verify our created credential appears in the list
    await verifyCredentialExists(popup, testCredentialName);

    // Take a screenshot
    await popup.screenshot({ path: 'tests/screenshots/4.3-credential-in-list.png' });
  });
});
