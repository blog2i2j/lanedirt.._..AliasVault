import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColorScheme';
import { useTranslation } from '@/hooks/useTranslation';

import LoadingIndicator from '@/components/LoadingIndicator';
import { ThemedButton } from '@/components/themed/ThemedButton';
import { ThemedContainer } from '@/components/themed/ThemedContainer';
import { ThemedScrollView } from '@/components/themed/ThemedScrollView';
import { ThemedText } from '@/components/themed/ThemedText';
import { UsernameDisplay } from '@/components/ui/UsernameDisplay';
import { useWebApi } from '@/context/WebApiContext';
import NativeVaultManager from '@/specs/NativeVaultManager';

/**
 * QR Code confirmation screen for mobile login.
 */
export default function QRConfirmScreen() : React.ReactNode {
  const colors = useColors();
  const { t } = useTranslation();
  const webApi = useWebApi();
  const insets = useSafeAreaInsets();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();

  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Handle mobile login QR code.
   */
  const handleMobileLogin = async (requestId: string) : Promise<void> => {
    try {
      // Fetch the public key from server
      const response = await webApi.authFetch<{ clientPublicKey: string }>(
        `auth/mobile-login/request/${requestId}`,
        { method: 'GET' }
      );

      const publicKeyJWK = response.clientPublicKey;

      // Encrypt the decryption key using native module
      const encryptedKey = await NativeVaultManager.encryptDecryptionKeyForMobileLogin(publicKeyJWK);

      // Submit the encrypted key to the server
      await webApi.authFetch(
        'auth/mobile-login/submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId,
            encryptedDecryptionKey: encryptedKey,
          }),
        }
      );

      // Success! Navigate to result page
      router.replace({
        pathname: '/(tabs)/settings/qr-result',
        params: {
          success: 'true',
          message: t('settings.qrScanner.mobileLogin.successDescription'),
        },
      });
    } catch (error) {
      console.error('Mobile login error:', error);
      let errorMsg = t('common.errors.unknownErrorTryAgain');

      // Error! Navigate to result page
      router.replace({
        pathname: '/(tabs)/settings/qr-result',
        params: {
          success: 'false',
          message: errorMsg,
        },
      });
    }
  };

  /**
   * Handle confirmation - authenticate user first, then process the scanned QR code.
   */
  const handleConfirm = async () : Promise<void> => {
    if (!requestId) {
      return;
    }

    setIsProcessing(true);

    try {
      // Check server version compatibility
      const isVersionSupported = await NativeVaultManager.isServerVersionGreaterThanOrEqualTo('0.25.0');

      if (!isVersionSupported) {
        Alert.alert(
          t('common.error'),
          t('common.errors.serverVersionTooOld'),
          [
            {
              text: t('common.ok'),
              /**
               * Go back to the settings tab.
               */
              onPress: (): void => {
                router.back();
              },
            },
          ]
        );
        setIsProcessing(false);
        return;
      }

      // Check if biometric or PIN is enabled
      const authMethods = await NativeVaultManager.getAuthMethods();
      const isPinEnabled = await NativeVaultManager.isPinEnabled();
      const isBiometricEnabled = authMethods.includes('faceid');

      if (!isBiometricEnabled && !isPinEnabled) {
        Alert.alert(
          t('common.error'),
          t('settings.qrScanner.mobileLogin.noAuthMethodEnabled'),
          [
            {
              text: t('common.ok'),
              /**
               * Go back to the previous screen.
               */
              onPress: (): void => {
                router.back();
              },
            },
          ]
        );
        setIsProcessing(false);
        return;
      }

      // Authenticate user with either biometric or PIN (automatically detected)
      const authenticated = await NativeVaultManager.authenticateUser(
        t('settings.qrScanner.mobileLogin.confirmTitle'),
        t('settings.qrScanner.mobileLogin.confirmSubtitle')
      );

      if (!authenticated) {
        setIsProcessing(false);
        return;
      }

      // Process the mobile login
      await handleMobileLogin(requestId);
    } catch (error) {
      console.error('Authentication or QR code processing error:', error);
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('common.errors.unknownError')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle dismiss - go back to settings.
   */
  const handleDismiss = () : void => {
    router.back();
  };

  const styles = StyleSheet.create({
    confirmationContainer: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
    confirmationTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      textAlign: 'center',
    },
    confirmationText: {
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 16,
      textAlign: 'center',
    },
    usernameDisplayContainer: {
      marginBottom: 12,
      width: '100%',
    },
    buttonContainer: {
      gap: 12,
      marginTop: 20,
      paddingBottom: insets.bottom + 80,
      paddingHorizontal: 20,
    },
    button: {
      width: '100%',
    },
    cancelButton: {
      backgroundColor: colors.secondary,
    },
  });

  // Show loading during processing
  if (isProcessing) {
    return (
      <ThemedContainer>
        <View style={styles.confirmationContainer}>
          <LoadingIndicator />
        </View>
      </ThemedContainer>
    );
  }

  // Show confirmation screen
  return (
    <ThemedContainer>
      <ThemedScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.confirmationContainer}>
          <ThemedText style={styles.confirmationTitle}>
            {t('settings.qrScanner.mobileLogin.confirmTitle')}
          </ThemedText>
          <ThemedText style={styles.confirmationText}>
            {t('settings.qrScanner.mobileLogin.confirmMessage')}
          </ThemedText>
          <View style={styles.usernameDisplayContainer}>
            <UsernameDisplay />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <ThemedButton
            title={t('common.confirm')}
            onPress={handleConfirm}
            style={styles.button}
          />
          <ThemedButton
            title={t('common.cancel')}
            onPress={handleDismiss}
            style={StyleSheet.flatten([styles.button, styles.cancelButton])}
          />
        </View>
      </ThemedScrollView>
    </ThemedContainer>
  );
}
