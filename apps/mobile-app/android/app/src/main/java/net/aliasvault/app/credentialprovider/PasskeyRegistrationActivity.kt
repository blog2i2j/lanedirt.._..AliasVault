package net.aliasvault.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
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
import net.aliasvault.app.vaultstore.VaultStore
import net.aliasvault.app.vaultstore.createCredentialWithPasskey
import net.aliasvault.app.vaultstore.models.Passkey
import net.aliasvault.app.vaultstore.passkey.PasskeyAuthenticator
import net.aliasvault.app.vaultstore.passkey.PasskeyHelper
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
 */
class PasskeyRegistrationActivity : Activity() {

    companion object {
        private const val TAG = "PasskeyRegistration"
    }

    private lateinit var vaultStore: VaultStore
    private lateinit var webApiService: WebApiService

    // UI elements
    private lateinit var headerSubtitle: TextView
    private lateinit var displayNameInput: TextInputEditText
    private lateinit var websiteText: TextView
    private lateinit var usernameContainer: View
    private lateinit var usernameText: TextView
    private lateinit var errorText: TextView
    private lateinit var saveButton: MaterialButton
    private lateinit var cancelButton: MaterialButton
    private lateinit var scrollView: View
    private lateinit var loadingOverlay: View
    private lateinit var loadingIndicator: LoadingIndicator

    // Request data
    private var providerRequest: ProviderCreateCredentialRequest? = null
    private var requestJson: String = ""
    private var clientDataHash: ByteArray? = null
    private var origin: String? = null
    private var rpId: String = ""
    private var userName: String? = null
    private var userDisplayName: String? = null
    private var userId: ByteArray? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_passkey_registration)

        Log.d(TAG, "PasskeyRegistrationActivity onCreate called")

        // Initialize UI elements
        initializeViews()

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
                showError(getString(R.string.passkey_creation_failed))
                return
            }

            Log.d(TAG, "Provider request retrieved successfully")

            // Extract parameters from providerRequest.callingRequest
            val createRequest = providerRequest!!.callingRequest
            if (createRequest !is CreatePublicKeyCredentialRequest) {
                Log.e(TAG, "Request is not a CreatePublicKeyCredentialRequest")
                showError(getString(R.string.passkey_creation_failed))
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
                showError(getString(R.string.passkey_creation_failed))
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

            // Populate UI
            populateUI()

            // Set up button listeners
            saveButton.setOnClickListener {
                onSaveClicked()
            }

            cancelButton.setOnClickListener {
                onCancelClicked()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            showError(getString(R.string.passkey_creation_failed))
        }
    }

    private fun initializeViews() {
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
    }

    private fun populateUI() {
        // Set subtitle
        headerSubtitle.text = "Create a new passkey for $rpId"

        // Set display name (default to rpId)
        displayNameInput.setText(rpId)

        // Set website
        websiteText.text = rpId

        // Set username if available
        if (!userName.isNullOrEmpty()) {
            usernameContainer.visibility = View.VISIBLE
            usernameText.text = userName
        } else {
            usernameContainer.visibility = View.GONE
        }
    }

    private fun onSaveClicked() {
        // Validate display name
        val displayName = displayNameInput.text.toString().trim()
        if (displayName.isEmpty()) {
            errorText.text = getString(R.string.passkey_error_empty_name)
            errorText.visibility = View.VISIBLE
            return
        }

        // Hide error and start creation
        errorText.visibility = View.GONE

        // Start passkey creation in coroutine
        CoroutineScope(Dispatchers.Main).launch {
            createPasskey(displayName)
        }
    }

    private fun onCancelClicked() {
        setResult(RESULT_CANCELED)
        finish()
    }

    private fun showLoading(message: String) {
        loadingIndicator.setMessage(message)
        loadingIndicator.startAnimation()
        loadingOverlay.visibility = View.VISIBLE
        scrollView.alpha = 0.3f
        scrollView.isEnabled = false
    }

    private fun hideLoading() {
        loadingIndicator.stopAnimation()
        loadingOverlay.visibility = View.GONE
        scrollView.alpha = 1.0f
        scrollView.isEnabled = true
    }

    private fun showError(message: String) {
        hideLoading()
        errorText.text = message
        errorText.visibility = View.VISIBLE
    }

    /**
     * Create the passkey
     */
    private suspend fun createPasskey(displayName: String) = withContext(Dispatchers.IO) {
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
                put("authenticatorAttachment", "cross-platform")
                put(
                    "response",
                    JSONObject().apply {
                        put("clientDataJSON", clientDataJsonB64)
                        put("attestationObject", attestationObjectB64)
                        put("transports", JSONArray().apply { put("hybrid") })
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
