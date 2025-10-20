import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { useColors } from '@/hooks/useColorScheme';
import { useVaultSync } from '@/hooks/useVaultSync';

import LoadingIndicator from '@/components/LoadingIndicator';
import { ThemedView } from '@/components/themed/ThemedView';
import { useApp } from '@/context/AppContext';
import { useDb } from '@/context/DbContext';
import NativeVaultManager from '@/specs/NativeVaultManager';

/**
 * Initialize page that handles all boot logic.
 */
export default function Initialize() : React.ReactNode {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [showSkipButton, setShowSkipButton] = useState(false);
  const hasInitialized = useRef(false);
  const skipButtonTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string>('');
  const { t } = useTranslation();
  const app = useApp();
  const { syncVault } = useVaultSync();
  const dbContext = useDb();
  const colors = useColors();

  /**
   * Update status with smart skip button logic.
   * Normalizes status by removing animation dots and manages skip button visibility.
   */
  const updateStatus = useCallback((message: string): void => {
    setStatus(message);

    // Normalize status by removing animation dots for comparison
    const normalizedMessage = message.replace(/\.+$/, '');
    const normalizedLastStatus = lastStatusRef.current.replace(/\.+$/, '');

    // Clear any existing timeout
    if (skipButtonTimeoutRef.current) {
      clearTimeout(skipButtonTimeoutRef.current);
      skipButtonTimeoutRef.current = null;
    }

    // If status changed (excluding dots), hide skip button and reset timer
    if (normalizedMessage !== normalizedLastStatus) {
      setShowSkipButton(false);
      lastStatusRef.current = message;

      // Start new timer for the new status
      if (message) {
        skipButtonTimeoutRef.current = setTimeout(() => {
          setShowSkipButton(true);
        }, 5000) as unknown as NodeJS.Timeout;
      }
    } else {
      // Same status (excluding dots) - update ref but keep timer running
      lastStatusRef.current = message;
    }
  }, []);

  /**
   * Handle offline scenario - show alert with options to open local vault or retry sync.
   */
  const handleOfflineFlow = useCallback((): void => {
    Alert.alert(
      t('app.alerts.syncIssue'),
      t('app.alerts.syncIssueMessage'),
      [
        {
          text: t('app.alerts.openLocalVault'),
          /**
           * Handle opening vault in read-only mode.
           */
          onPress: async () : Promise<void> => {
            updateStatus(t('app.status.openingVaultReadOnly'));
            const { enabledAuthMethods } = await app.initializeAuth();

            try {
              const hasEncryptedDatabase = await NativeVaultManager.hasEncryptedDatabase();

              // No encrypted database
              if (!hasEncryptedDatabase) {
                router.replace('/unlock');
                return;
              }

              // Set offline mode
              app.setOfflineMode(true);

              // FaceID not enabled
              const isFaceIDEnabled = enabledAuthMethods.includes('faceid');
              if (!isFaceIDEnabled) {
                router.replace('/unlock');
                return;
              }

              // Attempt to unlock vault
              updateStatus(t('app.status.unlockingVault'));
              const isUnlocked = await dbContext.unlockVault();

              // Vault couldn't be unlocked
              if (!isUnlocked) {
                router.replace('/unlock');
                return;
              }

              // Vault successfully unlocked - proceed with decryption
              await new Promise(resolve => setTimeout(resolve, 500));

              // Migrations pending
              if (await dbContext.hasPendingMigrations()) {
                router.replace('/upgrade');
                return;
              }

              // Success - navigate to credentials
              router.replace('/(tabs)/credentials');
            } catch (err) {
              console.error('Error during offline vault unlock:', err);
              router.replace('/unlock');
            }
          }
        },
        {
          text: t('app.alerts.retrySync'),
          /**
           * Handle retrying the connection.
           */
          onPress: () : void => {
            updateStatus(t('app.status.retryingConnection'));
            setShowSkipButton(false);

            // Clear any existing timeout
            if (skipButtonTimeoutRef.current) {
              clearTimeout(skipButtonTimeoutRef.current);
              skipButtonTimeoutRef.current = null;
            }

            // Reset status tracking
            lastStatusRef.current = '';

            /**
             * Reset the hasInitialized flag and navigate to the same route
             * to force a re-render and trigger the useEffect again
             */
            hasInitialized.current = false;
            router.replace('/initialize');
          }
        }
      ]
    );
  }, [dbContext, router, app, t, updateStatus]);

  useEffect(() => {
    // Ensure this only runs once.
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;

    /**
     * Initialize the app.
     */
    const initializeApp = async () : Promise<void> => {
      /**
       * Handle vault unlocking process.
       */
      async function handleVaultUnlock() : Promise<void> {
        const { enabledAuthMethods } = await app.initializeAuth();

        try {
          const hasEncryptedDatabase = await NativeVaultManager.hasEncryptedDatabase();
          if (hasEncryptedDatabase) {
            const isFaceIDEnabled = enabledAuthMethods.includes('faceid');
            if (!isFaceIDEnabled) {
              router.replace('/unlock');
              return;
            }

            updateStatus(t('app.status.unlockingVault'));
            const isUnlocked = await dbContext.unlockVault();
            if (isUnlocked) {
              await new Promise(resolve => setTimeout(resolve, 500));

              // Check if the vault is up to date, if not, redirect to the upgrade page.
              if (await dbContext.hasPendingMigrations()) {
                router.replace('/upgrade');
                return;
              }

              router.replace('/(tabs)/credentials');
              return;
            }

            router.replace('/unlock');
            return;
          } else {
            router.replace('/unlock');
            return;
          }
        } catch (err) {
          console.error('Error during vault unlock:', err);
          router.replace('/unlock');
          return;
        }
      }

      /**
       * Initialize the app.
       */
      const initialize = async () : Promise<void> => {
        const { isLoggedIn } = await app.initializeAuth();

        if (!isLoggedIn) {
          router.replace('/login');
          return;
        }

        // First perform vault sync
        await syncVault({
          initialSync: true,
          /**
           * Handle the status update.
           */
          onStatus: (message) => {
            updateStatus(message);
          },
          /**
           * Handle successful vault sync and continue with vault unlock flow.
           */
          onSuccess: async () => {
          // Continue with the rest of the flow after successful sync
            handleVaultUnlock();
          },
          /**
           * Handle offline state and prompt user for action.
           */
          onOffline: () => {
            handleOfflineFlow();
          },
          /**
           * Handle error during vault sync.
           */
          onError: async (error: string) => {
            /**
             * Authentication errors are already handled in useVaultSync
             * Show modal with error message for other errors
             */
            Alert.alert(t('common.error'), error);
            router.replace('/unlock');
            return;
          },
          /**
           * On upgrade required.
           */
          onUpgradeRequired: () : void => {
            router.replace('/upgrade');
          },
        });
      };

      initialize();
    };

    initializeApp();

    // Cleanup timeout on unmount
    return (): void => {
      if (skipButtonTimeoutRef.current) {
        clearTimeout(skipButtonTimeoutRef.current);
      }
    };
  }, [dbContext, syncVault, app, router, t, handleOfflineFlow, updateStatus]);

  /**
   * Handle skip button press by calling the offline handler.
   */
  const handleSkipPress = (): void => {
    // Clear any existing timeout
    if (skipButtonTimeoutRef.current) {
      clearTimeout(skipButtonTimeoutRef.current);
      skipButtonTimeoutRef.current = null;
    }

    setShowSkipButton(false);
    lastStatusRef.current = '';

    handleOfflineFlow();
  };

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    skipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentBackground,
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 8,
      width: 200,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    skipButtonText: {
      marginLeft: 8,
      fontSize: 16,
      color: colors.textMuted,
    },
  });

  return (
    <ThemedView style={styles.container}>
      <View>
        <LoadingIndicator status={status || ''} />
      </View>
      {showSkipButton && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkipPress}>
          <Ionicons name="play-forward-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}