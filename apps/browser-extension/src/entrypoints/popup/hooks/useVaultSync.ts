import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { sendMessage } from 'webext-bridge/popup';

import { useApp } from '@/entrypoints/popup/context/AppContext';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useWebApi } from '@/entrypoints/popup/context/WebApiContext';

import type { EncryptionKeyDerivationParams } from '@/utils/dist/shared/models/metadata';
import type { VaultResponse } from '@/utils/dist/shared/models/webapi';
import { EncryptionUtility } from '@/utils/EncryptionUtility';
import { NetworkError } from '@/utils/types/errors/NetworkError';
import { VaultVersionIncompatibleError } from '@/utils/types/errors/VaultVersionIncompatibleError';
import type { VaultUploadResponse } from '@/utils/types/messaging/VaultUploadResponse';
import { vaultMergeService } from '@/utils/VaultMergeService';

/**
 * Utility function to ensure a minimum time has elapsed for an operation
 */
const withMinimumDelay = async <T>(
  operation: () => Promise<T>,
  minDelayMs: number,
  enableDelay: boolean = true
): Promise<T> => {
  if (!enableDelay) {
    // If delay is disabled, return the result immediately.
    return operation();
  }

  const startTime = Date.now();
  const result = await operation();
  const elapsedTime = Date.now() - startTime;

  if (elapsedTime < minDelayMs) {
    await new Promise(resolve => setTimeout(resolve, minDelayMs - elapsedTime));
  }

  return result;
};

type VaultSyncOptions = {
  initialSync?: boolean;
  onSuccess?: (hasNewVault: boolean) => void;
  onError?: (error: string) => void;
  onStatus?: (message: string) => void;
  onOffline?: () => void;
  onUpgradeRequired?: () => void;
}

/**
 * Hook to sync the vault with the server.
 * Supports offline mode: if server is unavailable, continues with local vault.
 */
export const useVaultSync = (): { syncVault: (options?: VaultSyncOptions) => Promise<boolean>; } => {
  const { t } = useTranslation();
  const app = useApp();
  const dbContext = useDb();
  const webApi = useWebApi();

  /**
   * Check for pending migrations and trigger upgrade if needed.
   * @returns True if upgrade is required (caller should return), false otherwise.
   */
  const checkAndHandleUpgrade = useCallback(async (onUpgradeRequired?: () => void): Promise<boolean> => {
    if (await dbContext.hasPendingMigrations()) {
      onUpgradeRequired?.();
      return true;
    }
    return false;
  }, [dbContext]);

  /**
   * Handle entering offline mode.
   * @returns True to indicate success (caller should return true).
   */
  const enterOfflineMode = useCallback(async (
    onStatus?: (message: string) => void,
    onOffline?: () => void,
    onSuccess?: (hasNewVault: boolean) => void
  ): Promise<boolean> => {
    await dbContext.setIsOffline(true);
    onStatus?.(t('common.offlineMode'));
    onOffline?.();
    onSuccess?.(false);
    return true;
  }, [dbContext, t]);

  const syncVault = useCallback(async (options: VaultSyncOptions = {}) => {
    const { initialSync = false, onSuccess, onError, onStatus, onOffline, onUpgradeRequired } = options;

    // For the initial sync, we add an artifical delay to various steps which makes it feel more fluid.
    const enableDelay = initialSync;

    try {
      const isLoggedIn = await app.initializeAuth();

      if (!isLoggedIn) {
        // Not authenticated, return false immediately
        return false;
      }

      // Check app status and vault revision
      onStatus?.(t('common.checkingVaultUpdates'));
      const statusResponse = await withMinimumDelay(() => webApi.getStatus(), 300, enableDelay);

      // Check if server is actually available, 0.0.0 indicates connection error which triggers offline mode.
      if (statusResponse.serverVersion === '0.0.0') {
        // Server is unavailable - enter offline mode if we have a local vault
        if (dbContext.dbAvailable) {
          return enterOfflineMode(onStatus, onOffline, onSuccess);
        } else {
          // No local vault available, can't operate offline
          onError?.(t('common.errors.serverNotAvailable'));
          return false;
        }
      }

      const statusError = webApi.validateStatusResponse(statusResponse);
      if (statusError) {
        onError?.(t('common.errors.' + statusError));
        return false;
      }

      // Check if the SRP salt has changed compared to locally stored encryption key derivation params
      const storedEncryptionParams = await sendMessage('GET_ENCRYPTION_KEY_DERIVATION_PARAMS', {}, 'background') as EncryptionKeyDerivationParams | null;
      if (storedEncryptionParams && statusResponse.srpSalt && statusResponse.srpSalt !== storedEncryptionParams.salt) {
        /**
         * Server SRP salt has changed compared to locally stored value, which means the user has changed
         * their password since the last time they logged in. This means that the local encryption key is no
         * longer valid and the user needs to re-authenticate. We trigger a logout but do not revoke tokens
         * as these were already revoked by the server upon password change.
         */
        await app.logout(t('common.errors.passwordChanged'));
        return false;
      }

      // We have a valid connection to the server - exit offline mode if we were in it
      if (dbContext.isOffline) {
        await dbContext.setIsOffline(false);
      }

      // Compare vault revisions
      const vaultMetadata = await dbContext.getVaultMetadata();
      const vaultRevisionNumber = vaultMetadata?.vaultRevisionNumber ?? 0;

      if (statusResponse.vaultRevision > vaultRevisionNumber) {
        /*
         * Server has a newer vault. Before overwriting local vault, check if we have
         * pending local changes that need to be merged.
         */
        const hasPendingSync = await sendMessage('GET_HAS_PENDING_SYNC', {}, 'background') as boolean;

        onStatus?.(t('common.syncingUpdatedVault'));
        const vaultResponseJson = await withMinimumDelay(() => webApi.get<VaultResponse>('Vault'), 1000, enableDelay) as VaultResponse;

        try {
          // Get encryption key from background worker
          const encryptionKey = await sendMessage('GET_ENCRYPTION_KEY', {}, 'background') as string;

          if (hasPendingSync) {
            /*
             * We have local changes that haven't been synced to server.
             * Merge local vault with server vault, then upload the merged result.
             */
            onStatus?.(t('common.mergingVaultChanges'));
            const localEncryptedVault = await sendMessage('GET_ENCRYPTED_VAULT', {}, 'background') as string | null;

            if (localEncryptedVault) {
              // Decrypt both vaults
              const localDecrypted = await EncryptionUtility.symmetricDecrypt(localEncryptedVault, encryptionKey);
              const serverDecrypted = await EncryptionUtility.symmetricDecrypt(vaultResponseJson.vault.blob, encryptionKey);

              // Perform LWW merge
              const mergeResult = await vaultMergeService.merge(localDecrypted, serverDecrypted);

              if (mergeResult.success) {
                console.info('Vault merge during sync completed:', mergeResult.stats);

                // Re-encrypt the merged vault
                const mergedEncryptedVault = await EncryptionUtility.symmetricEncrypt(
                  mergeResult.mergedVaultBase64,
                  encryptionKey
                );

                // Update the vault response with the merged blob
                vaultResponseJson.vault.blob = mergedEncryptedVault;

                /*
                 * Upload the merged vault to server.
                 * Use the server's revision as our current revision since we just fetched it.
                 */
                onStatus?.(t('common.uploadingVault'));
                const uploadResponse = await sendMessage('UPLOAD_VAULT', {
                  vaultBlob: mergedEncryptedVault
                }, 'background') as VaultUploadResponse;

                if (uploadResponse.success && uploadResponse.status === 0) {
                  // Upload succeeded - update revision
                  await dbContext.setCurrentVaultRevisionNumber(uploadResponse.newRevisionNumber!);
                  await dbContext.setHasPendingSync(false);
                } else {
                  console.error('Failed to upload merged vault:', uploadResponse.error);
                  // Keep hasPendingSync true so we retry later
                }
              } else {
                console.error('Vault merge failed during sync, using server vault');
              }
            }
          }

          await dbContext.initializeDatabase(vaultResponseJson, encryptionKey);

          // Check if upgrade is required after initializing database
          if (await checkAndHandleUpgrade(onUpgradeRequired)) {
            return false;
          }

          onSuccess?.(true);
          return true;
        } catch (error) {
          // Check if it's a version-related error (app needs to be updated)
          if (error instanceof VaultVersionIncompatibleError) {
            await app.logout(error.message);
            return false;
          }
          // Vault could not be decrypted, throw an error
          throw new Error('Vault could not be decrypted, if the problem persists please logout and login again.');
        }
      } else if (statusResponse.vaultRevision === vaultRevisionNumber) {
        /*
         * Server and local vault are at the same revision.
         * If we have pending local changes, upload them now.
         */
        const hasPendingSync = await sendMessage('GET_HAS_PENDING_SYNC', {}, 'background') as boolean;
        if (hasPendingSync) {
          onStatus?.(t('common.uploadingVault'));

          // Get the current encrypted vault and upload it
          const encryptedVault = await sendMessage('GET_ENCRYPTED_VAULT', {}, 'background') as string | null;

          if (encryptedVault) {
            const uploadResponse = await sendMessage('UPLOAD_VAULT', {
              vaultBlob: encryptedVault
            }, 'background') as VaultUploadResponse;

            if (uploadResponse.success && uploadResponse.status === 0) {
              // Upload succeeded - update revision and clear pending flag
              await dbContext.setCurrentVaultRevisionNumber(uploadResponse.newRevisionNumber!);
              await dbContext.setHasPendingSync(false);
            } else if (uploadResponse.status === 2) {
              /*
               * Server returned Outdated - another device uploaded first.
               * Recursively call syncVault to fetch, merge, and retry.
               */
              return syncVault(options);
            } else {
              console.error('Failed to upload pending vault:', uploadResponse.error);
              // Keep hasPendingSync true so we retry later
            }
          }

          onSuccess?.(false);
          return true;
        }
      }

      // Check if upgrade is required (for paths that didn't initialize a new database)
      if (await checkAndHandleUpgrade(onUpgradeRequired)) {
        return false;
      }

      await withMinimumDelay(() => Promise.resolve(onSuccess?.(false)), 300, enableDelay);
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during vault sync';
      console.error('Vault sync error:', err);

      // Check if it's a version-related error (app needs to be updated)
      if (err instanceof VaultVersionIncompatibleError) {
        await app.logout(errorMessage);
        return false;
      }

      // Check if it's a network error - enter offline mode if we have a local vault
      if (err instanceof NetworkError) {
        if (dbContext.dbAvailable) {
          return enterOfflineMode(onStatus, onOffline, onSuccess);
        }
      }

      onError?.(errorMessage);
      return false;
    }
  }, [app, dbContext, webApi, t, checkAndHandleUpgrade, enterOfflineMode]);

  return { syncVault };
};
