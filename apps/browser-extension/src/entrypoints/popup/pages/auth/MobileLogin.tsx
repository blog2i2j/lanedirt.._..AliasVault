import QRCode from 'qrcode';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Button from '@/entrypoints/popup/components/Button';
import { useAuth } from '@/entrypoints/popup/context/AuthContext';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import { useWebApi } from '@/entrypoints/popup/context/WebApiContext';
import { MobileLoginUtility } from '@/entrypoints/popup/utils/MobileLoginUtility';

import type { VaultResponse } from '@/utils/dist/shared/models/webapi';
import type { MobileLoginResult } from '@/utils/types/messaging/MobileLoginResult';

/**
 * Mobile login page - scan QR code with mobile device to login.
 */
const MobileLogin: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const webApi = useWebApi();
  const { initializeDatabase, storeEncryptionKey, storeEncryptionKeyDerivationParams } = useDb();
  const { setAuthTokens, clearAuth } = useAuth();
  const { showLoading, hideLoading, setIsInitialLoading } = useLoading();

  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(120); // 2 minutes in seconds
  const mobileLoginRef = useRef<MobileLoginUtility | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer effect
  useEffect(() => {
    if (qrCodeUrl && timeRemaining > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return (): void => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      };
    }
  }, [qrCodeUrl, timeRemaining]);

  useEffect(() => {
    /**
     * Initialize mobile login on component mount.
     */
    const initiateMobileLogin = async () : Promise<void> => {
      try {
        showLoading();
        setError(null);

        // Initialize mobile login utility
        if (!mobileLoginRef.current) {
          mobileLoginRef.current = new MobileLoginUtility(webApi);
        }

        // Initiate mobile login and get QR code data
        const requestId = await mobileLoginRef.current.initiate();

        // Generate QR code with AliasVault prefix for mobile login
        const qrData = `aliasvault://mobile-login/${requestId}`;
        const qrDataUrl = await QRCode.toDataURL(qrData, {
          width: 256,
          margin: 2,
        });

        setQrCodeUrl(qrDataUrl);
        hideLoading();

        // Start polling for response
        await mobileLoginRef.current.startPolling(
          async (result: MobileLoginResult) => {
            showLoading();
            try {
              // Handle successful authentication
              await handleSuccessfulAuth(
                result.username,
                result.token,
                result.refreshToken,
                result.decryptionKey,
                {
                  salt: result.salt,
                  encryptionType: result.encryptionType,
                  encryptionSettings: result.encryptionSettings,
                }
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : t('common.errors.unknownError'));
              hideLoading();
            }
          },
          (errorMessage) => {
            setError(errorMessage);
            hideLoading();
          }
        );
      } catch (err) {
        hideLoading();
        // Check if this is a 404 error (endpoint doesn't exist - server version too old for this feature)
        const errorWithStatus = err as Error & { status?: number };
        // TODO: this check can be removed at a later time when v1.0 is ready and 0.25.0 release when this was introduced has been out for a while.
        if (err instanceof Error && errorWithStatus.status === 404) {
          // Clear auth and navigate back to login with error message
          await clearAuth(t('common.errors.serverVersionTooOld'));
          navigate('/login');
        } else {
          setError(err instanceof Error ? err.message : t('common.errors.unknownError'));
        }
      }
    };

    initiateMobileLogin();

    // Cleanup on unmount
    return (): void => {
      if (mobileLoginRef.current) {
        mobileLoginRef.current.cleanup();
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle successful authentication.
   */
  const handleSuccessfulAuth = async (
    username: string,
    token: string,
    refreshToken: string,
    decryptionKey: string,
    vaultMetadata: { salt: string; encryptionType: string; encryptionSettings: string }
  ) : Promise<void> => {
    // Fetch vault from server with the new auth token
    const vaultResponse = await webApi.authFetch<VaultResponse>('Vault', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    // Store auth tokens and username
    await setAuthTokens(username, token, refreshToken);

    // Store the encryption key and derivation params
    await storeEncryptionKey(decryptionKey);
    await storeEncryptionKeyDerivationParams({
      salt: vaultMetadata.salt,
      encryptionType: vaultMetadata.encryptionType,
      encryptionSettings: vaultMetadata.encryptionSettings,
    });

    // Initialize the database with the vault data
    const sqliteClient = await initializeDatabase(vaultResponse, decryptionKey);

    // Check for pending migrations
    try {
      if (await sqliteClient.hasPendingMigrations()) {
        navigate('/upgrade', { replace: true });
        hideLoading();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errors.unknownError'));
      hideLoading();
      return;
    }

    // Navigate to credentials page.
    hideLoading();
    setIsInitialLoading(false);
    navigate('/credentials', { replace: true });
  };

  /**
   * Handle back button.
   */
  const handleBack = () : void => {
    if (mobileLoginRef.current) {
      mobileLoginRef.current.cleanup();
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    navigate('/login');
  };

  /**
   * Format time remaining as MM:SS.
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="bg-white dark:bg-gray-700 w-full shadow-md rounded px-8 pt-6 pb-8 mb-4">
        {error && (
          <div className="mb-4 text-red-500 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <h2 className="text-xl font-bold dark:text-gray-200 mb-4">{t('auth.unlockWithMobile')}</h2>
        <p className="text-gray-700 dark:text-gray-200 mb-4 text-sm">
          {t('auth.scanQrCode')}
        </p>

        {qrCodeUrl && (
          <div className="flex flex-col items-center mb-6">
            <img src={qrCodeUrl} alt="QR Code" className="border-4 border-gray-200 dark:border-gray-600 rounded mb-4" />
            <div className="text-gray-700 text-sm dark:text-gray-300">
              {formatTime(timeRemaining)}
            </div>
          </div>
        )}

        <div className="flex w-full">
          <Button type="button" onClick={handleBack} variant="secondary">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MobileLogin;
