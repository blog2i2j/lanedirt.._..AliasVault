import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Button from '@/entrypoints/popup/components/Button';
import { FormInput } from '@/entrypoints/popup/components/FormInput';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import { useVaultMutate } from '@/entrypoints/popup/hooks/useVaultMutate';

import { AliasVaultPasskeyProvider } from '@/utils/passkey/AliasVaultPasskeyProvider';
import { PasskeyHelper } from '@/utils/passkey/PasskeyHelper';
import type { CreateRequest, PasskeyCreateCredentialResponse, PendingPasskeyCreateRequest } from '@/utils/passkey/types';

/**
 * PasskeyCreate
 */
const PasskeyCreate: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setIsInitialLoading } = useLoading();
  const dbContext = useDb();
  const { executeVaultMutation, isLoading: isMutating, syncStatus } = useVaultMutate();
  const [request, setRequest] = useState<PendingPasskeyCreateRequest | null>(null);
  const [displayName, setDisplayName] = useState('My Passkey');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /**
     * fetchRequestData
     */
    const fetchRequestData = async () : Promise<void> => {
      // Wait for DB to be initialized
      if (!dbContext.dbInitialized) {
        return;
      }

      // Check if vault is unlocked
      if (!dbContext.dbAvailable) {
        // Vault is locked, redirect to unlock
        const params = new URLSearchParams(location.search);
        const requestId = params.get('requestId');
        navigate(`/unlock?redirect=/credentials/passkeys/create&requestId=${requestId}`);
        return;
      }

      // Get the requestId from URL
      const params = new URLSearchParams(location.search);
      const requestId = params.get('requestId');

      if (requestId) {
        try {
          // Fetch the full request data from background
          const data = await sendMessage('GET_REQUEST_DATA', { requestId }, 'background') as unknown as PendingPasskeyCreateRequest;
          if (data && data.type === 'create') {
            setRequest(data);

            if (data.publicKey?.user?.displayName) {
              setDisplayName(data.publicKey.user.displayName);
            }
          }
        } catch (error) {
          console.error('Failed to fetch request data:', error);
          setError('Failed to load passkey request');
        }
      }

      setIsInitialLoading(false);
    };

    fetchRequestData();
  }, [location, setIsInitialLoading, dbContext.dbInitialized, dbContext.dbAvailable, navigate]);

  /**
   * Handle passkey creation
   */
  const handleCreate = async () : Promise<void> => {
    if (!request || !dbContext.sqliteClient) {
      return;
    }

    setError(null);

    try {
      // Build the CreateRequest
      const createRequest: CreateRequest = {
        origin: request.origin,
        requestId: request.requestId,
        publicKey: {
          rp: request.publicKey.rp,
          user: request.publicKey.user,
          challenge: request.publicKey.challenge,
          pubKeyCredParams: request.publicKey.pubKeyCredParams,
          attestation: request.publicKey.attestation,
          authenticatorSelection: request.publicKey.authenticatorSelection
        }
      };

      /**
       * Generate a new GUID for the passkey which will be embedded in the passkey
       * metadata and send back to the RP as the credential.id and credential.rawId.
       */
      const newPasskeyGuid = crypto.randomUUID().toUpperCase();
      const newPasskeyGuidBytes = PasskeyHelper.guidToBytes(newPasskeyGuid);
      const newPasskeyGuidBase64url = PasskeyHelper.guidToBase64url(newPasskeyGuid);

      // Create passkey using static method (generates keys and credential ID)
      const result = await AliasVaultPasskeyProvider.createPasskey(newPasskeyGuidBytes, createRequest, {
        uvPerformed: true,
        credentialIdBytes: 16
      });

      const { credential, stored } = result;

      // Use vault mutation to store both credential and passkey
      await executeVaultMutation(
        async () => {
          // 1. Create a parent Credential entry
          const credentialId = await dbContext.sqliteClient!.createCredential(
            {
              Id: '',
              ServiceName: request.publicKey.rp.name || request.origin,
              ServiceUrl: request.origin,
              Username: request.publicKey.user.name,
              Password: null,
              Notes: null,
              Logo: null,
              Alias: {
                FirstName: null,
                LastName: null,
                NickName: null,
                BirthDate: '0001-01-01 00:00:00', // TODO: once birthdate is made nullable in datamodel refactor, remove this.
                Gender: null,
                Email: null
              }
            },
            []
          );

          /**
           * Create the Passkey linked to the credential
           * Note: We let the database generate a GUID for Id, which we'll convert to base64url for the RP
           */
          await dbContext.sqliteClient!.createPasskey({
            Id: newPasskeyGuid,
            CredentialId: credentialId,
            RpId: stored.rpId,
            UserId: stored.userId ?? null,
            PublicKey: JSON.stringify(stored.publicKey),
            PrivateKey: JSON.stringify(stored.privateKey),
            DisplayName: displayName,
            AdditionalData: null
          });
        },
        {
          /**
           * Wait for vault mutation to have synced with server, then send passkey create success response
           * with the GUID-based credential ID.
           */
          onSuccess: async () => {
            // Use the GUID-based credential ID instead of the random one from the provider
            const flattenedCredential: PasskeyCreateCredentialResponse = {
              id: newPasskeyGuidBase64url,
              rawId: newPasskeyGuidBase64url,
              clientDataJSON: credential.response.clientDataJSON,
              attestationObject: credential.response.attestationObject
            };

            // Send response back to background
            await sendMessage('PASSKEY_POPUP_RESPONSE', {
              requestId: request.requestId,
              credential: flattenedCredential
            }, 'background');

            // Auto-close window on success
            window.close();
          },
          /**
           * onError
           */
          onError: (err) => {
            console.error('PasskeyCreate: Error storing passkey', err);
            setError(`Failed to store passkey: ${err.message}`);
          }
        }
      );
    } catch (error) {
      console.error('PasskeyCreate: Error creating passkey', error);
      setError(`Failed to create passkey: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /**
   * Handle fallback
   */
  const handleFallback = async () : Promise<void> => {
    if (!request) {
      return;
    }

    // Tell background to use native implementation
    await sendMessage('PASSKEY_POPUP_RESPONSE', {
      requestId: request.requestId,
      fallback: true
    }, 'background');

    window.close();
  };

  /**
   * Handle cancel
   */
  const handleCancel = async () : Promise<void> => {
    if (!request) {
      return;
    }

    // Tell background user cancelled
    await sendMessage('PASSKEY_POPUP_RESPONSE', {
      requestId: request.requestId,
      cancelled: true
    }, 'background');

    window.close();
  };

  if (!request) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Create Passkey
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Create a new passkey for <strong>{request.origin}</strong>
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {isMutating && syncStatus && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">{syncStatus}</p>
        </div>
      )}

      <div className="space-y-4">
        <FormInput
          id="displayName"
          label="Display Name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Enter a name for this passkey"
        />
      </div>

      <div className="space-y-3">
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={isMutating || !displayName.trim()}
          className="w-full"
        >
          {isMutating ? 'Creating...' : 'Create Passkey'}
        </Button>

        <Button
          variant="secondary"
          onClick={handleFallback}
          disabled={isMutating}
          className="w-full"
        >
          Use Browser Passkey
        </Button>

        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={isMutating}
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default PasskeyCreate;
