/**
 * WebAuthn Interceptor - Handles communication between page and extension
 * TODO: review this file
 */

import { sendMessage } from 'webext-bridge/content-script';

import { browser } from '#imports';

let interceptorInitialized = false;

/**
 * Initialize the WebAuthn interceptor
 */
export async function initializeWebAuthnInterceptor(_ctx: any): Promise<void> {
  if (interceptorInitialized) {
    return;
  }

  // Listen for WebAuthn create events from the page
  window.addEventListener('aliasvault:webauthn:create', async (event: any) => {
    const { requestId, publicKey, origin } = event.detail;

    try {
      // Send to background script to handle
      const result = await sendMessage('WEBAUTHN_CREATE', {
        publicKey,
        origin
      }, 'background');

      // Send response back to page
      window.dispatchEvent(new CustomEvent('aliasvault:webauthn:create:response', {
        detail: {
          requestId,
          ...result
        }
      }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('aliasvault:webauthn:create:response', {
        detail: {
          requestId,
          error: error.message
        }
      }));
    }
  });

  // Listen for WebAuthn get events from the page
  window.addEventListener('aliasvault:webauthn:get', async (event: any) => {
    const { requestId, publicKey, origin } = event.detail;

    try {
      // Send to background script to handle
      const result = await sendMessage('WEBAUTHN_GET', {
        publicKey,
        origin
      }, 'background');

      // Send response back to page
      window.dispatchEvent(new CustomEvent('aliasvault:webauthn:get:response', {
        detail: {
          requestId,
          ...result
        }
      }));
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('aliasvault:webauthn:get:response', {
        detail: {
          requestId,
          error: error.message
        }
      }));
    }
  });

  // Inject the page script
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/webauthn.js');
  script.async = true;
  (document.head || document.documentElement).appendChild(script);
  /**
   * onload
   */
  script.onload = () : void => {
    script.remove();
  };
  /**
   * onerror
   */
  script.onerror = () : void => {
    console.error('[AliasVault] WebAuthnInterceptor: Failed to load injected script');
  };

  interceptorInitialized = true;
}

/**
 * Check if WebAuthn interception is enabled
 */
export async function isWebAuthnInterceptionEnabled(): Promise<boolean> {
  try {
    const response = await sendMessage('GET_WEBAUTHN_SETTINGS', {}, 'background');
    return response.enabled ?? false;
  } catch {
    return false;
  }
}
