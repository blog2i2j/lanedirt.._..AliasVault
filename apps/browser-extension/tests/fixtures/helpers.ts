/**
 * Shared test helpers for E2E tests.
 *
 * This module provides reusable helper functions for common test operations
 * like credential creation, navigation, and form filling.
 */
import type { BrowserContext, Page } from '@playwright/test';

import { expect } from './fixtures';
import { FieldSelectors, ButtonSelectors } from './selectors';

/**
 * Client state object for multi-client tests.
 */
export type ClientState = {
  context: BrowserContext;
  extensionId: string;
  popup: Page;
};

/**
 * Navigate to the add credential form.
 * Assumes the user is already logged in and on the vault page.
 *
 * @param popup - The popup page
 */
export async function navigateToAddCredentialForm(popup: Page): Promise<void> {
  const addButton = popup.locator(ButtonSelectors.ADD_NEW_ITEM);
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(popup.locator(FieldSelectors.ITEM_NAME)).toBeVisible();
}

/**
 * Fill and save a login credential form.
 *
 * @param popup - The popup page
 * @param name - The credential name
 * @param username - The username for the credential
 * @param password - The password for the credential
 */
export async function fillAndSaveCredential(
  popup: Page,
  name: string,
  username: string,
  password: string
): Promise<void> {
  // Enter the item name
  await popup.fill(FieldSelectors.ITEM_NAME, name);

  // Click Continue/Next button
  await popup.click(ButtonSelectors.NEXT);

  // Wait for the add/edit form to load
  await expect(popup.locator(FieldSelectors.LOGIN_USERNAME)).toBeVisible({ timeout: 10000 });

  // Fill in credentials
  await popup.fill(FieldSelectors.LOGIN_USERNAME, username);
  await popup.fill(FieldSelectors.LOGIN_PASSWORD, password);

  // Click Save button
  await popup.click(ButtonSelectors.SAVE);

  // Wait for navigation to item details page (after save and sync)
  await expect(popup.locator(`text=${name}`)).toBeVisible({ timeout: 30000 });
}

/**
 * Navigate to the vault tab.
 *
 * @param popup - The popup page
 */
export async function navigateToVault(popup: Page): Promise<void> {
  await popup.locator('#nav-vault').click();
}

/**
 * Click on a credential in the vault list by name.
 *
 * @param popup - The popup page
 * @param credentialName - The name of the credential to click
 */
export async function clickCredential(popup: Page, credentialName: string): Promise<void> {
  await popup.locator(`text=${credentialName}`).click();
  await popup.waitForTimeout(100);
}

/**
 * Open the edit form for the currently viewed credential.
 *
 * @param popup - The popup page
 */
export async function openCredentialEditForm(popup: Page): Promise<void> {
  const editButton = popup.locator(ButtonSelectors.EDIT_CREDENTIAL);
  await expect(editButton).toBeVisible({ timeout: 5000 });
  await editButton.click();
  await expect(popup.locator(FieldSelectors.LOGIN_USERNAME)).toBeVisible({ timeout: 10000 });
}

/**
 * Verify a credential exists in the vault list.
 *
 * @param popup - The popup page
 * @param credentialName - The name of the credential to verify
 * @param timeout - Timeout in milliseconds (default: 10000)
 */
export async function verifyCredentialExists(
  popup: Page,
  credentialName: string,
  timeout: number = 10000
): Promise<void> {
  await expect(popup.locator(`text=${credentialName}`)).toBeVisible({ timeout });
}

/**
 * Verify the vault shows a specific item count.
 *
 * @param popup - The popup page
 * @param count - The expected item count
 */
export async function verifyVaultItemCount(popup: Page, count: number): Promise<void> {
  const itemsText = popup.locator(`text=/\\(${count} items?\\)/`);
  await expect(itemsText).toBeVisible({ timeout: 5000 });
}

/**
 * Get the value of a field in the edit form.
 *
 * @param popup - The popup page
 * @param selector - The CSS selector for the field
 * @returns The field value
 */
export async function getFieldValue(popup: Page, selector: string): Promise<string> {
  return popup.locator(selector).inputValue();
}

/**
 * Navigate to root popup.html to trigger a fresh sync.
 *
 * @param popup - The popup page
 */
export async function navigateToRoot(popup: Page): Promise<void> {
  await popup.evaluate(() => {
    window.location.href = '/popup.html';
  });
  await popup.waitForTimeout(100);
}

/**
 * Save the current credential form.
 *
 * @param popup - The popup page
 */
export async function saveCredential(popup: Page): Promise<void> {
  await popup.click(ButtonSelectors.SAVE);
  await popup.waitForTimeout(100);
}

/**
 * Fill the notes field in the credential form.
 *
 * @param popup - The popup page
 * @param notes - The notes text
 */
export async function fillNotes(popup: Page, notes: string): Promise<void> {
  await popup.fill(FieldSelectors.LOGIN_NOTES, notes);
}

/**
 * Fill the username field in the credential form.
 *
 * @param popup - The popup page
 * @param username - The username
 */
export async function fillUsername(popup: Page, username: string): Promise<void> {
  await popup.fill(FieldSelectors.LOGIN_USERNAME, username);
}

/**
 * Fill the password field in the credential form.
 *
 * @param popup - The popup page
 * @param password - The password
 */
export async function fillPassword(popup: Page, password: string): Promise<void> {
  await popup.fill(FieldSelectors.LOGIN_PASSWORD, password);
}

/**
 * Set the API URL in the extension's local storage.
 * This can be used to simulate offline mode by setting an invalid URL.
 *
 * @param popup - The popup page
 * @param apiUrl - The API URL to set (use invalid URL like 'http://invalid.localhost:9999' for offline)
 */
export async function setApiUrl(popup: Page, apiUrl: string): Promise<void> {
  await popup.evaluate((url) => {
    // Access chrome.storage.local directly to set the API URL
    chrome.storage.local.set({ apiUrl: url });
  }, apiUrl);
  // Small delay to allow storage to update
  await popup.waitForTimeout(100);
}

/**
 * Get the current API URL from the extension's local storage.
 *
 * @param popup - The popup page
 * @returns The current API URL
 */
export async function getApiUrl(popup: Page): Promise<string | null> {
  return popup.evaluate(() => {
    return new Promise<string | null>((resolve) => {
      chrome.storage.local.get(['apiUrl'], (result) => {
        resolve(result.apiUrl ?? null);
      });
    });
  });
}

/**
 * Simulate offline mode by setting an invalid API URL.
 * This will cause all API requests to fail, triggering the extension's offline behavior.
 *
 * @param popup - The popup page
 * @returns The original API URL that was replaced (to restore later)
 */
export async function enableOfflineMode(popup: Page): Promise<string | null> {
  const originalUrl = await getApiUrl(popup);
  await setApiUrl(popup, 'http://offline.invalid.localhost:9999');
  return originalUrl;
}

/**
 * Restore online mode by setting the API URL back to the original value.
 *
 * @param popup - The popup page
 * @param apiUrl - The API URL to restore
 */
export async function disableOfflineMode(popup: Page, apiUrl: string): Promise<void> {
  await setApiUrl(popup, apiUrl);
}

/**
 * Lock the vault by clearing the encryption key from session storage.
 * This simulates the user locking their vault without logging out.
 *
 * @param popup - The popup page
 */
export async function lockVault(popup: Page): Promise<void> {
  await popup.evaluate(() => {
    // Clear the encryption key from session storage via background message
    chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
  });
  await popup.waitForTimeout(100);
}

/**
 * Clean up a client state by closing popup and context.
 *
 * @param client - The client state to clean up
 */
export async function cleanupClient(client: ClientState | null | undefined): Promise<void> {
  if (client) {
    await client.popup?.close();
    await client.context?.close();
  }
}

/**
 * Clean up multiple clients.
 *
 * @param clients - Array of client states to clean up
 */
export async function cleanupClients(...clients: (ClientState | null | undefined)[]): Promise<void> {
  for (const client of clients) {
    await cleanupClient(client);
  }
}

/**
 * Wait for the offline indicator to appear on the page.
 * The indicator shows "Offline" text (from t('common.offline')) with amber background styling.
 *
 * @param popup - The popup page
 * @param timeout - Timeout in milliseconds (default: 5000)
 */
export async function waitForOfflineIndicator(popup: Page, timeout: number = 5000): Promise<void> {
  // The offline indicator has amber background (bg-amber-100 in light mode, bg-amber-900/30 in dark mode)
  // and contains the text "Offline"
  const offlineIndicator = popup.locator('div.bg-amber-100, div.bg-amber-900\\/30').filter({ hasText: 'Offline' });
  await expect(offlineIndicator).toBeVisible({ timeout });
}

/**
 * Check if the offline indicator is visible.
 *
 * @param popup - The popup page
 * @returns True if the offline indicator is visible
 */
export async function isOfflineIndicatorVisible(popup: Page): Promise<boolean> {
  const offlineIndicator = popup.locator('div.bg-amber-100, div.bg-amber-900\\/30').filter({ hasText: 'Offline' });
  return offlineIndicator.isVisible().catch(() => false);
}

/**
 * Perform a login on the unlock screen (for locked vault).
 *
 * @param popup - The popup page
 * @param password - The master password
 */
export async function unlockVault(popup: Page, password: string): Promise<void> {
  // Fill in the password on the unlock screen
  await popup.fill('input#password', password);
  // Click the unlock button
  await popup.click('button:has-text("Unlock")');
  // Wait for the vault to load
  await popup.waitForTimeout(500);
}
