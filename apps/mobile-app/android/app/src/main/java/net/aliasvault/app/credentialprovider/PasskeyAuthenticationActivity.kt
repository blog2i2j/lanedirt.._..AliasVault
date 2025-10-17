package net.aliasvault.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.passkey.PasskeyAuthenticator
import net.aliasvault.app.vaultstore.passkey.PasskeyHelper
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

/**
 * PasskeyAuthenticationActivity
 *
 * Handles passkey authentication (assertion generation) when user selects a passkey.
 * This activity:
 * 1. Retrieves the passkey from the vault
 * 2. Extracts PRF extension inputs if present
 * 3. Generates the WebAuthn assertion using PasskeyAuthenticator
 * 4. Returns the assertion to the calling app
 *
 * Flow:
 * - User selects a passkey from Credential Manager UI
 * - This activity is launched with passkey details
 * - We generate assertion and return it immediately (no UI needed)
 * - Or show biometric prompt if required
 */
class PasskeyAuthenticationActivity : Activity() {

    companion object {
        private const val TAG = "PasskeyAuthentication"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Log.d(TAG, "PasskeyAuthenticationActivity started")

        try {
            // Extract the credential request from the intent
            val providerRequest = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
            if (providerRequest == null) {
                Log.e(TAG, "No provider request found in intent")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            // Process the authentication request
            processAuthenticationRequest(providerRequest)
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            setResult(RESULT_CANCELED)
            finish()
        }
    }

    /**
     * Process the passkey authentication request and generate assertion
     */
    private fun processAuthenticationRequest(providerRequest: ProviderGetCredentialRequest) {
        try {
            // Extract passkey ID from intent
            val passkeyIdString = intent.getStringExtra(
                AliasVaultCredentialProviderService.EXTRA_PASSKEY_ID,
            )
            if (passkeyIdString == null) {
                Log.e(TAG, "No passkey ID in intent")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            val passkeyId = UUID.fromString(passkeyIdString)
            Log.d(TAG, "Processing authentication for passkey: $passkeyId")

            // Get vault store
            val vaultStore = VaultStore.getExistingInstance()
            if (vaultStore == null) {
                Log.e(TAG, "VaultStore not initialized")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            // Get database connection
            val db = try {
                val dbField = VaultStore::class.java.getDeclaredField("dbConnection")
                dbField.isAccessible = true
                dbField.get(vaultStore) as? android.database.sqlite.SQLiteDatabase
            } catch (e: Exception) {
                Log.e(TAG, "Cannot access database - vault might be locked", e)
                null
            }

            if (db == null) {
                Log.e(TAG, "Database not available - vault is locked")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            // Get the passkey from vault using its ID (not credential ID)
            val passkey = getPasskeyById(passkeyId, db, vaultStore)
            if (passkey == null) {
                Log.e(TAG, "Passkey not found: $passkeyId")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            Log.d(TAG, "Found passkey for RP: ${passkey.rpId}")

            // Parse the request JSON to extract necessary parameters
            val requestJson = intent.getStringExtra(
                AliasVaultCredentialProviderService.EXTRA_REQUEST_JSON,
            ) ?: ""
            val requestObj = JSONObject(requestJson)

            // Extract parameters from request
            val rpId = passkey.rpId
            val challenge = requestObj.optString("challenge", "")
            val origin = requestObj.optString("origin", "https://$rpId")

            // Build clientDataJSON
            val clientDataJson = buildClientDataJson(challenge, origin)
            val clientDataHash = sha256(clientDataJson.toByteArray(Charsets.UTF_8))

            // Extract PRF extension inputs if present
            val prfInputs = extractPrfInputs(requestObj)

            // Generate the passkey credential ID (UUID as bytes)
            val credentialId = PasskeyHelper.guidToBytes(passkey.id.toString())

            // Generate assertion using PasskeyAuthenticator
            val assertion = PasskeyAuthenticator.getAssertion(
                credentialId = credentialId,
                clientDataHash = clientDataHash,
                rpId = rpId,
                privateKeyJWK = passkey.privateKey,
                userId = passkey.userHandle,
                uvPerformed = true, // TODO: Add biometric authentication
                prfInputs = prfInputs,
                prfSecret = passkey.prfKey,
            )

            Log.d(TAG, "Assertion generated successfully")

            // Build the response
            val response = buildAuthenticationResponse(
                assertion,
                clientDataJson,
                prfInputs != null && passkey.prfKey != null,
            )

            // Return the response
            val resultIntent = Intent()
            PendingIntentHandler.setGetCredentialResponse(resultIntent, response)
            setResult(RESULT_OK, resultIntent)
            finish()
        } catch (e: Exception) {
            Log.e(TAG, "Error processing authentication request", e)
            setResult(RESULT_CANCELED)
            finish()
        }
    }

    /**
     * Get passkey by its UUID (not credential ID)
     */
    private fun getPasskeyById(
        passkeyId: UUID,
        db: android.database.sqlite.SQLiteDatabase,
        vaultStore: VaultStore,
    ): net.aliasvault.app.vaultstore.models.Passkey? {
        val query = """
            SELECT Id, CredentialId, RpId, UserHandle, PublicKey, PrivateKey, PrfKey,
                   DisplayName, CreatedAt, UpdatedAt, IsDeleted
            FROM Passkeys
            WHERE Id = ? AND IsDeleted = 0
            LIMIT 1
        """.trimIndent()

        val cursor = db.rawQuery(query, arrayOf(passkeyId.toString()))
        cursor.use {
            if (it.moveToFirst()) {
                return parsePasskeyRow(it)
            }
        }

        return null
    }

    /**
     * Parse passkey from cursor (simplified version from VaultStorePasskey)
     */
    private fun parsePasskeyRow(cursor: android.database.Cursor): net.aliasvault.app.vaultstore.models.Passkey? {
        try {
            val id = UUID.fromString(cursor.getString(0))
            val parentCredentialId = UUID.fromString(cursor.getString(1))
            val rpId = cursor.getString(2)
            val userHandle = if (!cursor.isNull(3)) cursor.getBlob(3) else null
            val publicKey = cursor.getString(4).toByteArray(Charsets.UTF_8)
            val privateKey = cursor.getString(5).toByteArray(Charsets.UTF_8)
            val prfKey = if (!cursor.isNull(6)) cursor.getBlob(6) else null
            val displayName = cursor.getString(7)

            // Use current date for createdAt/updatedAt as we don't need them here
            val now = java.util.Date()

            return net.aliasvault.app.vaultstore.models.Passkey(
                id = id,
                parentCredentialId = parentCredentialId,
                rpId = rpId,
                userHandle = userHandle,
                userName = null,
                publicKey = publicKey,
                privateKey = privateKey,
                prfKey = prfKey,
                displayName = displayName,
                createdAt = now,
                updatedAt = now,
                isDeleted = false,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing passkey row", e)
            return null
        }
    }

    /**
     * Build clientDataJSON for WebAuthn
     */
    private fun buildClientDataJson(challenge: String, origin: String): String {
        val clientData = JSONObject().apply {
            put("type", "webauthn.get")
            put("challenge", challenge)
            put("origin", origin)
            put("crossOrigin", false)
        }
        return clientData.toString()
    }

    /**
     * Compute SHA-256 hash
     */
    private fun sha256(data: ByteArray): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(data)
    }

    /**
     * Extract PRF extension inputs from request
     */
    private fun extractPrfInputs(requestObj: JSONObject): PasskeyAuthenticator.PrfInputs? {
        try {
            val extensions = requestObj.optJSONObject("extensions") ?: return null
            val prf = extensions.optJSONObject("prf") ?: return null
            val eval = prf.optJSONObject("eval") ?: prf.optJSONObject("evalByCredential") ?: return null

            // PRF inputs are base64url-encoded
            val firstB64 = eval.optString("first", null) ?: return null
            val secondB64 = eval.optString("second", null)

            val first = base64urlDecode(firstB64)
            val second = secondB64?.let { base64urlDecode(it) }

            Log.d(TAG, "PRF extension requested with ${if (second != null) "two" else "one"} salt(s)")

            return PasskeyAuthenticator.PrfInputs(first, second)
        } catch (e: Exception) {
            Log.w(TAG, "Error extracting PRF inputs", e)
            return null
        }
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
     * Build the GetCredentialResponse with assertion data
     */
    private fun buildAuthenticationResponse(
        assertion: PasskeyAuthenticator.PasskeyAssertionResult,
        clientDataJson: String,
        includePrf: Boolean,
    ): androidx.credentials.GetCredentialResponse {
        // Build the authenticator assertion response JSON
        val responseJson = JSONObject().apply {
            put("id", base64urlEncode(assertion.credentialId))
            put("rawId", base64urlEncode(assertion.credentialId))
            put("type", "public-key")

            val responseObj = JSONObject().apply {
                put("clientDataJSON", base64urlEncode(clientDataJson.toByteArray(Charsets.UTF_8)))
                put("authenticatorData", base64urlEncode(assertion.authenticatorData))
                put("signature", base64urlEncode(assertion.signature))
                assertion.userHandle?.let {
                    put("userHandle", base64urlEncode(it))
                }
            }
            put("response", responseObj)

            // Add PRF extension outputs if available
            if (includePrf && assertion.prfResults != null) {
                val extensionsObj = JSONObject().apply {
                    val prfObj = JSONObject().apply {
                        put("enabled", true)
                        val resultsObj = JSONObject().apply {
                            put("first", base64urlEncode(assertion.prfResults.first))
                            assertion.prfResults.second?.let {
                                put("second", base64urlEncode(it))
                            }
                        }
                        put("results", resultsObj)
                    }
                    put("prf", prfObj)
                }
                put("clientExtensionResults", extensionsObj)
                Log.d(TAG, "PRF extension results included in response")
            }
        }

        Log.d(TAG, "Authentication response built: ${responseJson.toString(2)}")

        // Create PublicKeyCredential response
        return androidx.credentials.GetCredentialResponse(
            androidx.credentials.PublicKeyCredential(responseJson.toString()),
        )
    }
}
