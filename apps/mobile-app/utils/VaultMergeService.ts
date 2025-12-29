import NativeVaultManager from '@/specs/NativeVaultManager';

/**
 * Statistics about what was merged.
 */
export type MergeStats = {
  tablesProcessed: number;
  recordsFromLocal: number;
  recordsFromServer: number;
  recordsCreatedLocally: number;
  conflicts: number;
}

/**
 * Result of a merge operation.
 */
export type MergeResult = {
  success: boolean;
  mergedVaultBase64: string;
  stats: MergeStats;
}

/**
 * Service for merging two vault SQLite databases using Last-Write-Wins (LWW) strategy.
 *
 * For mobile apps, the merge logic is delegated to the native layer since it already
 * has access to the SQLite database and encryption operations. The native layer
 * uses the Rust core library (compiled to Swift bindings for iOS and Kotlin bindings
 * for Android) for the actual merge logic.
 *
 * The merge uses UpdatedAt timestamps on all SyncableEntity records to determine
 * which version of a record wins in case of conflict.
 *
 * Note: In the mobile app, the vault merge happens differently from the browser extension.
 * The browser extension uses sql.js (JavaScript SQLite) in the popup, while the mobile app
 * delegates to native code which directly manipulates the encrypted SQLite database.
 *
 * For now, we implement a simplified approach where the native layer handles the merge
 * by re-initializing the database with the merged content.
 */
export class VaultMergeService {
  /**
   * Merge local vault changes with server vault using LWW strategy.
   *
   * For mobile, this currently takes a simplified approach:
   * 1. The local and server vaults are both encrypted SQLite blobs
   * 2. We need to decrypt both, merge in-memory, and re-encrypt
   *
   * Since the native layer already has the decryption key and SQLite database,
   * the actual merge happens there. This wrapper provides a consistent API.
   *
   * @param localVaultBase64 - The local vault (with offline changes) as base64 encrypted SQLite
   * @param serverVaultBase64 - The server vault (latest version) as base64 encrypted SQLite
   * @param encryptionKey - The encryption key to decrypt/encrypt the vaults
   * @returns The merged vault as base64 encrypted SQLite
   */
  static async mergeVaults(
    localVaultBase64: string,
    serverVaultBase64: string,
    encryptionKey: string | null
  ): Promise<string> {
    /**
     * For the mobile app, we use a simpler merge strategy:
     * Since the local vault is already loaded in memory by the native layer,
     * we can:
     * 1. Store the server vault temporarily
     * 2. Have the native layer perform the merge
     * 3. Return the merged (re-encrypted) vault
     *
     * However, the current native implementation doesn't have a dedicated merge API.
     * For now, we return the local vault (preserving local changes) and log a warning.
     *
     * TODO: Implement proper LWW merge in native layer using Rust bindings.
     * The Rust core library already has the merge logic, we just need to expose it
     * through Swift/Kotlin bindings.
     */
    console.warn(
      '[VaultMergeService] Full LWW merge not yet implemented for mobile. ' +
      'Preserving local changes. Server changes may be lost until next sync.'
    );

    /**
     * Fallback: Return the local vault to preserve local changes.
     * The sync mechanism will retry on next app open.
     *
     * A proper implementation would:
     * 1. Decrypt both vaults using the encryption key
     * 2. Use Rust core's mergeVaults() function
     * 3. Re-encrypt the merged result
     */
    return localVaultBase64;
  }
}
