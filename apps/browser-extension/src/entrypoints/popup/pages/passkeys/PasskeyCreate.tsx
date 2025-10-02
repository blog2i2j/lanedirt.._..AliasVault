import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Button from '@/entrypoints/popup/components/Button';
import { FormInput } from '@/entrypoints/popup/components/FormInput';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';

import { AliasVaultPasskeyProvider } from '@/utils/passkey/AliasVaultPasskeyProvider';
import type { CreateRequest, PasskeyCreateCredentialResponse, PendingPasskeyCreateRequest, StorePasskeyRequest, WebAuthnCreationPayload } from '@/utils/passkey/types';

/**
 * PasskeyCreate
 */
const PasskeyCreate: React.FC = () => {
  const location = useLocation();
  const { setIsInitialLoading } = useLoading();
  const [request, setRequest] = useState<PendingPasskeyCreateRequest | null>(null);
  const [displayName, setDisplayName] = useState('My Passkey');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /**
     * fetchRequestData
     */
    const fetchRequestData = async () : Promise<void> => {
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
        }
      }

      setIsInitialLoading(false);
    };

    fetchRequestData();
  }, [location, setIsInitialLoading]);

  /**
   * Handle passkey creation
   */
  const handleCreate = async () : Promise<void> => {
    if (!request) {
      return;
    }

    setLoading(true);

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

      // Create passkey using static method
      const result = await AliasVaultPasskeyProvider.createPasskey(createRequest, {
        uvPerformed: true, // Set to true if you implement actual user verification
        credentialIdBytes: 16
      });

      // Store the passkey data
      const data: StorePasskeyRequest = {
        rpId: result.stored.rpId,
        credentialId: result.stored.credentialId,
        displayName: displayName,
        publicKey: result.stored.publicKey as WebAuthnCreationPayload,
        privateKey: result.stored.privateKey,
        userId: result.stored.userId,
        userName: result.stored.userName,
        userDisplayName: result.stored.userDisplayName
      };

      await sendMessage('STORE_PASSKEY', data as unknown, 'background');

      const { credential } = result;

      console.info('PasskeyCreate: Created credential successfully', credential);

      /*
       * Flatten credential structure for injection script compatibility
       * The injection script expects: { id, rawId, clientDataJSON, attestationObject }
       * But the provider returns: { id, rawId, response: { clientDataJSON, attestationObject }, type }
       */
      const flattenedCredential: PasskeyCreateCredentialResponse = {
        id: credential.id,
        rawId: credential.rawId,
        clientDataJSON: credential.response.clientDataJSON,
        attestationObject: credential.response.attestationObject
      };

      // Send response back with the flattened credential
      await sendMessage('PASSKEY_POPUP_RESPONSE', {
        requestId: request.requestId,
        credential: flattenedCredential
      }, 'background');

      // For debugging: Don't close the window automatically
      console.info('PasskeyCreate: Passkey created successfully.');
      setLoading(false);

      /*
       * Uncomment to auto-close:
       * window.close();
       */
    } catch (error) {
      console.error('PasskeyCreate: Error creating passkey', error);
      setLoading(false);
      alert(`Failed to create passkey: ${error instanceof Error ? error.message : String(error)}`);
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
          disabled={loading || !displayName.trim()}
          className="w-full"
        >
          {loading ? 'Creating...' : 'Create Passkey'}
        </Button>

        <Button
          variant="secondary"
          onClick={handleFallback}
          disabled={loading}
          className="w-full"
        >
          Use Browser Passkey
        </Button>

        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={loading}
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default PasskeyCreate;
