package net.aliasvault.app.credentialprovider

import androidx.lifecycle.ViewModel
import net.aliasvault.app.vaultstore.PasskeyWithCredentialInfo
import java.util.UUID

/**
 * ViewModel to share passkey registration state between fragments
 */
class PasskeyRegistrationViewModel : ViewModel() {
    // Request data
    var requestJson: String = ""
    var clientDataHash: ByteArray? = null
    var origin: String? = null
    var rpId: String = ""
    var userName: String? = null
    var userDisplayName: String? = null
    var userId: ByteArray? = null

    // State
    var existingPasskeys: List<PasskeyWithCredentialInfo> = emptyList()
    var selectedPasskeyToReplace: PasskeyWithCredentialInfo? = null
    var isReplaceMode: Boolean = false

    fun onCreateNewSelected() {
        isReplaceMode = false
        selectedPasskeyToReplace = null
    }

    fun onReplaceSelected(passkeyInfo: PasskeyWithCredentialInfo) {
        isReplaceMode = true
        selectedPasskeyToReplace = passkeyInfo
    }

    fun getPasskeyById(id: UUID): PasskeyWithCredentialInfo? {
        return existingPasskeys.firstOrNull { it.passkey.id == id }
    }
}
