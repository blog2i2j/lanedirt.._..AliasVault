/* eslint-disable @typescript-eslint/no-explicit-any */
import { storage } from 'wxt/utils/storage';

import type { EncryptionKeyDerivationParams } from '@/utils/dist/shared/models/metadata';
import type { Vault, VaultResponse, VaultPostResponse } from '@/utils/dist/shared/models/webapi';
import { EncryptionUtility } from '@/utils/EncryptionUtility';
import { SqliteClient } from '@/utils/SqliteClient';
import { VaultVersionIncompatibleError } from '@/utils/types/errors/VaultVersionIncompatibleError';
import { BoolResponse as messageBoolResponse } from '@/utils/types/messaging/BoolResponse';
import { CredentialsResponse as messageCredentialsResponse } from '@/utils/types/messaging/CredentialsResponse';
import { IdentitySettingsResponse } from '@/utils/types/messaging/IdentitySettingsResponse';
import { PasswordSettingsResponse as messagePasswordSettingsResponse } from '@/utils/types/messaging/PasswordSettingsResponse';
import { StoreVaultRequest } from '@/utils/types/messaging/StoreVaultRequest';
import { StringResponse as stringResponse } from '@/utils/types/messaging/StringResponse';
import { VaultResponse as messageVaultResponse } from '@/utils/types/messaging/VaultResponse';
import { VaultUploadResponse as messageVaultUploadResponse } from '@/utils/types/messaging/VaultUploadResponse';
import { WebApiService } from '@/utils/WebApiService';

import { t } from '@/i18n/StandaloneI18n';

/**
 * Check if the user is logged in and if the vault is locked, and also check for pending migrations.
 */
export async function handleCheckAuthStatus() : Promise<{ isLoggedIn: boolean, isVaultLocked: boolean, hasPendingMigrations: boolean, error?: string }> {
  const username = await storage.getItem('local:username');
  const accessToken = await storage.getItem('local:accessToken');
  // Check local: storage for persistent vault (survives browser close)
  const vaultData = await storage.getItem('local:encryptedVault');
  const encryptionKey = await handleGetEncryptionKey();

  const isLoggedIn = username !== null && accessToken !== null;
  const isVaultLocked = isLoggedIn && (vaultData === null || encryptionKey === null);

  // If vault is locked, we can't check for pending migrations
  if (isVaultLocked) {
    return {
      isLoggedIn,
      isVaultLocked,
      hasPendingMigrations: false
    };
  }

  // If not logged in, no need to check migrations
  if (!isLoggedIn) {
    return {
      isLoggedIn,
      isVaultLocked,
      hasPendingMigrations: false
    };
  }

  // Vault is unlocked, check for pending migrations
  try {
    const sqliteClient = await createVaultSqliteClient();
    const hasPendingMigrations = await sqliteClient.hasPendingMigrations();
    return {
      isLoggedIn,
      isVaultLocked,
      hasPendingMigrations
    };
  } catch (error) {
    console.error('Error checking pending migrations:', error);

    // If it's a version incompatibility error, we need to handle it specially
    if (error instanceof VaultVersionIncompatibleError) {
      // Return the error so the UI can handle it appropriately (logout user)
      return {
        isLoggedIn,
        isVaultLocked,
        hasPendingMigrations: false,
        error: error.message
      };
    }

    return {
      isLoggedIn,
      isVaultLocked,
      hasPendingMigrations: false,
      error: error instanceof Error ? error.message : await t('common.errors.unknownError')
    };
  }
}

/**
 * Store the vault in browser storage atomically with all required metadata.
 * The encrypted vault is stored in local: storage (persistent) while metadata is in local:.
 * The encryption key remains in session: storage for security.
 *
 * This is an atomic operation that stores both the vault blob and its sync state together,
 * ensuring callers cannot forget to update the pending sync flag.
 */
export async function handleStoreVault(
  message: any,
) : Promise<messageBoolResponse> {
  try {
    const vaultRequest = message as StoreVaultRequest;

    /*
     * Store encrypted vault in local: storage (persistent across browser sessions).
     * This allows offline access after browser restart (user must re-enter password to unlock).
     */
    await storage.setItem('local:encryptedVault', vaultRequest.vaultBlob);

    /*
     * Always store the pending sync state - this is required for all vault storage operations.
     */
    await storage.setItem('local:hasPendingSync', vaultRequest.hasPendingSync);

    /*
     * For all other values, check if they have a value and store them in local: storage if they do.
     * These are also persisted to enable offline mode.
     * Some updates, e.g. when mutating local database, these values will not be set.
     */

    if (vaultRequest.publicEmailDomainList) {
      await storage.setItem('local:publicEmailDomains', vaultRequest.publicEmailDomainList);
    }

    if (vaultRequest.privateEmailDomainList) {
      await storage.setItem('local:privateEmailDomains', vaultRequest.privateEmailDomainList);
    }

    if (vaultRequest.hiddenPrivateEmailDomainList) {
      await storage.setItem('local:hiddenPrivateEmailDomains', vaultRequest.hiddenPrivateEmailDomainList);
    }

    if (vaultRequest.vaultRevisionNumber) {
      await storage.setItem('local:vaultRevisionNumber', vaultRequest.vaultRevisionNumber);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to store vault:', error);
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Store the encryption key (derived key) in browser storage.
 */
export async function handleStoreEncryptionKey(
  encryptionKey: string,
) : Promise<messageBoolResponse> {
  try {
    await storage.setItem('session:encryptionKey', encryptionKey);
    return { success: true };
  } catch (error) {
    console.error('Failed to store encryption key:', error);
    return { success: false, error: await t('common.errors.unknownErrorTryAgain') };
  }
}

/**
 * Store the encryption key derivation parameters in browser storage.
 * These are stored in local: storage to enable offline unlock after browser restart.
 */
export async function handleStoreEncryptionKeyDerivationParams(
  params: EncryptionKeyDerivationParams,
) : Promise<messageBoolResponse> {
  try {
    await storage.setItem('local:encryptionKeyDerivationParams', params);
    return { success: true };
  } catch (error) {
    console.error('Failed to store encryption key derivation params:', error);
    return { success: false, error: await t('common.errors.unknownErrorTryAgain') };
  }
}

/**
 * Sync the vault with the server to check if a newer vault is available. If so, the vault will be updated.
 */
export async function handleSyncVault(
) : Promise<messageBoolResponse> {
  const webApi = new WebApiService();
  const statusResponse = await webApi.getStatus();
  const statusError = webApi.validateStatusResponse(statusResponse);
  if (statusError !== null) {
    return { success: false, error: await t('common.errors.' + statusError) };
  }

  const vaultRevisionNumber = await storage.getItem('local:vaultRevisionNumber') as number;

  if (statusResponse.vaultRevision > vaultRevisionNumber) {
    // Retrieve the latest vault from the server.
    const vaultResponse = await webApi.get<VaultResponse>('Vault');

    // Store in local: storage for persistence (fresh from server, no pending sync)
    await storage.setItems([
      { key: 'local:encryptedVault', value: vaultResponse.vault.blob },
      { key: 'local:publicEmailDomains', value: vaultResponse.vault.publicEmailDomainList },
      { key: 'local:privateEmailDomains', value: vaultResponse.vault.privateEmailDomainList },
      { key: 'local:hiddenPrivateEmailDomains', value: vaultResponse.vault.hiddenPrivateEmailDomainList },
      { key: 'local:vaultRevisionNumber', value: vaultResponse.vault.currentRevisionNumber },
      { key: 'local:hasPendingSync', value: false }
    ]);
  }

  return { success: true };
}

/**
 * Get the vault from browser storage (local: for persistence).
 */
export async function handleGetVault(
) : Promise<messageVaultResponse> {
  try {
    const encryptionKey = await handleGetEncryptionKey();

    // Read from local: storage for persistent vault access
    const encryptedVault = await storage.getItem('local:encryptedVault') as string;
    const publicEmailDomains = await storage.getItem('local:publicEmailDomains') as string[];
    const privateEmailDomains = await storage.getItem('local:privateEmailDomains') as string[];
    const hiddenPrivateEmailDomains = await storage.getItem('local:hiddenPrivateEmailDomains') as string[] ?? [];
    const vaultRevisionNumber = await storage.getItem('local:vaultRevisionNumber') as number;

    if (!encryptedVault) {
      console.error('Vault not available');
      return { success: false, error: await t('common.errors.vaultNotAvailable') };
    }

    if (!encryptionKey) {
      console.error('Encryption key not available');
      return { success: false, error: await t('common.errors.vaultIsLocked') };
    }

    const decryptedVault = await EncryptionUtility.symmetricDecrypt(
      encryptedVault,
      encryptionKey
    );

    return {
      success: true,
      vault: decryptedVault,
      publicEmailDomains: publicEmailDomains ?? [],
      privateEmailDomains: privateEmailDomains ?? [],
      hiddenPrivateEmailDomains: hiddenPrivateEmailDomains ?? [],
      vaultRevisionNumber: vaultRevisionNumber ?? 0
    };
  } catch (error) {
    console.error('Failed to get vault:', error);
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Lock the vault by clearing only session data.
 * This preserves local vault data so user can unlock again without server.
 */
export function handleLockVault(): messageBoolResponse {
  // Clear session-only data (locks the vault)
  storage.removeItems([
    'session:encryptionKey',
    'session:persistedFormValues',
  ]);

  return { success: true };
}

/**
 * Clear the vault completely from browser storage (both local: and session:).
 * This is used for full logout - removes all vault data.
 */
export function handleClearVault(): messageBoolResponse {
  // Clear persistent vault data from local: storage
  storage.removeItems([
    'local:encryptedVault',
    'local:publicEmailDomains',
    'local:privateEmailDomains',
    'local:hiddenPrivateEmailDomains',
    'local:vaultRevisionNumber',
    'local:isOfflineMode',
    'local:hasPendingSync',
    'local:encryptionKeyDerivationParams'
  ]);

  // Clear session-only data
  storage.removeItems([
    'session:encryptionKey',
    'session:persistedFormValues',
  ]);

  return { success: true };
}

/**
 * Get all credentials.
 */
export async function handleGetCredentials(
) : Promise<messageCredentialsResponse> {
  const encryptionKey = await handleGetEncryptionKey();

  if (!encryptionKey) {
    return { success: false, error: await t('common.errors.vaultIsLocked') };
  }

  try {
    const sqliteClient = await createVaultSqliteClient();
    const credentials = sqliteClient.getAllCredentials();
    return { success: true, credentials: credentials };
  } catch (error) {
    console.error('Error getting credentials:', error);
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Create an identity.
 */
export async function handleCreateIdentity(
  message: any,
) : Promise<messageBoolResponse> {
  const encryptionKey = await handleGetEncryptionKey();

  if (!encryptionKey) {
    return { success: false, error: await t('common.errors.vaultIsLocked') };
  }

  try {
    const sqliteClient = await createVaultSqliteClient();

    // Add the new credential to the vault/database.
    await sqliteClient.createCredential(message.credential, message.attachments || []);

    // Upload the new vault to the server.
    await uploadNewVaultToServer(sqliteClient);

    return { success: true };
  } catch (error) {
    console.error('Failed to create identity:', error);
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Get the email addresses for a vault.
 */
export async function getEmailAddressesForVault(
  sqliteClient: SqliteClient
): Promise<string[]> {
  // TODO: create separate query to only get email addresses to avoid loading all credentials.
  const credentials = sqliteClient.getAllCredentials();

  // Get metadata from local: storage
  const privateEmailDomains = await storage.getItem('local:privateEmailDomains') as string[];

  const emailAddresses = credentials
    .filter(cred => cred.Alias?.Email != null)
    .map(cred => cred.Alias.Email ?? '')
    .filter((email, index, self) => self.indexOf(email) === index);

  return emailAddresses.filter(email => {
    const domain = email?.split('@')[1];
    return domain && privateEmailDomains.includes(domain);
  });
}

/**
 * Get default email domain for a vault.
 */
export function handleGetDefaultEmailDomain(): Promise<stringResponse> {
  return (async (): Promise<stringResponse> => {
    try {
      const sqliteClient = await createVaultSqliteClient();
      const defaultEmailDomain = await sqliteClient.getDefaultEmailDomain();

      return { success: true, value: defaultEmailDomain ?? undefined };
    } catch (error) {
      console.error('Error getting default email domain:', error);
      return { success: false, error: await t('common.errors.unknownError') };
    }
  })();
}

/**
 * Get the default identity settings.
 * Returns the effective language (with smart UI language matching if no explicit override is set).
 */
export async function handleGetDefaultIdentitySettings(
) : Promise<IdentitySettingsResponse> {
  try {
    const sqliteClient = await createVaultSqliteClient();
    const language = await sqliteClient.getEffectiveIdentityLanguage();
    const gender = sqliteClient.getDefaultIdentityGender();

    return {
      success: true,
      settings: {
        language,
        gender
      }
    };
  } catch (error) {
    console.error('Error getting default identity settings:', error);
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Get the password settings.
 */
export async function handleGetPasswordSettings(
) : Promise<messagePasswordSettingsResponse> {
  try {
    const sqliteClient = await createVaultSqliteClient();
    const passwordSettings = sqliteClient.getPasswordSettings();

    return { success: true, settings: passwordSettings };
  } catch (error) {
    console.error('Error getting password settings:', error);
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Get the encryption key for the encrypted vault.
 */
export async function handleGetEncryptionKey(
) : Promise<string | null> {
  // Try the current key name first (since 0.22.0)
  let encryptionKey = await storage.getItem('session:encryptionKey') as string | null;

  // Fall back to the legacy key name if not found
  if (!encryptionKey) {
    // TODO: this check can be removed some period of time after 0.22.0 is released.
    encryptionKey = await storage.getItem('session:derivedKey') as string | null;
  }

  return encryptionKey;
}

/**
 * Get the encryption key derivation parameters for password change detection and offline mode.
 * These are stored in local: storage to enable offline unlock after browser restart.
 */
export async function handleGetEncryptionKeyDerivationParams(
) : Promise<EncryptionKeyDerivationParams | null> {
  // Try local: storage first (current location since offline support)
  let params = await storage.getItem('local:encryptionKeyDerivationParams') as EncryptionKeyDerivationParams | null;

  // Fall back to session: storage for backwards compatibility
  if (!params) {
    params = await storage.getItem('session:encryptionKeyDerivationParams') as EncryptionKeyDerivationParams | null;
  }

  return params;
}

/**
 * Upload the vault to the server.
 */
export async function handleUploadVault(
  message: { vaultBlob: string; baseRevisionNumber?: number }
) : Promise<messageVaultUploadResponse> {
  try {
    /*
     * Store the new vault blob in local: storage with pending sync flag.
     * If a baseRevisionNumber is provided (e.g., after a merge), update it atomically.
     * The uploadNewVaultToServer will clear hasPendingSync on success.
     */
    if (message.baseRevisionNumber !== undefined) {
      // Store vault, pending sync flag, and revision number atomically
      await storage.setItems([
        { key: 'local:encryptedVault', value: message.vaultBlob },
        { key: 'local:hasPendingSync', value: true },
        { key: 'local:vaultRevisionNumber', value: message.baseRevisionNumber }
      ]);
    } else {
      await storage.setItems([
        { key: 'local:encryptedVault', value: message.vaultBlob },
        { key: 'local:hasPendingSync', value: true }
      ]);
    }

    // Create new sqlite client which will use the new vault blob.
    const sqliteClient = await createVaultSqliteClient();

    // Upload the new vault to the server.
    const response = await uploadNewVaultToServer(sqliteClient);
    return { success: true, status: response.status, newRevisionNumber: response.newRevisionNumber };
  } catch (error) {
    console.error('Failed to upload vault:', error);
    // hasPendingSync stays true since upload failed
    return { success: false, error: await t('common.errors.unknownError') };
  }
}

/**
 * Handle persisting form values to storage.
 * Data is encrypted using the derived key for additional security.
 */
export async function handlePersistFormValues(data: any): Promise<void> {
  const encryptionKey = await handleGetEncryptionKey();
  if (!encryptionKey) {
    throw new Error(await t('common.errors.unknownError'));
  }

  // Always stringify the data properly
  const serializedData = JSON.stringify(data);
  const encryptedData = await EncryptionUtility.symmetricEncrypt(
    serializedData,
    encryptionKey
  );
  await storage.setItem('session:persistedFormValues', encryptedData);
}

/**
 * Handle retrieving persisted form values from storage.
 * Data is decrypted using the derived key.
 */
export async function handleGetPersistedFormValues(): Promise<any | null> {
  const encryptionKey = await handleGetEncryptionKey();
  const encryptedData = await storage.getItem('session:persistedFormValues') as string | null;

  if (!encryptedData || !encryptionKey) {
    return null;
  }

  try {
    const decryptedData = await EncryptionUtility.symmetricDecrypt(
      encryptedData,
      encryptionKey
    );
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error('Failed to decrypt or parse persisted form values:', error);
    return null;
  }
}

/**
 * Handle clearing persisted form values from storage.
 */
export async function handleClearPersistedFormValues(): Promise<void> {
  await storage.removeItem('session:persistedFormValues');
}

/**
 * Upload a new version of the vault to the server using the provided sqlite client.
 */
async function uploadNewVaultToServer(sqliteClient: SqliteClient) : Promise<VaultPostResponse> {
  const updatedVaultData = sqliteClient.exportToBase64();
  const encryptionKey = await handleGetEncryptionKey();

  if (!encryptionKey) {
    throw new Error(await t('common.errors.vaultIsLocked'));
  }

  const encryptedVault = await EncryptionUtility.symmetricEncrypt(
    updatedVaultData,
    encryptionKey
  );

  /*
   * Store in local: storage for persistence with pending sync flag.
   * We're about to upload, so mark as pending until confirmed.
   */
  await storage.setItems([
    { key: 'local:encryptedVault', value: encryptedVault },
    { key: 'local:hasPendingSync', value: true }
  ]);

  // Get metadata from local: storage
  const vaultRevisionNumber = await storage.getItem('local:vaultRevisionNumber') as number;

  // Upload new encrypted vault to server.
  const username = await storage.getItem('local:username') as string;
  const emailAddresses = await getEmailAddressesForVault(sqliteClient);

  const newVault: Vault = {
    blob: encryptedVault,
    createdAt: new Date().toISOString(),
    credentialsCount: sqliteClient.getAllCredentials().length,
    currentRevisionNumber: vaultRevisionNumber,
    emailAddressList: emailAddresses,
    updatedAt: new Date().toISOString(),
    username: username,
    version: (await sqliteClient.getDatabaseVersion()).version,
    // TODO: add public RSA encryption key to payload when implementing vault creation from browser extension. Currently only web app does this.
    encryptionPublicKey: '',
  };

  const webApi = new WebApiService();
  const response = await webApi.post<Vault, VaultPostResponse>('Vault', newVault);

  // Check if response is successful (.status === 0)
  if (response.status === 0) {
    // Upload succeeded - update revision and clear pending sync
    await storage.setItems([
      { key: 'local:vaultRevisionNumber', value: response.newRevisionNumber },
      { key: 'local:hasPendingSync', value: false }
    ]);
  } else {
    // Upload failed - hasPendingSync stays true (was set above)
    throw new Error(await t('common.errors.unknownError'));
  }

  return response;
}

/**
 * Create a new sqlite client for the stored vault.
 */
async function createVaultSqliteClient() : Promise<SqliteClient> {
  // Read from local: storage for persistent vault access
  const encryptedVault = await storage.getItem('local:encryptedVault') as string;
  const encryptionKey = await handleGetEncryptionKey();
  if (!encryptedVault || !encryptionKey) {
    throw new Error(await t('common.errors.unknownError'));
  }

  // Decrypt the vault.
  const decryptedVault = await EncryptionUtility.symmetricDecrypt(
    encryptedVault,
    encryptionKey
  );

  // Initialize the SQLite client with the decrypted vault.
  const sqliteClient = new SqliteClient();
  await sqliteClient.initializeFromBase64(decryptedVault);

  return sqliteClient;
}

/**
 * Get offline mode status.
 */
export async function handleGetOfflineMode(): Promise<boolean> {
  const isOffline = await storage.getItem('local:isOfflineMode') as boolean;
  return isOffline ?? false;
}

/**
 * Set offline mode status.
 */
export async function handleSetOfflineMode(isOffline: boolean): Promise<void> {
  await storage.setItem('local:isOfflineMode', isOffline);
}

/**
 * Get pending sync status (true if local vault has changes not yet uploaded to server).
 */
export async function handleGetHasPendingSync(): Promise<boolean> {
  const hasPendingSync = await storage.getItem('local:hasPendingSync') as boolean;
  return hasPendingSync ?? false;
}

/**
 * Set pending sync status.
 */
export async function handleSetHasPendingSync(hasPendingSync: boolean): Promise<void> {
  await storage.setItem('local:hasPendingSync', hasPendingSync);
}

/**
 * Get the encrypted vault blob directly (for merge operations).
 */
export async function handleGetEncryptedVault(): Promise<string | null> {
  return await storage.getItem('local:encryptedVault') as string | null;
}

/**
 * Store the encrypted vault blob with pending sync flag.
 * This is the atomic operation that should be used for all local vault mutations.
 *
 * @param request Object with vaultBlob and hasPendingSync flag
 */
export async function handleStoreEncryptedVault(request: { vaultBlob: string; hasPendingSync: boolean }): Promise<void> {
  await storage.setItem('local:encryptedVault', request.vaultBlob);
  await storage.setItem('local:hasPendingSync', request.hasPendingSync);
}
