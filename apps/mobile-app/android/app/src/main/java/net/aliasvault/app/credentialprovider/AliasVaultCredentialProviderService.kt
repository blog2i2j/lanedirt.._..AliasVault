package net.aliasvault.app.credentialprovider

import android.app.PendingIntent
import android.content.Intent
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import android.util.Log
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import androidx.credentials.provider.PublicKeyCredentialEntry
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.getPasskeysForRpId
import net.aliasvault.app.vaultstore.passkey.PasskeyHelper
import org.json.JSONObject

/**
 * AliasVault Credential Provider Service
 *
 * Implements passkey authentication via Android Credential Manager API.
 * This service handles querying vault for matching passkeys and returning entries.
 *
 * Reference: https://developer.android.com/identity/sign-in/credential-provider
 */
class AliasVaultCredentialProviderService : CredentialProviderService() {

    companion object {
        private const val TAG = "AliasVaultCredProvider"

        // Intent extras for authentication
        const val EXTRA_REQUEST_JSON = "request_json"
        const val EXTRA_RP_ID = "rp_id"
        const val EXTRA_PASSKEY_ID = "passkey_id"

        // Intent extras for registration
        const val EXTRA_CREATE_REQUEST_JSON = "create_request_json"
        const val EXTRA_CREATE_RP_ID = "create_rp_id"
        const val EXTRA_CREATE_USER_NAME = "create_user_name"
        const val EXTRA_CREATE_USER_DISPLAY_NAME = "create_user_display_name"
        const val EXTRA_CREATE_USER_ID = "create_user_id"
    }

    /**
     * Called when the system needs to display available credentials for authentication
     */
    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>,
    ) {
        Log.d(TAG, "onBeginGetCredentialRequest called")

        try {
            // Get vault store instance
            val vaultStore = VaultStore.getExistingInstance()
            if (vaultStore == null) {
                Log.w(TAG, "VaultStore not initialized")
                callback.onResult(BeginGetCredentialResponse())
                return
            }

            val credentialEntries = mutableListOf<PublicKeyCredentialEntry>()

            // Process each credential option
            for (option in request.beginGetCredentialOptions) {
                when (option) {
                    is BeginGetPublicKeyCredentialOption -> {
                        // This is a passkey request
                        val entries = processPasskeyOption(option, vaultStore)
                        credentialEntries.addAll(entries)
                    }
                }
            }

            Log.d(TAG, "Returning ${credentialEntries.size} credential entries")
            callback.onResult(BeginGetCredentialResponse(credentialEntries = credentialEntries))
        } catch (e: Exception) {
            Log.e(TAG, "Error in onBeginGetCredentialRequest", e)
            callback.onResult(BeginGetCredentialResponse())
        }
    }

    /**
     * Process a passkey credential option and return matching credential entries
     */
    private fun processPasskeyOption(
        option: BeginGetPublicKeyCredentialOption,
        vaultStore: VaultStore,
    ): List<PublicKeyCredentialEntry> {
        try {
            // Parse the request JSON to extract RP ID and other parameters
            val requestJson = option.requestJson
            val requestObj = JSONObject(requestJson)

            val rpId = requestObj.getString("rpId")
            if (rpId.isEmpty()) {
                Log.w(TAG, "No rpId found in passkey request")
                return emptyList()
            }

            Log.d(TAG, "Looking for passkeys for RP ID: $rpId")

            // Query vault for matching passkeys
            val db = try {
                val dbField = VaultStore::class.java.getDeclaredField("dbConnection")
                dbField.isAccessible = true
                dbField.get(vaultStore) as? android.database.sqlite.SQLiteDatabase
            } catch (e: Exception) {
                Log.w(TAG, "Cannot access database - vault might be locked", e)
                null
            }

            if (db == null) {
                Log.w(TAG, "Database not available - vault is locked")
                return emptyList()
            }

            // Get passkeys for this RP ID
            val passkeys = vaultStore.getPasskeysForRpId(rpId, db)
            Log.d(TAG, "Found ${passkeys.size} passkeys for $rpId")

            // Debug: Log each passkey ID
            passkeys.forEach { passkey ->
                Log.d(TAG, "Passkey found: ID=${passkey.id}, DisplayName=${passkey.displayName}, RpId=${passkey.rpId}")
            }

            // Filter by allowCredentials if specified
            val allowCredentials = requestObj.optJSONArray("allowCredentials")
            val filteredPasskeys = if (allowCredentials != null && allowCredentials.length() > 0) {
                val allowedIds = mutableSetOf<String>()
                for (i in 0 until allowCredentials.length()) {
                    val cred = allowCredentials.getJSONObject(i)
                    val id = cred.optString("id", "")
                    if (id.isNotEmpty()) {
                        allowedIds.add(id)
                    }
                }

                passkeys.filter { passkey ->
                    val passkeyIdBytes = PasskeyHelper.guidToBytes(passkey.id.toString())
                    val passkeyIdB64 = android.util.Base64.encodeToString(
                        passkeyIdBytes,
                        android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
                    )
                    allowedIds.contains(passkeyIdB64)
                }
            } else {
                passkeys
            }

            Log.d(TAG, "After filtering: ${filteredPasskeys.size} passkeys")

            // Convert to CredentialEntry objects
            return filteredPasskeys.map { passkey ->
                createPasskeyEntry(passkey, option, requestJson)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing passkey option", e)
            return emptyList()
        }
    }

    /**
     * Create a PublicKeyCredentialEntry for a passkey
     */
    private fun createPasskeyEntry(
        passkey: net.aliasvault.app.vaultstore.models.Passkey,
        option: BeginGetPublicKeyCredentialOption,
        requestJson: String,
    ): PublicKeyCredentialEntry {
        Log.d(TAG, "Creating passkey entry for ID=${passkey.id}, DisplayName=${passkey.displayName}")

        // Create intent for PasskeyAuthenticationActivity
        val intent = Intent(this, PasskeyAuthenticationActivity::class.java).apply {
            putExtra(EXTRA_REQUEST_JSON, requestJson)
            putExtra(EXTRA_PASSKEY_ID, passkey.id.toString())
            putExtra(EXTRA_RP_ID, passkey.rpId)
            passkey.userHandle?.let { putExtra("user_handle", it) }
        }

        Log.d(TAG, "Intent created with passkey ID: ${passkey.id}")

        val pendingIntent = PendingIntent.getActivity(
            this,
            passkey.id.hashCode(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        // Use displayName or username for the UI
        val displayName = passkey.displayName.ifEmpty {
            passkey.userName ?: passkey.rpId
        }

        return PublicKeyCredentialEntry.Builder(
            context = this,
            username = displayName,
            pendingIntent = pendingIntent,
            beginGetPublicKeyCredentialOption = option,
        ).build()
    }

    /**
     * Called when the system needs to display available accounts for credential creation
     */
    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>,
    ) {
        Log.d(TAG, "onBeginCreateCredentialRequest called")

        val response: BeginCreateCredentialResponse? = processCreateCredentialRequest(request)
        if (response != null) {
            callback.onResult(response)
        } else {
            callback.onError(CreateCredentialUnknownException())
        }
    }

    /**
     * Process create credential request
     */
    private fun processCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
    ): BeginCreateCredentialResponse? {
        // Get vault store instance
        val vaultStore = VaultStore.getExistingInstance()
        if (vaultStore == null) {
            Log.w(TAG, "VaultStore not initialized for passkey creation")
            return null
        }

        return when (request) {
            is BeginCreatePublicKeyCredentialRequest -> {
                // Request is passkey type
                handleCreatePasskeyQuery(request)
            }
            else -> {
                // Request type not supported
                Log.w(TAG, "Unsupported credential type: ${request.javaClass.simpleName}")
                null
            }
        }
    }

    /**
     * Handle passkey creation query
     */
    private fun handleCreatePasskeyQuery(
        request: BeginCreatePublicKeyCredentialRequest,
    ): BeginCreateCredentialResponse {
        try {
            // Parse the request JSON to extract RP ID and user info
            val requestJson = request.requestJson
            val requestObj = JSONObject(requestJson)

            // Extract RP info
            val rpObj = requestObj.optJSONObject("rp")
            val rpId = rpObj?.optString("id") ?: ""
            val rpName = rpObj?.optString("name") ?: rpId

            // Extract user info
            val userObj = requestObj.optJSONObject("user")
            val userName = userObj?.optString("name") ?: ""
            val userDisplayName = userObj?.optString("displayName") ?: userName
            val userIdB64 = userObj?.optString("id") ?: ""

            Log.d(TAG, "Creating passkey for RP: $rpId ($rpName), user: $userName")

            val createEntries = mutableListOf<CreateEntry>()

            if (rpId.isNotEmpty()) {
                // Create entry for saving passkey to AliasVault
                // Using rpName or userDisplayName as the account name
                val accountName = if (userDisplayName.isNotEmpty()) {
                    "$userDisplayName@$rpName"
                } else {
                    rpName
                }

                val entry = CreateEntry(
                    accountName = accountName,
                    pendingIntent = createNewPendingIntent(
                        rpId = rpId,
                        userName = userName.ifEmpty { null },
                        userDisplayName = userDisplayName.ifEmpty { null },
                        userIdB64 = userIdB64.ifEmpty { null },
                        requestJson = requestJson,
                    ),
                )

                createEntries.add(entry)
            }

            Log.d(TAG, "Returning ${createEntries.size} create entries")
            return BeginCreateCredentialResponse(createEntries)
        } catch (e: Exception) {
            Log.e(TAG, "Error handling passkey create query", e)
            return BeginCreateCredentialResponse(emptyList())
        }
    }

    /**
     * Create a PendingIntent for passkey registration
     */
    private fun createNewPendingIntent(
        rpId: String,
        userName: String?,
        userDisplayName: String?,
        userIdB64: String?,
        requestJson: String,
    ): PendingIntent {
        // Create intent for PasskeyRegistrationActivity
        val intent = Intent(this, PasskeyRegistrationActivity::class.java).apply {
            putExtra(EXTRA_CREATE_REQUEST_JSON, requestJson)
            putExtra(EXTRA_CREATE_RP_ID, rpId)
            userName?.let { putExtra(EXTRA_CREATE_USER_NAME, it) }
            userDisplayName?.let { putExtra(EXTRA_CREATE_USER_DISPLAY_NAME, it) }
            userIdB64?.let { putExtra(EXTRA_CREATE_USER_ID, it) }
        }

        return PendingIntent.getActivity(
            this,
            rpId.hashCode(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>,
    ) {
        // Called when user signs out or clears credential state
        // For AliasVault, we don't need to do anything here as credentials
        // are managed through the main app
        Log.d(TAG, "onClearCredentialStateRequest called")
        callback.onResult(null)
    }
}
