/**
 * Test fixtures index.
 *
 * This module exports all Playwright test fixtures and helpers.
 */

// Core fixtures
export {
  test,
  expect,
  openPopup,
  waitForPopupReady,
  waitForLoggedIn,
  configureApiUrl,
  login,
  fullLoginFlow,
  closeCachedContext,
  createFreshContext,
} from './fixtures';

// Shared helpers for credential operations and multi-client tests
export {
  type ClientState,
  navigateToAddCredentialForm,
  fillAndSaveCredential,
  navigateToVault,
  clickCredential,
  openCredentialEditForm,
  verifyCredentialExists,
  verifyVaultItemCount,
  getFieldValue,
  navigateToRoot,
  saveCredential,
  fillNotes,
  fillUsername,
  fillPassword,
  setApiUrl,
  getApiUrl,
  enableOfflineMode,
  disableOfflineMode,
  lockVault,
  cleanupClient,
  cleanupClients,
  waitForOfflineIndicator,
  isOfflineIndicatorVisible,
  unlockVault,
} from './helpers';

// Field selectors and constants
export { FieldKey, FieldSelectors, ButtonSelectors } from './selectors';
