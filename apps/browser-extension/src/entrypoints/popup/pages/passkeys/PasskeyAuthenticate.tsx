import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Button from '@/entrypoints/popup/components/Button';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';

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
 * TODO: review this file
 */
const PasskeyAuthenticate: React.FC = () => {
  const location = useLocation();
  const { setIsInitialLoading } = useLoading();
  const [request, setRequest] = useState<IPasskeyRequest | null>(null);
  const [selectedPasskey, setSelectedPasskey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get the request data from hash (format: #/passkeys/authenticate?request=...)
    const params = new URLSearchParams(location.search);
    const requestData = params.get('request');

    if (requestData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(requestData));
        setRequest(parsed);
      } catch (error) {
        console.error('Failed to parse request data:', error);
      }
    }

    // Mark initial loading as complete
    setIsInitialLoading(false);
  }, [location, setIsInitialLoading]);

  /**
   *
   */
  const handleUsePasskey = async () => {
    if (!request || !selectedPasskey) {
      return;
    }

    setLoading(true);

    // Generate mock assertion for POC
    const credential = {
      id: selectedPasskey,
      rawId: selectedPasskey,
      clientDataJSON: btoa(JSON.stringify({
        type: 'webauthn.get',
        challenge: request.publicKey.challenge,
        origin: request.origin
      })),
      authenticatorData: btoa('mock_authenticator_data'),
      signature: btoa('mock_signature'),
      userHandle: btoa('user_handle')
    };

    // Update last used
    await sendMessage('UPDATE_PASSKEY_LAST_USED', {
      credentialId: selectedPasskey
    }, 'background');

    // Send response back
    await sendMessage('PASSKEY_POPUP_RESPONSE', {
      requestId: request.requestId,
      credential
    }, 'background');

    window.close();
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
              Select a passkey:
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
              {request.passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPasskey === pk.id
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-900 dark:border-blue-700'
                      : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600'
                  }`}
                  onClick={() => setSelectedPasskey(pk.id)}
                >
                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                    {pk.displayName}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Last used: {pk.lastUsed || 'Never'}
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
        {request.passkeys && request.passkeys.length > 0 && (
          <Button
            variant="primary"
            onClick={handleUsePasskey}
            disabled={loading || !selectedPasskey}
            className="w-full"
          >
            {loading ? 'Signing in...' : 'Use Selected Passkey'}
          </Button>
        )}

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
