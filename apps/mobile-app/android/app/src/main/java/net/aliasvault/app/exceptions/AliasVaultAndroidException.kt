package net.aliasvault.app.exceptions

/**
 * Base exception class for AliasVault Android application errors.
 *
 * This custom exception replaces generic Exception usage throughout the Android codebase
 * to provide more specific error handling and improve code quality.
 */
open class AliasVaultAndroidException : Exception {
    /**
     * Constructs an exception with a detail message.
     */
    constructor(message: String) : super(message)

    /**
     * Constructs an exception with a detail message and a cause.
     */
    constructor(message: String, cause: Throwable) : super(message, cause)

    /**
     * Constructs an exception with a cause.
     */
    constructor(cause: Throwable) : super(cause)
}

/**
 * Exception thrown when vault operations fail.
 */
class VaultOperationException : AliasVaultAndroidException {
    constructor(message: String) : super(message)
    constructor(message: String, cause: Throwable) : super(message, cause)
    constructor(cause: Throwable) : super(cause)
}

/**
 * Exception thrown when passkey operations fail.
 */
class PasskeyOperationException : AliasVaultAndroidException {
    constructor(message: String) : super(message)
    constructor(message: String, cause: Throwable) : super(message, cause)
    constructor(cause: Throwable) : super(cause)
}

/**
 * Exception thrown when cryptographic operations fail.
 */
class CryptoOperationException : AliasVaultAndroidException {
    constructor(message: String) : super(message)
    constructor(message: String, cause: Throwable) : super(message, cause)
    constructor(cause: Throwable) : super(cause)
}

/**
 * Exception thrown when data serialization/deserialization fails.
 */
class SerializationException : AliasVaultAndroidException {
    constructor(message: String) : super(message)
    constructor(message: String, cause: Throwable) : super(message, cause)
    constructor(cause: Throwable) : super(cause)
}
