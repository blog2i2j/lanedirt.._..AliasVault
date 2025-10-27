package net.aliasvault.app.vaultstore

import android.os.Handler
import android.util.Log
import net.aliasvault.app.vaultstore.storageprovider.StorageProvider

/**
 * Handles authentication methods and auto-lock functionality for the vault.
 */
class VaultAuth(
    private val storageProvider: StorageProvider,
    private val onClearCache: () -> Unit,
) {
    companion object {
        private const val TAG = "VaultAuth"
    }

    private var autoLockHandler: Handler? = null
    private var autoLockRunnable: Runnable? = null

    // region Authentication Methods

    /**
     * Set the auth methods.
     */
    fun setAuthMethods(authMethods: String) {
        storageProvider.setAuthMethods(authMethods)
    }

    /**
     * Get the auth methods.
     */
    fun getAuthMethods(): String {
        return storageProvider.getAuthMethods()
    }

    // endregion

    // region Auto-Lock Timeout

    /**
     * Set the auto-lock timeout.
     */
    fun setAutoLockTimeout(timeout: Int) {
        storageProvider.setAutoLockTimeout(timeout)
    }

    /**
     * Get the auto-lock timeout.
     */
    fun getAutoLockTimeout(): Int {
        return storageProvider.getAutoLockTimeout()
    }

    // endregion

    // region Background/Foreground Handling

    /**
     * Called when the app enters the background.
     */
    fun onAppBackgrounded() {
        Log.d(TAG, "App entered background, starting auto-lock timer with ${getAutoLockTimeout()}s")
        if (getAutoLockTimeout() > 0) {
            autoLockRunnable?.let { autoLockHandler?.removeCallbacks(it) }

            autoLockRunnable = Runnable {
                Log.d(TAG, "Auto-lock timer fired, clearing cache")
                onClearCache()
            }
            autoLockHandler?.postDelayed(autoLockRunnable!!, getAutoLockTimeout().toLong() * 1000)
        }
    }

    /**
     * Called when the app enters the foreground.
     */
    fun onAppForegrounded() {
        Log.d(TAG, "App entered foreground, canceling auto-lock timer")
        autoLockRunnable?.let { autoLockHandler?.removeCallbacks(it) }
        autoLockRunnable = null
    }

    /**
     * Set the auto-lock handler.
     */
    fun setAutoLockHandler(handler: Handler) {
        this.autoLockHandler = handler
    }

    // endregion
}
