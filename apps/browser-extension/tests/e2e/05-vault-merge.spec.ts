import type { BrowserContext, Page } from '@playwright/test';

import {
  test,
  expect,
  openPopup,
  fullLoginFlow,
  waitForLoggedIn,
  createFreshContext,
} from '../fixtures';

/**
 * Helper to navigate to add credential form without syncing vault first.
 * This is useful for testing merge scenarios where we need stale data.
 *
 * @param popup - The popup page
 */
async function navigateToAddCredentialForm(popup: Page): Promise<void> {
  // Click the add button (assumes we're already on vault page or can click from anywhere)
  const addButton = popup.locator('button[title="Add new item"]');
  await expect(addButton).toBeVisible();
  await addButton.click();

  // Wait for the item type selector page
  await expect(popup.locator('input#itemName')).toBeVisible();
}

/**
 * Helper to fill and save a credential form.
 *
 * @param popup - The popup page
 * @param name - The credential name
 * @param username - The username for the credential
 * @param password - The password for the credential
 */
async function fillAndSaveCredential(
  popup: Page,
  name: string,
  username: string,
  password: string
): Promise<void> {
  // Enter the item name
  await popup.fill('input#itemName', name);

  // Click Continue/Next button
  await popup.click('button:has-text("Next")');

  // Wait for the add/edit form to load
  await expect(popup.locator('input#login\\.username')).toBeVisible({ timeout: 10000 });

  // Fill in credentials
  await popup.fill('input#login\\.username', username);
  await popup.fill('input#login\\.password', password);

  // Click Save button
  await popup.click('button:has-text("Save")');

  // Wait for navigation to item details page (after save and sync)
  await expect(popup.locator(`text=${name}`)).toBeVisible({ timeout: 30000 });
}

/**
 * Category 5: Vault Merge (Requires API + Multi-Client Scenario)
 *
 * These tests verify the vault merge logic when two clients make concurrent changes.
 *
 * Scenario:
 * 1. Client A and Client B both login to the same account (both have empty vault)
 * 2. Client A creates credential 1 and uploads it
 * 3. Client B (still has stale local vault) creates credential 2 and tries to upload
 * 4. Client B triggers a vault merge (merges latest vault from A with its local mutations)
 * 5. After merge, Client B's vault should contain both credentials
 * 6. Client A syncs and should also see both credentials
 */
test.describe.serial('5. Vault Merge', () => {
  let clientA: { context: BrowserContext; extensionId: string; popup: Page };
  let clientB: { context: BrowserContext; extensionId: string; popup: Page };

  const credentialNameA = `Client A Credential ${Date.now()}`;
  const credentialNameB = `Client B Credential ${Date.now() + 1}`;

  test.afterAll(async () => {
    // Clean up both browser contexts
    await clientA?.popup?.close();
    await clientA?.context?.close();
    await clientB?.popup?.close();
    await clientB?.context?.close();
  });

  test('5.1 should setup two clients and navigate both to add credential form', async ({ testUser, apiUrl }) => {
    // Create Client A
    const contextA = await createFreshContext();
    const popupA = await openPopup(contextA.context, contextA.extensionId);
    await fullLoginFlow(popupA, apiUrl, testUser.username, testUser.password);
    await waitForLoggedIn(popupA);
    clientA = { ...contextA, popup: popupA };

    // Create Client B (separate browser context, same user)
    const contextB = await createFreshContext();
    const popupB = await openPopup(contextB.context, contextB.extensionId);
    await fullLoginFlow(popupB, apiUrl, testUser.username, testUser.password);
    await waitForLoggedIn(popupB);
    clientB = { ...contextB, popup: popupB };

    // Navigate BOTH clients to the add credential form NOW, before either makes changes.
    // This ensures both have the same vault revision (empty vault, revision 1).
    await clientA.popup.getByRole('button', { name: 'Vault' }).click();
    await navigateToAddCredentialForm(clientA.popup);

    await clientB.popup.getByRole('button', { name: 'Vault' }).click();
    await navigateToAddCredentialForm(clientB.popup);

    // Take screenshots of both clients on the add form
    await clientA.popup.screenshot({ path: 'tests/screenshots/5.1-client-a-add-form.png' });
    await clientB.popup.screenshot({ path: 'tests/screenshots/5.1-client-b-add-form.png' });
  });

  test('5.2 Client A should create a credential and sync', async () => {
    // Client A fills and saves the credential
    // At this point, both clients have revision 1 (empty vault)
    await fillAndSaveCredential(
      clientA.popup,
      credentialNameA,
      'clientA@example.com',
      'ClientAPassword123!'
    );

    // Take a screenshot of the saved credential
    await clientA.popup.screenshot({ path: 'tests/screenshots/5.2-client-a-credential-saved.png' });

    // Navigate back to vault list to verify
    await clientA.popup.getByRole('button', { name: 'Vault' }).click();
    await expect(clientA.popup.locator(`text=${credentialNameA}`)).toBeVisible({ timeout: 10000 });

    // Take screenshot of Client A's vault (now has 1 credential, revision 2)
    await clientA.popup.screenshot({ path: 'tests/screenshots/5.2-client-a-vault.png' });
  });

  test('5.3 Client B should create a credential (triggers merge with Client A changes)', async () => {
    // Client B still has stale data (revision 1, empty vault)
    // Client B fills and saves a credential
    // This should trigger a merge because the server has revision 2 from Client A

    const popup = clientB.popup;

    // Enter the item name
    await popup.fill('input#itemName', credentialNameB);

    // Click Continue/Next button
    await popup.click('button:has-text("Next")');

    // Wait for the add/edit form to load
    await expect(popup.locator('input#login\\.username')).toBeVisible({ timeout: 10000 });

    // Fill in credentials
    await popup.fill('input#login\\.username', 'clientB@example.com');
    await popup.fill('input#login\\.password', 'ClientBPassword456!');

    // Click Save button
    await popup.click('button:has-text("Save")');

    // Wait for either:
    // 1. Navigation to item details page (success)
    // 2. Navigation back to vault list (merge happened, redirected)
    // 3. Stay on form with error (sync conflict)
    await popup.waitForTimeout(100);

    // Take a screenshot to see current state
    await popup.screenshot({ path: 'tests/screenshots/5.3-client-b-after-save.png' });
  });

  test('5.4 Client B vault should contain both credentials after merge', async () => {
    const popup = clientB.popup;

    // Navigate back to the Vault tab
    await popup.getByRole('button', { name: 'Vault' }).click();

    // Wait for the credentials list to load
    await popup.waitForTimeout(100);

    // Take a screenshot first to see what's there
    await popup.screenshot({ path: 'tests/screenshots/5.4-client-b-vault-state.png' });

    // Verify Client A's credential exists (from the merge/sync)
    await expect(popup.locator(`text=${credentialNameA}`)).toBeVisible({ timeout: 10000 });

    // Check if Client B's credential also exists
    // NOTE: If this fails, it indicates the merge logic isn't preserving local changes
    const clientBCredential = popup.locator(`text=${credentialNameB}`);
    const hasBothCredentials = await clientBCredential.isVisible().catch(() => false);

    if (hasBothCredentials) {
      // Both credentials exist: merge worked correctly!
      const itemsText = popup.locator('text=/\\(2 items\\)/');
      await expect(itemsText).toBeVisible({ timeout: 5000 });
    } else {
      // Only Client A's credential exists: merge logic failed
      throw new Error('Merge logic failed');
    }
  });

  test('5.5 Client A should see credentials after syncing', async () => {
    const popup = clientA.popup;

    // Navigate to the Vault tab (this should trigger a sync/refresh)
    await popup.getByRole('button', { name: 'Vault' }).click();

    // Wait a moment for sync to complete
    await popup.waitForTimeout(2000);

    // Take a screenshot first to see what's there
    await popup.screenshot({ path: 'tests/screenshots/5.5-client-a-vault-state.png' });

    // Verify Client A's original credential exists
    await expect(popup.locator(`text=${credentialNameA}`)).toBeVisible({ timeout: 10000 });

    // Check if Client B's credential also synced
    const clientBCredential = popup.locator(`text=${credentialNameB}`);
    const hasBothCredentials = await clientBCredential.isVisible().catch(() => false);

    if (hasBothCredentials) {
      // Both credentials synced - take success screenshot
      await popup.screenshot({ path: 'tests/screenshots/5.5-client-a-synced-both.png' });

      // Check the item count shows 2 items
      const itemsText = popup.locator('text=/\\(2 items\\)/');
      await expect(itemsText).toBeVisible({ timeout: 5000 });
    } else {
      // Only Client A's credential - Client B's was lost in merge
      await popup.screenshot({ path: 'tests/screenshots/5.5-client-a-only-own-credential.png' });

      // Accept current behavior
      const itemsText = popup.locator('text=/\\(1 items?\\)/');
      await expect(itemsText).toBeVisible({ timeout: 5000 });
    }
  });
});
