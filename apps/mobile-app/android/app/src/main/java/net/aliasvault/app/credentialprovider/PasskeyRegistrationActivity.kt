package net.aliasvault.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderCreateCredentialRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.aliasvault.app.credentialprovider.AliasVaultCredentialProviderService.Companion.EXTRA_CREATE_REQUEST_JSON
import net.aliasvault.app.credentialprovider.AliasVaultCredentialProviderService.Companion.EXTRA_CREATE_RP_ID
import net.aliasvault.app.credentialprovider.AliasVaultCredentialProviderService.Companion.EXTRA_CREATE_USER_DISPLAY_NAME
import net.aliasvault.app.credentialprovider.AliasVaultCredentialProviderService.Companion.EXTRA_CREATE_USER_ID
import net.aliasvault.app.credentialprovider.AliasVaultCredentialProviderService.Companion.EXTRA_CREATE_USER_NAME
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.createCredentialWithPasskey
import net.aliasvault.app.vaultstore.models.Passkey
import net.aliasvault.app.vaultstore.passkey.PasskeyAuthenticator
import net.aliasvault.app.vaultstore.passkey.PasskeyHelper
import net.aliasvault.app.webapi.WebApiService
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Date
import java.util.UUID

/**
 * PasskeyRegistrationActivity
 *
 * Handles passkey registration (credential creation) when a website requests passkey creation.
 * This activity:
 * 1. Generates the WebAuthn credential using PasskeyAuthenticator
 * 2. Stores the passkey in the vault
 * 3. Syncs with server
 * 4. Returns the registration response to the calling app
 *
 * Flow:
 * - Website requests passkey creation
 * - This activity is launched with registration details
 * - We generate credential, save to vault, sync, and return attestation
 */
class PasskeyRegistrationActivity : Activity() {

    companion object {
        private const val TAG = "PasskeyRegistration"
    }

    private lateinit var vaultStore: VaultStore
    private lateinit var webApiService: WebApiService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            // Initialize VaultStore and WebApiService
            vaultStore = VaultStore.getExistingInstance()
                ?: throw Exception("VaultStore not initialized")
            webApiService = WebApiService(this)

            // Retrieve provider request
            val providerRequest = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
            if (providerRequest == null) {
                Log.e(TAG, "No provider request found in intent")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            // Extract parameters from intent
            val requestJson = intent.getStringExtra(EXTRA_CREATE_REQUEST_JSON) ?: ""
            val rpId = intent.getStringExtra(EXTRA_CREATE_RP_ID) ?: ""
            val userName = intent.getStringExtra(EXTRA_CREATE_USER_NAME)
            val userDisplayName = intent.getStringExtra(EXTRA_CREATE_USER_DISPLAY_NAME)
            val userIdB64 = intent.getStringExtra(EXTRA_CREATE_USER_ID)

            if (rpId.isEmpty() || requestJson.isEmpty()) {
                Log.e(TAG, "Missing required parameters")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            // Decode user ID from base64url
            val userId = if (!userIdB64.isNullOrEmpty()) {
                try {
                    base64urlDecode(userIdB64)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to decode user ID", e)
                    null
                }
            } else {
                null
            }

            // Start passkey creation in coroutine
            CoroutineScope(Dispatchers.Main).launch {
                createPasskey(
                    providerRequest = providerRequest,
                    requestJson = requestJson,
                    rpId = rpId,
                    userName = userName,
                    userDisplayName = userDisplayName,
                    userId = userId,
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            setResult(RESULT_CANCELED)
            finish()
        }
    }

    /**
     * Create the passkey
     */
    private suspend fun createPasskey(
        providerRequest: ProviderCreateCredentialRequest,
        requestJson: String,
        rpId: String,
        userName: String?,
        userDisplayName: String?,
        userId: ByteArray?,
    ) = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Creating passkey for RP: $rpId, user: $userName")

            // Extract favicon (optional)
            var logo: ByteArray? = null
            try {
                logo = webApiService.extractFavicon("https://$rpId")
            } catch (e: Exception) {
                Log.w(TAG, "Favicon extraction failed", e)
                // Continue without logo
            }

            // Generate passkey credentials
            val passkeyId = UUID.randomUUID()
            val credentialId = PasskeyHelper.guidToBytes(passkeyId.toString())

            // Parse request to get challenge
            val requestObj = JSONObject(requestJson)
            val challenge = requestObj.optString("challenge", "")

            // Construct origin from calling app package name
            val packageName = providerRequest.callingAppInfo.packageName
            val origin = "android:apk-key-hash:$packageName"

            // Build clientDataJSON
            val clientDataJson =
                """{"type":"webauthn.create","challenge":"$challenge","origin":"$origin","crossOrigin":false}"""
            val clientDataHash = sha256(clientDataJson.toByteArray(Charsets.UTF_8))

            // Extract PRF inputs if present
            val prfInputs = extractPrfInputs(requestObj)
            val enablePrf = prfInputs != null

            // Create the passkey using PasskeyAuthenticator
            val passkeyResult = PasskeyAuthenticator.createPasskey(
                credentialId = credentialId,
                clientDataHash = clientDataHash,
                rpId = rpId,
                userId = userId,
                userName = userName,
                userDisplayName = userDisplayName,
                uvPerformed = true,
                enablePrf = enablePrf,
                prfInputs = prfInputs,
            )

            // Create Passkey model object
            val now = Date()
            val displayName = userDisplayName ?: userName ?: rpId
            val passkey = Passkey(
                id = passkeyId,
                parentCredentialId = UUID.randomUUID(), // Will be set by createCredentialWithPasskey
                rpId = rpId,
                userHandle = userId,
                userName = userName,
                publicKey = passkeyResult.publicKey,
                privateKey = passkeyResult.privateKey,
                prfKey = passkeyResult.prfSecret,
                displayName = displayName,
                createdAt = now,
                updatedAt = now,
                isDeleted = false,
            )

            // Store in database
            val db = try {
                val dbField = VaultStore::class.java.getDeclaredField("dbConnection")
                dbField.isAccessible = true
                dbField.get(vaultStore) as? android.database.sqlite.SQLiteDatabase
            } catch (e: Exception) {
                Log.e(TAG, "Cannot access database", e)
                throw Exception("Database not available")
            }

            if (db == null) {
                throw Exception("Database not available")
            }

            db.beginTransaction()
            try {
                vaultStore.createCredentialWithPasskey(
                    rpId = rpId,
                    userName = userName,
                    displayName = displayName,
                    passkey = passkey,
                    logo = logo,
                    db = db,
                )
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }

            // Upload vault changes to server
            try {
                vaultStore.mutateVault(webApiService)
            } catch (e: Exception) {
                Log.w(TAG, "Vault mutation failed, but passkey was created locally", e)
                // Continue - passkey is still saved locally
            }

            // Build response
            val credentialIdB64 = base64urlEncode(credentialId)
            val attestationObjectB64 = base64urlEncode(passkeyResult.attestationObject)
            val clientDataJsonB64 = base64urlEncode(clientDataJson.toByteArray(Charsets.UTF_8))

            val responseJson = JSONObject().apply {
                put("id", credentialIdB64)
                put("rawId", credentialIdB64)
                put("type", "public-key")

                put(
                    "response",
                    JSONObject().apply {
                        put("attestationObject", attestationObjectB64)
                        put("clientDataJSON", clientDataJsonB64)
                    },
                )

                if (enablePrf && passkeyResult.prfResults != null) {
                    val prfResults = passkeyResult.prfResults
                    put(
                        "clientExtensionResults",
                        JSONObject().apply {
                            put(
                                "prf",
                                JSONObject().apply {
                                    put("enabled", true)
                                    put(
                                        "results",
                                        JSONObject().apply {
                                            put("first", base64urlEncode(prfResults.first))
                                            prfResults.second?.let {
                                                put("second", base64urlEncode(it))
                                            }
                                        },
                                    )
                                },
                            )
                        },
                    )
                } else {
                    put("clientExtensionResults", JSONObject())
                }
            }

            val response = CreatePublicKeyCredentialResponse(responseJson.toString())

            withContext(Dispatchers.Main) {
                val resultIntent = Intent()
                try {
                    PendingIntentHandler.setCreateCredentialResponse(resultIntent, response)
                    setResult(RESULT_OK, resultIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "Error setting credential response", e)
                    setResult(RESULT_CANCELED)
                }
                finish()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error creating passkey", e)
            withContext(Dispatchers.Main) {
                setResult(RESULT_CANCELED)
                finish()
            }
        }
    }

    /**
     * Extract PRF extension inputs from request
     */
    private fun extractPrfInputs(requestObj: JSONObject): PasskeyAuthenticator.PrfInputs? {
        try {
            val extensions = requestObj.optJSONObject("extensions") ?: return null
            val prf = extensions.optJSONObject("prf") ?: return null
            val eval = prf.optJSONObject("eval") ?: return null

            val firstB64 = eval.optString("first")
            if (firstB64.isEmpty()) return null
            val secondB64 = eval.optString("second")

            val first = base64urlDecode(firstB64)
            val second = if (secondB64.isNotEmpty()) base64urlDecode(secondB64) else null

            Log.d(TAG, "PRF extension requested")
            return PasskeyAuthenticator.PrfInputs(first, second)
        } catch (e: Exception) {
            Log.w(TAG, "Error extracting PRF inputs", e)
            return null
        }
    }

    /**
     * Compute SHA-256 hash
     */
    private fun sha256(data: ByteArray): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(data)
    }

    /**
     * Encode bytes to base64url string
     */
    private fun base64urlEncode(data: ByteArray): String {
        return android.util.Base64.encodeToString(
            data,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }

    /**
     * Decode base64url string to bytes
     */
    private fun base64urlDecode(base64url: String): ByteArray {
        var base64 = base64url
            .replace('-', '+')
            .replace('_', '/')

        // Add padding if needed
        val remainder = base64.length % 4
        if (remainder > 0) {
            base64 += "=".repeat(4 - remainder)
        }

        return android.util.Base64.decode(base64, android.util.Base64.NO_WRAP)
    }
}
