package net.aliasvault.app.autofill.utils

import android.util.Log
import net.aliasvault.app.rustcore.JnaInitializer
import net.aliasvault.app.vaultstore.models.Item
import org.json.JSONArray
import org.json.JSONObject

/**
 * Wrapper for the Rust item matcher using UniFFI bindings.
 */
object RustItemMatcher {
    private const val TAG = "RustItemMatcher"

    init {
        // Ensure JNA is initialized before any UniFFI calls
        JnaInitializer.ensureInitialized()
    }

    /**
     * Filter items based on app/website info using the Rust core credential matcher.
     *
     * @param items List of items to filter
     * @param searchText Search term (app package name, URL, or text)
     * @return Filtered list of items
     */
    fun filterItemsByAppInfo(
        items: List<Item>,
        searchText: String,
    ): List<Item> {
        // Early return for empty search
        if (searchText.isEmpty()) {
            return items
        }

        try {
            // Convert items to JSON format expected by Rust
            val rustCredentials = JSONArray()
            val itemMap = mutableMapOf<String, Item>()

            for (item in items) {
                val idString = item.id.toString()
                val credJson = JSONObject().apply {
                    put("Id", idString)
                    put("ServiceName", item.name ?: JSONObject.NULL)
                    put("ServiceUrl", item.url ?: JSONObject.NULL)
                    put("Username", item.username ?: JSONObject.NULL)
                }
                rustCredentials.put(credJson)
                itemMap[idString] = item
            }

            // Prepare input JSON for Rust
            val input = JSONObject().apply {
                put("credentials", rustCredentials)
                put("current_url", searchText)
                put("page_title", "")
                put("matching_mode", "default")
            }

            // Call Rust via UniFFI
            val outputJson = uniffi.aliasvault_core.filterCredentialsJson(input.toString())

            // Parse output
            val output = JSONObject(outputJson)
            val matchedIds = output.getJSONArray("matched_ids")

            // If no matches found, return empty list
            if (matchedIds.length() == 0) {
                return emptyList()
            }

            // Convert matched IDs back to items, maintaining order
            val filtered = mutableListOf<Item>()
            for (i in 0 until matchedIds.length()) {
                val id = matchedIds.getString(i)
                itemMap[id]?.let { filtered.add(it) }
            }

            return filtered
        } catch (e: Exception) {
            Log.e(TAG, "Error filtering items with Rust matcher: ${e.message}", e)
            // Fallback to returning all items on error
            return items
        }
    }
}
