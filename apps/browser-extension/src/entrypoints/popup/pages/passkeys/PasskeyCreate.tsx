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
   *
   */
  const handleCreate = async () => {
    if (!request) {
      return;
    }

    setLoading(true);

    try {
      console.log('PasskeyCreate: Starting passkey creation');
      console.log('PasskeyCreate: request', request);

      // Generate a real cryptographic key pair
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        true, // extractable
        ['sign', 'verify']
      );

      // Export the public key
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

      // Generate credential ID
      const credIdBytes = crypto.getRandomValues(new Uint8Array(16));
      // Convert to base64url (WebAuthn uses base64url, not standard base64)
      const base64 = btoa(String.fromCharCode(...credIdBytes));
      const credentialId = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      // Calculate rpId hash (SHA-256 of rpId)
      const rpId = request.publicKey.rp?.id || new URL(request.origin).hostname;
      const rpIdBuffer = new TextEncoder().encode(rpId);
      const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBuffer);
      const rpIdHash = new Uint8Array(rpIdHashBuffer);

      // Flags: UP (User Present) = 1, UV (User Verified) = 1, AT (Attested Credential Data) = 1
      const flags = new Uint8Array([0x45]); // Binary: 01000101
      const signCount = new Uint8Array([0, 0, 0, 0]);
      const aaguid = new Uint8Array(16); // All zeros for this implementation

      // Convert JWK coordinates from base64url to bytes for COSE format
      /**
       *
       */
      const base64UrlToBytes = (base64url: string): Uint8Array => {
        const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64);
        return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
      };

      const xCoord = base64UrlToBytes(publicKeyJwk.x!);
      const yCoord = base64UrlToBytes(publicKeyJwk.y!);

      /*
       * COSE public key (ES256 format) - proper CBOR encoding
       * Map with 5 entries: kty(1), alg(3), crv(-1), x(-2), y(-3)
       * CBOR negative integers: -1 = 0x20, -2 = 0x21, -3 = 0x22, -7 = 0x26
       * Keys must be in canonical order (by encoded byte value)
       */
      const coseKey = new Uint8Array([
        0xa5, // map(5)
        0x01, // key: 1 (kty - key type)
        0x02, // value: 2 (EC2 - Elliptic Curve Keys with x and y coordinate pair)
        0x03, // key: 3 (alg - algorithm)
        0x26, // value: -7 (ES256 - ECDSA w/ SHA-256)
        0x20, // key: -1 (crv - curve)
        0x01, // value: 1 (P-256)
        0x21, // key: -2 (x-coordinate)
        0x58, 0x20, // byte string(32)
        ...xCoord, // x coordinate (32 bytes)
        0x22, // key: -3 (y-coordinate)
        0x58, 0x20, // byte string(32)
        ...yCoord  // y coordinate (32 bytes)
      ]);

      // Construct authData
      const credIdLength = new Uint8Array([0, credIdBytes.length]);
      const authData = new Uint8Array([
        ...rpIdHash,
        ...flags,
        ...signCount,
        ...aaguid,
        ...credIdLength,
        ...credIdBytes,
        ...coseKey
      ]);

      /*
       * CBOR encode attestation object: {fmt: "none", authData: bytes, attStmt: {}}
       * Need to properly encode the authData length as a CBOR byte string
       */
      let authDataLengthBytes: number[];
      if (authData.length <= 23) {
        authDataLengthBytes = [0x40 | authData.length];
      } else if (authData.length <= 255) {
        authDataLengthBytes = [0x58, authData.length];
      } else {
        authDataLengthBytes = [0x59, authData.length >> 8, authData.length & 0xff];
      }

      // Create clientDataJSON (used for both signature and response)
      const clientDataJSON = JSON.stringify({
        type: 'webauthn.create',
        challenge: request.publicKey.challenge,
        origin: request.origin
      });

      // Check what attestation format is requested
      const attestationPreference = request.publicKey.attestation || 'none';
      console.log('PasskeyCreate: attestation preference', attestationPreference);

      let attestationObject: Uint8Array;

      if (attestationPreference === 'none' || attestationPreference === 'indirect') {
      /*
       * Use "none" attestation format (simplest, most privacy-preserving)
       * CRITICAL: CBOR map keys MUST be in lexicographic order of encoded bytes
       * The spec says: (fmt, attStmt, authData) NOT (fmt, authData, attStmt)
       * See: https://www.w3.org/TR/webauthn-2/#sctn-attestation-formats
       * Encoded key bytes: "authData" = 0x68..., "attStmt" = 0x67..., "fmt" = 0x63...
       * Sorted order by first byte: 0x63 < 0x67 < 0x68
       */
        attestationObject = new Uint8Array([
          0xa3, // map(3)
          0x63, 0x66, 0x6d, 0x74, // "fmt" (text(3)) - 0x636d74
          0x64, 0x6e, 0x6f, 0x6e, 0x65, // "none" (text(4))
          0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, // "attStmt" (text(7)) - 0x6761747453746d74
          0xa0, // map(0) - empty map
          0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData" (text(8)) - 0x6861757468446174
          ...authDataLengthBytes, ...authData // byte string with proper length encoding
        ]);
      } else {
      /*
       * Use "packed" attestation format with self-attestation
       * Create signature over authData + clientDataHash
       */
        const clientDataHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON));
        const dataToSign = new Uint8Array([...authData, ...new Uint8Array(clientDataHash)]);

        // Sign with the credential's private key (self-attestation)
        const attSignature = await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keyPair.privateKey,
          dataToSign
        );

        // Convert to DER format
        const rawSig = new Uint8Array(attSignature);
        const r = rawSig.slice(0, 32);
        const s = rawSig.slice(32, 64);

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

          return new Uint8Array([0x02, trimmed.length, ...trimmed]);
        };

        const rDer = encodeInteger(r);
        const sDer = encodeInteger(s);
        const derSignature = new Uint8Array([0x30, rDer.length + sDer.length, ...rDer, ...sDer]);

        /*
         * CBOR encode "packed" attestation object with self-attestation
         * IMPORTANT: CBOR map keys must be in canonical order:
         * 1. Sort by length (shortest first)
         * 2. Within same length, sort lexicographically
         * Order: "fmt" (3) < "alg" (3), "sig" (3) < "attStmt" (7) < "authData" (8)
         */

        const sigLengthBytes = derSignature.length <= 23
          ? [0x40 | derSignature.length]
          : [0x58, derSignature.length];

        attestationObject = new Uint8Array([
          0xa3, // map(3)
          // Key 1: "fmt" (3 bytes)
          0x63, 0x66, 0x6d, 0x74, // "fmt" (text(3))
          0x66, 0x70, 0x61, 0x63, 0x6b, 0x65, 0x64, // "packed" (text(6))
          // Key 2: "attStmt" (7 bytes)
          0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, // "attStmt" (text(7))
          0xa2, // map(2) - alg and sig, also in canonical order
          0x63, 0x61, 0x6c, 0x67, // "alg" (text(3)) - comes before "sig"
          0x26, // -7 (ES256)
          0x63, 0x73, 0x69, 0x67, // "sig" (text(3))
          ...sigLengthBytes, ...derSignature, // byte string
          // Key 3: "authData" (8 bytes)
          0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData" (text(8))
          ...authDataLengthBytes, ...authData // byte string with proper length encoding
        ]);
      }

      const credential = {
        id: credentialId,
        rawId: credentialId,
        clientDataJSON: btoa(clientDataJSON),
        attestationObject: btoa(String.fromCharCode(...attestationObject))
      };

      // Debug logging
      console.info('PasskeyCreate: Created credential');
      console.info('PasskeyCreate: credentialId length:', credentialId.length);
      console.info('PasskeyCreate: attestationObject length:', attestationObject.length);
      console.info('PasskeyCreate: attestation format:', attestationPreference);
      console.info('PasskeyCreate: rpId:', rpId);
      console.info('PasskeyCreate: origin:', request.origin);

      // Store passkey with the private key for future authentication
      await sendMessage('STORE_PASSKEY', {
        rpId,
        credentialId,
        displayName,
        publicKey: publicKeyJwk as JsonWebKey,
        privateKey: privateKeyJwk as JsonWebKey
      } as any, 'background');

      // Send response back
      await sendMessage('PASSKEY_POPUP_RESPONSE', {
        requestId: request.requestId,
        credential
      }, 'background');

      window.close();
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
