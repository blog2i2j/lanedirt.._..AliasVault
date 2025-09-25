/**
 * WebAuthn injection script - runs in page context to intercept credentials API
 * This is a public entry point that will be included in web_accessible_resources
 */

import { defineUnlistedScript } from '#imports';

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

  // Helper to convert base64 to ArrayBuffer
  /**
   *
   */
  function base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
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
    const event = new CustomEvent('aliasVault:webauthn:create', {
      detail: {
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
      }
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
        window.removeEventListener('aliasVault:webauthn:create:response', handler);
      }

      /**
       *
       */
      function handler(e: any) {
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
          // Mock credential for POC
          const cred = e.detail.credential;
          resolve({
            id: cred.id,
            type: 'public-key',
            rawId: base64ToBuffer(cred.rawId),
            response: {
              clientDataJSON: base64ToBuffer(cred.clientDataJSON),
              attestationObject: base64ToBuffer(cred.attestationObject)
            }
          } as any);
        } else {
          // Cancelled
          resolve(null);
        }
      }

      window.addEventListener('aliasVault:webauthn:create:response', handler);
    });
  };

  // Override credentials.get
  /**
   *
   */
  navigator.credentials.get = async function(options?: CredentialRequestOptions) {
    console.log('[AliasVault] Page: Intercepted credentials.get', options);

    if (!options?.publicKey) {
      return originalGet(options);
    }

    // Send event to content script
    const requestId = Math.random().toString(36).substr(2, 9);
    const event = new CustomEvent('aliasVault:webauthn:get', {
      detail: {
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
      }
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
        window.removeEventListener('aliasVault:webauthn:get:response', handler);
      }

      /**
       *
       */
      function handler(e: any) {
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
          // Mock credential for POC
          const cred = e.detail.credential;
          resolve({
            id: cred.id,
            type: 'public-key',
            rawId: base64ToBuffer(cred.rawId),
            response: {
              clientDataJSON: base64ToBuffer(cred.clientDataJSON),
              authenticatorData: base64ToBuffer(cred.authenticatorData),
              signature: base64ToBuffer(cred.signature),
              userHandle: cred.userHandle ? base64ToBuffer(cred.userHandle) : null
            }
          } as any);
        } else {
          // Cancelled
          resolve(null);
        }
      }

      window.addEventListener('aliasVault:webauthn:get:response', handler);
    });
  };

  console.log('[AliasVault] WebAuthn interceptor initialized in page context');
});
