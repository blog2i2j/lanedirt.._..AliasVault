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
   *
   */
  const handleUsePasskey = async () => {
    if (!request || !selectedPasskey) {
      return;
    }

    setLoading(true);

    try {
      console.log('PasskeyAuthenticate: Starting authentication');
      console.log('PasskeyAuthenticate: selectedPasskey', selectedPasskey);
      console.log('PasskeyAuthenticate: request', request);

      // Get the stored passkey to access the private key
      const passkeyData = await sendMessage('GET_PASSKEY_BY_ID', { credentialId: selectedPasskey }, 'background');

      if (!passkeyData) {
        console.error('Passkey not found');
        setLoading(false);
        return;
      }

      // Calculate rpId hash
      const rpId = request.publicKey.rpId || new URL(request.origin).hostname;
      const rpIdBuffer = new TextEncoder().encode(rpId);
      const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBuffer);
      const rpIdHash = new Uint8Array(rpIdHashBuffer);

      // Flags: UP (User Present) = 1, UV (User Verified) = 1
      const flags = new Uint8Array([0x05]); // Binary: 00000101

      // Sign count - increment from stored value (must increase on each use to detect cloned authenticators)
      const newSignCount = (passkeyData.signCount || 0) + 1;
      const signCount = new Uint8Array([
        (newSignCount >> 24) & 0xff,
        (newSignCount >> 16) & 0xff,
        (newSignCount >> 8) & 0xff,
        newSignCount & 0xff
      ]);

      // Construct authenticatorData (37 bytes minimum)
      const authenticatorData = new Uint8Array([
        ...rpIdHash,    // 32 bytes
        ...flags,       // 1 byte
        ...signCount    // 4 bytes
      ]);

      // Create clientDataJSON
      const clientDataJSON = JSON.stringify({
        type: 'webauthn.get',
        challenge: request.publicKey.challenge,
        origin: request.origin
      });

      // Create signature over authenticatorData + hash(clientDataJSON)
      const clientDataHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON));
      const dataToSign = new Uint8Array([...authenticatorData, ...new Uint8Array(clientDataHash)]);

      // Import the private key and sign
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        passkeyData.privateKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        dataToSign
      );

      // Convert raw signature (r || s) to DER format for WebAuthn
      const rawSignature = new Uint8Array(signatureBuffer);
      const r = rawSignature.slice(0, 32);
      const s = rawSignature.slice(32, 64);

      // Helper to encode integer in DER format
      /**
       *
       */
      const encodeInteger = (int: Uint8Array): Uint8Array => {
      // Remove leading zeros but keep at least one byte
        let i = 0;
        while (i < int.length - 1 && int[i] === 0 && (int[i + 1] & 0x80) === 0) {
          i++;
        }
        let trimmed = int.slice(i);

        // If high bit is set, add zero padding to keep it positive
        if (trimmed[0] & 0x80) {
          const padded = new Uint8Array(trimmed.length + 1);
          padded[0] = 0;
          padded.set(trimmed, 1);
          trimmed = padded;
        }

        // DER encoding: 0x02 (INTEGER tag) + length + value
        return new Uint8Array([0x02, trimmed.length, ...trimmed]);
      };

      const rDer = encodeInteger(r);
      const sDer = encodeInteger(s);

      // DER SEQUENCE: 0x30 (SEQUENCE tag) + length + r + s
      const derSignature = new Uint8Array([
        0x30,
        rDer.length + sDer.length,
        ...rDer,
        ...sDer
      ]);

      const credential = {
        id: selectedPasskey,
        rawId: selectedPasskey,
        clientDataJSON: btoa(clientDataJSON),
        authenticatorData: btoa(String.fromCharCode(...authenticatorData)),
        signature: btoa(String.fromCharCode(...derSignature)),
        userHandle: null
      };

      // Update last used and sign count
      await sendMessage('UPDATE_PASSKEY_LAST_USED', {
        credentialId: selectedPasskey,
        newSignCount
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
