import { useCallback, useRef } from 'react';

import { VaultAuthenticationError } from '@/utils/types/errors/VaultAuthenticationError';
import { useTranslation } from '@/hooks/useTranslation';

import { useApp } from '@/context/AppContext';
import { useDb } from '@/context/DbContext';
import NativeVaultManager from '@/specs/NativeVaultManager';
import { VaultVersionIncompatibleError } from '@/utils/types/errors/VaultVersionIncompatibleError';
import { VaultSyncErrorCode, getVaultSyncErrorCode } from '@/utils/types/errors/VaultSyncErrorCodes';
import { VaultMergeService } from '@/utils/VaultMergeService';

/**
 * Sync state tracking for race detection and offline support.
 */
export type SyncState = {
  isDirty: boolean;
  mutationSequence: number;
  serverRevision: number;
  isSyncing: boolean;
};

/**
 * Utility function to ensure a minimum time has elapsed for an operation
 */
const withMinimumDelay = async <T>(operation: () => Promise<T>, minDelayMs: number): Promise<T> => {
  const startTime = Date.now();
  const result = await operation();
  const elapsedTime = Date.now() - startTime;

  if (elapsedTime < minDelayMs) {
    await new Promise(resolve => setTimeout(resolve, minDelayMs - elapsedTime));
  }

  return result;
};

type VaultSyncOptions = {
  onSuccess?: (hasNewVault: boolean) => void;
  onError?: (error: string) => void;
  onStatus?: (message: string) => void;
  onOffline?: () => void;
  onUpgradeRequired?: () => void;
  abortSignal?: AbortSignal;
  /** Internal retry count for race detection */
  _retryCount?: number;
};

/**
 * Maximum number of sync retries for race detection.
 */
const MAX_SYNC_RETRIES = 3;

/**
 * Hook to sync the vault with the server.
 *
 * Implements the offline sync pattern from OFFLINE_MODE.md:
 * 1. Check isDirty before overwriting local vault
 * 2. Upload pending changes - sync is responsible for uploading, not just downloading
 * 3. Race detection - use mutation sequence to detect concurrent edits
 * 4. Recursive retry - if race detected, restart sync
 */
export const useVaultSync = (): {
  syncVault: (options?: VaultSyncOptions) => Promise<boolean>;
  getSyncState: () => Promise<SyncState>;
} => {
  const { t } = useTranslation();
  const app = useApp();
  const dbContext = useDb();
  const syncInProgressRef = useRef(false);

  const getSyncState = useCallback(async (): Promise<SyncState> => {
    return await NativeVaultManager.getSyncState();
  }, []);

  const syncVault = useCallback(async (options: VaultSyncOptions = {}): Promise<boolean> => {
    const { onSuccess, onError, onStatus, onOffline, onUpgradeRequired, abortSignal, _retryCount = 0 } = options;

    // Prevent infinite recursion
    if (_retryCount >= MAX_SYNC_RETRIES) {
      console.error('[useVaultSync] Max sync retries reached, aborting');
      onError?.('Sync failed after multiple retries');
      return false;
    }

    // Prevent concurrent syncs (only for the first call, not retries)
    if (_retryCount === 0 && syncInProgressRef.current) {
      console.log('[useVaultSync] Sync already in progress, skipping');
      return false;
    }

    if (_retryCount === 0) {
      syncInProgressRef.current = true;
    }

    try {
      // Check if operation was aborted
      if (abortSignal?.aborted) {
        console.debug('VaultSync: Operation aborted before starting');
        return false;
      }

      const { isLoggedIn } = await app.initializeAuth();

      if (!isLoggedIn) {
        return false;
      }

      if (abortSignal?.aborted) {
        console.debug('VaultSync: Operation aborted after auth check');
        return false;
      }

      // Mark as syncing
      await NativeVaultManager.setIsSyncing(true);

      onStatus?.(t('vault.checkingVaultUpdates'));

      // Capture sync state at start for race detection
      let versionCheck;
      try {
        versionCheck = await NativeVaultManager.checkVaultVersion();
      } catch (err) {
        const errorCode = getVaultSyncErrorCode(err);
        return await handleSyncError(err, errorCode, app, t, onError, onOffline);
      }

      const { isNewVersionAvailable, serverRevision, syncState } = versionCheck;
      const mutationSeqAtStart = syncState.mutationSequence;
      const isDirty = syncState.isDirty;

      if (abortSignal?.aborted) {
        console.debug('VaultSync: Operation aborted after version check');
        return false;
      }

      if (serverRevision > syncState.serverRevision) {
        // Server has newer vault - download it
        onStatus?.(t('vault.syncingUpdatedVault'));

        try {
          const serverVaultResponse = await NativeVaultManager.fetchServerVault();

          if (isDirty) {
            // CRITICAL: We have local changes - must merge!
            console.log('[useVaultSync] Local changes detected, merging with server vault');
            onStatus?.(t('vault.mergingVault'));

            const localVault = await NativeVaultManager.getEncryptedDatabase();
            if (!localVault) {
              throw new Error('No local vault available for merge');
            }

            // Perform LWW merge
            // Note: For now, VaultMergeService returns localVault as placeholder.
            // Full merge implementation will use Rust core library via native bindings.
            const mergedVault = await VaultMergeService.mergeVaults(
              localVault,
              serverVaultResponse.vault.blob,
              null // Encryption key not needed for current placeholder implementation
            );

            // Store merged vault with race detection
            const storeResult = await NativeVaultManager.storeEncryptedVaultWithSyncState(
              mergedVault,
              false, // Not marking dirty - this is a sync operation
              null, // Server revision will be updated after upload
              mutationSeqAtStart
            );

            if (!storeResult.success) {
              // Race detected - concurrent mutation happened during sync
              console.log('[useVaultSync] Race detected during merge, retrying sync');
              await NativeVaultManager.setIsSyncing(false);
              return syncVault({ ...options, _retryCount: _retryCount + 1 });
            }

            // Upload merged vault to server
            const uploadResult = await NativeVaultManager.uploadVault();

            if (uploadResult.success) {
              // Mark vault clean only if no mutations happened during upload
              await NativeVaultManager.markVaultClean(mutationSeqAtStart, uploadResult.newRevisionNumber);
            } else if (uploadResult.status === 2) {
              // Vault outdated - server moved forward, retry sync
              console.log('[useVaultSync] Vault outdated during upload, retrying sync');
              await NativeVaultManager.setIsSyncing(false);
              return syncVault({ ...options, _retryCount: _retryCount + 1 });
            } else {
              console.warn('[useVaultSync] Failed to upload merged vault:', uploadResult.error);
              // Keep isDirty true for next sync attempt
            }
          } else {
            // No local changes - safe to overwrite with server vault
            const storeResult = await NativeVaultManager.storeEncryptedVaultWithSyncState(
              serverVaultResponse.vault.blob,
              false,
              serverRevision,
              mutationSeqAtStart
            );

            if (!storeResult.success) {
              // Race detected - mutation happened during download
              console.log('[useVaultSync] Race detected during download, retrying sync');
              await NativeVaultManager.setIsSyncing(false);
              return syncVault({ ...options, _retryCount: _retryCount + 1 });
            }
          }
        } catch (err) {
          console.error('[useVaultSync] Error during vault download/merge:', err);
          const errorCode = getVaultSyncErrorCode(err);
          await NativeVaultManager.setIsSyncing(false);
          return await handleSyncError(err, errorCode, app, t, onError, onOffline);
        }
      } else if (serverRevision === syncState.serverRevision && isDirty) {
        // Local changes at same revision - upload them!
        console.log('[useVaultSync] Uploading local changes to server');
        onStatus?.(t('vault.uploadingChanges'));

        try {
          const uploadResult = await NativeVaultManager.uploadVault();

          if (uploadResult.success) {
            // Mark vault clean only if no mutations happened during upload
            await NativeVaultManager.markVaultClean(mutationSeqAtStart, uploadResult.newRevisionNumber);
          } else if (uploadResult.status === 2) {
            // Vault outdated - another device uploaded, retry to merge
            console.log('[useVaultSync] Vault outdated, another device uploaded, retrying sync');
            await NativeVaultManager.setIsSyncing(false);
            return syncVault({ ...options, _retryCount: _retryCount + 1 });
          } else {
            console.warn('[useVaultSync] Failed to upload vault:', uploadResult.error);
            // Keep isDirty true for next sync attempt
          }
        } catch (err) {
          console.error('[useVaultSync] Error during vault upload:', err);
          const errorCode = getVaultSyncErrorCode(err);
          await NativeVaultManager.setIsSyncing(false);
          return await handleSyncError(err, errorCode, app, t, onError, onOffline);
        }
      }
      // else: Already in sync - nothing to do

      // Mark syncing as complete
      await NativeVaultManager.setIsSyncing(false);

      // Unlock vault to refresh database connection
      try {
        await NativeVaultManager.unlockVault();

        // Check if the vault needs migration
        if (await dbContext.hasPendingMigrations()) {
          onUpgradeRequired?.();
          return false;
        }

        onSuccess?.(isNewVersionAvailable);

        // Register credential identities after sync
        try {
          await NativeVaultManager.registerCredentialIdentities();
        } catch (error) {
          console.warn('Vault sync: Failed to register credential identities:', error);
        }

        return isNewVersionAvailable;
      } catch (err) {
        if (err instanceof VaultVersionIncompatibleError) {
          await app.logout(t(err.message));
          return false;
        }

        console.error('Failed to unlock vault:', err);
        throw new Error(t('common.errors.unknownErrorTryAgain'));
      }
    } catch (err) {
      console.error('Vault sync error:', err);

      // Ensure syncing flag is cleared on error
      try {
        await NativeVaultManager.setIsSyncing(false);
      } catch {
        // Ignore
      }

      // Handle authentication errors
      if (err instanceof VaultAuthenticationError) {
        await app.logout(err.message);
        return false;
      }

      if (err instanceof VaultVersionIncompatibleError) {
        await app.logout(t(err.message));
        return false;
      }

      // Check if it's a vault sync error with error code
      const errorCode = getVaultSyncErrorCode(err);
      if (errorCode) {
        return await handleSyncError(err, errorCode, app, t, onError, onOffline);
      }

      const errorMessage = err instanceof Error ? err.message : t('common.errors.unknownError');
      onError?.(errorMessage);
      return false;
    } finally {
      if (_retryCount === 0) {
        syncInProgressRef.current = false;
      }
    }
  }, [app, dbContext, t]);

  return { syncVault, getSyncState };
};

/**
 * Handle sync errors by mapping error codes to appropriate actions.
 */
async function handleSyncError(
  err: unknown,
  errorCode: VaultSyncErrorCode | null,
  app: ReturnType<typeof useApp>,
  t: (key: string) => string,
  onError?: (error: string) => void,
  onOffline?: () => void
): Promise<boolean> {
  switch (errorCode) {
    case VaultSyncErrorCode.SESSION_EXPIRED:
    case VaultSyncErrorCode.AUTHENTICATION_FAILED:
      await app.logout('Your session has expired. Please login again.');
      return false;

    case VaultSyncErrorCode.PASSWORD_CHANGED:
      await app.logout(t('vault.errors.passwordChanged'));
      return false;

    case VaultSyncErrorCode.CLIENT_VERSION_NOT_SUPPORTED:
      onError?.(t('vault.errors.versionNotSupported'));
      return false;

    case VaultSyncErrorCode.SERVER_VERSION_NOT_SUPPORTED:
      await app.logout(t('vault.errors.serverVersionNotSupported'));
      return false;

    case VaultSyncErrorCode.SERVER_UNAVAILABLE:
    case VaultSyncErrorCode.NETWORK_ERROR:
    case VaultSyncErrorCode.TIMEOUT:
      await NativeVaultManager.setOfflineMode(true);
      onOffline?.();
      // Return true to continue with local vault
      return true;

    default:
      // Unknown error
      const errorMessage = err instanceof Error ? err.message : t('common.errors.unknownError');
      onError?.(errorMessage);
      return false;
  }
}
