import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import { VaultMergeService } from '../VaultMergeService';

/**
 * Test suite for VaultMergeService - tests LWW (Last-Write-Wins) merge logic
 * with real SQLite databases.
 */

let SQL: SqlJsStatic;

/**
 * Helper to create a test vault database with the Items table schema.
 * This mimics the actual vault structure used in AliasVault.
 */
function createTestVault(items: Array<{
  Id: string;
  ServiceName: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsDeleted?: number;
  DeletedAt?: string | null;
}>): string {
  const db = new SQL.Database();

  // Create Items table matching actual schema
  db.run(`
    CREATE TABLE Items (
      Id TEXT PRIMARY KEY,
      ServiceName TEXT,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL,
      IsDeleted INTEGER DEFAULT 0,
      DeletedAt TEXT
    )
  `);

  // Insert test records
  for (const item of items) {
    db.run(
      `INSERT INTO Items (Id, ServiceName, CreatedAt, UpdatedAt, IsDeleted, DeletedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        item.Id,
        item.ServiceName,
        item.CreatedAt,
        item.UpdatedAt,
        item.IsDeleted ?? 0,
        item.DeletedAt ?? null,
      ]
    );
  }

  // Export to base64
  const bytes = db.export();
  db.close();

  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Helper to read items from a base64 vault.
 */
function readItemsFromVault(vaultBase64: string): Array<{
  Id: string;
  ServiceName: string;
  UpdatedAt: string;
  IsDeleted: number;
}> {
  const binaryString = atob(vaultBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const db = new SQL.Database(bytes);
  const stmt = db.prepare('SELECT Id, ServiceName, UpdatedAt, IsDeleted FROM Items');
  const items: Array<{ Id: string; ServiceName: string; UpdatedAt: string; IsDeleted: number }> = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as { Id: string; ServiceName: string; UpdatedAt: string; IsDeleted: number };
    items.push(row);
  }
  stmt.free();
  db.close();

  return items;
}

describe('VaultMergeService', () => {
  let mergeService: VaultMergeService;

  beforeAll(async () => {
    // Initialize SQL.js once for all tests - use node_modules path for tests
    SQL = await initSqlJs({
      locateFile: (file: string) => `node_modules/sql.js/dist/${file}`,
    });
  });

  beforeEach(() => {
    mergeService = new VaultMergeService();
    // Inject the SQL.js instance so tests don't need 'src/' path
    mergeService.setSqlJs(SQL);
  });

  describe('LWW merge scenarios', () => {
    it('should keep locally created records not present on server', async () => {
      // Scenario: User created a new credential offline, server has nothing
      const localVault = await createTestVault([
        {
          Id: 'local-only-1',
          ServiceName: 'My Offline Credential',
          CreatedAt: '2024-12-08T10:00:00Z',
          UpdatedAt: '2024-12-08T10:00:00Z',
        },
      ]);

      const serverVault = await createTestVault([]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.recordsCreatedLocally).toBe(1);

      // Verify the local record exists in merged vault
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].Id).toBe('local-only-1');
      expect(mergedItems[0].ServiceName).toBe('My Offline Credential');
    });

    it('should use server record when server UpdatedAt is newer (conflict resolution)', async () => {
      // Scenario: Same credential edited on both devices, server edit is newer
      const localVault = await createTestVault([
        {
          Id: 'shared-item-1',
          ServiceName: 'Local Edit',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T10:00:00Z', // Earlier update
        },
      ]);

      const serverVault = await createTestVault([
        {
          Id: 'shared-item-1',
          ServiceName: 'Server Edit',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T11:00:00Z', // Later update - server wins
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.conflicts).toBe(1);
      expect(result.stats.recordsFromServer).toBe(1);

      // Verify server version won
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].ServiceName).toBe('Server Edit');
    });

    it('should keep local record when local UpdatedAt is newer', async () => {
      // Scenario: Same credential edited on both devices, local edit is newer
      const localVault = await createTestVault([
        {
          Id: 'shared-item-1',
          ServiceName: 'Local Edit (Newer)',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T12:00:00Z', // Later update - local wins
        },
      ]);

      const serverVault = await createTestVault([
        {
          Id: 'shared-item-1',
          ServiceName: 'Server Edit (Older)',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T10:00:00Z', // Earlier update
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.recordsFromLocal).toBe(1);

      // Verify local version won
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].ServiceName).toBe('Local Edit (Newer)');
    });

    it('should add server-only records to merged vault', async () => {
      // Scenario: Another device created a credential, local doesn't have it
      const localVault = await createTestVault([
        {
          Id: 'local-item-1',
          ServiceName: 'Existing Local',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-01T10:00:00Z',
        },
      ]);

      const serverVault = await createTestVault([
        {
          Id: 'local-item-1',
          ServiceName: 'Existing Local',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-01T10:00:00Z',
        },
        {
          Id: 'server-only-1',
          ServiceName: 'Created on Other Device',
          CreatedAt: '2024-12-08T09:00:00Z',
          UpdatedAt: '2024-12-08T09:00:00Z',
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      // Verify both records exist in merged vault
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(2);

      const serverOnlyItem = mergedItems.find((i) => i.Id === 'server-only-1');
      expect(serverOnlyItem).toBeDefined();
      expect(serverOnlyItem?.ServiceName).toBe('Created on Other Device');
    });

    it('should handle complex merge with local adds, server adds, and conflicts', async () => {
      // Scenario: Realistic merge with multiple types of changes
      const localVault = await createTestVault([
        {
          Id: 'item-unchanged',
          ServiceName: 'Unchanged Item',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-01T10:00:00Z',
        },
        {
          Id: 'item-local-wins',
          ServiceName: 'Local Wins',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T15:00:00Z', // Local is newer
        },
        {
          Id: 'item-server-wins',
          ServiceName: 'Server Will Win',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T10:00:00Z', // Server is newer
        },
        {
          Id: 'item-local-only',
          ServiceName: 'Created Offline',
          CreatedAt: '2024-12-08T14:00:00Z',
          UpdatedAt: '2024-12-08T14:00:00Z',
        },
      ]);

      const serverVault = await createTestVault([
        {
          Id: 'item-unchanged',
          ServiceName: 'Unchanged Item',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-01T10:00:00Z',
        },
        {
          Id: 'item-local-wins',
          ServiceName: 'Server Version (Older)',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T12:00:00Z', // Older than local
        },
        {
          Id: 'item-server-wins',
          ServiceName: 'Server Wins',
          CreatedAt: '2024-12-01T10:00:00Z',
          UpdatedAt: '2024-12-08T16:00:00Z', // Newer than local
        },
        {
          Id: 'item-server-only',
          ServiceName: 'From Other Device',
          CreatedAt: '2024-12-08T13:00:00Z',
          UpdatedAt: '2024-12-08T13:00:00Z',
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.tablesProcessed).toBeGreaterThanOrEqual(1);

      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(5); // All unique items

      // Verify each scenario
      const unchanged = mergedItems.find((i) => i.Id === 'item-unchanged');
      expect(unchanged?.ServiceName).toBe('Unchanged Item');

      const localWins = mergedItems.find((i) => i.Id === 'item-local-wins');
      expect(localWins?.ServiceName).toBe('Local Wins');

      const serverWins = mergedItems.find((i) => i.Id === 'item-server-wins');
      expect(serverWins?.ServiceName).toBe('Server Wins');

      const localOnly = mergedItems.find((i) => i.Id === 'item-local-only');
      expect(localOnly?.ServiceName).toBe('Created Offline');

      const serverOnly = mergedItems.find((i) => i.Id === 'item-server-only');
      expect(serverOnly?.ServiceName).toBe('From Other Device');
    });
  });

  describe('resolveItemDeletionConflict', () => {
    it('should keep delete when both are deleted', () => {
      const local = {
        Id: 'item-1',
        CreatedAt: '2024-12-01T10:00:00Z',
        UpdatedAt: '2024-12-08T10:00:00Z',
        IsDeleted: 1,
        DeletedAt: null,
      };
      const server = {
        Id: 'item-1',
        CreatedAt: '2024-12-01T10:00:00Z',
        UpdatedAt: '2024-12-08T11:00:00Z',
        IsDeleted: 1,
        DeletedAt: null,
      };

      const result = mergeService.resolveItemDeletionConflict(local, server);

      expect(result.IsDeleted).toBe(1);
    });

    it('should keep local delete when local is newer', () => {
      const local = {
        Id: 'item-1',
        CreatedAt: '2024-12-01T10:00:00Z',
        UpdatedAt: '2024-12-08T12:00:00Z', // Newer
        IsDeleted: 1,
        DeletedAt: null,
      };
      const server = {
        Id: 'item-1',
        CreatedAt: '2024-12-01T10:00:00Z',
        UpdatedAt: '2024-12-08T10:00:00Z', // Older
        IsDeleted: 0,
        DeletedAt: null,
      };

      const result = mergeService.resolveItemDeletionConflict(local, server);

      expect(result.IsDeleted).toBe(1);
    });

    it('should restore when server restore is newer than local delete', () => {
      const local = {
        Id: 'item-1',
        CreatedAt: '2024-12-01T10:00:00Z',
        UpdatedAt: '2024-12-08T10:00:00Z', // Older
        IsDeleted: 1,
        DeletedAt: null,
      };
      const server = {
        Id: 'item-1',
        CreatedAt: '2024-12-01T10:00:00Z',
        UpdatedAt: '2024-12-08T12:00:00Z', // Newer - restored
        IsDeleted: 0,
        DeletedAt: null,
      };

      const result = mergeService.resolveItemDeletionConflict(local, server);

      // Server wins because it's newer and not deleted
      expect(result.IsDeleted).toBe(0);
    });
  });
});
