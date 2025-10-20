package net.aliasvault.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.models.Passkey
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

            val passkey = getPasskeyById(passkeyId, db, vaultStore)
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

            val rpId = passkey.rpId
            val origin = requestObj.optString("origin", "https://$rpId")

            // Extract clientDataHash from Chrome's request
            // Chrome provides a pre-computed clientDataHash that we must use for signing
            var clientDataHashFromChrome: ByteArray? = null
            providerRequest.credentialOptions.forEach { option ->
                if (option is androidx.credentials.GetPublicKeyCredentialOption) {
                    clientDataHashFromChrome = option.clientDataHash
                }
            }

            val credentialId = PasskeyHelper.guidToBytes(passkey.id.toString())
            val prfInputs = extractPrfInputs(requestObj)

            val response = buildAuthenticationResponseWithSignature(
                requestJson,
                credentialId,
                passkey.privateKey,
                passkey.userHandle,
                origin,
                prfInputs,
                passkey.prfKey,
                clientDataHashFromChrome,
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

        Log.d(TAG, "Querying for passkey with ID: $passkeyId")

        val cursor = db.rawQuery(query, arrayOf(passkeyId.toString().uppercase()))
        cursor.use {
            if (it.moveToFirst()) {
                Log.d(TAG, "Found passkey in database")
                return parsePasskeyRow(it)
            } else {
                Log.w(TAG, "Passkey not found in database. Checking all passkeys...")
                // Debug: List all passkeys to see what's in the database
                val debugQuery = "SELECT Id, RpId, DisplayName FROM Passkeys WHERE IsDeleted = 0"
                val debugCursor = db.rawQuery(debugQuery, null)
                debugCursor.use { debugIt ->
                    var count = 0
                    while (debugIt.moveToNext()) {
                        count++
                        val id = debugIt.getString(0)
                        val rpId = debugIt.getString(1)
                        val displayName = debugIt.getString(2)
                        Log.d(TAG, "Passkey $count: ID=$id, RpId=$rpId, DisplayName=$displayName")
                    }
                    Log.d(TAG, "Total passkeys in database: $count")
                }
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
     * Build clientDataJSON for WebAuthn (from challenge ByteArray)
     */
    private fun buildClientDataJson(challenge: ByteArray, origin: String): String {
        val challengeB64 = base64urlEncode(challenge)
        return buildClientDataJson(challengeB64, origin)
    }

    /**
     * Build clientDataJSON for WebAuthn
     *
     * IMPORTANT: Per WebAuthn spec (https://www.w3.org/TR/webauthn-2/#clientdatajson-serialization),
     * the server/RP MUST parse clientDataJSON as JSON and validate only the required fields.
     * Browsers (Chrome) may add extra fields like "other_keys_can_be_added_here" to test that
     * RPs don't do naive template matching.
     *
     * We build a minimal, spec-compliant clientDataJSON here. The server should:
     * 1. Parse as JSON (not string compare!)
     * 2. Validate type === "webauthn.get"
     * 3. Validate challenge matches expected value
     * 4. Validate origin is allowed for this RP
     * 5. Ignore any extra fields
     *
     * CRITICAL: Must NOT escape forward slashes in origin!
     * JavaScript JSON.stringify() doesn't escape slashes by default, but Android's JSONObject does.
     */
    private fun buildClientDataJson(challenge: String, origin: String): String {
        // Build JSON manually WITHOUT escaping forward slashes
        // This matches browser behavior where JSON.stringify() doesn't escape slashes
        // NOTE: We only include required fields. Extra fields from browsers are allowed by spec.
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
     * Build WebAuthn assertion response with proper signature
     *
     * CRITICAL: If Chrome provides clientDataHash, we MUST use that for signing.
     * Otherwise, we build our own clientDataJSON.
     *
     * Chrome on Android will replace our clientDataJSON with its own (including extra fields),
     * so we must sign using Chrome's pre-computed hash to ensure the signature matches.
     */
    @Suppress("LongParameterList")
    private fun buildAuthenticationResponseWithSignature(
        requestJson: String,
        credentialId: ByteArray,
        privateKeyJWK: ByteArray,
        userHandle: ByteArray?,
        origin: String,
        prfInputs: PasskeyAuthenticator.PrfInputs?,
        prfSecret: ByteArray?,
        clientDataHashFromChrome: ByteArray?,
    ): androidx.credentials.GetCredentialResponse {
        val requestObj = JSONObject(requestJson)
        val challengeB64 = requestObj.optString("challenge", "")

        // Determine clientDataHash - use Chrome's if provided, otherwise build our own
        val clientDataHash: ByteArray
        val clientDataB64: String

        if (clientDataHashFromChrome != null) {
            clientDataHash = clientDataHashFromChrome
            val clientDataJson = buildClientDataJson(challengeB64, origin)
            clientDataB64 = base64urlEncode(clientDataJson.toByteArray(Charsets.UTF_8))
        } else {
            val clientDataJson = buildClientDataJson(challengeB64, origin)
            val clientDataBytes = clientDataJson.toByteArray(Charsets.UTF_8)
            clientDataHash = sha256(clientDataBytes)
            clientDataB64 = base64urlEncode(clientDataBytes)
        }

        val rpId = requestObj.optString("rpId", "")
        if (rpId.isEmpty()) {
            throw IllegalArgumentException("rpId required in request")
        }

        val userVerified = true
        val authData = buildAuthenticatorData(
            rpId = rpId,
            userVerified = userVerified,
            includeExtensions = false,
        )
        val authDataB64 = base64urlEncode(authData)

        val dataToSign = authData + clientDataHash
        val privateKey = importPrivateKeyFromJWK(privateKeyJWK)

        val signer = java.security.Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(dataToSign)
        val rawSignature = signer.sign()

        val signature = canonicalizeECDSASignature(rawSignature)

        // Step 6: Evaluate PRF extension if requested
        val prfResults = if (prfInputs?.first != null && prfSecret != null) {
            val first = evaluatePrf(prfSecret, prfInputs.first!!)
            val second = prfInputs.second?.let { evaluatePrf(prfSecret, it) }
            PasskeyAuthenticator.PrfResults(first, second)
        } else {
            null
        }

        // Build WebAuthn assertion response JSON
        val credentialIdB64 = base64urlEncode(credentialId)
        val signatureB64 = base64urlEncode(signature)
        val userHandleB64 = userHandle?.let { base64urlEncode(it) }

        val responseObj = JSONObject().apply {
            put("id", credentialIdB64)
            put("rawId", credentialIdB64)
            put("type", "public-key")
            put("authenticatorAttachment", "cross-platform")

            put(
                "response",
                JSONObject().apply {
                    put("clientDataJSON", clientDataB64)
                    put("authenticatorData", authDataB64)
                    put("signature", signatureB64)
                    userHandleB64?.let { put("userHandle", it) }
                },
            )

            put(
                "clientExtensionResults",
                prfResults?.let {
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

    /**
     * Build authenticatorData deterministically per WebAuthn spec
     *
     * @param rpId The relying party ID
     * @param userVerified Whether user verification was performed
     * @param includeExtensions Whether to include extension data
     * @return The authenticatorData bytes
     */
    private fun buildAuthenticatorData(
        rpId: String,
        userVerified: Boolean,
        includeExtensions: Boolean = false,
    ): ByteArray {
        // rpIdHash: SHA-256(rpId)
        val rpIdHash = sha256(rpId.toByteArray(Charsets.UTF_8))

        // Flags byte (bit 0 = UP, bit 2 = UV, bit 7 = ED)
        var flags: Byte = 0x01 // UP (User Present) = 1
        if (userVerified) {
            flags = (flags.toInt() or 0x04).toByte() // UV (User Verified) = 1
        }
        if (includeExtensions) {
            flags = (flags.toInt() or 0x80).toByte() // ED (Extension Data) = 1
        }
        // BE (Backup Eligible) and BS (Backup State) = 0 (bits 3 and 4)
        // We're not a synced/backup authenticator for credential manager purposes

        // signCount: 4 bytes, big-endian, set to 0
        // (we don't maintain per-credential counters)
        val signCount = byteArrayOf(0x00, 0x00, 0x00, 0x00)

        // Extensions: empty CBOR map if ED flag is set
        // PRF results go in clientExtensionResults, not authenticator extensions
        val extensions = if (includeExtensions) {
            // Empty CBOR map: 0xA0
            byteArrayOf(0xA0.toByte())
        } else {
            byteArrayOf()
        }

        return rpIdHash + flags + signCount + extensions
    }

    /**
     * Canonicalize ECDSA signature to low-S form per WebAuthn spec
     */
    private fun canonicalizeECDSASignature(derSignature: ByteArray): ByteArray {
        // Parse DER-encoded signature
        val (r, s) = parseDERSignature(derSignature)

        // secp256r1 order (n)
        val n = java.math.BigInteger(
            "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
            16,
        )

        val halfN = n.shiftRight(1)

        val canonicalS = if (s > halfN) n.subtract(s) else s

        // Re-encode to DER
        return encodeDERSignature(r, canonicalS)
    }

    /**
     * Parse DER-encoded ECDSA signature into (r, s) components
     */
    private fun parseDERSignature(der: ByteArray): Pair<java.math.BigInteger, java.math.BigInteger> {
        var offset = 0

        // SEQUENCE tag
        require(der[offset++].toInt() == 0x30) { "Invalid DER: expected SEQUENCE" }

        // SEQUENCE length
        val seqLength = der[offset++].toInt() and 0xFF
        require(seqLength == der.size - 2) { "Invalid DER: incorrect SEQUENCE length" }

        // INTEGER tag for r
        require(der[offset++].toInt() == 0x02) { "Invalid DER: expected INTEGER for r" }
        val rLength = der[offset++].toInt() and 0xFF
        val rBytes = der.copyOfRange(offset, offset + rLength)
        offset += rLength
        val r = java.math.BigInteger(1, rBytes)

        // INTEGER tag for s
        require(der[offset++].toInt() == 0x02) { "Invalid DER: expected INTEGER for s" }
        val sLength = der[offset++].toInt() and 0xFF
        val sBytes = der.copyOfRange(offset, offset + sLength)
        val s = java.math.BigInteger(1, sBytes)

        return Pair(r, s)
    }

    /**
     * Encode (r, s) components into DER-encoded ECDSA signature
     */
    private fun encodeDERSignature(r: java.math.BigInteger, s: java.math.BigInteger): ByteArray {
        fun encodeInteger(value: java.math.BigInteger): ByteArray {
            val bytes = value.toByteArray()
            // BigInteger.toByteArray() includes sign byte if MSB is set
            // DER INTEGER should have minimal encoding
            return byteArrayOf(0x02.toByte(), bytes.size.toByte()) + bytes
        }

        val rEncoded = encodeInteger(r)
        val sEncoded = encodeInteger(s)

        val totalLength = rEncoded.size + sEncoded.size

        return byteArrayOf(
            0x30.toByte(), // SEQUENCE tag
            totalLength.toByte(), // SEQUENCE length
        ) + rEncoded + sEncoded
    }

    /**
     * Import public key from private key JWK (uses x, y coordinates)
     */
    private fun importPublicKeyFromPrivateJWK(jwkData: ByteArray): java.security.interfaces.ECPublicKey {
        val jwkString = String(jwkData, Charsets.UTF_8)
        val jwk = JSONObject(jwkString)

        // Extract x and y coordinates
        val xBase64url = jwk.optString("x") ?: throw IllegalArgumentException("Missing 'x' in JWK")
        val yBase64url = jwk.optString("y") ?: throw IllegalArgumentException("Missing 'y' in JWK")

        val xBytes = base64urlDecode(xBase64url)
        val yBytes = base64urlDecode(yBase64url)

        // Create ECPoint
        val x = java.math.BigInteger(1, xBytes)
        val y = java.math.BigInteger(1, yBytes)
        val point = java.security.spec.ECPoint(x, y)

        // Get P-256 curve parameters
        val ecSpec = java.security.spec.ECGenParameterSpec("secp256r1")
        val params = java.security.AlgorithmParameters.getInstance("EC")
        params.init(ecSpec)
        val ecParameterSpec = params.getParameterSpec(java.security.spec.ECParameterSpec::class.java)

        // Create ECPublicKeySpec
        val pubKeySpec = java.security.spec.ECPublicKeySpec(point, ecParameterSpec)

        // Generate the public key
        val keyFactory = java.security.KeyFactory.getInstance("EC")
        return keyFactory.generatePublic(pubKeySpec) as java.security.interfaces.ECPublicKey
    }

    /**
     * Import private key from JWK format (duplicate from PasskeyAuthenticator for local use)
     */
    private fun importPrivateKeyFromJWK(jwkData: ByteArray): java.security.interfaces.ECPrivateKey {
        val jwkString = String(jwkData, Charsets.UTF_8)
        val jwk = JSONObject(jwkString)

        // Extract the d parameter (private key component)
        val dBase64url = jwk.optString("d")
            ?: throw IllegalArgumentException("Missing 'd' parameter in JWK")

        // Decode base64url to bytes
        val dBytes = base64urlDecode(dBase64url)

        // Convert to BigInteger (d parameter is the private key value)
        val d = java.math.BigInteger(1, dBytes)

        // Get P-256 curve parameters
        val ecSpec = java.security.spec.ECGenParameterSpec("secp256r1")
        val params = java.security.AlgorithmParameters.getInstance("EC")
        params.init(ecSpec)
        val ecParameterSpec = params.getParameterSpec(java.security.spec.ECParameterSpec::class.java)

        // Create ECPrivateKeySpec with the d value and curve parameters
        val privKeySpec = java.security.spec.ECPrivateKeySpec(d, ecParameterSpec)

        // Generate the private key
        val keyFactory = java.security.KeyFactory.getInstance("EC")
        return keyFactory.generatePrivate(privKeySpec) as java.security.interfaces.ECPrivateKey
    }

    /**
     * Evaluate PRF (hmac-secret extension) - duplicate from PasskeyAuthenticator
     */
    private fun evaluatePrf(secret: ByteArray, salt: ByteArray): ByteArray {
        // Step 1: Domain separation - hash salt with "WebAuthn PRF\x00" prefix
        val prefix = "WebAuthn PRF\u0000".toByteArray(Charsets.UTF_8)
        val domainSeparatedSalt = prefix + salt

        val md = MessageDigest.getInstance("SHA-256")
        val hashedSalt = md.digest(domainSeparatedSalt)

        // Step 2: Compute HMAC-SHA256(prfSecret, hashedSalt)
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        val secretKey = javax.crypto.spec.SecretKeySpec(secret, "HmacSHA256")
        mac.init(secretKey)
        return mac.doFinal(hashedSalt)
    }
}
