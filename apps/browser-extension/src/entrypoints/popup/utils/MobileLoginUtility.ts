import { Buffer } from 'buffer';

import type { MobileLoginInitiateResponse, MobileLoginPollResponse } from '@/utils/dist/shared/models/webapi';
import EncryptionUtility from '@/utils/EncryptionUtility';
import type { WebApiService } from '@/utils/WebApiService';

/**
 * Utility class for mobile login operations
 */
export class MobileLoginUtility {
  private webApi: WebApiService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private requestId: string | null = null;
  private privateKey: string | null = null;

  /**
   * Constructor for the MobileLoginUtility class.
   *
   * @param {WebApiService} webApi - The WebApiService instance.
   */
  public constructor(webApi: WebApiService) {
    this.webApi = webApi;
  }

  /**
   * Initiates a mobile login request and returns the QR code data
   */
  public async initiate(): Promise<string> {
    // Generate RSA key pair
    const keyPair = await EncryptionUtility.generateRsaKeyPair();
    this.privateKey = keyPair.privateKey;

    // Send public key to server (no auth required)
    const response = await this.webApi.rawFetch('auth/mobile-login/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientPublicKey: keyPair.publicKey,
      }),
    });

    if (!response.ok) {
      const error = new Error(`Failed to initiate mobile login: ${response.status}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    const data = await response.json() as MobileLoginInitiateResponse;
    this.requestId = data.requestId;

    // Return QR code data (request ID)
    return this.requestId;
  }

  /**
   * Starts polling the server for mobile login response
   */
  public async startPolling(
    onSuccess: (username: string, token: string, refreshToken: string, decryptionKey: string, salt: string, encryptionType: string, encryptionSettings: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!this.requestId || !this.privateKey) {
      throw new Error('Must call initiate() before starting polling');
    }

    /**
     * Polls the server for mobile login response
     */
    const pollFn = async (): Promise<void> => {
      try {
        if (!this.requestId) {
          this.stopPolling();
          return;
        }

        const response = await this.webApi.rawFetch(
          `auth/mobile-login/poll/${this.requestId}`,
          {
            method: 'GET',
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            // Request expired or not found
            this.stopPolling();
            this.privateKey = null;
            this.requestId = null;
            onError('Mobile login request expired');
            return;
          }
          throw new Error(`Polling failed: ${response.status}`);
        }

        const data = await response.json() as MobileLoginPollResponse;

        if (data.fulfilled && data.encryptedDecryptionKey && data.username && data.token && data.salt && data.encryptionType && data.encryptionSettings) {
          // Stop polling
          this.stopPolling();

          // Decrypt the decryption key using private key
          const decryptionKeyBytes = await EncryptionUtility.decryptWithPrivateKey(
            data.encryptedDecryptionKey,
            this.privateKey!
          );

          // Convert to base64 string
          const decryptionKey = Buffer.from(decryptionKeyBytes).toString('base64');

          // Clear sensitive data
          this.privateKey = null;
          this.requestId = null;

          // Call success callback
          onSuccess(
            data.username,
            data.token.token,
            data.token.refreshToken,
            decryptionKey,
            data.salt,
            data.encryptionType,
            data.encryptionSettings
          );
        }
      } catch (error) {
        this.stopPolling();
        this.privateKey = null;
        this.requestId = null;
        onError(error instanceof Error ? error.message : 'Unknown error occurred');
      }
    };

    // Poll every 3 seconds
    this.pollingInterval = setInterval(pollFn, 3000);

    // Stop polling after 2 minutes
    setTimeout(() => {
      if (this.pollingInterval) {
        this.stopPolling();
        this.privateKey = null;
        this.requestId = null;
        onError('Mobile login request timed out');
      }
    }, 120000);
  }

  /**
   * Stops polling the server
   */
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Cleans up resources
   */
  public cleanup(): void {
    this.stopPolling();
    this.privateKey = null;
    this.requestId = null;
  }
}
