import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Button from '@/entrypoints/popup/components/Button';
import { FormInput } from '@/entrypoints/popup/components/FormInput';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';

import { AliasVaultPasskeyProvider } from '@/utils/passkey/AliasVaultPasskeyProvider';
import type { CreateRequest, StoredPasskeyRecord, PasskeyCreateCredentialResponse } from '@/utils/passkey/types';

interface IPasskeyRequest {
  type: 'create';
  requestId: string;
  origin: string;
  publicKey: any;
}

/**
 *
 */
const PasskeyCreate: React.FC = () => {
  const location = useLocation();
  const { setIsInitialLoading } = useLoading();
  const [request, setRequest] = useState<IPasskeyRequest | null>(null);
  const [displayName, setDisplayName] = useState('My Passkey');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /**
     *
     */
    const fetchRequestData = async () => {
      console.log(location);
      // Get the requestId from URL
      const params = new URLSearchParams(location.search);
      const requestId = params.get('requestId');

      console.log('PasskeyCreate: requestId', requestId);

      if (requestId) {
        try {
          // Fetch the full request data from background
          const data = await sendMessage('GET_REQUEST_DATA', { requestId }, 'background');
          console.log('PasskeyCreate: fetched request data', data);
          if (data) {
            setRequest(data);

            if (data.publicKey?.user?.displayName) {
              setDisplayName(data.publicKey.user.displayName);
            }
          }
        } catch (error) {
          console.error('Failed to fetch request data:', error);
        }
      }

      // Mark initial loading as complete
      console.log('PasskeyCreate: useEffect: setIsInitialLoading(false)');
      setIsInitialLoading(false);
    };

    fetchRequestData();
  }, [location, setIsInitialLoading]);

  /**
   * Handle passkey creation
   */
  const handleCreate = async () => {
    if (!request) {
      return;
    }

    setLoading(true);

    try {
      console.log('PasskeyCreate: Starting passkey creation');
      console.log('PasskeyCreate: request', request);

      // Create the provider with storage callbacks
      const provider = new AliasVaultPasskeyProvider(
        async (record: StoredPasskeyRecord) => {
          await sendMessage('STORE_PASSKEY', {
            rpId: record.rpId,
            credentialId: record.credentialId,
            displayName,
            publicKey: record.publicKey,
            privateKey: record.privateKey,
            userId: record.userId,
            userName: record.userName,
            userDisplayName: record.userDisplayName
          } as any, 'background');
        },
        async (credentialId: string) => {
          const result = await sendMessage('GET_PASSKEY_BY_ID', { credentialId }, 'background');
          return result || null;
        }
      );

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

      // Create the passkey using the provider
      const { credential } = await provider.createPasskey(createRequest, {
        uvPerformed: false // Set to true if you implement actual user verification
      });

      console.info('PasskeyCreate: Created credential successfully', credential);

      // Flatten credential structure for injection script compatibility
      // The injection script expects: { id, rawId, clientDataJSON, attestationObject }
      // But the provider returns: { id, rawId, response: { clientDataJSON, attestationObject }, type }
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
      console.info('PasskeyCreate: Passkey created successfully. Window kept open for debugging.');
      setLoading(false);

      // Uncomment to auto-close:
      // window.close();
    } catch (error) {
      console.error('PasskeyCreate: Error creating passkey', error);
      setLoading(false);
      alert(`Failed to create passkey: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /**
   *
   */
  const handleFallback = async () => {
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
   *
   */
  const handleCancel = async () => {
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
