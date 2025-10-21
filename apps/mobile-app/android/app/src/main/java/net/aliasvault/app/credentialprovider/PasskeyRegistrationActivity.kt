package net.aliasvault.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderCreateCredentialRequest
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.aliasvault.app.R
import net.aliasvault.app.components.LoadingIndicator
import net.aliasvault.app.vaultstore.PasskeyWithCredentialInfo
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.createCredentialWithPasskey
import net.aliasvault.app.vaultstore.getPasskeysWithCredentialInfo
import net.aliasvault.app.vaultstore.models.Passkey
import net.aliasvault.app.vaultstore.passkey.PasskeyAuthenticator
import net.aliasvault.app.vaultstore.passkey.PasskeyHelper
import net.aliasvault.app.vaultstore.replacePasskey
import net.aliasvault.app.webapi.WebApiService
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date
import java.util.UUID

/**
 * PasskeyRegistrationActivity
 *
 * Handles passkey registration (credential creation) with a full UI.
 * Shows a form where the user can edit the display name, then creates and saves the passkey.
 * Displays loading states and error messages similar to iOS PasskeyRegistrationView.
 *
 * Supports two modes:
 * 1. Selection mode: When existing passkeys are found, shows options to create new or replace existing
 * 2. Form mode: Direct passkey creation form (either new or replacing a selected passkey)
 */
class PasskeyRegistrationActivity : Activity() {

    companion object {
        private const val TAG = "PasskeyRegistration"
    }

    private lateinit var vaultStore: VaultStore
    private lateinit var webApiService: WebApiService

    // UI elements - Form mode
    private var headerSubtitle: TextView? = null
    private var displayNameInput: TextInputEditText? = null
    private var websiteText: TextView? = null
    private var usernameContainer: View? = null
    private var usernameText: TextView? = null
    private var errorText: TextView? = null
    private var saveButton: MaterialButton? = null
    private var cancelButton: MaterialButton? = null
    private var scrollView: View? = null
    private var loadingOverlay: View? = null
    private var loadingIndicator: LoadingIndicator? = null

    // UI elements - Selection mode
    private var createNewButton: MaterialButton? = null
    private var existingPasskeysContainer: LinearLayout? = null

    // Request data
    private var providerRequest: ProviderCreateCredentialRequest? = null
    private var requestJson: String = ""
    private var clientDataHash: ByteArray? = null
    private var origin: String? = null
    private var rpId: String = ""
    private var userName: String? = null
    private var userDisplayName: String? = null
    private var userId: ByteArray? = null

    // State
    private var existingPasskeys: List<PasskeyWithCredentialInfo> = emptyList()
    private var selectedPasskeyToReplace: PasskeyWithCredentialInfo? = null
    private var isReplaceMode: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Log.d(TAG, "PasskeyRegistrationActivity onCreate called")

        try {
            // Initialize VaultStore and WebApiService
            vaultStore = VaultStore.getExistingInstance()
                ?: throw Exception("VaultStore not initialized")
            webApiService = WebApiService(this)

            Log.d(TAG, "VaultStore and WebApiService initialized")

            // Retrieve provider request
            providerRequest = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
            if (providerRequest == null) {
                Log.e(TAG, "No provider request found in intent")
                finish()
                return
            }

            Log.d(TAG, "Provider request retrieved successfully")

            // Extract parameters from providerRequest.callingRequest
            val createRequest = providerRequest!!.callingRequest
            if (createRequest !is CreatePublicKeyCredentialRequest) {
                Log.e(TAG, "Request is not a CreatePublicKeyCredentialRequest")
                finish()
                return
            }

            // Get requestJson, clientDataHash, and origin from the request
            requestJson = createRequest.requestJson
            clientDataHash = createRequest.clientDataHash
            origin = createRequest.origin

            Log.d(TAG, "Request JSON: $requestJson")
            Log.d(TAG, "Origin: $origin")
            Log.d(TAG, "ClientDataHash length: ${clientDataHash?.size}")

            // Parse request JSON to extract RP ID and user info
            val requestObj = JSONObject(requestJson)

            // Extract RP info
            val rpObj = requestObj.optJSONObject("rp")
            rpId = rpObj?.optString("id") ?: ""

            // Extract user info
            val userObj = requestObj.optJSONObject("user")
            userName = userObj?.optString("name")?.takeIf { it.isNotEmpty() }
            userDisplayName = userObj?.optString("displayName")?.takeIf { it.isNotEmpty() }
            val userIdB64 = userObj?.optString("id")

            Log.d(TAG, "Parameters: rpId=$rpId, userName=$userName, userDisplayName=$userDisplayName")

            if (rpId.isEmpty() || requestJson.isEmpty()) {
                Log.e(TAG, "Missing required parameters")
                finish()
                return
            }

            // Decode user ID from base64url
            userId = if (!userIdB64.isNullOrEmpty()) {
                try {
                    base64urlDecode(userIdB64)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to decode user ID", e)
                    null
                }
            } else {
                null
            }

            // Check for existing passkeys
            val db = vaultStore.database
            if (db != null) {
                existingPasskeys = vaultStore.getPasskeysWithCredentialInfo(
                    rpId = rpId,
                    userName = userName,
                    userId = userId,
                    db = db,
                )
                Log.d(TAG, "Found ${existingPasskeys.size} existing passkeys for rpId=$rpId")
            }

            // Decide which layout to show
            if (existingPasskeys.isEmpty()) {
                // No existing passkeys - show form directly
                showFormView(isReplace = false, passkeyToReplace = null)
            } else {
                // Existing passkeys found - show selection view
                showSelectionView()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            finish()
        }
    }

    /**
     * Show selection view when there are existing passkeys
     */
    private fun showSelectionView() {
        setContentView(R.layout.activity_passkey_selection)

        // Initialize selection view elements
        val headerSubtitle: TextView = findViewById(R.id.headerSubtitle)
        createNewButton = findViewById(R.id.createNewButton)
        existingPasskeysContainer = findViewById(R.id.existingPasskeysContainer)
        cancelButton = findViewById(R.id.cancelButton)
        scrollView = findViewById(R.id.scrollView)
        loadingOverlay = findViewById(R.id.loadingOverlay)
        loadingIndicator = findViewById(R.id.loadingIndicator)

        // Set subtitle
        headerSubtitle.text = "Create a new passkey for $rpId"

        // Set up create new button
        createNewButton?.setOnClickListener {
            showFormView(isReplace = false, passkeyToReplace = null)
        }

        // Populate existing passkeys list
        val inflater = LayoutInflater.from(this)
        existingPasskeys.forEach { passkeyInfo ->
            val itemView = inflater.inflate(R.layout.item_existing_passkey, existingPasskeysContainer, false)

            val displayNameView = itemView.findViewById<TextView>(R.id.passkeyDisplayName)
            val subtitleView = itemView.findViewById<TextView>(R.id.passkeySubtitle)

            displayNameView.text = passkeyInfo.passkey.displayName
            val subtitle = buildString {
                passkeyInfo.username?.let { append(it) }
                if (passkeyInfo.username != null && passkeyInfo.serviceName != null) {
                    append(" • ")
                }
                passkeyInfo.serviceName?.let { append(it) }
            }
            subtitleView.text = subtitle.ifEmpty { rpId }

            itemView.setOnClickListener {
                showFormView(isReplace = true, passkeyToReplace = passkeyInfo)
            }

            existingPasskeysContainer?.addView(itemView)
        }

        // Set up cancel button
        cancelButton?.setOnClickListener {
            setResult(RESULT_CANCELED)
            finish()
        }
    }

    /**
     * Show form view for creating or replacing a passkey
     */
    private fun showFormView(isReplace: Boolean, passkeyToReplace: PasskeyWithCredentialInfo?) {
        setContentView(R.layout.activity_passkey_registration)

        this.isReplaceMode = isReplace
        this.selectedPasskeyToReplace = passkeyToReplace

        // Initialize form view elements
        headerSubtitle = findViewById(R.id.headerSubtitle)
        displayNameInput = findViewById(R.id.displayNameInput)
        websiteText = findViewById(R.id.websiteText)
        usernameContainer = findViewById(R.id.usernameContainer)
        usernameText = findViewById(R.id.usernameText)
        errorText = findViewById(R.id.errorText)
        saveButton = findViewById(R.id.saveButton)
        cancelButton = findViewById(R.id.cancelButton)
        scrollView = findViewById(R.id.scrollView)
        loadingOverlay = findViewById(R.id.loadingOverlay)
        loadingIndicator = findViewById(R.id.loadingIndicator)

        // Update UI based on mode
        if (isReplace && passkeyToReplace != null) {
            headerSubtitle?.text = "Replace passkey for $rpId"
            displayNameInput?.setText(passkeyToReplace.passkey.displayName)
            saveButton?.text = getString(R.string.passkey_replace_button)
        } else {
            headerSubtitle?.text = "Create a new passkey for $rpId"
            displayNameInput?.setText(rpId)
            saveButton?.text = getString(R.string.passkey_create_button)
        }

        // Set website
        websiteText?.text = rpId

        // Set username if available
        if (!userName.isNullOrEmpty()) {
            usernameContainer?.visibility = View.VISIBLE
            usernameText?.text = userName
        } else {
            usernameContainer?.visibility = View.GONE
        }

        // Set up button listeners
        saveButton?.setOnClickListener {
            onSaveClicked()
        }

        cancelButton?.setOnClickListener {
            if (existingPasskeys.isNotEmpty()) {
                // Go back to selection view
                showSelectionView()
            } else {
                setResult(RESULT_CANCELED)
                finish()
            }
        }
    }

    private fun onSaveClicked() {
        // Validate display name
        val displayName = displayNameInput?.text.toString().trim()
        if (displayName.isEmpty()) {
            errorText?.text = getString(R.string.passkey_error_empty_name)
            errorText?.visibility = View.VISIBLE
            return
        }

        // Hide error and start creation
        errorText?.visibility = View.GONE

        // Start passkey creation in coroutine
        CoroutineScope(Dispatchers.Main).launch {
            if (isReplaceMode && selectedPasskeyToReplace != null) {
                replacePasskeyFlow(displayName, selectedPasskeyToReplace!!)
            } else {
                createPasskeyFlow(displayName)
            }
        }
    }

    private fun showLoading(message: String) {
        loadingIndicator?.setMessage(message)
        loadingIndicator?.startAnimation()
        loadingOverlay?.visibility = View.VISIBLE
        scrollView?.alpha = 0.3f
        scrollView?.isEnabled = false
    }

    private fun hideLoading() {
        loadingIndicator?.stopAnimation()
        loadingOverlay?.visibility = View.GONE
        scrollView?.alpha = 1.0f
        scrollView?.isEnabled = true
    }

    private fun showError(message: String) {
        hideLoading()
        errorText?.text = message
        errorText?.visibility = View.VISIBLE
    }

    /**
     * Create a new passkey flow
     */
    private suspend fun createPasskeyFlow(displayName: String) = withContext(Dispatchers.IO) {
        try {
            withContext(Dispatchers.Main) {
                showLoading(getString(R.string.passkey_creating))
            }

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

            // Use clientDataHash from the request
            val requestClientDataHash = this@PasskeyRegistrationActivity.clientDataHash
            if (requestClientDataHash == null) {
                throw Exception("Client data hash not available")
            }

            // Parse request to get challenge (for building response clientDataJSON later)
            val requestObj = JSONObject(requestJson)
            val challenge = requestObj.optString("challenge", "")

            // Use origin from the request
            val requestOrigin = this@PasskeyRegistrationActivity.origin
            if (requestOrigin == null) {
                throw Exception("Origin not available")
            }
            Log.d(TAG, "Using origin from request: $requestOrigin")

            // Extract PRF inputs if present
            val prfInputs = extractPrfInputs(requestObj)
            val enablePrf = prfInputs != null

            // Create the passkey using PasskeyAuthenticator
            val passkeyResult = PasskeyAuthenticator.createPasskey(
                credentialId = credentialId,
                clientDataHash = requestClientDataHash,
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
            withContext(Dispatchers.Main) {
                showLoading(getString(R.string.passkey_saving))
            }

            Log.d(TAG, "Saving passkey to vault...")
            vaultStore.createCredentialWithPasskey(
                rpId = rpId,
                userName = userName,
                displayName = displayName,
                passkey = passkey,
                logo = logo,
            )
            Log.d(TAG, "Passkey saved successfully")

            // Upload vault changes to server
            withContext(Dispatchers.Main) {
                showLoading(getString(R.string.passkey_syncing))
            }

            try {
                vaultStore.mutateVault(webApiService)
            } catch (e: Exception) {
                Log.w(TAG, "Vault mutation failed, but passkey was created locally", e)
                // Continue - passkey is still saved locally
                withContext(Dispatchers.Main) {
                    showError("Saved locally, but sync failed: ${e.message}")
                    delay(2000)
                }
            }

            // Build response
            val credentialIdB64 = base64urlEncode(credentialId)
            val attestationObjectB64 = base64urlEncode(passkeyResult.attestationObject)

            // Rebuild clientDataJSON for the response (needed for the credential response)
            val clientDataJson =
                """{"type":"webauthn.create","challenge":"$challenge","origin":"$requestOrigin","crossOrigin":false}"""
            val clientDataJsonB64 = base64urlEncode(clientDataJson.toByteArray(Charsets.UTF_8))

            val responseJson = JSONObject().apply {
                put("id", credentialIdB64)
                put("rawId", credentialIdB64)
                put("type", "public-key")
                put("authenticatorAttachment", "platform")
                put(
                    "response",
                    JSONObject().apply {
                        put("clientDataJSON", clientDataJsonB64)
                        put("attestationObject", attestationObjectB64)
                        put("authenticatorData", base64urlEncode(passkeyResult.authenticatorData))
                        put(
                            "transports",
                            org.json.JSONArray().apply {
                                put("internal")
                            },
                        )
                        put("publicKey", base64urlEncode(passkeyResult.publicKeyDER))
                        put("publicKeyAlgorithm", -7) // ES256, required for Chrome CredManHelper. Firefox doesn't need this.
                    },
                )

                // Add PRF extension results if present
                val prfResults = if (enablePrf) passkeyResult.prfResults else null
                if (prfResults != null) {
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

            Log.d(TAG, "Response JSON: ${responseJson.toString(2)}")

            val response = CreatePublicKeyCredentialResponse(responseJson.toString())

            withContext(Dispatchers.Main) {
                hideLoading()
                val resultIntent = Intent()
                try {
                    Log.d(TAG, "Setting credential response...")
                    PendingIntentHandler.setCreateCredentialResponse(resultIntent, response)
                    Log.d(TAG, "Credential response set successfully")

                    setResult(RESULT_OK, resultIntent)
                    Log.d(TAG, "Result set to RESULT_OK, finishing activity")
                    finish()
                } catch (e: Exception) {
                    Log.e(TAG, "Error setting credential response", e)
                    showError(getString(R.string.passkey_creation_failed) + ": ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error creating passkey", e)
            withContext(Dispatchers.Main) {
                showError(getString(R.string.passkey_creation_failed) + ": ${e.message}")
            }
        }
    }

    /**
     * Replace an existing passkey flow
     */
    private suspend fun replacePasskeyFlow(displayName: String, passkeyToReplace: PasskeyWithCredentialInfo) = withContext(Dispatchers.IO) {
        try {
            withContext(Dispatchers.Main) {
                showLoading(getString(R.string.passkey_replacing))
            }

            Log.d(TAG, "Replacing passkey ${passkeyToReplace.passkey.id} for RP: $rpId")

            // Extract favicon (optional)
            var logo: ByteArray? = null
            try {
                logo = webApiService.extractFavicon("https://$rpId")
            } catch (e: Exception) {
                Log.w(TAG, "Favicon extraction failed", e)
                // Continue without logo
            }

            // Generate new passkey credentials
            val newPasskeyId = UUID.randomUUID()
            val credentialId = PasskeyHelper.guidToBytes(newPasskeyId.toString())

            // Use clientDataHash from the request
            val requestClientDataHash = this@PasskeyRegistrationActivity.clientDataHash
            if (requestClientDataHash == null) {
                throw Exception("Client data hash not available")
            }

            // Parse request to get challenge
            val requestObj = JSONObject(requestJson)
            val challenge = requestObj.optString("challenge", "")

            // Use origin from the request
            val requestOrigin = this@PasskeyRegistrationActivity.origin
            if (requestOrigin == null) {
                throw Exception("Origin not available")
            }

            // Extract PRF inputs if present
            val prfInputs = extractPrfInputs(requestObj)
            val enablePrf = prfInputs != null

            // Create the new passkey using PasskeyAuthenticator
            val passkeyResult = PasskeyAuthenticator.createPasskey(
                credentialId = credentialId,
                clientDataHash = requestClientDataHash,
                rpId = rpId,
                userId = userId,
                userName = userName,
                userDisplayName = userDisplayName,
                uvPerformed = true,
                enablePrf = enablePrf,
                prfInputs = prfInputs,
            )

            // Create new Passkey model object
            val now = Date()
            val newPasskey = Passkey(
                id = newPasskeyId,
                parentCredentialId = passkeyToReplace.passkey.parentCredentialId,
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

            // Replace in database
            withContext(Dispatchers.Main) {
                showLoading(getString(R.string.passkey_saving))
            }

            val db = vaultStore.database ?: throw Exception("Vault not unlocked")
            db.beginTransaction()
            try {
                vaultStore.replacePasskey(
                    oldPasskeyId = passkeyToReplace.passkey.id,
                    newPasskey = newPasskey,
                    displayName = displayName,
                    logo = logo,
                    db = db,
                )

                // Commit transaction and persist to encrypted vault file
                vaultStore.commitTransaction()

                Log.d(TAG, "Passkey replaced successfully")
            } catch (e: Exception) {
                db.endTransaction()
                throw e
            }

            // Upload vault changes to server
            withContext(Dispatchers.Main) {
                showLoading(getString(R.string.passkey_syncing))
            }

            try {
                vaultStore.mutateVault(webApiService)
            } catch (e: Exception) {
                Log.w(TAG, "Vault mutation failed, but passkey was replaced locally", e)
                withContext(Dispatchers.Main) {
                    showError("Saved locally, but sync failed: ${e.message}")
                    delay(2000)
                }
            }

            // Build response (same as create flow)
            val credentialIdB64 = base64urlEncode(credentialId)
            val attestationObjectB64 = base64urlEncode(passkeyResult.attestationObject)

            val clientDataJson =
                """{"type":"webauthn.create","challenge":"$challenge","origin":"$requestOrigin","crossOrigin":false}"""
            val clientDataJsonB64 = base64urlEncode(clientDataJson.toByteArray(Charsets.UTF_8))

            val responseJson = JSONObject().apply {
                put("id", credentialIdB64)
                put("rawId", credentialIdB64)
                put("type", "public-key")
                put("authenticatorAttachment", "platform")
                put(
                    "response",
                    JSONObject().apply {
                        put("clientDataJSON", clientDataJsonB64)
                        put("attestationObject", attestationObjectB64)
                        put("authenticatorData", base64urlEncode(passkeyResult.authenticatorData))
                        put(
                            "transports",
                            org.json.JSONArray().apply {
                                put("internal")
                            },
                        )
                        put("publicKey", base64urlEncode(passkeyResult.publicKeyDER))
                        put("publicKeyAlgorithm", -7)
                    },
                )

                // Add PRF extension results if present
                val prfResults = if (enablePrf) passkeyResult.prfResults else null
                if (prfResults != null) {
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

            Log.d(TAG, "Response JSON: ${responseJson.toString(2)}")

            val response = CreatePublicKeyCredentialResponse(responseJson.toString())

            withContext(Dispatchers.Main) {
                hideLoading()
                val resultIntent = Intent()
                try {
                    Log.d(TAG, "Setting credential response...")
                    PendingIntentHandler.setCreateCredentialResponse(resultIntent, response)
                    Log.d(TAG, "Credential response set successfully")

                    setResult(RESULT_OK, resultIntent)
                    Log.d(TAG, "Result set to RESULT_OK, finishing activity")
                    finish()
                } catch (e: Exception) {
                    Log.e(TAG, "Error setting credential response", e)
                    showError(getString(R.string.passkey_creation_failed) + ": ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error replacing passkey", e)
            withContext(Dispatchers.Main) {
                showError(getString(R.string.passkey_creation_failed) + ": ${e.message}")
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
