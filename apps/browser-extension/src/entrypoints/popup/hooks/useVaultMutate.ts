import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendMessage } from 'webext-bridge/popup';

import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useWebApi } from '@/entrypoints/popup/context/WebApiContext';

import type { VaultResponse } from '@/utils/dist/shared/models/webapi';
import { EncryptionUtility } from '@/utils/EncryptionUtility';
import { UploadVaultRequest } from '@/utils/types/messaging/UploadVaultRequest';
import { VaultUploadResponse as messageVaultUploadResponse } from '@/utils/types/messaging/VaultUploadResponse';
import { vaultMergeService } from '@/utils/VaultMergeService';

import { useVaultSync } from './useVaultSync';

type VaultMutationOptions = {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  skipSyncCheck?: boolean;
}

/**
 * Hook to execute a vault mutation.
 * Supports offline mode with LWW merge when coming back online.
 */
export function useVaultMutate() : {
  executeVaultMutation: (operation: () => Promise<void>, options?: VaultMutationOptions) => Promise<void>;
  isLoading: boolean;
  syncStatus: string;
  } {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState(t('common.syncingVault'));
  const dbContext = useDb();
  const webApi = useWebApi();
  const { syncVault } = useVaultSync();

  /**
   * Execute the provided operation and save locally (for offline mode)
   */
  const executeMutateOperationLocal = useCallback(async (
    operation: () => Promise<void>,
  ) : Promise<void> => {
    setSyncStatus(t('common.savingChangesToVault'));

    // Execute the provided operation (e.g. create/update/delete credential)
    await operation();

    // Export and encrypt the updated vault
    const base64Vault = dbContext.sqliteClient!.exportToBase64();
    const encryptionKey = await sendMessage('GET_ENCRYPTION_KEY', {}, 'background') as string;
    const encryptedVaultBlob = await EncryptionUtility.symmetricEncrypt(
      base64Vault,
      encryptionKey
    );

    // Store the updated vault locally with pending sync flag (atomic operation)
    await sendMessage('STORE_ENCRYPTED_VAULT', {
      vaultBlob: encryptedVaultBlob,
      hasPendingSync: true
    }, 'background');

    // Update local state to reflect pending sync
    await dbContext.setHasPendingSync(true);
  }, [dbContext, t]);

  /**
   * Upload the vault to the server, handling conflicts with LWW merge
   */
  const uploadVaultWithMerge = useCallback(async (
    options: VaultMutationOptions,
    retryCount: number = 0
  ) : Promise<void> => {
    const MAX_RETRIES = 3;

    if (retryCount >= MAX_RETRIES) {
      throw new Error(t('common.errors.syncConflictMaxRetries'));
    }

    setSyncStatus(t('common.uploadingVaultToServer'));

    // Get the current local vault
    const base64Vault = dbContext.sqliteClient!.exportToBase64();
    const encryptionKey = await sendMessage('GET_ENCRYPTION_KEY', {}, 'background') as string;
    const encryptedVaultBlob = await EncryptionUtility.symmetricEncrypt(
      base64Vault,
      encryptionKey
    );

    const request: UploadVaultRequest = {
      vaultBlob: encryptedVaultBlob,
    };

    try {
      const response = await sendMessage('UPLOAD_VAULT', request, 'background') as messageVaultUploadResponse;

      if (response.status === 0 && response.newRevisionNumber) {
        // Success - update local revision number, clear pending sync, and exit offline mode
        await dbContext.setCurrentVaultRevisionNumber(response.newRevisionNumber);
        await dbContext.setHasPendingSync(false);
        if (dbContext.isOffline) {
          await dbContext.setIsOffline(false);
        }
        options.onSuccess?.();
      } else if (response.status === 2) {
        // Vault is outdated - need to merge with server vault
        setSyncStatus(t('common.mergingVaultChanges'));

        // Fetch the latest vault from server
        const serverVaultResponse = await webApi.get<VaultResponse>('Vault');
        const serverEncryptedBlob = serverVaultResponse.vault.blob;

        // Decrypt both vaults for merge
        const localDecrypted = base64Vault; // Already decrypted
        const serverDecrypted = await EncryptionUtility.symmetricDecrypt(
          serverEncryptedBlob,
          encryptionKey
        );

        // Perform LWW merge
        const mergeResult = await vaultMergeService.merge(localDecrypted, serverDecrypted);

        if (!mergeResult.success) {
          throw new Error(t('common.errors.mergeFailed'));
        }

        console.info('Vault merge completed:', mergeResult.stats);

        // Re-initialize the database with merged vault
        await dbContext.sqliteClient!.initializeFromBase64(mergeResult.mergedVaultBase64);

        // Update local revision to server's revision before retrying
        await dbContext.setCurrentVaultRevisionNumber(serverVaultResponse.vault.currentRevisionNumber);

        // Retry upload with merged vault
        await uploadVaultWithMerge(options, retryCount + 1);
      } else if (response.status === 1) {
        // Legacy merge status - should not happen with API >= 0.20.0
        throw new Error(t('common.errors.legacyMergeRequired'));
      } else {
        throw new Error(t('common.errors.unknownError'));
      }
    } catch (error) {
      // Check if it's a network error - enter offline mode
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
        await dbContext.setIsOffline(true);
        setSyncStatus(t('common.offlineModeSaved'));
        // Changes are saved locally, success from user perspective
        options.onSuccess?.();
        return;
      }
      throw error;
    }
  }, [dbContext, webApi, t]);

  /**
   * Execute the provided operation (e.g. create/update/delete credential)
   */
  const executeMutateOperation = useCallback(async (
    operation: () => Promise<void>,
    options: VaultMutationOptions
  ) : Promise<void> => {
    // First, execute the operation and save locally
    await executeMutateOperationLocal(operation);

    // If we're offline, we're done - changes are saved locally
    if (dbContext.isOffline) {
      setSyncStatus(t('common.offlineModeSaved'));
      options.onSuccess?.();
      return;
    }

    // Try to upload to server (with merge if needed)
    await uploadVaultWithMerge(options);
  }, [dbContext, executeMutateOperationLocal, uploadVaultWithMerge, t]);

  /**
   * Hook to execute a vault mutation which uploads a new encrypted vault to the server
   */
  const executeVaultMutation = useCallback(async (
    operation: () => Promise<void>,
    options: VaultMutationOptions = {}
  ) => {
    try {
      setIsLoading(true);
      setSyncStatus(t('common.checkingVaultUpdates'));

      // Skip sync check if requested (e.g., during upgrade operations)
      if (options.skipSyncCheck) {
        setSyncStatus(t('common.executingOperation'));
        await executeMutateOperation(operation, options);
        return;
      }

      // If offline, skip sync and just execute the operation locally
      if (dbContext.isOffline) {
        setSyncStatus(t('common.executingOperation'));
        await executeMutateOperation(operation, options);
        return;
      }

      await syncVault({
        /**
         * Handle the status update.
         */
        onStatus: (message) => setSyncStatus(message),
        /**
         * Handle successful vault sync and continue with vault mutation.
         */
        onSuccess: async (hasNewVault) => {
          if (hasNewVault) {
            // Vault was changed, but has now been reloaded so we can continue with the operation.
          }
          await executeMutateOperation(operation, options);
        },
        /**
         * Handle offline mode - continue with local operation.
         */
        onOffline: async () => {
          // We're now in offline mode, execute operation locally
          await executeMutateOperation(operation, options);
        },
        /**
         * Handle error during vault sync.
         */
        onError: (error) => {
          options.onError?.(new Error(error));
        }
      });
    } catch (error) {
      console.error('Error during vault mutation:', error);
      options.onError?.(error instanceof Error ? error : new Error(t('common.errors.unknownError')));
    } finally {
      setIsLoading(false);
      setSyncStatus('');
    }
  }, [syncVault, executeMutateOperation, dbContext.isOffline, t]);

  return {
    executeVaultMutation,
    isLoading,
    syncStatus,
  };
}
