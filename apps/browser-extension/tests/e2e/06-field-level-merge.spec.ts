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
  clickCredential,
  openCredentialEditForm,
  verifyCredentialExists,
  getFieldValue,
  saveCredential,
  fillUsername,
  fillPassword,
  fillNotes,
  cleanupClients,
  FieldSelectors,
} from '../fixtures';

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
  let clientA: ClientState;
  let clientB: ClientState;

  const credentialName = `Field Merge Test ${Date.now()}`;
  const originalUsername = 'original@example.com';
  const originalPassword = 'OriginalPassword123!';

  // Values for field-level merge test
  const clientAUsername = 'clientA_modified_user@example.com';
  const clientANotes = 'Notes modified by Client A';
  const clientBPassword = 'ClientBModifiedPassword789!';
  const clientBNotes = 'Notes modified by Client B - this should win';

  test.afterAll(async () => {
    await cleanupClients(clientA, clientB);
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
    await navigateToVault(clientA.popup);
    await navigateToAddCredentialForm(clientA.popup);
    await fillAndSaveCredential(clientA.popup, credentialName, originalUsername, originalPassword);

    await clientA.popup.screenshot({ path: 'tests/screenshots/6.1-client-a-credential-created.png' });
  });

  test('6.2 Both clients sync and verify credential exists', async () => {
    // Client A navigates to vault and waits for sync
    await navigateToVault(clientA.popup);
    await clientA.popup.waitForTimeout(100);

    // Take screenshot to debug what's visible
    await clientA.popup.screenshot({ path: 'tests/screenshots/6.2-client-a-vault.png' });
    await verifyCredentialExists(clientA.popup, credentialName);

    // Let Client B navigate to root so it will sync and see the credential
    await navigateToRoot(clientB.popup);
    await verifyCredentialExists(clientB.popup, credentialName);
  });

  test('6.3 Client A edits credential (username and notes) and saves', async () => {
    const popup = clientA.popup;

    // Click on the credential to open details
    await clickCredential(popup, credentialName);

    // Open edit form
    await openCredentialEditForm(popup);

    // Modify username and notes
    await fillUsername(popup, clientAUsername);
    await fillNotes(popup, clientANotes);

    await popup.screenshot({ path: 'tests/screenshots/6.3-client-a-before-save.png' });

    // Save the credential
    await saveCredential(popup);

    // Wait for save to complete
    await popup.waitForTimeout(500);

    await popup.screenshot({ path: 'tests/screenshots/6.3-client-a-after-save.png' });
  });

  test('6.4 Client B edits same credential (password and notes) with stale data', async () => {
    const popup = clientB.popup;

    // Client B has stale data - click on credential to open details
    await clickCredential(popup, credentialName);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-stale-details.png' });

    // Open edit form
    await openCredentialEditForm(popup);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-stale-form.png' });

    // Modify password and notes (different value than Client A)
    await fillPassword(popup, clientBPassword);
    await fillNotes(popup, clientBNotes);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-before-save.png' });

    // Save the credential - this should trigger a merge
    await saveCredential(popup);

    await popup.screenshot({ path: 'tests/screenshots/6.4-client-b-after-save.png' });
  });

  test('6.5 Client B verifies field-level merge result', async () => {
    const popup = clientB.popup;

    // Navigate to vault
    await navigateToVault(popup);
    await popup.waitForTimeout(100);

    // Click on credential to view merged details
    await clickCredential(popup, credentialName);

    // Open edit form to see the actual field values
    await openCredentialEditForm(popup);

    await popup.screenshot({ path: 'tests/screenshots/6.5-client-b-merged-form.png' });

    // Verify username has Client A's value (preserved from earlier edit)
    const usernameValue = await getFieldValue(popup, FieldSelectors.LOGIN_USERNAME);
    expect(usernameValue).toBe(clientAUsername);

    // Verify password has Client B's value (preserved from this client's edit)
    const passwordValue = await getFieldValue(popup, FieldSelectors.LOGIN_PASSWORD);
    expect(passwordValue).toBe(clientBPassword);

    // Verify notes has Client B's value (last writer wins)
    const notesValue = await getFieldValue(popup, FieldSelectors.LOGIN_NOTES);
    expect(notesValue).toBe(clientBNotes);

    // Navigate back
    await popup.goBack();
    await popup.waitForTimeout(100);
  });

  test('6.6 Client A syncs and verifies merged credential', async () => {
    const popup = clientA.popup;

    // Navigate to root so it will sync and see the merged credential
    await navigateToRoot(popup);

    // Click on credential to view synced details
    await clickCredential(popup, credentialName);

    // Open edit form to verify the actual field values
    await openCredentialEditForm(popup);

    await popup.screenshot({ path: 'tests/screenshots/6.6-client-a-synced-form.png' });

    // Verify username has Client A's value (our original edit)
    const usernameValue = await getFieldValue(popup, FieldSelectors.LOGIN_USERNAME);
    expect(usernameValue).toBe(clientAUsername);

    // Verify password has Client B's value (merged from other client)
    const passwordValue = await getFieldValue(popup, FieldSelectors.LOGIN_PASSWORD);
    expect(passwordValue).toBe(clientBPassword);

    // Verify notes has Client B's value (last writer wins)
    const notesValue = await getFieldValue(popup, FieldSelectors.LOGIN_NOTES);
    expect(notesValue).toBe(clientBNotes);
  });
});
