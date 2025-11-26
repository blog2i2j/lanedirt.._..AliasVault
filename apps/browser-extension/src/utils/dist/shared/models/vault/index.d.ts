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
    /** Whether the TOTP code has been deleted (soft delete) */
    IsDeleted?: boolean;
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
    /** Indicates if this credential has an associated passkey */
    HasPasskey?: boolean;
    /** The relying party ID (domain) of the associated passkey */
    PasskeyRpId?: string;
    /** The display name of the associated passkey */
    PasskeyDisplayName?: string;
    /** Indicates if this credential has one or more attachments */
    HasAttachment?: boolean;
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
    /** The credential ID foreign key */
    CredentialId: string;
    /** The relying party identifier */
    RpId: string;
    /** The user handle (user ID) provided by the relying party - stored as byte array (BLOB) */
    UserHandle?: Uint8Array | number[] | null;
    /** The public key */
    PublicKey: string;
    /** The private key */
    PrivateKey: string;
    /** The PRF encryption key associated with the passkey (optional, only set if PRF was requested by RP) */
    PrfKey?: Uint8Array | number[];
    /** The display name for the passkey */
    DisplayName: string;
    /** Additional data as JSON blob (Base64 encoded) */
    AdditionalData?: string | null;
    /** Created timestamp (epoch milliseconds) */
    CreatedAt: number;
    /** Updated timestamp (epoch milliseconds) */
    UpdatedAt: number;
    /** Soft delete flag (0/1) */
    IsDeleted: number;
};

/**
 * System field keys for the field-based data model.
 * These keys map to FieldDefinition.FieldKey values.
 *
 * System fields use predefined string keys for consistent reference
 * across all platforms. Custom (user-defined) fields have FieldKey = NULL
 * and are identified by their GUID and user-provided Label.
 *
 * Usage:
 * ```typescript
 * // Query by field key
 * WHERE FieldKey = FieldKey.LoginUsername
 *
 * // Insert system field
 * FieldKey = FieldKey.LoginPassword
 *
 * // Custom field
 * FieldKey = null  // User-defined field
 * ```
 */
declare const FieldKey: {
    /**
     * Login username field
     * Type: Text
     */
    readonly LoginUsername: "login.username";
    /**
     * Login password field
     * Type: Password
     */
    readonly LoginPassword: "login.password";
    /**
     * Login notes field
     * Type: Text
     */
    readonly LoginNotes: "login.notes";
    /**
     * Login URL field (multi-value)
     * Type: URL
     */
    readonly LoginUrl: "login.url";
    /**
     * Login recovery codes field (multi-value)
     * Type: Text
     */
    readonly LoginRecoveryCodes: "login.recovery_codes";
    /**
     * Credit card number field
     * Type: Text
     */
    readonly CardNumber: "card.number";
    /**
     * Credit card cardholder name field
     * Type: Text
     */
    readonly CardCardholderName: "card.cardholder_name";
    /**
     * Credit card expiry month field
     * Type: Text
     */
    readonly CardExpiryMonth: "card.expiry_month";
    /**
     * Credit card expiry year field
     * Type: Text
     */
    readonly CardExpiryYear: "card.expiry_year";
    /**
     * Credit card CVV field
     * Type: Password
     */
    readonly CardCvv: "card.cvv";
    /**
     * Credit card PIN field
     * Type: Password
     */
    readonly CardPin: "card.pin";
    /**
     * Identity title field (e.g., Mr., Mrs., Dr.)
     * Type: Text
     */
    readonly IdentityTitle: "identity.title";
    /**
     * Identity first name field
     * Type: Text
     */
    readonly IdentityFirstName: "identity.first_name";
    /**
     * Identity middle name field
     * Type: Text
     */
    readonly IdentityMiddleName: "identity.middle_name";
    /**
     * Identity last name field
     * Type: Text
     */
    readonly IdentityLastName: "identity.last_name";
    /**
     * Identity email field
     * Type: Email
     */
    readonly IdentityEmail: "identity.email";
    /**
     * Identity phone number field (multi-value)
     * Type: Text
     */
    readonly IdentityPhoneNumbers: "identity.phone_numbers";
    /**
     * Identity address line 1 field
     * Type: Text
     */
    readonly IdentityAddressLine1: "identity.address_line1";
    /**
     * Identity address line 2 field
     * Type: Text
     */
    readonly IdentityAddressLine2: "identity.address_line2";
    /**
     * Identity city field
     * Type: Text
     */
    readonly IdentityCity: "identity.city";
    /**
     * Identity state/province field
     * Type: Text
     */
    readonly IdentityState: "identity.state";
    /**
     * Identity postal code field
     * Type: Text
     */
    readonly IdentityPostalCode: "identity.postal_code";
    /**
     * Identity country field
     * Type: Text
     */
    readonly IdentityCountry: "identity.country";
    /**
     * API key value field
     * Type: Password
     */
    readonly ApiKeyKey: "apikey.key";
    /**
     * API key type/provider field (e.g., "OpenAI", "Stripe")
     * Type: Text
     */
    readonly ApiKeyType: "apikey.type";
    /**
     * Alias email field
     * Type: Email
     */
    readonly AliasEmail: "alias.email";
    /**
     * Alias first name field
     * Type: Text
     */
    readonly AliasFirstName: "alias.first_name";
    /**
     * Alias last name field
     * Type: Text
     */
    readonly AliasLastName: "alias.last_name";
    /**
     * Alias nickname field
     * Type: Text
     */
    readonly AliasNickname: "alias.nickname";
    /**
     * Alias gender field
     * Type: Text
     */
    readonly AliasGender: "alias.gender";
    /**
     * Alias birth date field
     * Type: Date
     */
    readonly AliasBirthdate: "alias.birthdate";
};
/**
 * Type representing all valid field key values
 */
type FieldKeyValue = typeof FieldKey[keyof typeof FieldKey];

export { type Alias, type Attachment, type Credential, type EncryptionKey, FieldKey, type FieldKeyValue, type Passkey, type PasswordSettings, type TotpCode };
