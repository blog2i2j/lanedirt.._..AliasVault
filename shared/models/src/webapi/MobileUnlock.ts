import type { TokenModel } from './ValidateLogin';

/**
 * Mobile unlock initiate request type.
 */
export type MobileUnlockInitiateRequest = {
    clientPublicKey: string;
}

/**
 * Mobile unlock initiate response type.
 */
export type MobileUnlockInitiateResponse = {
    requestId: string;
}

/**
 * Mobile unlock submit request type.
 */
export type MobileUnlockSubmitRequest = {
    requestId: string;
    encryptedDecryptionKey: string;
    username: string;
}

/**
 * Mobile unlock poll response type.
 */
export type MobileUnlockPollResponse = {
    fulfilled: boolean;
    encryptedDecryptionKey: string | null;
    username: string | null;
    token: TokenModel | null;
    salt: string | null;
    encryptionType: string | null;
    encryptionSettings: string | null;
}
