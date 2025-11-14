---
layout: default
title: Architecture
has_children: true
nav_order: 5
---

# Architecture

AliasVault implements zero-knowledge encryption where sensitive user data never leaves the client device in unencrypted form. Below is a detailed explanation of how the system secures user data and communications.

**What is Zero-Knowledge in AliasVault**:
- **Vault Data** (usernames, passwords, notes, passkeys etc.) is fully encrypted client-side before being sent to the server. The server cannot decrypt any vault contents.
- **Email Contents**: When emails are received by the server, their contents are immediately encrypted with your public key before being saved. Only you can decrypt and read them with your private key.

*Note: email aliases are stored on the server as "claims" which are linked to internal user IDs for routing purposes.*

## Diagram
The security architecture diagram below illustrates all encryption and authentication processes used in AliasVault to secure user data and communications.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/diagrams/security-architecture/aliasvault-security-architecture-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="../assets/diagrams/security-architecture/aliasvault-security-architecture-light.svg">
  <img alt="AliasVault Security Architecture Diagram" src="../assets/diagrams/security-architecture/aliasvault-security-architecture-light.svg">
</picture>

You can also view the diagram in a browser-friendly HTML format: [AliasVault Security Architecture](https://docs.aliasvault.net/assets/diagrams/security-architecture/aliasvault-security-architecture.html)

## Key Components and Process Flow

### 1. Key Derivation
- When a user enters their master password, it remains strictly on the client device
- The master password is processed through Argon2id (a memory-hard key derivation function) locally
- The derived key serves two purposes:
    - Authentication with the server through the SRP protocol
    - Local encryption/decryption of vault contents using AES-256-GCM

### 2. Authentication Process
1. SRP (Secure Remote Password) Authentication
    - Enables secure password-based authentication without transmitting the password
    - Client and server perform a cryptographic handshake to verify identity

2. Two-Factor Authentication (Optional)
    - If enabled, requires an additional verification step after successful SRP authentication
    - Uses Time-based One-Time Password (TOTP) protocol
    - Compatible with standard authenticator apps (e.g., Google Authenticator)
    - Server only issues the final JWT access token after successful 2FA verification

### 3. Vault Operations
- All vault contents are encrypted/decrypted locally using AES-256-GCM
- The encryption key is derived from the user's master password
- Only encrypted data is ever transmitted to or stored on the server
- The server never has access to the unencrypted vault contents

### 4. Email System Security

#### Key Generation and Storage
1. RSA key pair is generated locally on the client
2. Private key is stored in the encrypted vault
3. Public key is sent to the server and associated with email claim(s)

#### Email Reception Process
1. When an email is received, the server:
    - Verifies if the recipient (email address) matches a valid email claim
    - If no valid claim exists, the email is rejected
    - If valid, generates a random 256-bit symmetric key
    - Encrypts the email content using this symmetric key
    - Encrypts the symmetric key using the recipient's public key
    - Stores both the encrypted email and encrypted symmetric key

#### Email Retrieval Process
1. Client retrieves encrypted email and encrypted symmetric key from server
2. Client uses private key from vault to decrypt the symmetric key
3. Client uses decrypted symmetric key to decrypt the email contents
4. All decryption occurs locally on the client device

> Note: The use of a symmetric key for email content encryption and asymmetric encryption for the symmetric key (hybrid encryption) is implemented due to RSA's limitations on encryption string length and for better performance.

### 5. Passkey Authentication System

AliasVault includes a virtual passkey authenticator that implements the WebAuthn Level 2 specification, allowing users to securely store and use passkeys for passwordless authentication across websites and services.

#### Virtual Authenticator Implementation
1. Platform Support
    - Browser Extension: Virtual authenticator using Web Crypto API
    - iOS: Native Swift implementation using CryptoKit
    - Android: Native Kotlin implementation using AndroidKeyStore
    - All platforms provide consistent WebAuthn Level 2 compliant behavior

2. Key Management
    - ES256 (ECDSA P-256) key pairs generated locally on client device
    - Private keys stored as encrypted entries in the user's vault
    - Public keys used for WebAuthn authentication with relying parties
    - All key material encrypted using the same AES-256-GCM vault encryption

#### Passkey Registration Process
1. When registering a new passkey:
    - Client generates an ES256 (ECDSA P-256) key pair locally
    - Private key is encrypted and stored in the user's vault
    - Public key is sent to the relying party (website/service)
    - Attestation object created with proper WebAuthn flags:
        - UP (User Present) - User interaction confirmed
        - AT (Attested Credential Data) - New credential created
        - UV (User Verified) - Optional, based on user verification requirement
        - BE (Backup Eligible) - Credential can be backed up
        - BS (Backup State) - Credential is backed up in vault

2. Authenticator Data
    - Uses AliasVault's unique AAGUID (Authenticator Attestation GUID): `a11a5faa-9f32-4b8c-8c5d-2f7d13e8c942`
    - Sign count always 0 for syncable credentials
    - Supports both "none" and "packed" self-attestation formats
    - CBOR/COSE encoding for attestation objects

#### Passkey Authentication Process
1. When authenticating with an existing passkey:
    - Client retrieves encrypted passkey from vault
    - Private key decrypted locally using vault encryption key
    - Client signs authentication challenge using private key
    - Signature sent to relying party for verification
    - All cryptographic operations performed client-side

2. Cross-Platform Synchronization
    - Passkeys automatically sync across all user devices
    - Encrypted passkey data synchronized through vault sync mechanism
    - Enables seamless authentication on browser extension, iOS app, and Android app
    - Maintains zero-knowledge architecture during sync

#### Additional Capabilities
1. PRF Extension (hmac-secret)
    - Supports WebAuthn PRF extension for deriving additional secrets
    - Enables relying parties to use passkeys for encryption key derivation
    - PRF secrets stored encrypted in vault alongside passkey data
    - Implements HMAC-SHA256 for PRF evaluation
    - PRF is supported via browser extension and iOS (0.24.0+)
        - Android support is pending due to limited Android API support

## Security Benefits
- Zero-knowledge encryption: entire vault is encrypted client-side before transmission
- Email contents are encrypted with your public key immediately upon receipt by the server
- Master password never leaves the client device
- All sensitive operations (key derivation, encryption/decryption) happen locally
- Server stores only encrypted vault data and encrypted email contents
- Multi-layer hybrid encryption for emails provides secure communication
- Optional 2FA adds an additional security layer
- Use of established cryptographic standards (Argon2id, AES-256-GCM, RSA/OAEP)
- Passkey private keys remain encrypted in vault at all times
- Cross-platform passkey sync without compromising security
- WebAuthn compliance eliminates phishing risks through domain binding
- No personally identifiable information required for registration

This security architecture ensures that even if the server is compromised, vault contents and email messages remain secure and unreadable as all sensitive operations and keys remain strictly on the client side. Email aliases (stored on the server as "claims" for routing) are linked to internal user IDs, not real-world identities.
