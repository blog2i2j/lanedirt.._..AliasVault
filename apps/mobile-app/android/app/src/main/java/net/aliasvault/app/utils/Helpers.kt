package net.aliasvault.app.utils

/**
 * Helpers
 * -------------------------
 * Utility class for helper methods.
 */
object Helpers {
    /**
     * Encode bytes to base64url string.
     */
    @JvmStatic
    fun bytesToBase64url(data: ByteArray): String {
        return android.util.Base64.encodeToString(
            data,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }

    /**
     * Decode base64url string to bytes.
     */
    @JvmStatic
    fun base64urlDecode(base64url: String): ByteArray {
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
