package net.aliasvault.app.vaultstore.storageprovider

import java.io.File

/**
 * Interface for storage providers that can store and retrieve data.
 * This allows for different implementations for real devices and testing.
 */
interface StorageProvider {
    /**
     * Get the encrypted database file.
     * @return The encrypted database file
     */
    fun getEncryptedDatabaseFile(): File

    /**
     * Set the encrypted database file.
     * @param encryptedData The encrypted database data as a base64 encoded string
     */
    fun setEncryptedDatabaseFile(encryptedData: String)

    /**
     * Get the key derivation parameters.
     * @return The key derivation parameters as a string
     */
    fun getKeyDerivationParams(): String

    /**
     * Set the key derivation parameters.
     * @param keyDerivationParams The key derivation parameters as a string
     */
    fun setKeyDerivationParams(keyDerivationParams: String)

    /**
     * Get the metadata.
     * @return The metadata as a string
     */
    fun getMetadata(): String

    /**
     * Set the metadata.
     * @param metadata The metadata as a string
     */
    fun setMetadata(metadata: String)

    /**
     * Get the auto-lock timeout.
     * @return The auto-lock timeout in seconds
     */
    fun getAutoLockTimeout(): Int

    /**
     * Set the auto-lock timeout.
     * @param timeout The auto-lock timeout in seconds
     */
    fun setAutoLockTimeout(timeout: Int)

    /**
     * Get the authentication methods.
     * @return The authentication methods as a string
     */
    fun getAuthMethods(): String

    /**
     * Set the authentication methods.
     * @param authMethods The authentication methods as a string
     */
    fun setAuthMethods(authMethods: String)

    /**
     * Clear all data from the storage provider.
     */
    fun clearStorage()
}
