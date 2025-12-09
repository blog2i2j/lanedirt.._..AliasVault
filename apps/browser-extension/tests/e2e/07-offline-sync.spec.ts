import {
  test,
  expect,
  openPopup,
  fullLoginFlow,
  waitForLoggedIn,
  createFreshContext,
  type ClientState,
  navigateToAddCredentialForm,
  fillAndSaveCredential,
  navigateToVault,
  navigateToRoot,
  verifyCredentialExists,
  verifyVaultItemCount,
  cleanupClients,
  enableOfflineMode,
  disableOfflineMode,
  waitForOfflineIndicator,
  FieldSelectors,
  ButtonSelectors,
} from '../fixtures';

/**
 * Category 7: Offline Sync (Requires API + Multi-Client Scenario)
 *
 * These tests verify offline mode functionality and subsequent sync behavior:
 *
 * Scenario:
 * 1. Client A (online) and Client B (will go offline) both login to the same account
 * 2. Client A creates a credential while online and syncs
 * 3. Client B goes offline (by changing API URL to invalid)
 * 4. Client B creates a new credential while offline (stored locally with hasPendingSync=true)
 * 5. Client B locks the vault locally
 * 6. Client B unlocks the vault (still offline - uses stored encryption params)
 * 7. Client B goes back online (restore valid API URL)
 * 8. Client B navigates to root to trigger sync (should merge local changes with server)
 * 9. Client A syncs and verifies both credentials are present
 */
test.describe.serial('7. Offline Sync', () => {
  let clientA: ClientState;
  let clientB: ClientState;
  let originalApiUrl: string | null = null;
  let sharedTestUser: { username: string; password: string };

  const credentialNameA = `Online Client A ${Date.now()}`;
  const credentialNameB = `Offline Client B ${Date.now() + 1}`;

  test.afterAll(async () => {
    await cleanupClients(clientA, clientB);
  });

  test('7.1 Setup: Both clients login to the same account', async ({ testUser, apiUrl }) => {
    // Store the testUser for use in later tests (fixture creates new user each time)
    sharedTestUser = { username: testUser.username, password: testUser.password };

    // Create Client A (will stay online)
    const contextA = await createFreshContext();
    const popupA = await openPopup(contextA.context, contextA.extensionId);
    await fullLoginFlow(popupA, apiUrl, sharedTestUser.username, sharedTestUser.password);
    await waitForLoggedIn(popupA);
    clientA = { ...contextA, popup: popupA };

    // Create Client B (will go offline later)
    const contextB = await createFreshContext();
    const popupB = await openPopup(contextB.context, contextB.extensionId);
    await fullLoginFlow(popupB, apiUrl, sharedTestUser.username, sharedTestUser.password);
    await waitForLoggedIn(popupB);
    clientB = { ...contextB, popup: popupB };

    // Store the original API URL for later restoration
    originalApiUrl = apiUrl;

    await clientA.popup.screenshot({ path: 'tests/screenshots/7.1-client-a-logged-in.png' });
    await clientB.popup.screenshot({ path: 'tests/screenshots/7.1-client-b-logged-in.png' });
  });

  test('7.2 Client A creates a credential while online', async () => {
    // Client A creates a credential (online, syncs immediately)
    await navigateToVault(clientA.popup);
    await navigateToAddCredentialForm(clientA.popup);
    await fillAndSaveCredential(
      clientA.popup,
      credentialNameA,
      'clientA@example.com',
      'ClientAPassword123!'
    );

    // Verify credential was saved
    await navigateToVault(clientA.popup);
    await verifyCredentialExists(clientA.popup, credentialNameA);

    await clientA.popup.screenshot({ path: 'tests/screenshots/7.2-client-a-credential-created.png' });
  });

  test('7.3 Client B goes offline', async () => {
    const popup = clientB.popup;

    // Put Client B into offline mode by setting an invalid API URL
    await enableOfflineMode(popup);

    // Navigate to root to trigger the offline detection
    await navigateToRoot(popup);

    // Wait for the extension to detect offline status
    await popup.waitForTimeout(1000);

    // Take a screenshot to see the offline state
    await popup.screenshot({ path: 'tests/screenshots/7.3-client-b-offline-mode.png' });

    // The offline indicator should be visible
    await waitForOfflineIndicator(popup, 10000);
  });

  test('7.4 Client B creates a credential while offline', async () => {
    const popup = clientB.popup;

    // Navigate to vault and create a credential while offline
    await navigateToVault(popup);
    await navigateToAddCredentialForm(popup);

    // Fill and save the credential
    // Note: In offline mode, this should be saved locally with hasPendingSync=true
    await popup.fill(FieldSelectors.ITEM_NAME, credentialNameB);
    await popup.click(ButtonSelectors.NEXT);
    await expect(popup.locator(FieldSelectors.LOGIN_USERNAME)).toBeVisible({ timeout: 10000 });
    await popup.fill(FieldSelectors.LOGIN_USERNAME, 'clientB@example.com');
    await popup.fill(FieldSelectors.LOGIN_PASSWORD, 'ClientBPassword456!');
    await popup.click(ButtonSelectors.SAVE);

    // Wait for save to complete (in offline mode, this saves locally)
    await popup.waitForTimeout(500);

    await popup.screenshot({ path: 'tests/screenshots/7.4-client-b-offline-credential-saved.png' });

    // Navigate to vault to verify the credential exists locally
    await navigateToVault(popup);
    await verifyCredentialExists(popup, credentialNameB);

    await popup.screenshot({ path: 'tests/screenshots/7.4-client-b-offline-credential-in-list.png' });
  });

  test('7.5 Client B locks vault while offline', async () => {
    const popup = clientB.popup;

    // Navigate to Settings tab via bottom navigation
    await popup.getByRole('button', { name: 'Settings' }).click();
    await popup.waitForTimeout(100);

    await popup.screenshot({ path: 'tests/screenshots/7.5-client-b-settings-page.png' });

    // Click the lock button (has title="Lock")
    const lockButton = popup.locator('button[title="Lock"]');
    await expect(lockButton).toBeVisible({ timeout: 5000 });
    await lockButton.click();

    await popup.waitForTimeout(500);

    await popup.screenshot({ path: 'tests/screenshots/7.5-client-b-vault-locked.png' });

    // Verify we're on the unlock page
    await expect(popup.locator('input#password')).toBeVisible({ timeout: 5000 });
  });

  test('7.6 Client B unlocks vault while still offline', async () => {
    const popup = clientB.popup;

    // Unlock the vault with the master password (use stored user from test 7.1)
    // In offline mode, this should work using stored encryption params
    await popup.fill('input#password', sharedTestUser.password);
    await popup.click('button:has-text("Unlock")');

    // Wait for unlock and navigation to complete
    await popup.waitForTimeout(2000);

    await popup.screenshot({ path: 'tests/screenshots/7.6-client-b-after-unlock.png' });

    // After unlock, verify we can see our credential
    // The extension should still be in offline mode
    await navigateToVault(popup);
    await verifyCredentialExists(popup, credentialNameB);

    await popup.screenshot({ path: 'tests/screenshots/7.6-client-b-offline-vault-unlocked.png' });
  });

  test('7.7 Client B goes back online and triggers sync', async () => {
    const popup = clientB.popup;

    // Restore the valid API URL to go back online
    if (originalApiUrl) {
      await disableOfflineMode(popup, originalApiUrl);
    }

    // Navigate to root to trigger a sync
    await navigateToRoot(popup);

    // Wait for sync to complete
    await popup.waitForTimeout(2000);

    await popup.screenshot({ path: 'tests/screenshots/7.7-client-b-back-online.png' });

    // After coming back online and syncing, Client B should have both credentials:
    // - The credential it created offline (uploaded during sync)
    // - The credential Client A created (downloaded during sync)
    await navigateToVault(popup);
    await popup.waitForTimeout(500);

    await popup.screenshot({ path: 'tests/screenshots/7.7-client-b-vault-after-sync.png' });

    // Verify Client B's offline credential is still there
    await verifyCredentialExists(popup, credentialNameB);

    // Verify Client A's credential was downloaded during sync
    await verifyCredentialExists(popup, credentialNameA);

    // Verify total item count is 2
    await verifyVaultItemCount(popup, 2);
  });

  test('7.8 Client A syncs and verifies both credentials are present', async () => {
    const popup = clientA.popup;

    // Navigate to root to trigger a sync
    await navigateToRoot(popup);

    // Wait for sync to complete
    await popup.waitForTimeout(2000);

    await popup.screenshot({ path: 'tests/screenshots/7.8-client-a-vault-after-sync.png' });

    // Verify both credentials exist
    await navigateToVault(popup);

    // Client A's original credential
    await verifyCredentialExists(popup, credentialNameA);

    // Client B's credential (created offline, then synced)
    await verifyCredentialExists(popup, credentialNameB);

    // Verify total item count is 2
    await verifyVaultItemCount(popup, 2);

    await popup.screenshot({ path: 'tests/screenshots/7.8-client-a-both-credentials.png' });
  });
});
