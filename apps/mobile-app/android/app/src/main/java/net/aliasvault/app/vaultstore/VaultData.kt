package net.aliasvault.app.vaultstore

/**
 * Vault data from API.
 */
data class VaultData(
    val username: String,
    val blob: String,
    val version: String,
    val currentRevisionNumber: Int,
    val encryptionPublicKey: String,
    val credentialsCount: Int,
    val emailAddressList: List<String>,
    val privateEmailDomainList: List<String>,
    val hiddenPrivateEmailDomainList: List<String>,
    val publicEmailDomainList: List<String>,
    val createdAt: String,
    val updatedAt: String,
)

/**
 * Vault response from Vault GET endpoint.
 */
data class VaultResponse(
    val status: Int,
    val vault: VaultData,
)

/**
 * Result of checking for new vault version.
 */
data class VaultVersionCheckResult(
    val isNewVersionAvailable: Boolean,
    val newRevision: Int?,
    val serverRevision: Int,
    val syncState: net.aliasvault.app.vaultstore.models.SyncState,
)

/**
 * Result of vault upload.
 */
data class VaultUploadResult(
    val success: Boolean,
    val status: Int,
    val newRevisionNumber: Int,
    val mutationSeqAtStart: Int,
    val error: String? = null,
)
