import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Alert, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColorScheme';
import { useTranslation } from '@/hooks/useTranslation';

import { ThemedButton } from '@/components/themed/ThemedButton';
import { ThemedContainer } from '@/components/themed/ThemedContainer';
import { ThemedScrollView } from '@/components/themed/ThemedScrollView';
import { ThemedText } from '@/components/themed/ThemedText';
import { ThemedView } from '@/components/themed/ThemedView';
import { useApp } from '@/context/AppContext';
import { useWebApi } from '@/context/WebApiContext';
import NativeVaultManager from '@/specs/NativeVaultManager';

// QR Code type prefixes
const QR_CODE_PREFIXES = {
  MOBILE_UNLOCK: 'aliasvault://mobile-unlock/',
  // Future: PASSKEY: 'aliasvault://passkey/',
  // Future: SHARE_CREDENTIAL: 'aliasvault://share/',
} as const;

type QRCodeType = keyof typeof QR_CODE_PREFIXES;

/**
 * Scanned QR code data.
 */
interface ScannedQRCode {
  type: QRCodeType | null;
  payload: string;
  rawData: string;
}

/**
 * Parse QR code data and determine its type.
 */
function parseQRCode(data: string): ScannedQRCode {
  for (const [type, prefix] of Object.entries(QR_CODE_PREFIXES)) {
    if (data.startsWith(prefix)) {
      return {
        type: type as QRCodeType,
        payload: data.substring(prefix.length),
        rawData: data,
      };
    }
  }
  return { type: null, payload: data, rawData: data };
}

/**
 * General QR code scanner screen for AliasVault.
 */
export default function QRScannerScreen() : React.ReactNode {
  const colors = useColors();
  const { t } = useTranslation();
  const { username } = useApp();
  const webApi = useWebApi();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedQRCode | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { url } = useLocalSearchParams<{ url?: string }>();

  // Request camera permission on mount
  useEffect(() => {
    const requestCameraPermission = async () : Promise<void> => {
      if (!permission) {
        return; // Still loading permission status
      }

      if (!permission.granted && permission.canAskAgain) {
        // Request permission
        await requestPermission();
      } else if (!permission.granted && !permission.canAskAgain) {
        // Permission was permanently denied
        Alert.alert(
          t('settings.qrScanner.cameraPermissionTitle'),
          t('settings.qrScanner.cameraPermissionMessage'),
          [{ text: t('common.ok'), onPress: () => router.back() }]
        );
      }
    };

    requestCameraPermission();
  }, [permission?.granted]);

  // Handle QR code URL passed from deep link (e.g., from native camera)
  useEffect(() => {
    if (url && typeof url === 'string') {
      handleBarcodeScanned({ data: url });
    }
  }, [url]);

  /**
   * Handle mobile unlock QR code.
   */
  const handleMobileUnlock = async (requestId: string) : Promise<void> => {
    try {
      // Fetch the public key from server
      const response = await webApi.authFetch<{ clientPublicKey: string }>(
        `auth/mobile-unlock/request/${requestId}`,
        { method: 'GET' }
      );

      const publicKeyJWK = response.clientPublicKey;

      // Encrypt the decryption key using native module
      // This ensures the decryption key never touches React Native code
      const encryptedKey = await NativeVaultManager.encryptDecryptionKeyForMobileUnlock(publicKeyJWK);

      // Submit the encrypted key to the server
      await webApi.authFetch(
        'auth/mobile-unlock/submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId,
            encryptedDecryptionKey: encryptedKey,
            username: username,
          }),
        }
      );

      // Success!
      setSuccessMessage(t('settings.qrScanner.mobileUnlock.successDescription'));
    } catch (error) {
      console.error('Mobile unlock error:', error);
      let errorMsg = t('settings.qrScanner.mobileUnlock.genericError');

      if (error instanceof Error) {
        if (error.message.includes('ENCRYPTION_ERROR')) {
          errorMsg = t('settings.qrScanner.mobileUnlock.vaultLocked');
        } else if (error.message.includes('404')) {
          errorMsg = t('settings.qrScanner.mobileUnlock.requestExpired');
        } else if (error.message.includes('401') || error.message.includes('403')) {
          errorMsg = t('settings.qrScanner.mobileUnlock.unauthorized');
        }
      }

      setErrorMessage(errorMsg);
    }
  };

  /**
   * Handle barcode scanned - show confirmation screen.
   */
  const handleBarcodeScanned = ({ data }: { data: string }) : void => {
    // Prevent multiple scans
    if (scannedData) {
      return;
    }

    // Parse the QR code to determine its type
    const parsedData = parseQRCode(data);

    if (!parsedData.type) {
      Alert.alert(
        t('settings.qrScanner.invalidQrCode'),
        t('settings.qrScanner.notAliasVaultQr'),
        [{ text: t('common.ok'), onPress: () => router.back() }]
      );
      return;
    }

    // Show confirmation screen
    setScannedData(parsedData);
  };

  /**
   * Handle confirmation - authenticate user first, then process the scanned QR code.
   */
  const handleConfirm = async () : Promise<void> => {
    if (!scannedData) {
      return;
    }

    setIsProcessing(true);

    try {
      let authenticated = false;

      // Check which authentication method is available
      const pinEnabled = await NativeVaultManager.isPinEnabled();

      if (pinEnabled) {
        // PIN is enabled, use PIN unlock
        try {
          await NativeVaultManager.showPinUnlock();
          authenticated = true;
        } catch (pinError: any) {
          // User cancelled PIN or PIN failed
          console.log('PIN unlock cancelled or failed:', pinError);
          Alert.alert(
            t('common.error'),
            t('settings.qrScanner.mobileUnlock.authenticationFailed')
          );
          setIsProcessing(false);
          return;
        }
      } else {
        // Try biometric authentication
        try {
          authenticated = await NativeVaultManager.authenticateUser(
            t('settings.qrScanner.mobileUnlock.authenticationRequired')
          );
        } catch (authError: any) {
          console.error('Biometric authentication error:', authError);
          Alert.alert(
            t('common.error'),
            t('settings.qrScanner.mobileUnlock.authenticationFailed')
          );
          setIsProcessing(false);
          return;
        }
      }

      if (!authenticated) {
        Alert.alert(
          t('common.error'),
          t('settings.qrScanner.mobileUnlock.authenticationFailed')
        );
        setIsProcessing(false);
        return;
      }

      // Route to appropriate handler based on type
      switch (scannedData.type) {
        case 'MOBILE_UNLOCK':
          await handleMobileUnlock(scannedData.payload);
          break;
        // Future cases:
        // case 'PASSKEY':
        //   await handlePasskey(scannedData.payload);
        //   break;
        default:
          Alert.alert(
            t('common.error'),
            t('settings.qrScanner.unsupportedQrType')
          );
      }
    } catch (error) {
      console.error('QR code processing error:', error);
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('common.errors.unknownError')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle cancel - go back to scanning.
   */
  const handleCancel = () : void => {
    setScannedData(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  /**
   * Handle dismiss - go back to settings.
   */
  const handleDismiss = () : void => {
    router.back();
  };

  const styles = StyleSheet.create({
    camera: {
      flex: 1,
    },
    cameraContainer: {
      backgroundColor: colors.black,
      flex: 1,
    },
    cameraOverlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    cameraOverlayText: {
      color: colors.white,
      fontSize: 16,
      marginTop: 20,
      paddingHorizontal: 40,
      textAlign: 'center',
    },
    closeButton: {
      position: 'absolute',
      right: 16,
      top: 16,
      zIndex: 10,
    },
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
      marginBottom: 12,
      textAlign: 'center',
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
    successContainer: {
      alignItems: 'center',
      backgroundColor: colors.success + '10',
      borderColor: colors.success,
      borderRadius: 12,
      borderWidth: 2,
      marginBottom: 20,
      padding: 20,
    },
    successIcon: {
      marginBottom: 16,
    },
    successTitle: {
      color: colors.success,
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 8,
      textAlign: 'center',
    },
    successText: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    errorContainer: {
      alignItems: 'center',
      backgroundColor: colors.destructive + '10',
      borderColor: colors.destructive,
      borderRadius: 12,
      borderWidth: 2,
      marginBottom: 20,
      padding: 20,
    },
    errorIcon: {
      marginBottom: 16,
    },
    errorTitle: {
      color: colors.destructive,
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 8,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  });

  // Show confirmation/success/error screen after scanning
  if (scannedData || successMessage || errorMessage) {
    return (
      <ThemedContainer>
        <ThemedScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.confirmationContainer}>
            {successMessage && (
              <View style={styles.successContainer}>
                <Ionicons
                  name="checkmark-circle"
                  size={64}
                  color={colors.success}
                  style={styles.successIcon}
                />
                <ThemedText style={styles.successTitle}>
                  {t('settings.qrScanner.mobileUnlock.successTitle')}
                </ThemedText>
                <ThemedText style={styles.successText}>
                  {successMessage}
                </ThemedText>
              </View>
            )}

            {errorMessage && (
              <View style={styles.errorContainer}>
                <Ionicons
                  name="alert-circle"
                  size={64}
                  color={colors.destructive}
                  style={styles.errorIcon}
                />
                <ThemedText style={styles.errorTitle}>
                  {t('common.error')}
                </ThemedText>
                <ThemedText style={styles.errorText}>
                  {errorMessage}
                </ThemedText>
              </View>
            )}

            {!successMessage && !errorMessage && scannedData?.type === 'MOBILE_UNLOCK' && (
              <>
                <ThemedText style={styles.confirmationTitle}>
                  {t('settings.qrScanner.mobileUnlock.confirmTitle')}
                </ThemedText>
                <ThemedText style={styles.confirmationText}>
                  {t('settings.qrScanner.mobileUnlock.confirmMessage', { username })}
                </ThemedText>
              </>
            )}
          </View>

          <View style={styles.buttonContainer}>
            {(successMessage || errorMessage) ? (
              <ThemedButton
                title={t('common.close')}
                onPress={handleDismiss}
                style={styles.button}
              />
            ) : (
              <>
                <ThemedButton
                  title={t('common.confirm')}
                  onPress={handleConfirm}
                  loading={isProcessing}
                  disabled={isProcessing}
                  style={styles.button}
                />
                <ThemedButton
                  title={t('common.cancel')}
                  onPress={handleCancel}
                  disabled={isProcessing}
                  style={StyleSheet.flatten([styles.button, styles.cancelButton])}
                />
              </>
            )}
          </View>
        </ThemedScrollView>
      </ThemedContainer>
    );
  }

  // Show loading or permission denied screen
  if (!permission || !permission.granted) {
    return (
      <ThemedContainer>
        <ThemedView style={styles.confirmationContainer}>
          {permission && !permission.granted && (
            <>
              <ThemedText style={styles.confirmationTitle}>
                {t('settings.qrScanner.cameraPermissionTitle')}
              </ThemedText>
              <ThemedText style={styles.confirmationText}>
                {t('settings.qrScanner.cameraPermissionMessage')}
              </ThemedText>
            </>
          )}
        </ThemedView>
      </ThemedContainer>
    );
  }

  return (
    <ThemedContainer>
      <View style={styles.cameraContainer}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Ionicons name="close-circle" size={32} color={colors.white} />
        </TouchableOpacity>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={handleBarcodeScanned}
        >
          <View style={styles.cameraOverlay}>
            <Ionicons name="qr-code-outline" size={100} color={colors.white} />
            <ThemedText style={styles.cameraOverlayText}>
              {t('settings.qrScanner.scanningMessage')}
            </ThemedText>
          </View>
        </CameraView>
      </View>
    </ThemedContainer>
  );
}
