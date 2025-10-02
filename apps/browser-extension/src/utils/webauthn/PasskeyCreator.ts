/**
 * PasskeyCreator - Robust WebAuthn passkey creation utility
 * Uses proper CBOR encoding to ensure maximum compatibility
 */

import { encode as cborEncode } from 'cbor-x';

/**
 * Helper function to convert Uint8Array to base64url string
 */
export function uint8ArrayToBase64url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Helper function to convert base64url string to Uint8Array
 */
export function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
}

/**
 * Create COSE_Key from JWK for ES256 algorithm
 * Uses proper CBOR encoding via cbor-x library
 */
export function createCoseKeyFromJwk(publicKeyJwk: JsonWebKey): Uint8Array {
  if (!publicKeyJwk.x || !publicKeyJwk.y) {
    throw new Error('Invalid JWK: missing x or y coordinates');
  }

  // Convert x and y coordinates from base64url to bytes
  const xCoord = base64UrlToUint8Array(publicKeyJwk.x);
  const yCoord = base64UrlToUint8Array(publicKeyJwk.y);

  // Validate coordinate lengths (P-256 uses 32-byte coordinates)
  if (xCoord.length !== 32 || yCoord.length !== 32) {
    throw new Error(
      `Invalid P-256 key coordinates: x=${xCoord.length} bytes, y=${yCoord.length} bytes (expected 32 bytes each)`
    );
  }

  /*
   * COSE_Key structure for ES256 (RFC 8152)
   * Map keys:
   *   1 (kty): 2 (EC2 - Elliptic Curve Keys with x and y coordinate pair)
   *   3 (alg): -7 (ES256 - ECDSA w/ SHA-256)
   *  -1 (crv): 1 (P-256 - NIST P-256 curve)
   *  -2 (x): x-coordinate as byte string
   *  -3 (y): y-coordinate as byte string
   */
  const coseKey = {
    1: 2,        // kty: EC2
    3: -7,       // alg: ES256
    '-1': 1,     // crv: P-256
    '-2': xCoord, // x-coordinate
    '-3': yCoord  // y-coordinate
  };

  // Encode using cbor-x, which handles canonical CBOR encoding
  return new Uint8Array(cborEncode(coseKey));
}

/**
 * Create authenticator data according to WebAuthn spec
 */
export interface IAuthenticatorDataOptions {
  rpId: string;
  flags: number;
  signCount: number;
  aaguid?: Uint8Array;
  credentialId?: Uint8Array;
  cosePublicKey?: Uint8Array;
}

/**
 *
 */
export async function createAuthenticatorData(options: IAuthenticatorDataOptions): Promise<Uint8Array> {
  const {
    rpId,
    flags,
    signCount,
    aaguid = new Uint8Array(16), // Default to all zeros
    credentialId,
    cosePublicKey
  } = options;

  // Calculate rpId hash (SHA-256)
  const rpIdBytes = new TextEncoder().encode(rpId);
  const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBytes);
  const rpIdHash = new Uint8Array(rpIdHashBuffer);

  // Flags (1 byte)
  const flagsByte = new Uint8Array([flags]);

  // Sign count (4 bytes, big-endian)
  const signCountBytes = new Uint8Array([
    (signCount >> 24) & 0xff,
    (signCount >> 16) & 0xff,
    (signCount >> 8) & 0xff,
    signCount & 0xff
  ]);

  // Build base authData (rpIdHash + flags + signCount)
  const parts: Uint8Array[] = [rpIdHash, flagsByte, signCountBytes];

  // If AT (Attested Credential Data) flag is set, include attested credential data
  if ((flags & 0x40) && credentialId && cosePublicKey) {
    // AAGUID (16 bytes)
    parts.push(aaguid);

    // Credential ID Length (2 bytes, big-endian)
    const credIdLength = new Uint8Array([
      (credentialId.length >> 8) & 0xff,
      credentialId.length & 0xff
    ]);
    parts.push(credIdLength);

    // Credential ID
    parts.push(credentialId);

    // COSE-encoded public key
    parts.push(cosePublicKey);
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const authData = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    authData.set(part, offset);
    offset += part.length;
  }

  return authData;
}

/**
 * Create attestation object with proper CBOR encoding
 */
export interface IAttestationObjectOptions {
  fmt: 'none' | 'packed';
  authData: Uint8Array;
  attStmt?: {
    alg?: number;
    sig?: Uint8Array;
  };
}

/**
 *
 */
export function createAttestationObject(options: IAttestationObjectOptions): Uint8Array {
  const { fmt, authData, attStmt = {} } = options;

  // Build attestation object structure
  const attestationObject: Record<string, unknown> = {
    fmt,
    attStmt,
    authData
  };

  // Encode using cbor-x with canonical encoding
  return new Uint8Array(cborEncode(attestationObject));
}

/**
 * Encode ECDSA signature (IEEE P1363 format) to DER format
 * Web Crypto API returns signatures as r||s concatenation
 * WebAuthn requires DER-encoded signatures
 */
export function encodeDerSignature(rawSignature: Uint8Array): Uint8Array {
  // For P-256, signature is 64 bytes: 32-byte r + 32-byte s
  if (rawSignature.length !== 64) {
    throw new Error(`Invalid signature length: ${rawSignature.length} (expected 64 for P-256)`);
  }

  const r = rawSignature.slice(0, 32);
  const s = rawSignature.slice(32, 64);

  /**
   * Encode integer in DER format
   * DER integers must be positive, so add 0x00 padding if high bit is set
   */
  const encodeInteger = (int: Uint8Array): Uint8Array => {
    // Remove leading zeros but keep at least one byte
    let i = 0;
    while (i < int.length - 1 && int[i] === 0 && (int[i + 1] & 0x80) === 0) {
      i++;
    }
    let trimmed = int.slice(i);

    // If high bit is set, add zero padding to keep it positive
    if (trimmed[0] & 0x80) {
      const padded = new Uint8Array(trimmed.length + 1);
      padded[0] = 0;
      padded.set(trimmed, 1);
      trimmed = padded;
    }

    // DER INTEGER: 0x02 (tag) + length + value
    return new Uint8Array([0x02, trimmed.length, ...trimmed]);
  };

  const rDer = encodeInteger(r);
  const sDer = encodeInteger(s);

  // DER SEQUENCE: 0x30 (tag) + length + r + s
  return new Uint8Array([0x30, rDer.length + sDer.length, ...rDer, ...sDer]);
}

/**
 * WebAuthn flag constants
 */
export const WebAuthnFlags = {
  UP: 0x01,  // User Present
  UV: 0x04,  // User Verified
  BE: 0x08,  // Backup Eligible
  BS: 0x10,  // Backup State
  AT: 0x40,  // Attested Credential Data
  ED: 0x80   // Extension Data
} as const;

/**
 * Create WebAuthn credential for registration
 * This is the main function to use for creating passkeys
 */
export interface ICreatePasskeyOptions {
  rpId: string;
  origin: string;
  challenge: string; // base64url encoded
  displayName: string;
  attestation?: 'none' | 'indirect' | 'direct';
}

export interface ICreatePasskeyResult {
  credential: {
    id: string;
    rawId: string;
    clientDataJSON: string;
    attestationObject: string;
  };
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
  credentialId: string;
}

/**
 *
 */
export async function createPasskey(options: ICreatePasskeyOptions): Promise<ICreatePasskeyResult> {
  const { rpId, origin, challenge, displayName, attestation = 'none' } = options;

  // Generate ES256 key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true, // extractable
    ['sign', 'verify']
  );

  // Export keys
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  // Generate credential ID (16 random bytes)
  const credIdBytes = crypto.getRandomValues(new Uint8Array(16));
  const credentialId = uint8ArrayToBase64url(credIdBytes);

  // Create COSE public key
  const cosePublicKey = createCoseKeyFromJwk(publicKeyJwk);

  /*
   * Authenticator flags:
   * - UP (User Present): Always set
   * - UV (User Verified): Set to indicate user verification
   * - BE (Backup Eligible): Set to indicate passkey can be synced
   * - BS (Backup State): Set to indicate passkey is backed up
   * - AT (Attested Credential Data): Set during registration
   */
  const flags = WebAuthnFlags.UP | WebAuthnFlags.UV | WebAuthnFlags.BE | WebAuthnFlags.BS | WebAuthnFlags.AT;

  // Create authenticator data
  const authData = await createAuthenticatorData({
    rpId,
    flags,
    signCount: 0, // Always 0 for synced passkeys
    credentialId: credIdBytes,
    cosePublicKey
  });

  // Create clientDataJSON
  const clientDataJSON = JSON.stringify({
    type: 'webauthn.create',
    challenge,
    origin,
    crossOrigin: false
  });

  // Create attestation object
  let attestationObject: Uint8Array;

  if (attestation === 'none' || attestation === 'indirect') {
    // Use "none" attestation (most privacy-preserving)
    attestationObject = createAttestationObject({
      fmt: 'none',
      authData,
      attStmt: {}
    });
  } else {
    // Use "packed" attestation with self-attestation
    const clientDataHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON));
    const dataToSign = new Uint8Array([...authData, ...new Uint8Array(clientDataHash)]);

    // Sign with the credential's private key
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      dataToSign
    );

    const derSignature = encodeDerSignature(new Uint8Array(signature));

    attestationObject = createAttestationObject({
      fmt: 'packed',
      authData,
      attStmt: {
        alg: -7, // ES256
        sig: derSignature
      }
    });
  }

  console.info('[PasskeyCreator] Created credential successfully');
  console.info('[PasskeyCreator] Details:', {
    credentialId,
    credentialIdBytes: credIdBytes.length,
    authDataLength: authData.length,
    coseKeyLength: cosePublicKey.length,
    attestationObjectLength: attestationObject.length,
    attestationFormat: attestation,
    rpId,
    origin,
    flags: flags.toString(2).padStart(8, '0')
  });

  return {
    credential: {
      id: credentialId,
      rawId: credentialId,
      clientDataJSON: btoa(clientDataJSON),
      attestationObject: btoa(String.fromCharCode(...attestationObject))
    },
    privateKey: privateKeyJwk,
    publicKey: publicKeyJwk,
    credentialId
  };
}
