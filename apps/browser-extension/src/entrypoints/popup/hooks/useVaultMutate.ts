import { useCallback, useRef, useState } from 'react';
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
 * 2. Save encrypted vault locally and mark as dirty (increments mutation sequence)
 * 3. Trigger sync which handles: upload, merge if needed, offline mode
 *
 * The mutation sequence is used for race detection:
 * - Each mutation increments the sequence
 * - Sync captures sequence at start, only clears dirty if sequence unchanged
 * - This ensures we never lose local changes during concurrent operations
 */
export function useVaultMutate(): {
    executeVaultMutation: (operation: () => Promise<void>, options?: VaultMutationOptions) => Promise<void>;
    executeVaultMutationAsync: (operation: () => Promise<void>) => Promise<void>;
    isLoading: boolean;
    syncStatus: string;
    } {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const dbContext = useDb();
  const { syncVault } = useVaultSync();

  // Track if a sync is currently in progress
  const isSyncingRef = useRef(false);

  /**
   * Execute the provided operation and save locally.
   * Atomically increments mutation sequence and marks dirty.
   */
  const saveLocally = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    // Execute the provided operation (e.g. create/update/delete credential)
    await operation();

    // Export and encrypt the updated vault
    const base64Vault = dbContext.sqliteClient!.exportToBase64();
    const encryptionKey = await sendMessage('GET_ENCRYPTION_KEY', {}, 'background') as string;
    const encryptedVaultBlob = await EncryptionUtility.symmetricEncrypt(
      base64Vault,
      encryptionKey
    );

    // Store the updated vault locally, mark dirty, increment mutation sequence
    await sendMessage('STORE_ENCRYPTED_VAULT', {
      vaultBlob: encryptedVaultBlob,
      markDirty: true
    }, 'background');

    // Refresh the sync state in React
    await dbContext.refreshSyncState();
  }, [dbContext]);

  /**
   * Trigger a sync cycle. If sync is already in progress, it will be queued.
   * After sync completes, checks if more mutations happened and re-syncs if needed.
   */
  const triggerSync = useCallback(async (): Promise<void> => {
    if (isSyncingRef.current) {
      // Sync already in progress - it will re-sync if dirty when done
      return;
    }

    isSyncingRef.current = true;

    try {
      await syncVault({
        /**
         * Handle successful sync completion.
         */
        onSuccess: async () => {
          // Refresh state from storage
          await dbContext.refreshSyncState();

          // Check if still dirty (more mutations during sync)
          const isDirty = await sendMessage('GET_SYNC_STATE', {}, 'background') as { isDirty: boolean };
          if (isDirty.isDirty) {
            isSyncingRef.current = false;
            // Re-sync to pick up new changes
            await triggerSync();
          }
        },
        /**
         * Handle offline mode - local save succeeded.
         */
        onOffline: () => {
          // Offline mode - local save succeeded, will sync when back online
        },
        /**
         * Handle sync errors.
         * @param error - Error message from sync
         */
        onError: (error) => {
          console.error('Background sync error:', error);
        }
      });
    } catch (error) {
      console.error('Error during background sync:', error);
    } finally {
      isSyncingRef.current = false;
    }
  }, [dbContext, syncVault]);

  /**
   * Execute a vault mutation asynchronously: save locally immediately, then
   * trigger sync in background. This doesn't block the UI.
   */
  const executeVaultMutationAsync = useCallback(async (
    operation: () => Promise<void>
  ): Promise<void> => {
    // 1. Execute mutation and save locally (fast, doesn't block)
    await saveLocally(operation);

    // 2. Trigger sync in background
    void triggerSync();
  }, [saveLocally, triggerSync]);

  /**
   * Execute a vault mutation: save locally, then sync with server.
   *
   * The sync handles all scenarios:
   * - Online + same revision + isDirty → upload
   * - Online + server newer + isDirty → merge + upload
   * - Offline → changes are safe locally, will sync when back online
   */
  const executeVaultMutation = useCallback(async (
    operation: () => Promise<void>,
    options: VaultMutationOptions = {}
  ) => {
    try {
      setIsLoading(true);
      setSyncStatus(t('common.savingChangesToVault'));

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
        onSuccess: async () => {
          // Refresh state from storage
          await dbContext.refreshSyncState();
          options.onSuccess?.();
        },
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
  }, [dbContext, saveLocally, syncVault, t]);

  return {
    executeVaultMutation,
    executeVaultMutationAsync,
    isLoading,
    syncStatus,
  };
}
