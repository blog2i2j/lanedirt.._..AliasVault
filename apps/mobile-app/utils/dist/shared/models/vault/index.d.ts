/**
 * Encryption key SQLite database type.
 */
type EncryptionKey = {
    Id: string;
    PublicKey: string;
    PrivateKey: string;
    IsPrimary: boolean;
};

/**
 * Settings for password generation stored in SQLite database settings table as string.
 */
type PasswordSettings = {
    /**
     * The length of the password.
     */
    Length: number;
    /**
     * Whether to use lowercase letters.
     */
    UseLowercase: boolean;
    /**
     * Whether to use uppercase letters.
     */
    UseUppercase: boolean;
    /**
     * Whether to use numbers.
     */
    UseNumbers: boolean;
    /**
     * Whether to use special characters.
     */
    UseSpecialChars: boolean;
    /**
     * Whether to use non-ambiguous characters.
     */
    UseNonAmbiguousChars: boolean;
};

/**
 * TotpCode SQLite database type.
 */
type TotpCode = {
    /** The ID of the TOTP code */
    Id: string;
    /** The name of the TOTP code */
    Name: string;
    /** The secret key for the TOTP code */
    SecretKey: string;
    /** The credential ID this TOTP code belongs to */
    CredentialId: string;
};

/**
 * Credential SQLite database type.
 */
type Credential = {
    Id: string;
    Username?: string;
    Password: string;
    ServiceName: string;
    ServiceUrl?: string;
    Logo?: Uint8Array | number[];
    Notes?: string;
    Alias: Alias;
};
/**
 * Alias SQLite database type.
 */
type Alias = {
    FirstName?: string;
    LastName?: string;
    NickName?: string;
    BirthDate: string;
    Gender?: string;
    Email?: string;
};

/**
 * Attachment SQLite database type.
 */
type Attachment = {
    Id: string;
    Filename: string;
    Blob: Uint8Array | number[];
    CredentialId: string;
    CreatedAt: string;
    UpdatedAt: string;
    IsDeleted?: boolean;
};

/**
 * Passkey SQLite database type.
 */
type Passkey = {
    /** The ID of the passkey */
    Id: string;
    /** The item version for payload schema */
    ItemVersion: number;
    /** The relying party identifier */
    RpId: string;
    /** The credential ID (Base64 encoded) */
    CredentialId: string;
    /** The signature counter */
    SignCount: number;
    /** Whether the passkey is backup eligible */
    IsBackupEligible: number;
    /** Whether the passkey is in backup state */
    IsBackupState: number;
    /** The display name for the passkey */
    DisplayName: string;
    /** The last used timestamp (epoch milliseconds) */
    LastUsedAt?: number | null;
    /** Additional data as JSON blob (Base64 encoded) */
    AdditionalData?: string | null;
    /** Created timestamp (epoch milliseconds) */
    CreatedAt: number;
    /** Updated timestamp (epoch milliseconds) */
    UpdatedAt: number;
    /** Soft delete flag (0/1) */
    IsDeleted: number;
};

export type { Alias, Attachment, Credential, EncryptionKey, Passkey, PasswordSettings, TotpCode };
