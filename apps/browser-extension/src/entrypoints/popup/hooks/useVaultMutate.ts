import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendMessage } from 'webext-bridge/popup';

import { useDb } from '@/entrypoints/popup/context/DbContext';

import { EncryptionUtility } from '@/utils/EncryptionUtility';

import { useVaultSync } from './useVaultSync';

type VaultMutationOptions = {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to execute a vault mutation.
 *
 * Flow:
 * 1. Execute the mutation on local database
 * 2. Save encrypted vault locally with hasPendingSync=true (atomic)
 * 3. Trigger sync which handles: upload, merge if needed, offline mode
 *
 * LWW (Last-Write-Wins) merge ensures conflicts are resolved by UpdatedAt timestamp,
 * so we don't need to pre-sync before mutations.
 */
export function useVaultMutate(): {
    executeVaultMutation: (operation: () => Promise<void>, options?: VaultMutationOptions) => Promise<void>;
    isLoading: boolean;
    syncStatus: string;
    } {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const dbContext = useDb();
  const { syncVault } = useVaultSync();

  /**
   * Execute the provided operation and save locally with pending sync flag.
   */
  const saveLocally = useCallback(async (operation: () => Promise<void>): Promise<void> => {
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
   * Execute a vault mutation: save locally, then sync.
   *
   * The sync handles all scenarios:
   * - Online + same revision + hasPendingSync → upload
   * - Online + server newer + hasPendingSync → merge + upload
   * - Offline → changes are safe locally, will sync when back online
   */
  const executeVaultMutation = useCallback(async (
    operation: () => Promise<void>,
    options: VaultMutationOptions = {}
  ) => {
    try {
      setIsLoading(true);

      // 1. Execute mutation and save locally (always succeeds if no exceptions)
      await saveLocally(operation);

      // 2. Sync with server (handles upload, merge, offline - everything)
      await syncVault({
        /**
         * Handle status updates during sync.
         * @param message - Status message to display
         */
        onStatus: (message) => setSyncStatus(message),
        /**
         * Handle successful sync completion.
         */
        onSuccess: () => options.onSuccess?.(),
        /**
         * Handle offline mode - local save succeeded.
         */
        onOffline: () => {
          // Local save succeeded, user can continue working offline
          setSyncStatus(t('common.offlineModeSaved'));
          options.onSuccess?.();
        },
        /**
         * Handle sync errors.
         * @param error - Error message from sync
         */
        onError: (error) => options.onError?.(new Error(error))
      });
    } catch (error) {
      console.error('Error during vault mutation:', error);
      options.onError?.(error instanceof Error ? error : new Error(t('common.errors.unknownError')));
    } finally {
      setIsLoading(false);
      setSyncStatus('');
    }
  }, [saveLocally, syncVault, t]);

  return {
    executeVaultMutation,
    isLoading,
    syncStatus,
  };
}
