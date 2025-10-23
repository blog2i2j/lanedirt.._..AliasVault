package net.aliasvault.app.vaultstore

/**
 * Error codes for vault sync operations
 * These error codes are language-independent and can be properly handled by the client
 *
 * This is a Kotlin port of the iOS Swift implementation:
 * - Reference: apps/mobile-app/ios/VaultStoreKit/Enums/VaultSyncError.swift
 *
 * IMPORTANT: Keep all implementations synchronized. Changes to the public interface must be
 * reflected in all ports. Error types and codes should remain consistent.
 */
sealed class VaultSyncError(message: String, cause: Throwable? = null) : Exception(message, cause) {
    // Authentication errors
    /**
     * Error indicating authentication failed.
     */
    class AuthenticationFailed(
        message: String = "Authentication failed",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    /**
     * Error indicating session expired.
     */
    class SessionExpired(
        message: String = "Session expired",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    /**
     * Error indicating password has changed.
     */
    class PasswordChanged(
        message: String = "Password has changed",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    // Network/connectivity errors
    /**
     * Error indicating server unavailable.
     */
    class ServerUnavailable(
        /** The HTTP status code. */
        val statusCode: Int,
        message: String = "Server unavailable (status: $statusCode)",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    /**
     * Error indicating network error.
     */
    class NetworkError(
        /** The underlying error. */
        val underlyingError: Throwable,
    ) : VaultSyncError("Network error: ${underlyingError.message}", underlyingError)

    /**
     * Error indicating request timeout.
     */
    class Timeout(
        message: String = "Request timeout",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    // Version/compatibility errors
    /**
     * Error indicating client version not supported.
     */
    class ClientVersionNotSupported(
        message: String = "Client version not supported",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    /**
     * Error indicating server version not supported.
     */
    class ServerVersionNotSupported(
        message: String = "Server version not supported",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    /**
     * Error indicating vault version incompatible.
     */
    class VaultVersionIncompatible(
        message: String = "Vault version incompatible",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    // Vault status errors
    /**
     * Error indicating vault merge required.
     */
    class VaultMergeRequired(
        message: String = "Vault merge required",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    /**
     * Error indicating vault outdated.
     */
    class VaultOutdated(
        message: String = "Vault outdated",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    // Decryption errors
    /**
     * Error indicating failed to decrypt vault.
     */
    class VaultDecryptFailed(
        message: String = "Failed to decrypt vault",
        cause: Throwable? = null,
    ) : VaultSyncError(message, cause)

    // Generic errors
    /**
     * Error indicating unknown error.
     */
    class UnknownError(
        message: String,
        cause: Throwable? = null,
    ) : VaultSyncError("Unknown error: $message", cause)

    /**
     * Error indicating parse error.
     */
    class ParseError(
        message: String,
        cause: Throwable? = null,
    ) : VaultSyncError("Parse error: $message", cause)

    /**
     * Get the error code string for React Native bridge.
     */
    val code: String
        get() = when (this) {
            is AuthenticationFailed -> "VAULT_SYNC_AUTH_FAILED"
            is SessionExpired -> "VAULT_SYNC_SESSION_EXPIRED"
            is PasswordChanged -> "VAULT_SYNC_PASSWORD_CHANGED"
            is ServerUnavailable -> "VAULT_SYNC_SERVER_UNAVAILABLE"
            is NetworkError -> "VAULT_SYNC_NETWORK_ERROR"
            is Timeout -> "VAULT_SYNC_TIMEOUT"
            is ClientVersionNotSupported -> "VAULT_SYNC_CLIENT_VERSION_NOT_SUPPORTED"
            is ServerVersionNotSupported -> "VAULT_SYNC_SERVER_VERSION_NOT_SUPPORTED"
            is VaultVersionIncompatible -> "VAULT_SYNC_VAULT_VERSION_INCOMPATIBLE"
            is VaultMergeRequired -> "VAULT_SYNC_MERGE_REQUIRED"
            is VaultOutdated -> "VAULT_SYNC_OUTDATED"
            is VaultDecryptFailed -> "VAULT_SYNC_DECRYPT_FAILED"
            is UnknownError -> "VAULT_SYNC_UNKNOWN_ERROR"
            is ParseError -> "VAULT_SYNC_PARSE_ERROR"
        }
}
