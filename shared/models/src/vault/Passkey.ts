/**
 * Passkey SQLite database type.
 */
export type Passkey = {
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
}
