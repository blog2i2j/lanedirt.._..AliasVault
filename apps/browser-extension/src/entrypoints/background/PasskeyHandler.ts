/**
 * PasskeyHandler - Handles passkey storage and management in background
 * TODO: review this file
 */

import { storage, browser } from '#imports';

interface IPasskeyData {
  id: string;
  rpId: string;
  credentialId: string;
  displayName: string;
  publicKey: unknown;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  signCount: number;
}

// In-memory session storage for passkeys (for POC)
const sessionPasskeys = new Map<string, IPasskeyData>();

// Pending popup requests
const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: any) => void;
}>();

/**
 * Handle WebAuthn settings request
 */
export async function handleGetWebAuthnSettings(): Promise<{ enabled: boolean }> {
  /*
   * For POC, always enabled. In production, this would be a user setting
   * const settings = await storage.getItem('local:webauthn_enabled');
   * return { enabled: settings !== false };
   */
  return { enabled: true };
}

/**
 * Handle WebAuthn create (registration) request
 */
export async function handleWebAuthnCreate(data: {
  publicKey: unknown;
  origin: string;
}): Promise<any> {
  const { publicKey, origin } = data;
  const requestId = Math.random().toString(36).substr(2, 9);

  console.log('handleWebAuthnCreate: requestId', requestId);
  console.log('handleWebAuthnCreate: origin', origin);
  console.log('handleWebAuthnCreate: publicKey', publicKey);

  // Create popup using main popup with hash navigation
  const popupUrl = browser.runtime.getURL('/popup.html') + '#/passkeys/create?' + new URLSearchParams({
    request: encodeURIComponent(JSON.stringify({
      type: 'create',
      requestId,
      origin,
      publicKey
    }))
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
      pendingRequests.set(requestId, { resolve, reject });

      // Clean up if popup is closed without response
      const checkClosed = setInterval(async () => {
        try {
          if (popup.id) {
            const window = await browser.windows.get(popup.id);
            // Window still exists, continue waiting
          }
        } catch {
          // Window no longer exists
          clearInterval(checkClosed);
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            resolve({ cancelled: true });
          }
        }
      }, 1000);
    });
  } catch (error) {
    return { error: 'Failed to create popup window' };
  }
}

interface IPasskeyDisplay {
  id: string;
  displayName: string;
  lastUsed: string | null;
}

/**
 * Handle WebAuthn get (authentication) request
 */
export async function handleWebAuthnGet(data: {
  publicKey: { allowCredentials?: Array<{ id: string }> };
  origin: string;
}): Promise<any> {
  const { publicKey, origin } = data;
  const requestId = Math.random().toString(36).substr(2, 9);

  // Get passkeys for this origin
  const passkeys = getPasskeysForOrigin(origin);

  // Filter by allowCredentials if specified
  let filteredPasskeys = passkeys;
  if (publicKey.allowCredentials && publicKey.allowCredentials.length > 0) {
    const allowedIds = new Set(publicKey.allowCredentials.map(c => c.id));
    filteredPasskeys = passkeys.filter(pk => allowedIds.has(pk.credentialId));
  }

  const passkeyList = filteredPasskeys.map(pk => ({
    id: pk.credentialId,
    displayName: pk.displayName,
    lastUsed: pk.lastUsedAt ? new Date(pk.lastUsedAt).toLocaleDateString() : null
  }));

  // Create popup using main popup with hash navigation
  const popupUrl = browser.runtime.getURL('/popup.html') + '#/passkeys/authenticate?' + new URLSearchParams({
    request: encodeURIComponent(JSON.stringify({
      type: 'get',
      requestId,
      origin,
      publicKey,
      passkeys: passkeyList
    }))
  }).toString();

  try {
    const popup = await browser.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 450,
      height: Math.min(600, 400 + passkeyList.length * 60),
      focused: true
    });

    // Wait for response from popup
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });

      // Clean up if popup is closed without response
      const checkClosed = setInterval(async () => {
        try {
          if (popup.id) {
            const window = await browser.windows.get(popup.id);
            // Window still exists, continue waiting
          }
        } catch {
          // Window no longer exists
          clearInterval(checkClosed);
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            resolve({ cancelled: true });
          }
        }
      }, 1000);
    });
  } catch (error) {
    return { error: 'Failed to create popup window' };
  }
}

/**
 * Store a new passkey
 */
export async function handleStorePasskey(data: {
  rpId: string;
  credentialId: string;
  displayName: string;
  publicKey: unknown;
}): Promise<{ success: boolean }> {
  const { rpId, credentialId, displayName, publicKey } = data;

  const passkey: IPasskeyData = {
    id: Date.now().toString(),
    rpId: rpId.replace(/^https?:\/\//, '').split('/')[0], // Extract domain
    credentialId,
    displayName,
    publicKey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastUsedAt: null,
    signCount: 0
  };

  // Store in session memory
  const key = `${passkey.rpId}:${credentialId}`;
  sessionPasskeys.set(key, passkey);

  /*
   * In production, this would be stored in the vault database
   * For now, also store in local storage for persistence across reloads
   */
  const storedPasskeys: Record<string, IPasskeyData> = await storage.getItem('local:passkeys') || {};
  storedPasskeys[key] = passkey;
  await storage.setItem('local:passkeys', storedPasskeys);

  return { success: true };
}

/**
 * Update passkey last used time
 */
export async function handleUpdatePasskeyLastUsed(data: {
  credentialId: string;
}): Promise<{ success: boolean }> {
  const { credentialId } = data;

  // Find and update the passkey
  for (const [key, passkey] of sessionPasskeys.entries()) {
    if (passkey.credentialId === credentialId) {
      passkey.lastUsedAt = Date.now();
      passkey.signCount++;
      sessionPasskeys.set(key, passkey);

      // Update in storage too
      const storedPasskeys: Record<string, IPasskeyData> = await storage.getItem('local:passkeys') || {};
      if (storedPasskeys[key]) {
        storedPasskeys[key] = passkey;
        await storage.setItem('local:passkeys', storedPasskeys);
      }
      return { success: true };
    }
  }

  return { success: false };
}

/**
 * Get passkeys for a specific origin
 */
function getPasskeysForOrigin(origin: string): IPasskeyData[] {
  const rpId = origin.replace(/^https?:\/\//, '').split('/')[0];
  const passkeys: IPasskeyData[] = [];

  for (const [_key, passkey] of sessionPasskeys.entries()) {
    if (passkey.rpId === rpId || passkey.rpId === `.${rpId}`) {
      passkeys.push(passkey);
    }
  }

  return passkeys;
}

/**
 * Initialize passkeys from storage on startup
 */
export async function initializePasskeys(): Promise<void> {
  const storedPasskeys: Record<string, IPasskeyData> = await storage.getItem('local:passkeys') || {};

  for (const [key, passkey] of Object.entries(storedPasskeys)) {
    sessionPasskeys.set(key, passkey as IPasskeyData);
  }
}

/**
 * Handle response from passkey popup
 */
export async function handlePasskeyPopupResponse(data: {
  requestId: string;
  credential?: any;
  fallback?: boolean;
  cancelled?: boolean;
}): Promise<{ success: boolean }> {
  const { requestId, credential, fallback, cancelled } = data;
  const request = pendingRequests.get(requestId);

  if (!request) {
    return { success: false };
  }

  pendingRequests.delete(requestId);

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
 * Clear all passkeys (for development)
 */
export async function handleClearAllPasskeys(): Promise<{ success: boolean }> {
  sessionPasskeys.clear();
  await storage.removeItem('local:passkeys');
  return { success: true };
}
