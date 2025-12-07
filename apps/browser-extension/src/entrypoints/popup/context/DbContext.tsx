import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { sendMessage } from 'webext-bridge/popup';

import type { EncryptionKeyDerivationParams, VaultMetadata } from '@/utils/dist/shared/models/metadata';
import type { VaultResponse } from '@/utils/dist/shared/models/webapi';
import EncryptionUtility from '@/utils/EncryptionUtility';
import SqliteClient from '@/utils/SqliteClient';
import { StoreVaultRequest } from '@/utils/types/messaging/StoreVaultRequest';
import type { VaultResponse as messageVaultResponse } from '@/utils/types/messaging/VaultResponse';

import { storage } from '#imports';

type DbContextType = {
  sqliteClient: SqliteClient | null;
  dbInitialized: boolean;
  dbAvailable: boolean;
  isOffline: boolean;
  hasPendingSync: boolean;
  setIsOffline: (offline: boolean) => Promise<void>;
  setHasPendingSync: (hasPendingSync: boolean) => Promise<void>;
  initializeDatabase: (vaultResponse: VaultResponse, derivedKey: string) => Promise<SqliteClient>;
  initializeDatabaseFromDecryptedVault: (decryptedVaultBase64: string) => Promise<SqliteClient>;
  storeEncryptionKey: (derivedKey: string) => Promise<void>;
  storeEncryptionKeyDerivationParams: (params: EncryptionKeyDerivationParams) => Promise<void>;
  clearDatabase: () => void;
  getVaultMetadata: () => Promise<VaultMetadata | null>;
  setCurrentVaultRevisionNumber: (revisionNumber: number) => Promise<void>;
  hasPendingMigrations: () => Promise<boolean>;
}

const DbContext = createContext<DbContextType | undefined>(undefined);

/**
 * DbProvider to provide the SQLite client to the app that components can use to make database queries.
 */
export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * SQLite client.
   */
  const [sqliteClient, setSqliteClient] = useState<SqliteClient | null>(null);

  /**
   * Database initialization state. If true, the database has been initialized and the dbAvailable state is correct.
   */
  const [dbInitialized, setDbInitialized] = useState(false);

  /**
   * Database availability state. If true, the database is available. If false, the database is not available and needs to be unlocked or retrieved again from the API.
   */
  const [dbAvailable, setDbAvailable] = useState(false);

  /**
   * Offline mode state. If true, the extension is operating offline.
   */
  const [isOffline, setIsOfflineState] = useState(false);

  /**
   * Pending sync state. If true, the local vault has changes not yet uploaded to server.
   */
  const [hasPendingSync, setHasPendingSyncState] = useState(false);

  /**
   * Set the offline mode state and persist it.
   */
  const setIsOffline = useCallback(async (offline: boolean) => {
    setIsOfflineState(offline);
    await sendMessage('SET_OFFLINE_MODE', offline, 'background');
  }, []);

  /**
   * Set the pending sync state and persist it.
   */
  const setHasPendingSync = useCallback(async (pendingSync: boolean) => {
    setHasPendingSyncState(pendingSync);
    await sendMessage('SET_HAS_PENDING_SYNC', pendingSync, 'background');
  }, []);

  /**
   * Load initial offline and pending sync state from storage.
   */
  useEffect(() => {
    /**
     * Load the offline mode and pending sync state from background storage.
     */
    const loadSyncState = async () : Promise<void> => {
      const offlineMode = await sendMessage('GET_OFFLINE_MODE', {}, 'background') as boolean;
      setIsOfflineState(offlineMode);

      const pendingSync = await sendMessage('GET_HAS_PENDING_SYNC', {}, 'background') as boolean;
      setHasPendingSyncState(pendingSync);
    };
    loadSyncState();
  }, []);

  const initializeDatabase = useCallback(async (vaultResponse: VaultResponse, derivedKey: string) => {
    // Attempt to decrypt the blob.
    const decryptedBlob = await EncryptionUtility.symmetricDecrypt(
      vaultResponse.vault.blob,
      derivedKey
    );

    // Initialize the SQLite client.
    const client = new SqliteClient();
    await client.initializeFromBase64(decryptedBlob);

    setSqliteClient(client);
    setDbInitialized(true);
    setDbAvailable(true);

    /**
     * Store encrypted vault and metadata in background worker (persistent storage).
     * Since we just fetched from server, hasPendingSync is false - vault is in sync.
     */
    const request: StoreVaultRequest = {
      vaultBlob: vaultResponse.vault.blob,
      publicEmailDomainList: vaultResponse.vault.publicEmailDomainList,
      privateEmailDomainList: vaultResponse.vault.privateEmailDomainList,
      hiddenPrivateEmailDomainList: vaultResponse.vault.hiddenPrivateEmailDomainList,
      vaultRevisionNumber: vaultResponse.vault.currentRevisionNumber,
      hasPendingSync: false, // Fresh from server, no pending changes
    };

    await sendMessage('STORE_VAULT', request, 'background');

    // Update local state to reflect sync status
    setHasPendingSyncState(false);

    return client;
  }, []);

  /**
   * Initialize the database from an already-decrypted vault (for offline mode).
   * This is used when we have the decryption key but the server is unavailable.
   */
  const initializeDatabaseFromDecryptedVault = useCallback(async (decryptedVaultBase64: string) => {
    // Initialize the SQLite client.
    const client = new SqliteClient();
    await client.initializeFromBase64(decryptedVaultBase64);

    setSqliteClient(client);
    setDbInitialized(true);
    setDbAvailable(true);

    return client;
  }, []);

  const checkStoredVault = useCallback(async () => {
    try {
      const response = await sendMessage('GET_VAULT', {}, 'background') as messageVaultResponse;
      if (response?.vault) {
        const client = new SqliteClient();
        await client.initializeFromBase64(response.vault);

        setSqliteClient(client);
        setDbInitialized(true);
        setDbAvailable(true);
        // Metadata is already stored in session storage by background worker
      } else {
        setDbInitialized(true);
        setDbAvailable(false);
      }
    } catch (error) {
      console.error('Error retrieving vault from background:', error);
      setDbInitialized(true);
      setDbAvailable(false);
    }
  }, []);

  /**
   * Get the vault metadata from local storage (persistent).
   */
  const getVaultMetadata = useCallback(async () : Promise<VaultMetadata | null> => {
    try {
      const publicEmailDomains = await storage.getItem('local:publicEmailDomains') as string[] | null;
      const privateEmailDomains = await storage.getItem('local:privateEmailDomains') as string[] | null;
      const hiddenPrivateEmailDomains = await storage.getItem('local:hiddenPrivateEmailDomains') as string[] | null;
      const vaultRevisionNumber = await storage.getItem('local:vaultRevisionNumber') as number | null;

      if (!publicEmailDomains && !privateEmailDomains) {
        return null;
      }

      return {
        publicEmailDomains: publicEmailDomains ?? [],
        privateEmailDomains: privateEmailDomains ?? [],
        hiddenPrivateEmailDomains: hiddenPrivateEmailDomains ?? [],
        vaultRevisionNumber: vaultRevisionNumber ?? 0,
      };
    } catch (error) {
      console.error('Error getting vault metadata from local storage:', error);
      return null;
    }
  }, []);

  /**
   * Set the current vault revision number in local storage (persistent).
   */
  const setCurrentVaultRevisionNumber = useCallback(async (revisionNumber: number) => {
    await storage.setItem('local:vaultRevisionNumber', revisionNumber);
  }, []);

  /**
   * Check if there are pending migrations.
   */
  const hasPendingMigrations = useCallback(async () => {
    if (!sqliteClient) {
      return false;
    }
    return await sqliteClient.hasPendingMigrations();
  }, [sqliteClient]);

  /**
   * Check if database is initialized and try to retrieve vault from background
   */
  useEffect(() : void => {
    if (!dbInitialized) {
      checkStoredVault();
    }
  }, [dbInitialized, checkStoredVault]);

  /**
   * Store encryption key in background worker.
   */
  const storeEncryptionKey = useCallback(async (encryptionKey: string) : Promise<void> => {
    await sendMessage('STORE_ENCRYPTION_KEY', encryptionKey, 'background');
  }, []);

  /**
   * Store encryption key derivation params in background worker.
   */
  const storeEncryptionKeyDerivationParams = useCallback(async (params: EncryptionKeyDerivationParams) : Promise<void> => {
    await sendMessage('STORE_ENCRYPTION_KEY_DERIVATION_PARAMS', params, 'background');
  }, []);

  /**
   * Clear database and remove from background worker, called when logging out.
   */
  const clearDatabase = useCallback(() : void => {
    setSqliteClient(null);
    setDbInitialized(false);
    setDbAvailable(false);
    sendMessage('CLEAR_VAULT', {}, 'background');
  }, []);

  const contextValue = useMemo(() => ({
    sqliteClient,
    dbInitialized,
    dbAvailable,
    isOffline,
    hasPendingSync,
    setIsOffline,
    setHasPendingSync,
    initializeDatabase,
    initializeDatabaseFromDecryptedVault,
    storeEncryptionKey,
    storeEncryptionKeyDerivationParams,
    clearDatabase,
    getVaultMetadata,
    setCurrentVaultRevisionNumber,
    hasPendingMigrations,
  }), [sqliteClient, dbInitialized, dbAvailable, isOffline, hasPendingSync, setIsOffline, setHasPendingSync, initializeDatabase, initializeDatabaseFromDecryptedVault, storeEncryptionKey, storeEncryptionKeyDerivationParams, clearDatabase, getVaultMetadata, setCurrentVaultRevisionNumber, hasPendingMigrations]);

  return (
    <DbContext.Provider value={contextValue}>
      {children}
    </DbContext.Provider>
  );
};

/**
 * Hook to use the DbContext
 */
export const useDb = () : DbContextType => {
  const context = useContext(DbContext);
  if (context === undefined) {
    throw new Error('useDb must be used within a DbProvider');
  }
  return context;
};
