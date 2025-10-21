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
    class AuthenticationFailed(message: String = "Authentication failed") : VaultSyncError(message)
    class SessionExpired(message: String = "Session expired") : VaultSyncError(message)
    class PasswordChanged(message: String = "Password has changed") : VaultSyncError(message)

    // Network/connectivity errors
    class ServerUnavailable(val statusCode: Int, message: String = "Server unavailable (status: $statusCode)") :
        VaultSyncError(message)
    class NetworkError(val underlyingError: Throwable) :
        VaultSyncError("Network error: ${underlyingError.message}", underlyingError)
    class Timeout(message: String = "Request timeout") : VaultSyncError(message)

    // Version/compatibility errors
    class ClientVersionNotSupported(message: String = "Client version not supported") : VaultSyncError(message)
    class ServerVersionNotSupported(message: String = "Server version not supported") : VaultSyncError(message)
    class VaultVersionIncompatible(message: String = "Vault version incompatible") : VaultSyncError(message)

    // Vault status errors
    class VaultMergeRequired(message: String = "Vault merge required") : VaultSyncError(message)
    class VaultOutdated(message: String = "Vault outdated") : VaultSyncError(message)

    // Decryption errors
    class VaultDecryptFailed(message: String = "Failed to decrypt vault") : VaultSyncError(message)

    // Generic errors
    class UnknownError(message: String) : VaultSyncError("Unknown error: $message")
    class ParseError(message: String) : VaultSyncError("Parse error: $message")

    /**
     * Get the error code string for React Native bridge
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
