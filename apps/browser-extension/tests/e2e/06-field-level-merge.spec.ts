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
 * Helper to navigate to add credential form.
 *
 * @param popup - The popup page
 */
async function navigateToAddCredentialForm(popup: Page): Promise<void> {
  const addButton = popup.locator('button[title="Add new item"]');
  await expect(addButton).toBeVisible();
  await addButton.click();
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
  await popup.fill('input#itemName', name);
  await popup.click('button:has-text("Next")');
  await expect(popup.locator('input#login\\.username')).toBeVisible({ timeout: 10000 });
  await popup.fill('input#login\\.username', username);
  await popup.fill('input#login\\.password', password);
  await popup.click('button:has-text("Save")');
  await expect(popup.locator(`text=${name}`)).toBeVisible({ timeout: 30000 });
}

/**
 * Category 6: Field-Level Merge (Requires API + Multi-Client Scenario)
 *
 * These tests verify that when the same credential is modified on two clients
 * simultaneously, the merge happens at the field level:
 * - Fields modified only on Client A are preserved
 * - Fields modified only on Client B are preserved
 * - Fields modified on both clients: the last writer wins
 *
 * Scenario:
 * 1. Client A and Client B both login to the same account
 * 2. Client A creates a credential and both clients sync
 * 3. Client A edits the credential: changes username and notes
 * 4. Client B (with stale data) edits the same credential: changes password and notes
 * 5. After merge, both username (from A) and password (from B) should be preserved
 * 6. Notes should have Client B's value (last writer wins)
 */
test.describe.serial('6. Field-Level Merge', () => {
  let clientA: { context: BrowserContext; extensionId: string; popup: Page };
  let clientB: { context: BrowserContext; extensionId: string; popup: Page };

  const credentialName = `Field Merge Test ${Date.now()}`;
  const originalUsername = 'original@example.com';
  const originalPassword = 'OriginalPassword123!';

  // Values for field-level merge test
  const clientAUsername = 'clientA_modified_user@example.com';
  const clientANotes = 'Notes modified by Client A';
  const clientBPassword = 'ClientBModifiedPassword789!';
  const clientBNotes = 'Notes modified by Client B - this should win';

  test.afterAll(async () => {
    await clientA?.popup?.close();
    await clientA?.context?.close();
    await clientB?.popup?.close();
    await clientB?.context?.close();
  });

  test('6.1 Setup: Both clients login and Client A creates a credential', async ({ testUser, apiUrl }) => {
    // Create Client A
    const contextA = await createFreshContext();
    const popupA = await openPopup(contextA.context, contextA.extensionId);
    await fullLoginFlow(popupA, apiUrl, testUser.username, testUser.password);
    await waitForLoggedIn(popupA);
    clientA = { ...contextA, popup: popupA };

    // Create Client B
    const contextB = await createFreshContext();
    const popupB = await openPopup(contextB.context, contextB.extensionId);
    await fullLoginFlow(popupB, apiUrl, testUser.username, testUser.password);
    await waitForLoggedIn(popupB);
    clientB = { ...contextB, popup: popupB };

    // Client A creates the credential
    await clientA.popup.getByRole('button', { name: 'Vault' }).click();
    await navigateToAddCredentialForm(clientA.popup);
    await fillAndSaveCredential(clientA.popup, credentialName, originalUsername, originalPassword);

    await clientA.popup.screenshot({ path: 'tests/screenshots/6.1-client-a-credential-created.png' });
  });

  test('6.2 Both clients sync and verify credential exists', async () => {
    // Client A navigates to vault and waits for sync
    await clientA.popup.getByRole('button', { name: 'Vault' }).click();
    await clientA.popup.waitForTimeout(100);

    // Take screenshot to debug what's visible
    await clientA.popup.screenshot({ path: 'tests/screenshots/6.2-client-a-vault.png' });
    await expect(clientA.popup.locator(`text=${credentialName}`)).toBeVisible({ timeout: 10000 });

    // Let Client B navigate to root so it will sync and see the credential
    await clientB.popup.evaluate(() => {
      window.location.href = '/popup.html';
    });
    await clientB.popup.waitForTimeout(100);
    await expect(clientB.popup.locator(`text=${credentialName}`)).toBeVisible({ timeout: 10000 });
  });

  test('6.3 Client A edits credential (username and notes) and saves', async () => {
    const popup = clientA.popup;

    // Click on the credential to open details
    await popup.locator(`text=${credentialName}`).click();
    await popup.waitForTimeout(100);

    // Click the edit button
    const editButton = popup.locator('button[title="Edit Credential"]');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    // Wait for edit form to load
    await expect(popup.locator('input#login\\.username')).toBeVisible({ timeout: 10000 });

    // Modify username
    await popup.fill('input#login\\.username', clientAUsername);

    // Modify notes
    await popup.fill('textarea#login\\.notes', clientANotes);

    await popup.screenshot({ path: 'tests/screenshots/6.3-client-a-before-save.png' });

    // Click Save button
    await popup.click('button:has-text("Save")');

    // Wait for save to complete
    await popup.waitForTimeout(500);

    await popup.screenshot({ path: 'tests/screenshots/6.3-client-a-after-save.png' });
  });

  test('6.4 Client B edits same credential (password and notes) with stale data', async () => {
    const popup = clientB.popup;

    // Client B has stale data - click on credential to open details
    await popup.locator(`text=${credentialName}`).click();
    await popup.waitForTimeout(100);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-stale-details.png' });

    // Click the edit button
    const editButton = popup.locator('button[title="Edit Credential"]');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    // Wait for edit form to load
    await expect(popup.locator('input#login\\.password')).toBeVisible({ timeout: 10000 });

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-stale-form.png' });

    // Modify password
    await popup.fill('input#login\\.password', clientBPassword);

    // Modify notes (different value than Client A)
    await popup.fill('textarea#login\\.notes', clientBNotes);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-before-save.png' });

    // Click Save button - this should trigger a merge
    await popup.click('button:has-text("Save")');

    // Wait for save/merge to complete
    await popup.waitForTimeout(100);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-after-save.png' });
  });

  test('6.5 Client B verifies field-level merge result', async () => {
    const popup = clientB.popup;

    // Navigate to vault
    await popup.getByRole('button', { name: 'Vault' }).click();
    await popup.waitForTimeout(100);

    // Click on credential to view merged details
    await popup.locator(`text=${credentialName}`).click();
    await popup.waitForTimeout(100);

    // Click edit to see the actual field values
    const editButton = popup.locator('button[title="Edit Credential"]');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    await expect(popup.locator('input#login\\.username')).toBeVisible({ timeout: 10000 });

    await popup.screenshot({ path: 'tests/screenshots/6.5-client-b-merged-form.png' });

    // Verify username has Client A's value (preserved from earlier edit)
    const usernameValue = await popup.locator('input#login\\.username').inputValue();
    expect(usernameValue).toBe(clientAUsername);

    // Verify password has Client B's value (preserved from this client's edit)
    const passwordValue = await popup.locator('input#login\\.password').inputValue();
    expect(passwordValue).toBe(clientBPassword);

    // Verify notes has Client B's value (last writer wins)
    const notesValue = await popup.locator('textarea#login\\.notes').inputValue();
    expect(notesValue).toBe(clientBNotes);

    // Navigate back
    await popup.goBack();
    await popup.waitForTimeout(100);
  });

  test('6.6 Client A syncs and verifies merged credential', async () => {
    const popup = clientA.popup;

    // Navigate to root so it will sync and see the credential
    await popup.evaluate(() => {
      window.location.href = '/popup.html';
    });

    // Click on credential to view synced details
    await popup.locator(`text=${credentialName}`).click();
    await popup.waitForTimeout(100);

    // Click edit to verify the actual field values
    const editButton = popup.locator('button[title="Edit Credential"]');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    await expect(popup.locator('input#login\\.username')).toBeVisible({ timeout: 10000 });

    await popup.screenshot({ path: 'tests/screenshots/6.6-client-a-synced-form.png' });

    // Verify username has Client A's value (our original edit)
    const usernameValue = await popup.locator('input#login\\.username').inputValue();
    expect(usernameValue).toBe(clientAUsername);

    // Verify password has Client B's value (merged from other client)
    const passwordValue = await popup.locator('input#login\\.password').inputValue();
    expect(passwordValue).toBe(clientBPassword);

    // Verify notes has Client B's value (last writer wins)
    const notesValue = await popup.locator('textarea#login\\.notes').inputValue();
    expect(notesValue).toBe(clientBNotes);
  });
});
