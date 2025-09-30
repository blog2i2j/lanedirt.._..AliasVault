import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Button from '@/entrypoints/popup/components/Button';
import { FormInput } from '@/entrypoints/popup/components/FormInput';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';

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
    // Get the request data from hash
    const hash = location.hash.substring(1); // Remove '#'
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const requestData = params.get('request');

    console.log('PasskeyCreate: useEffect: requestData', requestData);

    if (requestData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(requestData));
        setRequest(parsed);

        if (parsed.publicKey?.user?.displayName) {
          setDisplayName(parsed.publicKey.user.displayName);
        }
      } catch (error) {
        console.error('Failed to parse request data:', error);
      }
    }

    // Mark initial loading as complete
    console.log('PasskeyCreate: useEffect: setIsInitialLoading(false)');
    setIsInitialLoading(false);
  }, [location, setIsInitialLoading]);

  /**
   *
   */
  const handleCreate = async () => {
    if (!request) {
      return;
    }

    setLoading(true);

    // Generate mock credential for POC
    const credentialId = btoa(Math.random().toString());
    const credential = {
      id: credentialId,
      rawId: credentialId,
      clientDataJSON: btoa(JSON.stringify({
        type: 'webauthn.create',
        challenge: request.publicKey.challenge,
        origin: request.origin
      })),
      attestationObject: btoa('mock_attestation_object')
    };

    // Store passkey
    await sendMessage('STORE_PASSKEY', {
      rpId: request.origin,
      credentialId,
      displayName,
      publicKey: request.publicKey
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
