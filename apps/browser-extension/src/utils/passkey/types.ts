/**
 * Type definitions for the AliasVaultPasskeyProvider
 */

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
  publicKey: {
    rpId?: string;
    challenge: ArrayBuffer | Uint8Array | string; // often base64url string from page
    userVerification?: 'required' | 'preferred' | 'discouraged';
  };
};
