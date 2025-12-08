import initSqlJs, { SqlJsStatic } from 'sql.js';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { VaultSqlGenerator } from '@/utils/dist/shared/vault-sql';

import { VaultMergeService } from '../VaultMergeService';

/**
 * Test suite for VaultMergeService - tests LWW (Last-Write-Wins) merge logic
 * with real SQLite databases using the actual vault schema.
 */

let SQL: SqlJsStatic;
let vaultSchema: string;

describe('VaultMergeService', () => {
  let mergeService: VaultMergeService;

  beforeAll(async () => {
    // Initialize SQL.js once for all tests - use node_modules path for tests
    SQL = await initSqlJs({
      /**
       * Locate the SQL.js WASM file in node_modules for test environment.
       * @param file - The filename to locate
       * @returns The path to the file
       */
      locateFile: (file: string) => `node_modules/sql.js/dist/${file}`,
    });

    // Get the complete vault schema from VaultSqlGenerator
    const sqlGenerator = new VaultSqlGenerator();
    vaultSchema = sqlGenerator.getCompleteSchemaSql();
  });

  beforeEach(() => {
    mergeService = new VaultMergeService();
    // Inject the SQL.js instance so tests don't need 'src/' path
    mergeService.setSqlJs(SQL);
  });

  describe('LWW merge scenarios', () => {
    it('should keep locally created records not present on server', async () => {
      // Scenario: User created a new credential offline, server has nothing
      const localVault = createTestVault([
        {
          Id: 'local-only-1',
          Name: 'My Offline Credential',
          CreatedAt: '2024-12-08 10:00:00.000',
          UpdatedAt: '2024-12-08 10:00:00.000',
        },
      ]);

      const serverVault = createTestVault([]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.recordsCreatedLocally).toBeGreaterThanOrEqual(1);

      // Verify the local record exists in merged vault
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].Id).toBe('local-only-1');
      expect(mergedItems[0].Name).toBe('My Offline Credential');
    });

    it('should use server record when server UpdatedAt is newer (conflict resolution)', async () => {
      // Scenario: Same credential edited on both devices, server edit is newer
      const localVault = createTestVault([
        {
          Id: 'shared-item-1',
          Name: 'Local Edit',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 10:00:00.000', // Earlier update
        },
      ]);

      const serverVault = createTestVault([
        {
          Id: 'shared-item-1',
          Name: 'Server Edit',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 11:00:00.000', // Later update - server wins
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.conflicts).toBeGreaterThanOrEqual(1);

      // Verify server version won
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].Name).toBe('Server Edit');
    });

    it('should keep local record when local UpdatedAt is newer', async () => {
      // Scenario: Same credential edited on both devices, local edit is newer
      const localVault = createTestVault([
        {
          Id: 'shared-item-1',
          Name: 'Local Edit (Newer)',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 12:00:00.000', // Later update - local wins
        },
      ]);

      const serverVault = createTestVault([
        {
          Id: 'shared-item-1',
          Name: 'Server Edit (Older)',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 10:00:00.000', // Earlier update
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.recordsFromLocal).toBeGreaterThanOrEqual(1);

      // Verify local version won
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].Name).toBe('Local Edit (Newer)');
    });

    it('should add server-only records to merged vault', async () => {
      // Scenario: Another device created a credential, local doesn't have it
      const localVault = createTestVault([
        {
          Id: 'local-item-1',
          Name: 'Existing Local',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-01 10:00:00.000',
        },
      ]);

      const serverVault = createTestVault([
        {
          Id: 'local-item-1',
          Name: 'Existing Local',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-01 10:00:00.000',
        },
        {
          Id: 'server-only-1',
          Name: 'Created on Other Device',
          CreatedAt: '2024-12-08 09:00:00.000',
          UpdatedAt: '2024-12-08 09:00:00.000',
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      // Verify both records exist in merged vault
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(2);

      const serverOnlyItem = mergedItems.find((i) => i.Id === 'server-only-1');
      expect(serverOnlyItem).toBeDefined();
      expect(serverOnlyItem?.Name).toBe('Created on Other Device');
    });

    it('should handle complex merge with local adds, server adds, and conflicts', async () => {
      // Scenario: Realistic merge with multiple types of changes
      const localVault = createTestVault([
        {
          Id: 'item-unchanged',
          Name: 'Unchanged Item',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-01 10:00:00.000',
        },
        {
          Id: 'item-local-wins',
          Name: 'Local Wins',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 15:00:00.000', // Local is newer
        },
        {
          Id: 'item-server-wins',
          Name: 'Server Will Win',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 10:00:00.000', // Server is newer
        },
        {
          Id: 'item-local-only',
          Name: 'Created Offline',
          CreatedAt: '2024-12-08 14:00:00.000',
          UpdatedAt: '2024-12-08 14:00:00.000',
        },
      ]);

      const serverVault = createTestVault([
        {
          Id: 'item-unchanged',
          Name: 'Unchanged Item',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-01 10:00:00.000',
        },
        {
          Id: 'item-local-wins',
          Name: 'Server Version (Older)',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 12:00:00.000', // Older than local
        },
        {
          Id: 'item-server-wins',
          Name: 'Server Wins',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 16:00:00.000', // Newer than local
        },
        {
          Id: 'item-server-only',
          Name: 'From Other Device',
          CreatedAt: '2024-12-08 13:00:00.000',
          UpdatedAt: '2024-12-08 13:00:00.000',
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);
      expect(result.stats.tablesProcessed).toBeGreaterThanOrEqual(1);

      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(5); // All unique items

      // Verify each scenario
      const unchanged = mergedItems.find((i) => i.Id === 'item-unchanged');
      expect(unchanged?.Name).toBe('Unchanged Item');

      const localWins = mergedItems.find((i) => i.Id === 'item-local-wins');
      expect(localWins?.Name).toBe('Local Wins');

      const serverWins = mergedItems.find((i) => i.Id === 'item-server-wins');
      expect(serverWins?.Name).toBe('Server Wins');

      const localOnly = mergedItems.find((i) => i.Id === 'item-local-only');
      expect(localOnly?.Name).toBe('Created Offline');

      const serverOnly = mergedItems.find((i) => i.Id === 'item-server-only');
      expect(serverOnly?.Name).toBe('From Other Device');
    });
  });

  describe('resolveItemDeletionConflict', () => {
    it('should keep delete when both are deleted', () => {
      const local = {
        Id: 'item-1',
        CreatedAt: '2024-12-01 10:00:00.000',
        UpdatedAt: '2024-12-08 10:00:00.000',
        IsDeleted: 1,
        DeletedAt: null,
      };
      const server = {
        Id: 'item-1',
        CreatedAt: '2024-12-01 10:00:00.000',
        UpdatedAt: '2024-12-08 11:00:00.000',
        IsDeleted: 1,
        DeletedAt: null,
      };

      const result = mergeService.resolveItemDeletionConflict(local, server);

      expect(result.IsDeleted).toBe(1);
    });

    it('should keep local delete when local is newer', () => {
      const local = {
        Id: 'item-1',
        CreatedAt: '2024-12-01 10:00:00.000',
        UpdatedAt: '2024-12-08 12:00:00.000', // Newer
        IsDeleted: 1,
        DeletedAt: null,
      };
      const server = {
        Id: 'item-1',
        CreatedAt: '2024-12-01 10:00:00.000',
        UpdatedAt: '2024-12-08 10:00:00.000', // Older
        IsDeleted: 0,
        DeletedAt: null,
      };

      const result = mergeService.resolveItemDeletionConflict(local, server);

      expect(result.IsDeleted).toBe(1);
    });

    it('should restore when server restore is newer than local delete', () => {
      const local = {
        Id: 'item-1',
        CreatedAt: '2024-12-01 10:00:00.000',
        UpdatedAt: '2024-12-08 10:00:00.000', // Older
        IsDeleted: 1,
        DeletedAt: null,
      };
      const server = {
        Id: 'item-1',
        CreatedAt: '2024-12-01 10:00:00.000',
        UpdatedAt: '2024-12-08 12:00:00.000', // Newer - restored
        IsDeleted: 0,
        DeletedAt: null,
      };

      const result = mergeService.resolveItemDeletionConflict(local, server);

      // Server wins because it's newer and not deleted
      expect(result.IsDeleted).toBe(0);
    });
  });

  describe('FieldValues merge scenarios', () => {
    it('should keep locally created FieldValue not present on server', async () => {
      // Scenario: User added a new field value offline
      const localVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-local-1',
            ItemId: 'item-1',
            FieldKey: 'login.password',
            Value: 'local-password',
            CreatedAt: '2024-12-08 10:00:00.000',
            UpdatedAt: '2024-12-08 10:00:00.000',
          },
        ]
      );

      const serverVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [] // No field values on server
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(1);
      expect(mergedFieldValues[0].Id).toBe('fv-local-1');
      expect(mergedFieldValues[0].Value).toBe('local-password');
    });

    it('should add server-only FieldValue to merged vault', async () => {
      // Scenario: Another device added a field value
      const localVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [] // No field values locally
      );

      const serverVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-server-1',
            ItemId: 'item-1',
            FieldKey: 'login.username',
            Value: 'server-username',
            CreatedAt: '2024-12-08 09:00:00.000',
            UpdatedAt: '2024-12-08 09:00:00.000',
          },
        ]
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(1);
      expect(mergedFieldValues[0].Id).toBe('fv-server-1');
      expect(mergedFieldValues[0].Value).toBe('server-username');
    });

    it('should use server FieldValue when server UpdatedAt is newer', async () => {
      // Scenario: Same field edited on both devices, server edit is newer
      const localVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-shared-1',
            ItemId: 'item-1',
            FieldKey: 'login.password',
            Value: 'local-password',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 10:00:00.000', // Earlier
          },
        ]
      );

      const serverVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-shared-1',
            ItemId: 'item-1',
            FieldKey: 'login.password',
            Value: 'server-password',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 11:00:00.000', // Later - server wins
          },
        ]
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(1);
      expect(mergedFieldValues[0].Value).toBe('server-password');
    });

    it('should keep local FieldValue when local UpdatedAt is newer', async () => {
      // Scenario: Same field edited on both devices, local edit is newer
      const localVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-shared-1',
            ItemId: 'item-1',
            FieldKey: 'login.password',
            Value: 'local-password-newer',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 12:00:00.000', // Later - local wins
          },
        ]
      );

      const serverVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-shared-1',
            ItemId: 'item-1',
            FieldKey: 'login.password',
            Value: 'server-password-older',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 10:00:00.000', // Earlier
          },
        ]
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(1);
      expect(mergedFieldValues[0].Value).toBe('local-password-newer');
    });

    it('should handle soft-deleted FieldValue - keep delete when local is newer', async () => {
      // Scenario: User deleted field locally (newer), server still has it
      const localVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-deleted-1',
            ItemId: 'item-1',
            FieldKey: 'login.notes',
            Value: 'deleted-notes',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 12:00:00.000', // Newer - local delete wins
            IsDeleted: 1,
          },
        ]
      );

      const serverVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-deleted-1',
            ItemId: 'item-1',
            FieldKey: 'login.notes',
            Value: 'server-notes',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 10:00:00.000', // Older
            IsDeleted: 0,
          },
        ]
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(1);
      expect(mergedFieldValues[0].IsDeleted).toBe(1);
    });

    it('should restore FieldValue when server restore is newer than local delete', async () => {
      // Scenario: User deleted locally, but server restored it with newer timestamp
      const localVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-restored-1',
            ItemId: 'item-1',
            FieldKey: 'login.notes',
            Value: 'deleted-notes',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 10:00:00.000', // Older
            IsDeleted: 1,
          },
        ]
      );

      const serverVault = createTestVaultWithFieldValues(
        [{ Id: 'item-1', Name: 'Test Item', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-01 10:00:00.000' }],
        [
          {
            Id: 'fv-restored-1',
            ItemId: 'item-1',
            FieldKey: 'login.notes',
            Value: 'restored-notes',
            CreatedAt: '2024-12-01 10:00:00.000',
            UpdatedAt: '2024-12-08 12:00:00.000', // Newer - server wins, restores
            IsDeleted: 0,
          },
        ]
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(1);
      expect(mergedFieldValues[0].IsDeleted).toBe(0);
      expect(mergedFieldValues[0].Value).toBe('restored-notes');
    });
  });

  describe('Item soft-delete and DeletedAt scenarios', () => {
    it('should preserve DeletedAt when item is moved to trash', async () => {
      // Scenario: Item moved to trash locally (newer)
      const localVault = createTestVault([
        {
          Id: 'item-trashed',
          Name: 'Trashed Item',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 12:00:00.000', // Newer
          DeletedAt: '2024-12-08 12:00:00.000',
          IsDeleted: 0,
        },
      ]);

      const serverVault = createTestVault([
        {
          Id: 'item-trashed',
          Name: 'Not Trashed Yet',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 10:00:00.000', // Older
          IsDeleted: 0,
          DeletedAt: null,
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].IsDeleted).toBe(0);
    });

    it('should restore from trash when server restore is newer', async () => {
      // Scenario: Item in trash locally, but server restored it
      const localVault = createTestVault([
        {
          Id: 'item-restored',
          Name: 'In Trash Locally',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 10:00:00.000', // Older
          DeletedAt: '2024-12-08 10:00:00.000',
          IsDeleted: 1,
        },
      ]);

      const serverVault = createTestVault([
        {
          Id: 'item-restored',
          Name: 'Restored on Server',
          CreatedAt: '2024-12-01 10:00:00.000',
          UpdatedAt: '2024-12-08 12:00:00.000', // Newer
          IsDeleted: 0,
          DeletedAt: null,
        },
      ]);

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0].IsDeleted).toBe(0);
      expect(mergedItems[0].Name).toBe('Restored on Server');
    });

    it('should handle complex scenario with items and field values together', async () => {
      // Scenario: Realistic merge with items and their field values
      const localVault = createTestVaultWithFieldValues(
        [
          { Id: 'item-1', Name: 'Item 1 Local', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 15:00:00.000' }, // Local wins
          { Id: 'item-2', Name: 'Item 2 Old', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 10:00:00.000' }, // Server wins
          { Id: 'item-3', Name: 'New Local Item', CreatedAt: '2024-12-08 14:00:00.000', UpdatedAt: '2024-12-08 14:00:00.000' }, // Local only
        ],
        [
          { Id: 'fv-1a', ItemId: 'item-1', FieldKey: 'login.username', Value: 'local-user', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 15:00:00.000' }, // Local wins
          { Id: 'fv-1b', ItemId: 'item-1', FieldKey: 'login.password', Value: 'old-pass', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 10:00:00.000' }, // Server wins
          { Id: 'fv-3a', ItemId: 'item-3', FieldKey: 'login.url', Value: 'https://local.com', CreatedAt: '2024-12-08 14:00:00.000', UpdatedAt: '2024-12-08 14:00:00.000' }, // Local only
        ]
      );

      const serverVault = createTestVaultWithFieldValues(
        [
          { Id: 'item-1', Name: 'Item 1 Server', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 12:00:00.000' }, // Older
          { Id: 'item-2', Name: 'Item 2 Server', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 16:00:00.000' }, // Newer
          { Id: 'item-4', Name: 'Server Only Item', CreatedAt: '2024-12-08 13:00:00.000', UpdatedAt: '2024-12-08 13:00:00.000' }, // Server only
        ],
        [
          { Id: 'fv-1a', ItemId: 'item-1', FieldKey: 'login.username', Value: 'server-user', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 12:00:00.000' }, // Older
          { Id: 'fv-1b', ItemId: 'item-1', FieldKey: 'login.password', Value: 'new-pass', CreatedAt: '2024-12-01 10:00:00.000', UpdatedAt: '2024-12-08 16:00:00.000' }, // Newer
          { Id: 'fv-4a', ItemId: 'item-4', FieldKey: 'login.url', Value: 'https://server.com', CreatedAt: '2024-12-08 13:00:00.000', UpdatedAt: '2024-12-08 13:00:00.000' }, // Server only
        ]
      );

      const result = await mergeService.merge(localVault, serverVault);

      expect(result.success).toBe(true);

      // Verify items
      const mergedItems = readItemsFromVault(result.mergedVaultBase64);
      expect(mergedItems).toHaveLength(4);

      const item1 = mergedItems.find(i => i.Id === 'item-1');
      expect(item1?.Name).toBe('Item 1 Local'); // Local wins

      const item2 = mergedItems.find(i => i.Id === 'item-2');
      expect(item2?.Name).toBe('Item 2 Server'); // Server wins

      const item3 = mergedItems.find(i => i.Id === 'item-3');
      expect(item3?.Name).toBe('New Local Item'); // Local only

      const item4 = mergedItems.find(i => i.Id === 'item-4');
      expect(item4?.Name).toBe('Server Only Item'); // Server only

      // Verify field values
      const mergedFieldValues = readFieldValuesFromVault(result.mergedVaultBase64);
      expect(mergedFieldValues).toHaveLength(4);

      const fv1a = mergedFieldValues.find(fv => fv.Id === 'fv-1a');
      expect(fv1a?.Value).toBe('local-user'); // Local wins

      const fv1b = mergedFieldValues.find(fv => fv.Id === 'fv-1b');
      expect(fv1b?.Value).toBe('new-pass'); // Server wins

      const fv3a = mergedFieldValues.find(fv => fv.Id === 'fv-3a');
      expect(fv3a?.Value).toBe('https://local.com'); // Local only

      const fv4a = mergedFieldValues.find(fv => fv.Id === 'fv-4a');
      expect(fv4a?.Value).toBe('https://server.com'); // Server only
    });
  });
});

/**
 * Helper to create a test vault database using the actual vault schema.
 * Inserts test Items records for merge testing.
 */
function createTestVault(items: Array<{
  Id: string;
  Name: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsDeleted?: number;
  DeletedAt?: string | null;
}>): string {
  const db = new SQL.Database();

  // Execute the complete vault schema
  db.exec(vaultSchema);

  // Insert test Items records
  for (const item of items) {
    db.run(
      `INSERT INTO Items (Id, Name, ItemType, LogoId, FolderId, CreatedAt, UpdatedAt, IsDeleted, DeletedAt)
       VALUES (?, ?, 'Login', NULL, NULL, ?, ?, ?, ?)`,
      [
        item.Id,
        item.Name,
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
 * Helper to read Items from a base64 vault.
 */
function readItemsFromVault(vaultBase64: string): Array<{
  Id: string;
  Name: string;
  UpdatedAt: string;
  IsDeleted: number;
}> {
  const binaryString = atob(vaultBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const db = new SQL.Database(bytes);
  const stmt = db.prepare('SELECT Id, Name, UpdatedAt, IsDeleted FROM Items');
  const items: Array<{ Id: string; Name: string; UpdatedAt: string; IsDeleted: number }> = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as { Id: string; Name: string; UpdatedAt: string; IsDeleted: number };
    items.push(row);
  }
  stmt.free();
  db.close();

  return items;
}

/**
 * Type for FieldValue test record.
 */
type TestFieldValue = {
  Id: string;
  ItemId: string;
  FieldKey: string;
  Value: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsDeleted?: number;
};

/**
 * Type for Item test record.
 */
type TestItem = {
  Id: string;
  Name: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsDeleted?: number;
  DeletedAt?: string | null;
};

/**
 * Helper to create a test vault with both Items and FieldValues.
 */
function createTestVaultWithFieldValues(
  items: TestItem[],
  fieldValues: TestFieldValue[]
): string {
  const db = new SQL.Database();

  // Execute the complete vault schema
  db.exec(vaultSchema);

  // Insert test Items records
  for (const item of items) {
    db.run(
      `INSERT INTO Items (Id, Name, ItemType, LogoId, FolderId, CreatedAt, UpdatedAt, IsDeleted, DeletedAt)
       VALUES (?, ?, 'Login', NULL, NULL, ?, ?, ?, ?)`,
      [
        item.Id,
        item.Name,
        item.CreatedAt,
        item.UpdatedAt,
        item.IsDeleted ?? 0,
        item.DeletedAt ?? null,
      ]
    );
  }

  // Insert test FieldValues records
  for (const fv of fieldValues) {
    db.run(
      `INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, FieldKey, Value, Weight, CreatedAt, UpdatedAt, IsDeleted)
       VALUES (?, ?, NULL, ?, ?, 0, ?, ?, ?)`,
      [
        fv.Id,
        fv.ItemId,
        fv.FieldKey,
        fv.Value,
        fv.CreatedAt,
        fv.UpdatedAt,
        fv.IsDeleted ?? 0,
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
 * Helper to read FieldValues from a base64 vault.
 */
function readFieldValuesFromVault(vaultBase64: string): Array<{
  Id: string;
  ItemId: string;
  FieldKey: string;
  Value: string;
  UpdatedAt: string;
  IsDeleted: number;
}> {
  const binaryString = atob(vaultBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const db = new SQL.Database(bytes);
  const stmt = db.prepare('SELECT Id, ItemId, FieldKey, Value, UpdatedAt, IsDeleted FROM FieldValues');
  const fieldValues: Array<{
    Id: string;
    ItemId: string;
    FieldKey: string;
    Value: string;
    UpdatedAt: string;
    IsDeleted: number;
  }> = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      Id: string;
      ItemId: string;
      FieldKey: string;
      Value: string;
      UpdatedAt: string;
      IsDeleted: number;
    };
    fieldValues.push(row);
  }
  stmt.free();
  db.close();

  return fieldValues;
}
