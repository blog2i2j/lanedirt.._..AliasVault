import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Button from '@/entrypoints/popup/components/Button';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';

import { AliasVaultPasskeyProvider } from '@/utils/passkey/AliasVaultPasskeyProvider';
import type { GetRequest, StoredPasskeyRecord } from '@/utils/passkey/types';

interface IPasskeyRequest {
  type: 'get';
  requestId: string;
  origin: string;
  publicKey: any;
  passkeys?: Array<{
    id: string;
    displayName: string;
    lastUsed: string | null;
  }>;
}
/**
 *
 */
const PasskeyAuthenticate: React.FC = () => {
  const location = useLocation();
  const { setIsInitialLoading } = useLoading();
  const [request, setRequest] = useState<IPasskeyRequest | null>(null);
  const [selectedPasskey, setSelectedPasskey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /**
     *
     */
    const fetchRequestData = async () => {
      // Get the requestId from URL
      const params = new URLSearchParams(location.search);
      const requestId = params.get('requestId');

      if (requestId) {
        try {
          // Fetch the full request data from background
          const response = await sendMessage('GET_REQUEST_DATA', { requestId }, 'background');
          console.log('PasskeyAuthenticate: full response', response);
          console.log('PasskeyAuthenticate: response type', typeof response);
          const keys = response ? Object.keys(response) : [];
          console.log('PasskeyAuthenticate: response keys', keys);
          keys.forEach(key => {
            console.log(`PasskeyAuthenticate: ${key} =`, (response as any)[key]);
          });

          // The response might be wrapped in a data property
          const data = response;
          console.log('PasskeyAuthenticate: request data', data);
          console.log('PasskeyAuthenticate: passkeys', data?.passkeys);
          console.log('PasskeyAuthenticate: passkeys is array?', Array.isArray(data?.passkeys));
          console.log('PasskeyAuthenticate: passkeys length', data?.passkeys?.length);

          if (data) {
            setRequest(data);
          }
        } catch (error) {
          console.error('Failed to fetch request data:', error);
        }
      }

      // Mark initial loading as complete
      setIsInitialLoading(false);
    };

    fetchRequestData();
  }, [location, setIsInitialLoading]);

  /**
   * Handle passkey authentication
   */
  const handleUsePasskey = async (credentialId: string) => {
    if (!request) {
      return;
    }

    setLoading(true);

    try {
      console.log('PasskeyAuthenticate: Starting authentication');
      console.log('PasskeyAuthenticate: credentialId', credentialId);
      console.log('PasskeyAuthenticate: request', request);

      // Create the provider with storage callbacks
      const provider = new AliasVaultPasskeyProvider(
        async (record: StoredPasskeyRecord) => {
          // Not used during authentication
          await sendMessage('STORE_PASSKEY', record as any, 'background');
        },
        async (credentialId: string) => {
          const result = await sendMessage('GET_PASSKEY_BY_ID', { credentialId }, 'background');
          return result || null;
        }
      );

      // Build the GetRequest
      const getRequest: GetRequest = {
        origin: request.origin,
        requestId: request.requestId,
        publicKey: {
          rpId: request.publicKey.rpId,
          challenge: request.publicKey.challenge,
          userVerification: request.publicKey.userVerification
        }
      };

      // Get the assertion using the provider
      const credential = await provider.getAssertion(getRequest, credentialId, {
        uvPerformed: true, // Set to true if you implement actual user verification
        includeBEBS: true   // Include backup-eligible and backup-state flags
      });

      console.info('PasskeyAuthenticate: Received assertion successfully', credential);

      // Update last used timestamp
      await sendMessage('UPDATE_PASSKEY_LAST_USED', {
        credentialId
      }, 'background');

      // Send response back
      await sendMessage('PASSKEY_POPUP_RESPONSE', {
        requestId: request.requestId,
        credential
      }, 'background');

      window.close();
    } catch (error) {
      console.error('PasskeyAuthenticate: Error during authentication', error);
      setLoading(false);
      alert(`Failed to authenticate: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /**
   * Handle passkey deletion
   */
  const handleDeletePasskey = async (credentialId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering authentication

    if (!confirm('Are you sure you want to delete this passkey?')) {
      return;
    }

    try {
      await sendMessage('DELETE_PASSKEY', { credentialId }, 'background');

      // Update the request to remove the deleted passkey
      if (request?.passkeys) {
        const updatedPasskeys = request.passkeys.filter(pk => pk.id !== credentialId);
        setRequest({ ...request, passkeys: updatedPasskeys });

        // Clear selection if the deleted passkey was selected
        if (selectedPasskey === credentialId) {
          setSelectedPasskey(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete passkey:', error);
      alert(`Failed to delete passkey: ${error instanceof Error ? error.message : String(error)}`);
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
          Sign in with Passkey
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sign in with passkey for <strong>{request.origin}</strong>
        </p>
      </div>

      <div className="space-y-4">
        {request.passkeys && request.passkeys.length > 0 ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select a passkey to sign in:
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
              {request.passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="relative group p-3 rounded-lg border cursor-pointer transition-colors bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-blue-900 dark:hover:border-blue-700"
                  onClick={() => !loading && handleUsePasskey(pk.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {pk.displayName}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Last used: {pk.lastUsed || 'Never'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeletePasskey(pk.id, e)}
                      className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete passkey"
                      disabled={loading}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400">
              No passkeys found for this site
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
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

export default PasskeyAuthenticate;
