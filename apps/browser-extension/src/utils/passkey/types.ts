/**
 * Type definitions for the AliasVaultPasskeyProvider
 */

export type StoredPasskeyRecord = {
  rpId: string;
  credentialId: string;               // base64url identifier (string)
  publicKey: JsonWebKey;              // JWK (P-256)
  privateKey: JsonWebKey;             // JWK (P-256)
  userId?: ArrayBuffer | Uint8Array | string | null;
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
