package net.aliasvault.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.getPasskeyById
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

        try {
            val providerRequest = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
            if (providerRequest == null) {
                Log.e(TAG, "No provider request found in intent")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            processAuthenticationRequest(providerRequest)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing authentication request", e)
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

            val passkeyId = UUID.fromString(passkeyIdString.uppercase())

            val vaultStore = VaultStore.getExistingInstance()
            if (vaultStore == null) {
                Log.e(TAG, "VaultStore not initialized")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            val db = try {
                val dbField = VaultStore::class.java.getDeclaredField("dbConnection")
                dbField.isAccessible = true
                dbField.get(vaultStore) as? android.database.sqlite.SQLiteDatabase
            } catch (e: Exception) {
                Log.e(TAG, "Cannot access database", e)
                null
            }

            if (db == null) {
                Log.e(TAG, "Database not available")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            val passkey = vaultStore.getPasskeyById(passkeyId, db)
            if (passkey == null) {
                Log.e(TAG, "Passkey not found: $passkeyId")
                setResult(RESULT_CANCELED)
                finish()
                return
            }

            val requestJson = intent.getStringExtra(
                AliasVaultCredentialProviderService.EXTRA_REQUEST_JSON,
            ) ?: ""
            val requestObj = JSONObject(requestJson)

            // Extract clientDataHash from Chrome's request
            var clientDataHashFromChrome: ByteArray? = null
            providerRequest.credentialOptions.forEach { option ->
                if (option is androidx.credentials.GetPublicKeyCredentialOption) {
                    clientDataHashFromChrome = option.clientDataHash
                }
            }

            // If Chrome didn't provide clientDataHash, build clientDataJSON and hash it
            val clientDataHash: ByteArray
            val clientDataJson: String?
            if (clientDataHashFromChrome != null) {
                clientDataHash = clientDataHashFromChrome
                // Don't build clientDataJSON - Chrome has its own
                clientDataJson = null
            } else {
                val challenge = requestObj.optString("challenge", "")
                val origin = requestObj.optString("origin", "https://${passkey.rpId}")
                val json = buildClientDataJson(challenge, origin)
                clientDataHash = sha256(json.toByteArray(Charsets.UTF_8))
                clientDataJson = json
            }

            // Use PasskeyAuthenticator.getAssertion for signing
            val credentialId = PasskeyHelper.guidToBytes(passkey.id.toString())
            val prfInputs = extractPrfInputs(requestObj)
            val assertion = PasskeyAuthenticator.getAssertion(
                credentialId = credentialId,
                clientDataHash = clientDataHash,
                rpId = passkey.rpId,
                privateKeyJWK = passkey.privateKey,
                userId = passkey.userHandle,
                uvPerformed = true,
                prfInputs = prfInputs,
                prfSecret = passkey.prfKey,
            )

            // Build response JSON
            val response = buildPublicKeyCredentialResponse(
                assertion = assertion,
                clientDataJson = clientDataJson,
            )

            val resultIntent = Intent()
            try {
                PendingIntentHandler.setGetCredentialResponse(resultIntent, response)
                setResult(RESULT_OK, resultIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Error setting credential response", e)
                try {
                    PendingIntentHandler.setGetCredentialException(
                        resultIntent,
                        androidx.credentials.exceptions.GetCredentialUnknownException("Failed to generate assertion: ${e.message}"),
                    )
                    setResult(RESULT_OK, resultIntent)
                } catch (e2: Exception) {
                    Log.e(TAG, "Error setting exception", e2)
                    setResult(RESULT_CANCELED)
                }
            }
            finish()
        } catch (e: Exception) {
            Log.e(TAG, "Error processing authentication request", e)
            setResult(RESULT_CANCELED)
            finish()
        }
    }

    /**
     * Build clientDataJSON for WebAuthn
     */
    private fun buildClientDataJson(challenge: ByteArray, origin: String): String {
        val challengeB64 = base64urlEncode(challenge)
        return buildClientDataJson(challengeB64, origin)
    }

    /**
     * Build clientDataJSON for WebAuthn
     */
    private fun buildClientDataJson(challenge: String, origin: String): String {
        // Build JSON manually WITHOUT escaping forward slashes
        // This matches browser behavior where JSON.stringify() doesn't escape slashes
        // TODO: check if this point is ever hit?
        Log.d(TAG, "--------------------------------------")
        Log.d(TAG, "Building clientDataJSON for WebAuthn manually")
        Log.d(TAG, "--------------------------------------")
        return """{"type":"webauthn.get","challenge":"$challenge","origin":"$origin","crossOrigin":false}"""
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
            val firstB64 = eval.optString("first") ?: return null
            if (firstB64.isEmpty()) return null
            val secondB64 = eval.optString("second")

            val first = base64urlDecode(firstB64)
            val second = if (secondB64.isNotEmpty()) base64urlDecode(secondB64) else null

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
     * Build PublicKeyCredential response from PasskeyAuthenticator assertion result
     *
     * @param assertion The assertion result from PasskeyAuthenticator.getAssertion
     * @param clientDataJson Optional clientDataJSON string. If null, clientDataJSON will be
     *                       omitted from the response (used when Chrome provides clientDataHash)
     */
    private fun buildPublicKeyCredentialResponse(
        assertion: PasskeyAuthenticator.PasskeyAssertionResult,
        clientDataJson: String?,
    ): androidx.credentials.GetCredentialResponse {
        val credentialIdB64 = base64urlEncode(assertion.credentialId)
        val signatureB64 = base64urlEncode(assertion.signature)
        val authDataB64 = base64urlEncode(assertion.authenticatorData)
        val userHandleB64 = assertion.userHandle?.let { base64urlEncode(it) }

        val responseObj = JSONObject().apply {
            put("id", credentialIdB64)
            put("rawId", credentialIdB64)
            put("type", "public-key")
            put("authenticatorAttachment", "cross-platform")

            put(
                "response",
                JSONObject().apply {
                    // Only include clientDataJSON if we built it ourselves
                    // When Chrome provides clientDataHash, omit this field
                    clientDataJson?.let {
                        put("clientDataJSON", base64urlEncode(it.toByteArray(Charsets.UTF_8)))
                    }
                    put("authenticatorData", authDataB64)
                    put("signature", signatureB64)
                    userHandleB64?.let { put("userHandle", it) }
                },
            )

            put(
                "clientExtensionResults",
                assertion.prfResults?.let {
                    JSONObject().apply {
                        put(
                            "prf",
                            JSONObject().apply {
                                put(
                                    "results",
                                    JSONObject().apply {
                                        put("first", base64urlEncode(it.first))
                                        it.second?.let { second -> put("second", base64urlEncode(second)) }
                                    },
                                )
                            },
                        )
                    }
                } ?: JSONObject(),
            )
        }

        return androidx.credentials.GetCredentialResponse(
            androidx.credentials.PublicKeyCredential(responseObj.toString()),
        )
    }
}
