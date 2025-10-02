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
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  userId?: string | null;          // base64url encoded user.id for userHandle
  userName?: string;
  userDisplayName?: string;
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

// Store request data temporarily (to avoid URL length limits)
const pendingRequestData = new Map<string, any>();

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

  // Store request data temporarily (to avoid URL length limits)
  const requestData = {
    type: 'create',
    requestId,
    origin,
    publicKey
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
            pendingRequestData.delete(requestId);
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
  console.log('handleWebAuthnGet: origin', origin);
  const passkeys = getPasskeysForOrigin(origin);

  // Filter by allowCredentials if specified
  let filteredPasskeys = passkeys;

  if (publicKey.allowCredentials && publicKey.allowCredentials.length > 0) {
    const allowedIds = new Set(publicKey.allowCredentials.map(c => c.id));
    console.log('handleWebAuthnGet: allowedIds', Array.from(allowedIds));
    filteredPasskeys = passkeys.filter(pk => {
      const matches = allowedIds.has(pk.credentialId);
      console.log('handleWebAuthnGet: checking', pk.credentialId, 'matches?', matches);
      return matches;
    });
    console.log('handleWebAuthnGet: after filter, filteredPasskeys count', filteredPasskeys.length);
  }

  let passkeyList = filteredPasskeys.map(pk => ({
    id: pk.credentialId,
    displayName: pk.displayName,
    lastUsed: pk.lastUsedAt ? new Date(pk.lastUsedAt).toLocaleDateString() : null
  }));
  console.log('handleWebAuthnGet: final passkeyList', passkeyList);

  /*
   * If allowCredentials was specified but we have no matches, show all passkeys anyway
   * (This is what password managers do - they show their own passkeys even if the site
   * doesn't explicitly request them, allowing users to use extension passkeys)
   */
  if (passkeyList.length === 0 && passkeys.length > 0) {
    console.log('handleWebAuthnGet: no matching allowCredentials, showing all passkeys instead');
    passkeyList = passkeys.map(pk => ({
      id: pk.credentialId,
      displayName: pk.displayName,
      lastUsed: pk.lastUsedAt ? new Date(pk.lastUsedAt).toLocaleDateString() : null
    }));
  }

  // Store request data temporarily (to avoid URL length limits)
  const requestData = {
    type: 'get',
    requestId,
    origin,
    publicKey,
    passkeys: passkeyList
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
            pendingRequestData.delete(requestId);
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
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  userId?: string | null;
  userName?: string;
  userDisplayName?: string;
}): Promise<{ success: boolean }> {
  const { rpId, credentialId, displayName, publicKey, privateKey, userId, userName, userDisplayName } = data;

  console.log('handleStorePasskey: Storing passkey with raw userId:', userId);

  const passkey: IPasskeyData = {
    id: Date.now().toString(),
    rpId, // Already processed by the popup, no need to extract domain again
    credentialId,
    displayName,
    publicKey,
    privateKey,
    userId,
    userName,
    userDisplayName,
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
  let storedPasskeys: Record<string, IPasskeyData> = {};
  const rawData = await storage.getItem('local:passkeys');

  // Handle migration from old array format or corrupted string data
  if (typeof rawData === 'string') {
    // Data was stored as stringified JSON (old format), clear it
    console.warn('PasskeyHandler: Found old/corrupted passkey storage format, migrating...');
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) {
        // Convert array to record format
        for (const pk of parsed) {
          const pkKey = `${pk.rpId}:${pk.credentialId}`;
          storedPasskeys[pkKey] = pk;
        }
      }
    } catch (e) {
      console.error('PasskeyHandler: Failed to migrate old passkey data', e);
    }
  } else if (rawData && typeof rawData === 'object') {
    storedPasskeys = rawData as Record<string, IPasskeyData>;
  }

  storedPasskeys[key] = passkey;
  await storage.setItem('local:passkeys', storedPasskeys);

  return { success: true };
}

/**
 * Update passkey last used time (sign count always remains 0 for cross-device sync compatibility)
 */
export async function handleUpdatePasskeyLastUsed(data: {
  credentialId: string;
}): Promise<{ success: boolean }> {
  const { credentialId } = data;

  // Find and update the passkey
  for (const [key, passkey] of sessionPasskeys.entries()) {
    if (passkey.credentialId === credentialId) {
      passkey.lastUsedAt = Date.now();
      // Sign count always remains 0 for cross-device sync compatibility
      passkey.signCount = 0;

      sessionPasskeys.set(key, passkey);

      // Update in storage too
      const rawData = await storage.getItem('local:passkeys');
      let storedPasskeys: Record<string, IPasskeyData> = {};

      if (typeof rawData === 'object' && rawData !== null) {
        storedPasskeys = rawData as Record<string, IPasskeyData>;
      }

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

  for (const [key, passkey] of sessionPasskeys.entries()) {
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
  const rawData = await storage.getItem('local:passkeys');
  let storedPasskeys: Record<string, IPasskeyData> = {};

  // Handle migration from old array format or corrupted string data
  if (typeof rawData === 'string') {
    console.warn('PasskeyHandler: Found old/corrupted passkey storage format during init, migrating...');
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) {
        // Convert array to record format
        for (const pk of parsed) {
          const pkKey = `${pk.rpId}:${pk.credentialId}`;
          storedPasskeys[pkKey] = pk;
        }
        // Save migrated data
        await storage.setItem('local:passkeys', storedPasskeys);
      }
    } catch (e) {
      console.error('PasskeyHandler: Failed to migrate old passkey data during init', e);
    }
  } else if (rawData && typeof rawData === 'object') {
    storedPasskeys = rawData as Record<string, IPasskeyData>;
  }

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
 * Get passkey by credential ID
 */
export async function handleGetPasskeyById(data: { credentialId: string }): Promise<IPasskeyData | null> {
  const { credentialId } = data;

  for (const [_key, passkey] of sessionPasskeys.entries()) {
    if (passkey.credentialId === credentialId) {
      console.log('handleGetPasskeyById: Found passkey with userId:', passkey.userId);
      return passkey;
    }
  }

  console.log('handleGetPasskeyById: Passkey not found for credentialId:', credentialId);
  return null;
}

/**
 * Get request data by request ID
 */
export async function handleGetRequestData(data: { requestId: string }): Promise<any> {
  const { requestId } = data;
  const requestData = pendingRequestData.get(requestId);
  return requestData || null;
}

/**
 * Clear all passkeys (for development)
 */
export async function handleClearAllPasskeys(): Promise<{ success: boolean }> {
  sessionPasskeys.clear();
  await storage.removeItem('local:passkeys');
  return { success: true };
}

/**
 * Delete a specific passkey
 */
export async function handleDeletePasskey(data: { credentialId: string }): Promise<{ success: boolean }> {
  const { credentialId } = data;

  // Find and remove from session storage
  let deletedKey: string | null = null;
  for (const [key, passkey] of sessionPasskeys.entries()) {
    if (passkey.credentialId === credentialId) {
      sessionPasskeys.delete(key);
      deletedKey = key;
      break;
    }
  }

  if (deletedKey) {
    // Remove from storage (storage API expects Record format, not stringified)
    const storedPasskeys: Record<string, IPasskeyData> = await storage.getItem('local:passkeys') || {};
    delete storedPasskeys[deletedKey];
    await storage.setItem('local:passkeys', storedPasskeys);
  }

  return { success: !!deletedKey };
}
