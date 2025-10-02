/**
 * Type definitions for WebAuthn injection script
 * These types ensure type safety for the credential objects we create
 */

/**
 * WebAuthn credential response for registration (create)
 * This is what the injection script returns to the page
 */
export type WebAuthnPublicKeyCredential = PublicKeyCredential & {
  readonly authenticatorAttachment: AuthenticatorAttachment | null;
  readonly response: AuthenticatorAttestationResponse;
};

/**
 * WebAuthn credential response for authentication (get)
 */
export type WebAuthnAssertionCredential = PublicKeyCredential & {
  readonly authenticatorAttachment: AuthenticatorAttachment | null;
  readonly response: AuthenticatorAssertionResponse;
};

/**
 * Internal credential format from provider (base64 encoded)
 */
export type ProviderCreateCredential = {
  id: string;
  rawId: string;
  clientDataJSON: string;
  attestationObject: string;
};

export type ProviderGetCredential = {
  id: string;
  rawId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string | null;
};

/**
 * Custom event detail types for communication between page and content script
 */
export type WebAuthnCreateEventDetail = {
  requestId: string;
  publicKey: {
    rp?: { id?: string; name?: string };
    user: {
      id: string; // base64 encoded
      name?: string;
      displayName?: string;
    };
    challenge: string; // base64 encoded
    pubKeyCredParams?: Array<{ type: string; alg: number }>;
    timeout?: number;
    excludeCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
    authenticatorSelection?: {
      authenticatorAttachment?: AuthenticatorAttachment;
      requireResidentKey?: boolean;
      residentKey?: ResidentKeyRequirement;
      userVerification?: UserVerificationRequirement;
    };
    attestation?: AttestationConveyancePreference;
    extensions?: AuthenticationExtensionsClientInputs;
  };
  origin: string;
};

export type WebAuthnGetEventDetail = {
  requestId: string;
  publicKey: {
    challenge: string; // base64 encoded
    timeout?: number;
    rpId?: string;
    allowCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
    userVerification?: UserVerificationRequirement;
    extensions?: AuthenticationExtensionsClientInputs;
  };
  origin: string;
};

export type WebAuthnCreateResponseDetail = {
  requestId: string;
  credential?: ProviderCreateCredential;
  fallback?: boolean;
  cancelled?: boolean;
  error?: string;
};

export type WebAuthnGetResponseDetail = {
  requestId: string;
  credential?: ProviderGetCredential;
  fallback?: boolean;
  cancelled?: boolean;
  error?: string;
};
