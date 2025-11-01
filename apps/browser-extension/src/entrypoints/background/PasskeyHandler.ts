/**
 * PasskeyHandler - Handles passkey popup management in background
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extractDomain, extractRootDomain } from '@/entrypoints/contentScript/Filter';

import {
  PASSKEY_PROVIDER_ENABLED_KEY,
  PASSKEY_DISABLED_SITES_KEY
} from '@/utils/Constants';
import type {
  PasskeyPopupResponse,
  WebAuthnCreateRequest,
  WebAuthnGetRequest,
  PendingPasskeyRequest,
  PendingPasskeyCreateRequest,
  PendingPasskeyGetRequest,
  WebAuthnSettingsResponse,
  WebAuthnCreationPayload,
  WebAuthnPublicKeyGetPayload
} from '@/utils/passkey/types';

import { browser, storage } from '#imports';

// Pending popup requests
const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  /**
   * Store window ID in order to close the popup window from background script later.
   */
  windowId?: number;
}>();

// Store request data temporarily (to avoid URL length limits)
const pendingRequestData = new Map<string, PendingPasskeyRequest>();

/**
 * Handle WebAuthn settings request
 */
export async function handleGetWebAuthnSettings(data: any): Promise<WebAuthnSettingsResponse> {
  // Check if passkey provider is enabled in settings (default to true if not set)
  const globalEnabled = await storage.getItem(PASSKEY_PROVIDER_ENABLED_KEY);
  if (globalEnabled === false) {
    return { enabled: false };
  }

  // If hostname is provided, check if it's disabled for that site
  const { hostname } = data || {};
  if (hostname) {
    // Extract base domain for matching
    const baseDomain = extractRootDomain(extractDomain(hostname));

    // Check disabled sites
    const disabledSites = await storage.getItem(PASSKEY_DISABLED_SITES_KEY) as string[] ?? [];
    if (disabledSites.includes(baseDomain)) {
      return { enabled: false };
    }
  }

  return { enabled: true };
}

/**
 * Handle WebAuthn create (registration) request
 */
export async function handleWebAuthnCreate(data: any): Promise<any> {
  const { publicKey, origin } = data as WebAuthnCreateRequest;
  const requestId = Math.random().toString(36).substr(2, 9);

  // Store request data temporarily (to avoid URL length limits)
  const requestData: PendingPasskeyCreateRequest = {
    type: 'create',
    requestId,
    origin,
    publicKey: publicKey as WebAuthnCreationPayload
  };
  pendingRequestData.set(requestId, requestData);

  // Create popup using main popup with hash navigation - only pass requestId
  const popupUrl = browser.runtime.getURL('/popup.html') + '#/passkeys/create?' + new URLSearchParams({
    requestId
  }).toString();

  try {
    const popup = await browser.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 450,
      height: 600,
      focused: true
    });

    // Wait for response from popup
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject, windowId: popup.id });

      // Clean up if popup is closed without response
      const checkClosed = setInterval(async () => {
        try {
          if (popup.id) {
            const _window = await browser.windows.get(popup.id);
            // Window still exists, continue waiting
          }
        } catch {
          // Window no longer exists
          clearInterval(checkClosed);
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            pendingRequestData.delete(requestId);
            resolve({ cancelled: true });
          }
        }
      }, 1000);
    });
  } catch {
    return { error: 'Failed to create popup window' };
  }
}

/**
 * Handle WebAuthn get (authentication) request
 * Note: Passkey retrieval is now handled in the popup via SqliteClient
 */
export async function handleWebAuthnGet(data: any): Promise<any> {
  const { publicKey, origin } = data as WebAuthnGetRequest;
  const requestId = Math.random().toString(36).substr(2, 9);

  // Store request data temporarily (to avoid URL length limits)
  const requestData: PendingPasskeyGetRequest = {
    type: 'get',
    requestId,
    origin,
    publicKey: publicKey as WebAuthnPublicKeyGetPayload,
    passkeys: [] // Will be populated by the popup from vault
  };
  pendingRequestData.set(requestId, requestData);

  // Create popup using main popup with hash navigation - only pass requestId
  const popupUrl = browser.runtime.getURL('/popup.html') + '#/passkeys/authenticate?' + new URLSearchParams({
    requestId
  }).toString();

  try {
    const popup = await browser.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 450,
      height: 600,
      focused: true
    });

    // Wait for response from popup
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject, windowId: popup.id });

      // Clean up if popup is closed without response
      const checkClosed = setInterval(async () => {
        try {
          if (popup.id) {
            const _window = await browser.windows.get(popup.id);
            // Window still exists, continue waiting
          }
        } catch {
          // Window no longer exists
          clearInterval(checkClosed);
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            pendingRequestData.delete(requestId);
            resolve({ cancelled: true });
          }
        }
      }, 1000);
    });
  } catch {
    return { error: 'Failed to create popup window' };
  }
}

/**
 * Handle response from passkey popup
 */
export async function handlePasskeyPopupResponse(data: any): Promise<{ success: boolean }> {
  const { requestId, credential, fallback, cancelled } = data as PasskeyPopupResponse;
  const request = pendingRequests.get(requestId);

  if (!request) {
    return { success: false };
  }

  /**
   * Close the popup window from background script to ensure it always works.
   * Calling window.close() from the popup does not work in all browsers.
   */
  if (request.windowId) {
    try {
      await browser.windows.remove(request.windowId);
    } catch (error) {
      // Window might already be closed, ignore error
      console.debug('Failed to close popup window:', error);
    }
  }

  // Clean up both maps
  pendingRequests.delete(requestId);
  pendingRequestData.delete(requestId);

  if (cancelled) {
    request.resolve({ cancelled: true });
  } else if (fallback) {
    request.resolve({ fallback: true });
  } else if (credential) {
    request.resolve({ credential });
  } else {
    request.resolve({ cancelled: true });
  }

  return { success: true };
}

/**
 * Get request data by request ID
 */
export async function handleGetRequestData(data: any): Promise<PendingPasskeyRequest | null> {
  const { requestId } = data as { requestId: string };
  const requestData = pendingRequestData.get(requestId);
  return requestData || null;
}

