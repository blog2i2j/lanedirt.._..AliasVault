import initSqlJs, { Database } from 'sql.js';

/**
 * Entity record from a SyncableEntity table.
 * All entities extending SyncableEntity have these fields.
 */
interface ISyncableRecord {
  Id: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsDeleted: number; // SQLite stores booleans as 0/1
}

/**
 * Item record with additional deletion tracking fields.
 */
interface IItemRecord extends ISyncableRecord {
  DeletedAt: string | null;
}

/**
 * Result of a merge operation.
 */
export interface IMergeResult {
  success: boolean;
  mergedVaultBase64: string;
  stats: IMergeStats;
}

/**
 * Statistics about what was merged.
 */
export interface IMergeStats {
  tablesProcessed: number;
  recordsFromLocal: number;
  recordsFromServer: number;
  recordsCreatedLocally: number;
  conflicts: number;
}

/**
 * Configuration for a syncable table.
 */
interface ITableConfig {
  name: string;
  primaryKey: string;
  isItemTable?: boolean; // Special handling for Item.DeletedAt
}

/**
 * All tables that extend SyncableEntity and need LWW merge.
 */
const SYNCABLE_TABLES: ITableConfig[] = [
  { name: 'Items', primaryKey: 'Id', isItemTable: true },
  { name: 'FieldValues', primaryKey: 'Id' },
  { name: 'Folders', primaryKey: 'Id' },
  { name: 'Tags', primaryKey: 'Id' },
  { name: 'ItemTags', primaryKey: 'Id' },
  { name: 'Attachments', primaryKey: 'Id' },
  { name: 'TotpCodes', primaryKey: 'Id' },
  { name: 'Passkeys', primaryKey: 'Id' },
  { name: 'FieldDefinitions', primaryKey: 'Id' },
  { name: 'FieldHistories', primaryKey: 'Id' },
  { name: 'Logos', primaryKey: 'Id' },
];

/**
 * Service for merging two vault SQLite databases using Last-Write-Wins (LWW) strategy.
 *
 * The merge uses UpdatedAt timestamps on all SyncableEntity records to determine
 * which version of a record wins in case of conflict.
 */
export class VaultMergeService {
  /**
   * Merge local vault changes with server vault using LWW strategy.
   *
   * @param localVaultBase64 - The local vault (with offline changes) as base64 SQLite
   * @param serverVaultBase64 - The server vault (latest version) as base64 SQLite
   * @returns MergeResult with the merged vault as base64
   */
  public async merge(localVaultBase64: string, serverVaultBase64: string): Promise<IMergeResult> {
    const stats: IMergeStats = {
      tablesProcessed: 0,
      recordsFromLocal: 0,
      recordsFromServer: 0,
      recordsCreatedLocally: 0,
      conflicts: 0,
    };

    try {
      // Initialize SQL.js
      const SQL = await initSqlJs({
        /**
         * Locate the SQL.js WASM file.
         * @param file - The file name to locate
         * @returns The path to the file
         */
        locateFile: (file: string) => `src/${file}`
      });

      // Load both databases
      const localDb = this.loadDatabase(SQL, localVaultBase64);
      const serverDb = this.loadDatabase(SQL, serverVaultBase64);

      /*
       * We'll merge INTO the local database (which has our changes)
       * by comparing with server and updating where server wins.
       */
      for (const tableConfig of SYNCABLE_TABLES) {
        try {
          await this.mergeTable(localDb, serverDb, tableConfig, stats);
          stats.tablesProcessed++;
        } catch (error) {
          // Table might not exist in one of the databases (schema mismatch)
          console.warn(`Skipping table ${tableConfig.name} during merge:`, error);
        }
      }

      // Export the merged database
      const mergedVaultBase64 = this.exportDatabase(localDb);

      // Clean up
      localDb.close();
      serverDb.close();

      return {
        success: true,
        mergedVaultBase64,
        stats,
      };
    } catch (error) {
      console.error('Vault merge failed:', error);
      throw error;
    }
  }

  /**
   * Load a SQLite database from base64 string.
   * @param SQL - The SQL.js instance
   * @param base64String - The base64 encoded database
   * @returns The loaded Database instance
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loadDatabase(SQL: any, base64String: string): Database {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new SQL.Database(bytes);
  }

  /**
   * Export a SQLite database to base64 string.
   * @param db - The database to export
   * @returns The base64 encoded database
   */
  private exportDatabase(db: Database): string {
    db.run('VACUUM');
    const binaryArray = db.export();
    let binaryString = '';
    for (let i = 0; i < binaryArray.length; i++) {
      binaryString += String.fromCharCode(binaryArray[i]);
    }
    return btoa(binaryString);
  }

  /**
   * Merge a single table using LWW strategy.
   * @param localDb - The local database
   * @param serverDb - The server database
   * @param tableConfig - Configuration for the table
   * @param stats - Statistics to update
   */
  private async mergeTable(
    localDb: Database,
    serverDb: Database,
    tableConfig: ITableConfig,
    stats: IMergeStats
  ): Promise<void> {
    const { name: tableName, primaryKey: _primaryKey, isItemTable } = tableConfig;

    // Get all records from both databases
    const localRecords = this.getTableRecords(localDb, tableName);
    const serverRecords = this.getTableRecords(serverDb, tableName);

    // Create a map of server records by primary key for quick lookup
    const serverMap = new Map<string, ISyncableRecord>();
    for (const record of serverRecords) {
      serverMap.set(record.Id, record);
    }

    // Process local records
    for (const localRecord of localRecords) {
      const serverRecord = serverMap.get(localRecord.Id);

      if (!serverRecord) {
        // Record only exists locally (created offline) - keep it
        stats.recordsCreatedLocally++;
        continue;
      }

      // Record exists in both - compare UpdatedAt for LWW
      const localUpdated = new Date(localRecord.UpdatedAt).getTime();
      const serverUpdated = new Date(serverRecord.UpdatedAt).getTime();

      if (serverUpdated > localUpdated) {
        // Server wins - update local with server data
        stats.conflicts++;
        stats.recordsFromServer++;

        if (isItemTable) {
          this.updateItemRecord(localDb, tableName, serverRecord as IItemRecord, serverDb);
        } else {
          this.updateRecord(localDb, tableName, serverRecord, serverDb);
        }
      } else {
        // Local wins - keep local (already there)
        stats.recordsFromLocal++;
      }

      // Remove from server map to track what's been processed
      serverMap.delete(localRecord.Id);
    }

    // Insert server-only records into local (new records from other devices)
    for (const serverRecord of serverMap.values()) {
      stats.recordsFromServer++;
      if (isItemTable) {
        this.insertItemRecord(localDb, tableName, serverRecord as IItemRecord, serverDb);
      } else {
        this.insertRecord(localDb, tableName, serverRecord, serverDb);
      }
    }
  }

  /**
   * Get all records from a table.
   * @param db - The database to query
   * @param tableName - The name of the table
   * @returns Array of records from the table
   */
  private getTableRecords(db: Database, tableName: string): ISyncableRecord[] {
    const stmt = db.prepare(`SELECT * FROM ${tableName}`);
    const records: ISyncableRecord[] = [];

    while (stmt.step()) {
      records.push(stmt.getAsObject() as unknown as ISyncableRecord);
    }
    stmt.free();

    return records;
  }

  /**
   * Get column names for a table (excluding computed columns).
   * @param db - The database to query
   * @param tableName - The name of the table
   * @returns Array of column names
   */
  private getTableColumns(db: Database, tableName: string): string[] {
    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const columns: string[] = [];

    while (stmt.step()) {
      const col = stmt.getAsObject() as { name: string };
      columns.push(col.name);
    }
    stmt.free();

    return columns;
  }

  /**
   * Update a record in local database with data from server.
   * @param localDb - The local database
   * @param tableName - The name of the table
   * @param serverRecord - The record from server
   * @param serverDb - The server database (for schema info)
   */
  private updateRecord(
    localDb: Database,
    tableName: string,
    serverRecord: ISyncableRecord,
    serverDb: Database
  ): void {
    const columns = this.getTableColumns(serverDb, tableName);

    // Build UPDATE statement
    const setClause = columns
      .filter(col => col !== 'Id')
      .map(col => `${col} = ?`)
      .join(', ');

    const values = columns
      .filter(col => col !== 'Id')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(col => (serverRecord as any)[col]);

    values.push(serverRecord.Id); // For WHERE clause

    const sql = `UPDATE ${tableName} SET ${setClause} WHERE Id = ?`;
    localDb.run(sql, values);
  }

  /**
   * Update an Item record with special handling for DeletedAt.
   * @param localDb - The local database
   * @param tableName - The name of the table
   * @param serverRecord - The record from server
   * @param serverDb - The server database (for schema info)
   */
  private updateItemRecord(
    localDb: Database,
    tableName: string,
    serverRecord: IItemRecord,
    serverDb: Database
  ): void {
    // For Item table, use same update logic but server record includes DeletedAt
    this.updateRecord(localDb, tableName, serverRecord, serverDb);
  }

  /**
   * Insert a new record from server into local database.
   * @param localDb - The local database
   * @param tableName - The name of the table
   * @param serverRecord - The record from server
   * @param serverDb - The server database (for schema info)
   */
  private insertRecord(
    localDb: Database,
    tableName: string,
    serverRecord: ISyncableRecord,
    serverDb: Database
  ): void {
    const columns = this.getTableColumns(serverDb, tableName);

    const columnList = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = columns.map(col => (serverRecord as any)[col]);

    const sql = `INSERT OR REPLACE INTO ${tableName} (${columnList}) VALUES (${placeholders})`;
    localDb.run(sql, values);
  }

  /**
   * Insert an Item record with special handling for DeletedAt.
   * @param localDb - The local database
   * @param tableName - The name of the table
   * @param serverRecord - The record from server
   * @param serverDb - The server database (for schema info)
   */
  private insertItemRecord(
    localDb: Database,
    tableName: string,
    serverRecord: IItemRecord,
    serverDb: Database
  ): void {
    // For Item table, use same insert logic
    this.insertRecord(localDb, tableName, serverRecord, serverDb);
  }

  /**
   * Resolve deletion conflicts for Item records.
   *
   * Rules:
   * - IsDeleted=true (permanent delete) is "sticky" unless restored with later UpdatedAt
   * - DeletedAt (moved to trash) follows LWW
   * @param local - The local record
   * @param server - The server record
   * @returns The resolved record
   */
  public resolveItemDeletionConflict(local: IItemRecord, server: IItemRecord): IItemRecord {
    const localUpdated = new Date(local.UpdatedAt).getTime();
    const serverUpdated = new Date(server.UpdatedAt).getTime();

    // Standard LWW for the base winner
    const winner = serverUpdated > localUpdated ? { ...server } : { ...local };

    /*
     * Special handling for IsDeleted (permanent delete)
     * If both are deleted, stay deleted
     */
    if (local.IsDeleted && server.IsDeleted) {
      winner.IsDeleted = 1;
    } else if (local.IsDeleted && localUpdated > serverUpdated) {
      // If only one is deleted, the delete wins if it's newer
      winner.IsDeleted = 1;
    } else if (server.IsDeleted && serverUpdated > localUpdated) {
      winner.IsDeleted = 1;
    }
    // Otherwise, the non-deleted (restore) wins if it's newer

    return winner;
  }
}

/**
 * Singleton instance for the vault merge service.
 */
export const vaultMergeService = new VaultMergeService();
