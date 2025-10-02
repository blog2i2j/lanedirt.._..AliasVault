/**
 * Type definitions for the AliasVaultPasskeyProvider
 */

// Re-export injection script types for convenience
export type {
  WebAuthnCreateEventDetail,
  WebAuthnGetEventDetail,
  WebAuthnCreateResponseDetail,
  WebAuthnGetResponseDetail,
  ProviderCreateCredential,
  ProviderGetCredential,
  WebAuthnPublicKeyCredential,
  WebAuthnAssertionCredential
} from './webauthn.types';

/**
 * WebAuthn credential response types (for injection script compatibility)
 */
export type PasskeyCreateCredentialResponse = {
  id: string;                    // base64url credential ID
  rawId: string;                 // base64url (same as id for compatibility)
  clientDataJSON: string;        // base64 encoded client data JSON
  attestationObject: string;     // base64 encoded attestation object (CBOR)
};

export type PasskeyGetCredentialResponse = {
  id: string;                    // base64url credential ID
  rawId: string;                 // base64url (same as id for compatibility)
  clientDataJSON: string;        // base64 encoded client data JSON
  authenticatorData: string;     // base64 encoded authenticator data
  signature: string;             // base64 encoded DER signature
  userHandle: string | null;     // base64 encoded user ID (null if not provided during creation)
};

export type StoredPasskeyRecord = {
  rpId: string;
  credentialId: string;               // base64url identifier (string)
  publicKey: JsonWebKey;              // JWK (P-256)
  privateKey: JsonWebKey;             // JWK (P-256)
  userId?: string | null;             // base64url encoded user.id (stored as string for consistency)
  userName?: string;
  userDisplayName?: string;
  lastUsedAt?: number;
};

/**
 * Request to store a new passkey
 * TODO: check actual stored data type, but this will be replaced by vault integration anyway
 */
export type StorePasskeyRequest = {
  rpId: string;
  credentialId: string;
  displayName: string;
  publicKey: WebAuthnCreationPayload;
  privateKey: JsonWebKey;
  userId?: string | null;
  userName?: string;
  userDisplayName?: string;
};

/**
 * Request to update passkey last used timestamp
 */
export type UpdatePasskeyLastUsedRequest = {
  credentialId: string;
};

/**
 * Request to delete a passkey
 */
export type DeletePasskeyRequest = {
  credentialId: string;
};

/**
 * Request to get passkey by ID
 */
export type GetPasskeyByIdRequest = {
  credentialId: string;
};

/**
 * Request to get pending request data
 */
export type GetRequestDataRequest = {
  requestId: string;
};

/**
 * Passkey popup response
 */
export type PasskeyPopupResponse = {
  requestId: string;
  credential?: PasskeyCreateCredentialResponse;
  fallback?: boolean;
  cancelled?: boolean;
};

/**
 * WebAuthn create request
 */
export type WebAuthnCreateRequest = {
  publicKey: unknown;
  origin: string;
};

/**
 * WebAuthn get request
 */
export type WebAuthnGetRequest = {
  publicKey: {
    allowCredentials?: Array<{ id: string }>;
  };
  origin: string;
};

/**
 * WebAuthn settings response
 */
export type WebAuthnSettingsResponse = {
  enabled: boolean;
};

/**
 * Pending passkey request data for create operation
 * TODO: check usage chain
 */
export type PendingPasskeyCreateRequest = {
  type: 'create';
  requestId: string;
  origin: string;
  publicKey: WebAuthnCreationPayload;
};

/**
 * Pending passkey request data for get/authenticate operation
 * TODO: check usage chain
 */
export type PendingPasskeyGetRequest = {
  type: 'get';
  requestId: string;
  origin: string;
  publicKey: WebAuthnPublicKeyGetPayload;
  passkeys: Array<{
    id: string;
    displayName: string;
    lastUsed: string | null;
  }>;
};

export type WebAuthnPublicKeyGetPayload = {
  challenge: string; // Base64URL-encoded challenge
  timeout?: number;
  rpId?: string;
  allowCredentials?: {
    id: string; // Base64URL-encoded credential ID
    type: "public-key";
    transports?: string[];
  }[];
  userVerification?: "required" | "preferred" | "discouraged";
  hints?: string[];
};

/**
 * Union type for all pending passkey requests
 */
export type PendingPasskeyRequest = PendingPasskeyCreateRequest | PendingPasskeyGetRequest;

export type CreateRequest = {
  origin: string;                     // e.g. "https://example.com"
  requestId?: string;                 // optional correlation id (if you need it)
  publicKey: {
    rp?: { id?: string; name?: string };
    user?: { id?: ArrayBuffer | Uint8Array | string; name?: string; displayName?: string };
    challenge: ArrayBuffer | Uint8Array | string;
    pubKeyCredParams?: Array<{ type: 'public-key'; alg: number }>;
    attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
    authenticatorSelection?: {
      userVerification?: 'required' | 'preferred' | 'discouraged';
      requireResidentKey?: boolean;
      residentKey?: 'required' | 'preferred' | 'discouraged';
      authenticatorAttachment?: 'platform' | 'cross-platform';
    };
  };
};

export type GetRequest = {
  origin: string;
  requestId?: string;
  publicKey: WebAuthnPublicKeyGetPayload
};

export type WebAuthnCreationPayload = {
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string; // Base64URL-encoded user ID
    name: string;
    displayName: string;
  };
  challenge: string; // Base64URL-encoded challenge
  pubKeyCredParams: {
    type: "public-key";
    alg: number; // COSE algorithm identifier
  }[];
  timeout: number;
  excludeCredentials: {
    id: string; // Base64URL-encoded credential ID
    type: "public-key";
    transports: string[];
  }[];
  authenticatorSelection: {
    residentKey: "discouraged" | "preferred" | "required";
    requireResidentKey: boolean;
    userVerification: "required" | "preferred" | "discouraged";
  };
  attestation: "none" | "indirect" | "direct" | "enterprise";
  hints: string[];
  extensions?: {
    credProps?: boolean;
    [key: string]: unknown;
  };
};