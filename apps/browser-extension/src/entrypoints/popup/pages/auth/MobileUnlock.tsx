import QRCode from 'qrcode';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Button from '@/entrypoints/popup/components/Button';
import { useAuth } from '@/entrypoints/popup/context/AuthContext';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import { useWebApi } from '@/entrypoints/popup/context/WebApiContext';
import { MobileUnlockUtility } from '@/entrypoints/popup/utils/MobileUnlockUtility';

import type { VaultResponse } from '@/utils/dist/shared/models/webapi';

/**
 * Mobile unlock page - scan QR code with mobile device to unlock.
 */
const MobileUnlock: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const webApi = useWebApi();
  const { initializeDatabase, storeEncryptionKey, storeEncryptionKeyDerivationParams } = useDb();
  const { setAuthTokens } = useAuth();
  const { showLoading, hideLoading, setIsInitialLoading } = useLoading();

  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(120); // 2 minutes in seconds
  const mobileUnlockRef = useRef<MobileUnlockUtility | null>(null);
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
     * Initialize mobile unlock on component mount.
     */
    const initiateMobileUnlock = async () : Promise<void> => {
      try {
        showLoading();
        setError(null);

        // Initialize mobile unlock utility
        if (!mobileUnlockRef.current) {
          mobileUnlockRef.current = new MobileUnlockUtility(webApi);
        }

        // Initiate mobile unlock and get QR code data
        const requestId = await mobileUnlockRef.current.initiate();

        // Generate QR code with AliasVault prefix for mobile unlock
        const qrData = `aliasvault://mobile-unlock/${requestId}`;
        const qrDataUrl = await QRCode.toDataURL(qrData, {
          width: 256,
          margin: 2,
        });

        setQrCodeUrl(qrDataUrl);
        hideLoading();

        // Start polling for response
        await mobileUnlockRef.current.startPolling(
          async (username, token, refreshToken, decryptionKey, salt, encryptionType, encryptionSettings) => {
            showLoading();
            try {
              // Handle successful authentication
              await handleSuccessfulAuth(
                username,
                token,
                refreshToken,
                decryptionKey,
                {
                  salt,
                  encryptionType,
                  encryptionSettings,
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
        setError(err instanceof Error ? err.message : t('auth.errors.serverError'));
      }
    };

    initiateMobileUnlock();

    // Cleanup on unmount
    return (): void => {
      if (mobileUnlockRef.current) {
        mobileUnlockRef.current.cleanup();
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
    if (mobileUnlockRef.current) {
      mobileUnlockRef.current.cleanup();
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
            {t('auth.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MobileUnlock;
