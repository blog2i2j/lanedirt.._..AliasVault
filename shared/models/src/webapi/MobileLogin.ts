import type { TokenModel } from './ValidateLogin';

/**
 * Mobile login initiate request type.
 */
export type MobileLoginInitiateRequest = {
    clientPublicKey: string;
}

/**
 * Mobile login initiate response type.
 */
export type MobileLoginInitiateResponse = {
    requestId: string;
}

/**
 * Mobile login submit request type.
 */
export type MobileLoginSubmitRequest = {
    requestId: string;
    encryptedDecryptionKey: string;
    username: string;
}

/**
 * Mobile login poll response type.
 */
export type MobileLoginPollResponse = {
    fulfilled: boolean;
    encryptedDecryptionKey: string | null;
    username: string | null;
    token: TokenModel | null;
    salt: string | null;
    encryptionType: string | null;
    encryptionSettings: string | null;
}
