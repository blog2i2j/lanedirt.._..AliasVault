/**
 * AliasVaultPasskeyProvider
 * -------------------------
 * A small self-contained WebAuthn "virtual authenticator" for a browser extension.
 * It can create ("register") and use ("authenticate") passkeys. The class focuses on:
 *   - Correct WebAuthn data assembly (authenticatorData, attestationObject, clientDataJSON)
 *   - Proper CBOR/COSE encoding for ES256 keys
 *   - Dynamic flags for UV/UP/AT/BE/BS
 *   - Consistent base64url/base64 handling
 *
 * NOTE:
 * - This class does not handle UI concerns or message passing. Inject storage callbacks so you
 *   can persist and retrieve passkeys (keys + metadata) in your extension background.
 * - By design, signCount is always 0 (clone detection disabled) for syncable passkeys.
 * - Attestation defaults to "none" (privacy-preserving). If an RP requests "direct", we do a
 *   "packed" *self* attestation using the generated credential private key (no x5c chain).
 * - For authentication ("get"), we also set BE/BS bits to indicate backup-eligible & backed-up.
 */

import type { CreateRequest, GetRequest, StoredPasskeyRecord } from './types';

/**
 *
 */
export class AliasVaultPasskeyProvider {
  /**
   * Inject your storage layer via callbacks.
   * - store: persist a newly created passkey
   * - getById: fetch a stored passkey (by credentialId)
   */
  constructor(
    private readonly store: (record: StoredPasskeyRecord) => Promise<void>,
    private readonly getById: (credentialId: string) => Promise<StoredPasskeyRecord | null>
  ) {}

  /*
   * ------------------------------------------------------------------------------------
   * Public API
   * ------------------------------------------------------------------------------------
   */

  /**
   * Create a new passkey (registration). Returns a credential-like object similar to
   * navigator.credentials.create() output, ready to be posted to the RP.
   *
   * It also calls `this.store(...)` to persist the passkey (private/public keys, ids, etc).
   */
  public async createPasskey(
    req: CreateRequest,
    opts?: { uvPerformed?: boolean; credentialIdBytes?: number } // uvPerformed: only set to true if your app did real UV
  ): Promise<{
    credential: {
      id: string;
      rawId: string; // base64url for transport (pages usually expect ArrayBuffers; adapt as needed)
      response: {
        clientDataJSON: string;       // base64 (UTF-8 JSON)
        attestationObject: string;    // base64 (CBOR)
      };
      type: 'public-key';
    };
    stored: StoredPasskeyRecord;
  }> {
    // 1) Validate and resolve algorithm (-7 = ES256)
    const alg = this.pickSupportedAlgorithm(req.publicKey.pubKeyCredParams);

    // 2) Determine RP ID (domain) and hash it
    const rpId = req.publicKey.rp?.id || new URL(req.origin).hostname;
    console.log('AliasVaultPasskeyProvider.createPasskey: rpId:', rpId);
    console.log('AliasVaultPasskeyProvider.createPasskey: rp.id from request:', req.publicKey.rp?.id);
    console.log('AliasVaultPasskeyProvider.createPasskey: origin hostname:', new URL(req.origin).hostname);
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', this.te(rpId)));

    // 3) Key pair generation (ES256 / P-256)
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const prvJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // 4) Generate a credentialId (random bytes; default 16)
    const credLen = Math.max(8, Math.min(opts?.credentialIdBytes ?? 16, 64));
    const credIdBytes = crypto.getRandomValues(new Uint8Array(credLen));
    const credentialIdB64u = this.toB64u(credIdBytes);

    // 5) COSE public key (CBOR) from JWK (ES256 / P-256)
    const coseKey = this.buildCoseEc2Es256(pubJwk);

    /*
     * 6) Flags (creation): UP (bit0)=1, UV (bit2) depends on policy, AT (bit6)=1, BE/BS optional
     *    - UV rules: set to 1 only if req requires it OR we actually performed UV (opts.uvPerformed)
     */
    let flags = 0x41; // UP + AT
    const uvReq = req.publicKey.authenticatorSelection?.userVerification;
    const uvPerformed = !!opts?.uvPerformed;
    if (uvReq === 'required' || (uvReq === 'preferred' && uvPerformed)) {
      flags |= 0x04; // UV
    }
    // For passkeys (syncable), we may set BE (0x08) and BS (0x10) to 1 to indicate backup-eligible & backed-up
    flags |= 0x08; // BE
    flags |= 0x10; // BS

    const signCount = new Uint8Array([0, 0, 0, 0]); // 0 for syncable credentials

    // 7) AttestedCredentialData = AAGUID(16 zeros) + credIdLen(2) + credId + COSEKey
    const aaguid = new Uint8Array(16); // all zeros in "none" attestation
    const credIdLenBytes = new Uint8Array([(credIdBytes.length >> 8) & 0xff, credIdBytes.length & 0xff]);
    const attestedCredData = this.concat(aaguid, credIdLenBytes, credIdBytes, coseKey);

    // 8) authenticatorData = rpIdHash (32) + flags (1) + signCount (4) + attestedCredData
    const authenticatorData = this.concat(rpIdHash, new Uint8Array([flags]), signCount, attestedCredData);

    // 9) clientDataJSON (stringify with challenge as base64url)
    const challengeB64u = this.challengeToB64u(req.publicKey.challenge);
    console.log('AliasVaultPasskeyProvider.createPasskey: challenge received:', req.publicKey.challenge);
    console.log('AliasVaultPasskeyProvider.createPasskey: challenge as base64url:', challengeB64u);
    console.log('AliasVaultPasskeyProvider.createPasskey: origin:', req.origin);
    const clientDataObj = {
      type: 'webauthn.create',
      challenge: challengeB64u,
      origin: req.origin,
      crossOrigin: false
    };
    const clientDataJSONStr = JSON.stringify(clientDataObj);
    console.log('AliasVaultPasskeyProvider.createPasskey: clientDataJSON:', clientDataJSONStr);
    const clientDataJSONBytes = this.te(clientDataJSONStr);

    // 10) Build attestationObject (CBOR map with "fmt","attStmt","authData")
    const attPref = req.publicKey.attestation || 'none';
    const attObjBytes =
      attPref === 'none' || attPref === 'indirect'
        ? this.buildAttObjNone(authenticatorData)
        : await this.buildAttObjPackedSelf(authenticatorData, clientDataJSONBytes, keyPair.privateKey);

    // 11) Store the passkey in your vault (so it can be used later for authentication)
    // Store userId as-is (injection script sends it as standard base64 string)
    let userIdB64: string | null = null;
    if (req.publicKey.user?.id) {
      console.log('Storing passkey with userId (standard base64):', req.publicKey.user.id);
      // The injection script already converted ArrayBuffer to standard base64, store as-is
      userIdB64 = typeof req.publicKey.user.id === 'string'
        ? req.publicKey.user.id
        : this.toB64(req.publicKey.user.id instanceof Uint8Array ? req.publicKey.user.id : new Uint8Array(req.publicKey.user.id));
    }

    const stored: StoredPasskeyRecord = {
      rpId,
      credentialId: credentialIdB64u,
      publicKey: pubJwk,
      privateKey: prvJwk,
      userId: userIdB64,
      userName: req.publicKey.user?.name,
      userDisplayName: req.publicKey.user?.displayName,
      lastUsedAt: Date.now()
    };
    await this.store(stored);

    // 12) Return a credential-like object (base64-encoded fields for transport)
    const credential = {
      id: credentialIdB64u,
      rawId: credentialIdB64u,
      response: {
        clientDataJSON: this.toB64(clientDataJSONBytes),
        attestationObject: this.toB64(attObjBytes)
      },
      type: 'public-key' as const
    };

    return { credential, stored };
  }

  /**
   * Create an assertion (authentication) with a stored passkey.
   *
   * Returns the flat object shape your client example expects:
   * {
   *   id, rawId, clientDataJSON, authenticatorData, signature, userHandle
   * }
   *
   * NOTE:
   * - The "standard" WebAuthn shape would nest these in `response` and use ArrayBuffers.
   *   You can adapt this output to that shape if the page expects the standard structure.
   */
  public async getAssertion(
    req: GetRequest,
    credentialIdB64u: string,
    opts?: { uvPerformed?: boolean; includeBEBS?: boolean }
  ): Promise<{
    id: string;
    rawId: string;
    clientDataJSON: string;    // base64
    authenticatorData: string; // base64
    signature: string;         // base64 (DER)
    userHandle: string | null; // base64 (if you choose to return it)
  }> {
    // 1) Load passkey
    const rec = await this.getById(credentialIdB64u);
    if (!rec) {
      throw new Error('Passkey not found');
    }

    // 2) rpId & hash
    const rpId = req.publicKey.rpId || new URL(req.origin).hostname;
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', this.te(rpId)));

    // 3) Flags (assertion): UP=1, UV depends on request & policy, BE/BS for syncable, AT=0 for auth
    let flags = 0x01; // UP
    const uvReq = req.publicKey.userVerification;
    const uvPerformed = !!opts?.uvPerformed;
    if (uvReq === 'required' || (uvReq === 'preferred' && uvPerformed)) {
      flags |= 0x04;
    } // UV
    if (opts?.includeBEBS ?? true) {
      flags |= 0x08; // BE
      flags |= 0x10; // BS
    }
    const signCount = new Uint8Array([0, 0, 0, 0]); // always 0 (sync-friendly)

    // 4) authenticatorData = rpIdHash + flags + signCount
    const authenticatorData = this.concat(rpIdHash, new Uint8Array([flags]), signCount);

    // 5) clientDataJSON
    const challengeB64u = this.challengeToB64u(req.publicKey.challenge);
    const clientDataObj = {
      type: 'webauthn.get',
      challenge: challengeB64u,
      origin: req.origin,
      crossOrigin: false
    };
    const clientDataJSONStr = JSON.stringify(clientDataObj);
    const clientDataJSONBytes = this.te(clientDataJSONStr);

    // 6) Signature over authenticatorData || SHA256(clientDataJSON)
    const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSONBytes));
    const toSign = this.concat(authenticatorData, clientDataHash);

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      rec.privateKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const rawSig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, toSign)
    );

    // 7) Convert raw (r|s) to DER sequence
    const derSig = this.ecdsaRawToDer(rawSig);

    // 8) Return userHandle (userId) as-is
    // This is required for discoverable credentials (resident keys) where the RP doesn't ask for a username first
    // userId is already stored as standard base64 (from injection script), return as-is
    let userHandleB64: string | null = null;
    if (rec.userId) {
      console.log('AliasVaultPasskeyProvider.getAssertion: rec.userId (standard base64):', rec.userId);
      // Return as-is - already in standard base64 format
      userHandleB64 = rec.userId;
      console.log('AliasVaultPasskeyProvider.getAssertion: userHandleB64:', userHandleB64);
    } else {
      console.warn('AliasVaultPasskeyProvider.getAssertion: No userId found in stored passkey record');
    }

    // 9) Return object in the flat shape (base64 strings), as your client example expects
    return {
      id: credentialIdB64u,
      rawId: credentialIdB64u,
      clientDataJSON: this.toB64(clientDataJSONBytes),
      authenticatorData: this.toB64(authenticatorData),
      signature: this.toB64(derSig),
      userHandle: userHandleB64
    };
  }

  /*
   * ------------------------------------------------------------------------------------
   * Internal helpers (encoding, CBOR/COSE, DER, utils)
   * ------------------------------------------------------------------------------------
   */

  /** Ensure ES256 (-7) is available; else throw (or extend to support others). */
  private pickSupportedAlgorithm(params?: Array<{ type: 'public-key'; alg: number }>): number {
    if (!params || params.length === 0) {
      return -7;
    } // assume ES256 default
    const hasEs256 = params.some(p => p.type === 'public-key' && p.alg === -7);
    if (!hasEs256) {
      throw new Error('No supported algorithm (ES256) in pubKeyCredParams');
    }
    return -7;
  }

  /** Build COSE EC2 public key for ES256: {1:2, 3:-7, -1:1, -2:x, -3:y} in CBOR. */
  private buildCoseEc2Es256(jwk: JsonWebKey): Uint8Array {
    const x = this.pad32(this.fromB64u(jwk.x!));
    const y = this.pad32(this.fromB64u(jwk.y!));
    /*
     * Map(5): 0xa5
     *  1:2      (kty: EC2)
     *  3:-7     (alg: ES256)
     * -1:1      (crv: P-256)
     * -2:x(32)  (x)
     * -3:y(32)  (y)
     */
    return new Uint8Array([
      0xa5,
      0x01, 0x02,               // 1: 2
      0x03, 0x26,               // 3: -7
      0x20, 0x01,               // -1: 1
      0x21, 0x58, 0x20, ...x,   // -2: bstr(32) x
      0x22, 0x58, 0x20, ...y    // -3: bstr(32) y
    ]);
  }

  /** Build "none" attestation object: { fmt: "none", attStmt: {}, authData: <bytes> } (CBOR). */
  private buildAttObjNone(authenticatorData: Uint8Array): Uint8Array {
    const fmtKey = this.cborText('fmt');         // "fmt"
    const fmtVal = this.cborText('none');        // "none"
    const attStmtKey = this.cborText('attStmt'); // "attStmt"
    const attStmtVal = new Uint8Array([0xa0]);   // map(0) {}
    const authDataKey = this.cborText('authData'); // "authData"
    const authDataVal = this.cborBstr(authenticatorData);

    // map(3)
    return this.concat(
      new Uint8Array([0xa3]),
      fmtKey, fmtVal,
      attStmtKey, attStmtVal,
      authDataKey, authDataVal
    );
  }

  /** Build "packed" self-attestation object (no x5c). */
  private async buildAttObjPackedSelf(
    authenticatorData: Uint8Array,
    clientDataJSON: Uint8Array,
    privateKey: CryptoKey
  ): Promise<Uint8Array> {
    // Signature over authenticatorData || SHA256(clientDataJSON)
    const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON));
    const toSign = this.concat(authenticatorData, clientDataHash);
    const rawSig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, toSign)
    );
    const derSig = this.ecdsaRawToDer(rawSig);

    // attStmt = { alg: -7, sig: <derSig> }
    const attStmtMap = this.concat(
      this.cborText('alg'), new Uint8Array([0x26]), // -7
      this.cborText('sig'), this.cborBstr(derSig)
    );
    // prepend map(2)
    const attStmt = this.concat(new Uint8Array([0xa2]), attStmtMap);

    // final: { fmt:"packed", attStmt:{...}, authData:<bytes> }
    const fmtKey = this.cborText('fmt');
    const fmtVal = this.cborText('packed');
    const attStmtKey = this.cborText('attStmt');
    const authDataKey = this.cborText('authData');
    const authDataVal = this.cborBstr(authenticatorData);

    return this.concat(
      new Uint8Array([0xa3]), // map(3)
      fmtKey, fmtVal,
      attStmtKey, attStmt,
      authDataKey, authDataVal
    );
  }

  // ----- CBOR small helpers -----

  /** Encode a UTF-8 string as CBOR text. */
  private cborText(s: string): Uint8Array {
    const bytes = this.te(s);
    if (bytes.length <= 23) {
      return new Uint8Array([0x60 | bytes.length, ...bytes]);
    } // major type 3
    if (bytes.length <= 0xff) {
      return new Uint8Array([0x78, bytes.length, ...bytes]);
    }
    return new Uint8Array([0x79, (bytes.length >> 8) & 0xff, bytes.length & 0xff, ...bytes]);
  }

  /** Encode a byte string as CBOR bstr. */
  private cborBstr(b: Uint8Array): Uint8Array {
    if (b.length <= 23) {
      return new Uint8Array([0x40 | b.length, ...b]);
    } // major type 2
    if (b.length <= 0xff) {
      return new Uint8Array([0x58, b.length, ...b]);
    }
    return new Uint8Array([0x59, (b.length >> 8) & 0xff, b.length & 0xff, ...b]);
  }

  // ----- DER helpers -----

  /** Convert raw ECDSA signature (r|s, 64 bytes) to DER SEQUENCE. */
  private ecdsaRawToDer(raw: Uint8Array): Uint8Array {
    if (raw.length !== 64) {
      throw new Error('Unexpected ECDSA signature length');
    }
    const r = raw.slice(0, 32);
    const s = raw.slice(32, 64);
    const rDer = this.derInt(r);
    const sDer = this.derInt(s);
    return new Uint8Array([0x30, rDer.length + sDer.length, ...rDer, ...sDer]);
  }

  /** Encode a positive big integer to DER INTEGER. */
  private derInt(src: Uint8Array): Uint8Array {
    // Trim leading zeros
    let i = 0;
    while (i < src.length - 1 && src[i] === 0x00) {
      i++;
    }
    let v = src.slice(i);
    // If MSB set, prepend 0 to keep it positive
    if ((v[0] & 0x80) !== 0) {
      v = this.concat(new Uint8Array([0x00]), v);
    }
    return new Uint8Array([0x02, v.length, ...v]);
  }

  // ----- Base64 / Base64url helpers -----

  /** UTF-8 encode string to bytes. */
  private te(s: string): Uint8Array {
    return new TextEncoder().encode(s);
  }

  /** Base64 encode bytes (Uint8Array) to ASCII string. */
  private toB64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }

  /** Base64url encode bytes. */
  private toB64u(bytes: Uint8Array): string {
    return this.toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  /** Base64url decode to bytes. */
  private fromB64u(b64u: string): Uint8Array {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
    const s = atob(b64 + pad);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      out[i] = s.charCodeAt(i);
    }
    return out;
  }

  /**
   * Normalize challenge to base64url string.
   * The injection script sends challenges as standard base64, so we need to convert to base64url.
   */
  private challengeToB64u(challenge: ArrayBuffer | Uint8Array | string): string {
    if (typeof challenge === 'string') {
      // String from injection script - it's standard base64, convert to base64url
      // Remove padding and replace + with - and / with _
      return challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    const bytes = challenge instanceof Uint8Array ? challenge : new Uint8Array(challenge);
    return this.toB64u(bytes);
  }

  /**
   * Normalize userId to base64url string.
   * userId can be:
   * - ArrayBuffer/Uint8Array from WebAuthn API (needs encoding)
   * - Plain UTF-8 string from test/simple cases (needs encoding)
   * - Already base64url encoded string (use as-is)
   */
  private userIdToB64u(userId: ArrayBuffer | Uint8Array | string): string {
    if (typeof userId === 'string') {
      // Check if it's already base64url (contains only valid base64url chars)
      if (/^[A-Za-z0-9_-]+$/.test(userId) && userId.length % 4 !== 1) {
        // Looks like base64url already (and not an invalid length)
        return userId;
      } else {
        // Plain UTF-8 string, encode it
        return this.toB64u(this.te(userId));
      }
    }
    const bytes = userId instanceof Uint8Array ? userId : new Uint8Array(userId);
    return this.toB64u(bytes);
  }

  /** Left-pad to 32 bytes (P-256 coord). */
  private pad32(b: Uint8Array): Uint8Array {
    if (b.length === 32) {
      return b;
    }
    const out = new Uint8Array(32);
    out.set(b, 32 - b.length);
    return out;
  }

  /** Concatenate typed arrays. */
  private concat(...chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}
