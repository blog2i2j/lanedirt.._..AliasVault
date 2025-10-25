package net.aliasvault.app.vaultstore.utils

import net.aliasvault.app.utils.AppInfo

/**
 * Utility for comparing semantic version strings
 *
 * This is a Kotlin port of the iOS Swift implementation:
 * - Reference: apps/mobile-app/ios/VaultStoreKit/Utils/VersionComparison.swift
 *
 * IMPORTANT: Keep all implementations synchronized. Changes to the public interface must be
 * reflected in all ports. Version comparison logic should remain consistent across platforms.
 */
object VersionComparison {
    /**
     * Checks if version1 is greater than or equal to version2, following SemVer rules.
     *
     * Pre-release versions (e.g., -alpha, -beta, -dev) are considered lower than release versions.
     *
     * @param version1 First version string (e.g., "1.2.3" or "1.2.3-beta")
     * @param version2 Second version string (e.g., "1.2.0" or "1.2.0-alpha")
     * @return true if version1 >= version2, false otherwise
     *
     * Example:
     * ```kotlin
     * VersionComparison.isGreaterThanOrEqualTo("1.2.3", "1.2.0") // true
     * VersionComparison.isGreaterThanOrEqualTo("1.2.0-alpha", "1.2.0") // false
     * VersionComparison.isGreaterThanOrEqualTo("1.2.0", "1.2.0-alpha") // true
     * ```
     */
    fun isGreaterThanOrEqualTo(version1: String, version2: String): Boolean {
        // Split versions into core and pre-release parts
        val components1 = version1.split("-", limit = 2)
        val components2 = version2.split("-", limit = 2)

        val core1 = components1[0]
        val core2 = components2[0]

        val preRelease1 = components1.getOrNull(1)
        val preRelease2 = components2.getOrNull(1)

        // Parse core version numbers
        val parts1 = core1.split(".").mapNotNull { it.toIntOrNull() }
        val parts2 = core2.split(".").mapNotNull { it.toIntOrNull() }

        // Compare core versions first
        val maxLength = maxOf(parts1.size, parts2.size)
        for (i in 0 until maxLength) {
            val part1 = parts1.getOrElse(i) { 0 }
            val part2 = parts2.getOrElse(i) { 0 }

            when {
                part1 > part2 -> return true
                part1 < part2 -> return false
            }
        }

        // If core versions are equal, check pre-release versions
        // No pre-release (release version) is greater than pre-release version
        return when {
            preRelease1 == null && preRelease2 != null -> true
            preRelease1 != null && preRelease2 == null -> false
            preRelease1 == null && preRelease2 == null -> true
            else -> preRelease1!! >= preRelease2!!
        }
    }

    /**
     * Checks if a given server version meets the minimum requirement.
     *
     * @param serverVersion The server version to validate
     * @param minimumVersion The minimum required version (defaults to AppInfo.MIN_SERVER_VERSION)
     * @return true if the server version is supported, false otherwise
     */
    fun isServerVersionSupported(
        serverVersion: String,
        minimumVersion: String = AppInfo.MIN_SERVER_VERSION,
    ): Boolean {
        return isGreaterThanOrEqualTo(serverVersion, minimumVersion)
    }
}
