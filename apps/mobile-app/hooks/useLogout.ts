import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { useDb } from '@/context/DbContext';
import { useWebApi } from '@/context/WebApiContext';

type UseLogoutReturn = {
  /**
   * User-initiated logout (e.g., user clicks logout button).
   * Shows confirmation dialog and warns about unsynced changes.
   * Clears ALL data including vault.
   */
  logoutUserInitiated: () => Promise<void>;

  /**
   * Forced logout (e.g., corrupted state, incompatible vault version).
   * Logs out immediately without confirmation dialog.
   * Clears ALL data including vault.
   */
  logoutForced: () => Promise<void>;
};

/**
 * Hook for handling logout across the app.
 * Provides consistent logout behavior with:
 * - Warning about unsynced changes (isDirty check)
 * - Confirmation dialog for user-initiated logout
 * - Token revocation
 * - Complete auth and vault data clearance
 *
 * Usage:
 * ```ts
 * const { logoutUserInitiated, logoutForced } = useLogout();
 *
 * // For user clicking logout button:
 * await logoutUserInitiated();
 *
 * // For error scenarios requiring immediate logout:
 * await logoutForced();
 * ```
 */
export function useLogout(): UseLogoutReturn {
  const { t } = useTranslation();
  const { clearAuthUserInitiated } = useAuth();
  const { isDirty } = useDb();
  const webApi = useWebApi();

  /**
   * Perform the actual logout - revokes tokens and clears auth.
   * Internal function used by both logout methods.
   */
  const performLogout = useCallback(async (): Promise<void> => {
    try {
      await webApi.revokeTokens();
    } catch (error) {
      console.error('Error revoking tokens:', error);
      // Continue with logout even if revoke fails
    }
    await clearAuthUserInitiated();
    router.replace('/login');
  }, [webApi, clearAuthUserInitiated]);

  /**
   * Forced logout - logs out immediately without confirmation.
   * Use for error scenarios like corrupted state or incompatible vault version.
   */
  const logoutForced = useCallback(async (): Promise<void> => {
    await performLogout();
  }, [performLogout]);

  /**
   * User-initiated logout - shows confirmation dialog.
   * Shows warning if there are unsynced changes, otherwise shows normal confirmation.
   */
  const logoutUserInitiated = useCallback(async (): Promise<void> => {
    if (isDirty) {
      // Show warning about unsynced changes
      Alert.alert(
        t('logout.unsyncedChangesTitle'),
        t('logout.unsyncedChangesWarning'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('logout.logoutAnyway'),
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
    } else {
      // Show normal confirmation dialog
      Alert.alert(
        t('auth.logout'),
        t('auth.confirmLogout'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('auth.logout'),
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
    }
  }, [isDirty, t, performLogout]);

  return {
    logoutUserInitiated,
    logoutForced,
  };
}
