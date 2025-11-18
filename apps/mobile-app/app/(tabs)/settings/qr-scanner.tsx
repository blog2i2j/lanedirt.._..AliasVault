import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useCallback, useRef } from 'react';
import { View, Alert, StyleSheet } from 'react-native';

import { useColors } from '@/hooks/useColorScheme';
import { useMinDurationLoading } from '@/hooks/useMinDurationLoading';
import { useTranslation } from '@/hooks/useTranslation';

import LoadingIndicator from '@/components/LoadingIndicator';
import { ThemedContainer } from '@/components/themed/ThemedContainer';
import { ThemedText } from '@/components/themed/ThemedText';
import { useWebApi } from '@/context/WebApiContext';

// QR Code type prefixes
const QR_CODE_PREFIXES = {
  MOBILE_UNLOCK: 'aliasvault://open/mobile-unlock/',
  /*
   * Future actions:
   * PASSKEY_AUTH: 'aliasvault://open/passkey-auth/',
   * SHARE_CREDENTIAL: 'aliasvault://open/share-credential/',
   */
} as const;

type QRCodeType = keyof typeof QR_CODE_PREFIXES;

/**
 * Scanned QR code data.
 */
type ScannedQRCode = {
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
  const webApi = useWebApi();
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoadingAfterScan, setIsLoadingAfterScan] = useMinDurationLoading(false, 500);
  const { url } = useLocalSearchParams<{ url?: string }>();
  const hasProcessedUrl = useRef(false);
  const processedUrls = useRef(new Set<string>());

  // Request camera permission on mount
  useEffect(() => {
    /**
     * Request camera permission.
     */
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
          [{ text: t('common.ok'), /**
           * Go back to the settings tab.
           */
            onPress: (): void => router.back() }]
        );
      }
    };

    requestCameraPermission();
  }, [permission, requestPermission, t]);

  /**
   * Validate the QR request with the server before navigating.
   */
  const validateAndNavigate = useCallback(async (parsedData: ScannedQRCode) : Promise<void> => {
    setIsLoadingAfterScan(true);

    try {
      if (parsedData.type === 'MOBILE_UNLOCK' || parsedData.type === 'MOBILE_LOGIN') {
        // Fetch the public key from server to validate the request exists
        await webApi.authFetch<{ clientPublicKey: string }>(
          `auth/mobile-login/request/${parsedData.payload}`,
          { method: 'GET' }
        );

        /*
         * Request is valid, navigate to confirmation page
         * Min duration of 500ms is handled by useMinDurationLoading
         */
        setIsLoadingAfterScan(false);

        router.replace(`/(tabs)/settings/mobile-unlock/${parsedData.payload}` as Href);
      }
    } catch (error) {
      setIsLoadingAfterScan(false);

      console.error('QR validation error:', error);
      let errorMsg = t('common.errors.unknownErrorTryAgain');

      if (error instanceof Error) {
        if (error.message.includes('404')) {
          // Request expired
          errorMsg = t('settings.qrScanner.mobileLogin.requestExpired');
        } else {
          errorMsg = t('common.errors.unknownErrorTryAgain');
        }
      }

      Alert.alert(
        t('common.error'),
        errorMsg,
        [{ text: t('common.ok') }]
      );

      // On error, go back to the settings screen
      router.replace('/(tabs)/settings');
    }
  }, [webApi, setIsLoadingAfterScan, t]);

  /**
   * Handle barcode scanned - validate request and navigate to confirmation.
   * Only processes AliasVault QR codes, silently ignores others.
   */
  const handleBarcodeScanned = useCallback(({ data }: { data: string }) : void => {
    // Prevent multiple scans
    if (isLoadingAfterScan) {
      return;
    }

    // Prevent processing the same URL multiple times
    if (processedUrls.current.has(data)) {
      return;
    }

    // Parse the QR code to determine its type
    const parsedData = parseQRCode(data);

    // Silently ignore non-AliasVault QR codes
    if (!parsedData.type) {
      return;
    }

    // Mark this URL as processed
    processedUrls.current.add(data);

    // Validate the request and navigate (with min 500ms loading)
    validateAndNavigate(parsedData);
  }, [isLoadingAfterScan, validateAndNavigate]);

  /**
   * Reset hasProcessedUrl when URL changes to allow processing new URLs.
   */
  useEffect(() => {
    hasProcessedUrl.current = false;
  }, [url]);

  /**
   * Handle QR code URL passed from deep link (e.g., from native camera).
   */
  useEffect(() => {
    if (url && typeof url === 'string' && !hasProcessedUrl.current) {
      hasProcessedUrl.current = true;
      handleBarcodeScanned({ data: url });
    }
  }, [url, handleBarcodeScanned]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 0,
    },
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
    loadingContainer: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
  });

  // Show loading animation after scan
  if (isLoadingAfterScan) {
    return (
      <ThemedContainer>
        <View style={styles.loadingContainer}>
          <LoadingIndicator />
        </View>
      </ThemedContainer>
    );
  }

  // Show permission request screen
  if (!permission || !permission.granted) {
    return (
      <ThemedContainer>
        <View style={styles.loadingContainer}>
          <LoadingIndicator />
        </View>
      </ThemedContainer>
    );
  }

  return (
    <ThemedContainer style={styles.container}>
      <View style={styles.cameraContainer}>
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
