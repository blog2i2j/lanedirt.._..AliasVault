/**
 * WebAuthn injection script - runs in page context to intercept credentials API
 * This is a public entry point that will be included in web_accessible_resources
 */

import { defineUnlistedScript } from '#imports';

import type {
  WebAuthnCreateEventDetail,
  WebAuthnGetEventDetail,
  WebAuthnCreateResponseDetail,
  WebAuthnGetResponseDetail,
  ProviderCreateCredential,
  ProviderGetCredential
} from '@/utils/passkey/webauthn-inject.types';

export default defineUnlistedScript(() => {
  // Only run once
  if ((window as any).__aliasVaultWebAuthnIntercepted) {
    return;
  }
  (window as any).__aliasVaultWebAuthnIntercepted = true;

  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);

  // Helper to convert ArrayBuffer to base64
  /**
   *
   */
  function bufferToBase64(buffer: ArrayBuffer | ArrayBufferView): string {
    const bytes = buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, (buffer as any).byteOffset, (buffer as any).byteLength);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper to convert base64/base64url to ArrayBuffer
  /**
   *
   */
  function base64ToBuffer(base64: string): ArrayBuffer {
    // Handle both base64 and base64url formats
    const base64Standard = base64.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64Standard + '==='.slice((base64Standard.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Override credentials.create
  /**
   *
   */
  navigator.credentials.create = async function(options?: CredentialCreationOptions) {
    console.log('[AliasVault] Page: Intercepted credentials.create', options);

    if (!options?.publicKey) {
      return originalCreate(options);
    }

    // Send event to content script
    const requestId = Math.random().toString(36).substr(2, 9);
    const eventDetail: WebAuthnCreateEventDetail = {
      requestId,
      publicKey: {
        ...options.publicKey,
        challenge: bufferToBase64(options.publicKey.challenge),
        user: {
          ...options.publicKey.user,
          id: bufferToBase64(options.publicKey.user.id)
        },
        excludeCredentials: options.publicKey.excludeCredentials?.map(cred => ({
          ...cred,
          id: bufferToBase64(cred.id)
        }))
      },
      origin: window.location.origin
    };
    const event = new CustomEvent<WebAuthnCreateEventDetail>('aliasvault:webauthn:create', {
      detail: eventDetail
    });
    window.dispatchEvent(event);

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        // Timeout - fall back to native
        console.log('[AliasVault] Page: Timeout, falling back to native');
        originalCreate(options).then(resolve).catch(reject);
      }, 30000); // 30 second timeout

      /**
       *
       */
      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('aliasvault:webauthn:create:response', handler as EventListener);
      }

      /**
       *
       */
      function handler(e: CustomEvent<WebAuthnCreateResponseDetail>) {
        if (e.detail.requestId !== requestId) {
          return;
        }

        cleanup();

        if (e.detail.fallback) {
          // User chose to use native implementation
          console.log('[AliasVault] Page: User chose native, falling back');
          originalCreate(options).then(resolve).catch(reject);
        } else if (e.detail.error) {
          reject(new Error(e.detail.error));
        } else if (e.detail.credential) {
          // Create a proper credential object with required methods
          const cred: ProviderCreateCredential = e.detail.credential;
          console.log('[AliasVault] Page: Creating credential response from:', cred);
          try {
            // Decode the attestation object to extract authenticator data
            const attestationObjectBuffer = base64ToBuffer(cred.attestationObject);
            const attObjBytes = new Uint8Array(attestationObjectBuffer);

            // Simple CBOR parser to extract authData
            // CBOR map starts with 0xA3 (map with 3 items)
            // Keys are: "fmt" (0x63), "attStmt" (0x67), "authData" (0x68)
            let authDataBuffer = new ArrayBuffer(0);
            try {
              // Find "authData" key (0x68 0x61 0x75 0x74 0x68 0x44 0x61 0x74 0x61)
              const authDataKeyBytes = [0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61];
              for (let i = 0; i < attObjBytes.length - authDataKeyBytes.length; i++) {
                let match = true;
                for (let j = 0; j < authDataKeyBytes.length; j++) {
                  if (attObjBytes[i + j] !== authDataKeyBytes[j]) {
                    match = false;
                    break;
                  }
                }
                if (match) {
                  // Found "authData" key, next byte is the type (0x58 = byte string)
                  const typeIdx = i + authDataKeyBytes.length;
                  if (attObjBytes[typeIdx] === 0x58) {
                    // Next byte is the length
                    const length = attObjBytes[typeIdx + 1];
                    authDataBuffer = attObjBytes.slice(typeIdx + 2, typeIdx + 2 + length).buffer;
                  }
                  break;
                }
              }
            } catch (e) {
              console.error('[AliasVault] Failed to parse authData from attestation object:', e);
            }

            const credential = {
              id: cred.id,
              type: 'public-key',
              rawId: base64ToBuffer(cred.rawId),
              authenticatorAttachment: 'platform',
              response: {
                clientDataJSON: base64ToBuffer(cred.clientDataJSON),
                attestationObject: attestationObjectBuffer,
                /**
                 *
                 */
                getTransports() {
                  return ['internal'];
                },
                /**
                 *
                 */
                getAuthenticatorData() {
                  return authDataBuffer;
                },
                /**
                 *
                 */
                getPublicKey() {
                  return null;
                },
                /**
                 *
                 */
                getPublicKeyAlgorithm() {
                  return -7; // ES256
                }
              },
              /**
               *
               */
              getClientExtensionResults() {
                return {};
              }
            };
            console.log('[AliasVault] Page: Created credential object:', credential);
            console.log('[AliasVault] Page: Credential rawId length:', credential.rawId.byteLength);
            console.log('[AliasVault] Page: Credential clientDataJSON length:', credential.response.clientDataJSON.byteLength);
            console.log('[AliasVault] Page: Credential attestationObject length:', credential.response.attestationObject.byteLength);
            console.log('[AliasVault] Page: Credential authData length:', authDataBuffer.byteLength);
            resolve(credential as any);
          } catch (error) {
            console.error('[AliasVault] Page: Error creating credential object:', error);
            reject(error);
          }
        } else {
          // Cancelled
          resolve(null);
        }
      }

      window.addEventListener('aliasvault:webauthn:create:response', handler as EventListener);
    });
  };

  // Override credentials.get
  /**
   *
   */
  navigator.credentials.get = async function(options?: CredentialRequestOptions) {
    console.log('[AliasVault] Page: Intercepted credentials.get', options);

    if (!options?.publicKey) {
      console.log('[AliasVault] Page: No public key, falling back to native');
      return originalGet(options);
    }

    // Send event to content script
    const requestId = Math.random().toString(36).substr(2, 9);
    const eventDetail: WebAuthnGetEventDetail = {
      requestId,
      publicKey: {
        ...options.publicKey,
        challenge: bufferToBase64(options.publicKey.challenge),
        allowCredentials: options.publicKey.allowCredentials?.map(cred => ({
          ...cred,
          id: bufferToBase64(cred.id)
        }))
      },
      origin: window.location.origin
    };
    const event = new CustomEvent<WebAuthnGetEventDetail>('aliasvault:webauthn:get', {
      detail: eventDetail
    });
    window.dispatchEvent(event);

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        // Timeout - fall back to native
        console.log('[AliasVault] Page: Timeout, falling back to native');
        originalGet(options).then(resolve).catch(reject);
      }, 30000);

      /**
       *
       */
      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('aliasvault:webauthn:get:response', handler as EventListener);
      }

      /**
       *
       */
      function handler(e: CustomEvent<WebAuthnGetResponseDetail>) {
        if (e.detail.requestId !== requestId) {
          return;
        }

        cleanup();

        if (e.detail.fallback) {
          // User chose to use native implementation
          console.log('[AliasVault] Page: User chose native, falling back');
          originalGet(options).then(resolve).catch(reject);
        } else if (e.detail.error) {
          reject(new Error(e.detail.error));
        } else if (e.detail.credential) {
          // Create a proper credential object with required methods
          const cred: ProviderGetCredential = e.detail.credential;
          console.log('Sending back credential with userhandle (converted to buffer):', cred.userHandle);
          const credential = {
            id: cred.id,
            type: 'public-key',
            rawId: base64ToBuffer(cred.rawId),
            authenticatorAttachment: 'platform',
            response: {
              clientDataJSON: base64ToBuffer(cred.clientDataJSON),
              authenticatorData: base64ToBuffer(cred.authenticatorData),
              signature: base64ToBuffer(cred.signature),
              userHandle: cred.userHandle ? base64ToBuffer(cred.userHandle) : null
            },
            /**
             *
             */
            getClientExtensionResults() {
              return {};
            }
          };
          resolve(credential as any);
        } else {
          // Cancelled
          resolve(null);
        }
      }

      window.addEventListener('aliasvault:webauthn:get:response', handler as EventListener);
    });
  };

  console.log('[AliasVault] WebAuthn interceptor initialized in page context');
});
