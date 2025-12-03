import initSqlJs, { Database } from 'sql.js';

import * as dateFormatter from '@/utils/dateFormatter';
import type { Credential, EncryptionKey, PasswordSettings, TotpCode, Passkey, Item, ItemField, ItemTagRef, FieldType } from '@/utils/dist/shared/models/vault';
import type { Attachment } from '@/utils/dist/shared/models/vault';
import { FieldKey, SystemFieldRegistry, getSystemField } from '@/utils/dist/shared/models/vault';
import type { VaultVersion } from '@/utils/dist/shared/vault-sql';
import { VaultSqlGenerator, checkVersionCompatibility, extractVersionFromMigrationId } from '@/utils/dist/shared/vault-sql';
import { VaultVersionIncompatibleError } from '@/utils/types/errors/VaultVersionIncompatibleError';

import { t } from '@/i18n/StandaloneI18n';

import { storage } from '#imports';

/**
 * Placeholder base64 image for credentials without a logo.
 */
const placeholderBase64 = 'UklGRjoEAABXRUJQVlA4IC4EAAAwFwCdASqAAIAAPpFCm0olo6Ihp5IraLASCWUA0eb/0s56RrLtCnYfLPiBshdXWMx8j1Ez65f169iA4xUDBTEV6ylMQeCIj2b7RngGi7gKZ9WjKdSoy9R8JcgOmjCMlDmLG20KhNo/i/Dc/Ah5GAvGfm8kfniV3AkR6fxN6eKwjDc6xrDgSfS48G5uGV6WzQt24YAVlLSK9BMwndzfHnePK1KFchFrL7O3ulB8cGNCeomu4o+l0SrS/JKblJ4WTzj0DAD++lCUEouSfgRKdiV2TiYCD+H+l3tANKSPQFPQuzi7rbvxqGeRmXB9kDwURaoSTTpYjA9REMUi9uA6aV7PWtBNXgUzMLowYMZeos6Xvyhb34GmufswMHA5ZyYpxzjTphOak4ZjNOiz8aScO5ygiTx99SqwX/uL+HSeVOSraHw8IymrMwm+jLxqN8BS8dGcItLlm/ioulqH2j4V8glDgSut+ExkxiD7m8TGPrrjCQNJbRDzpOFsyCyfBZupvp8QjGKW2KGziSZeIWes4aTB9tRmeEBhnUrmTDZQuXcc67Fg82KHrSfaeeOEq6jjuUjQ8wUnzM4Zz3dhrwSyslVz/WvnKqYkr4V/TTXPFF5EjF4rM1bHZ8bK63EfTnK41+n3n4gEFoYP4mXkNH0hntnYcdTqiE7Gn+q0BpRRxnkpBSZlA6Wa70jpW0FGqkw5e591A5/H+OV+60WAo+4Mi+NlsKrvLZ9EiVaPnoEFZlJQx1fA777AJ2MjXJ4KSsrWDWJi1lE8yPs8V6XvcC0chDTYt8456sKXAagCZyY+fzQriFMaddXyKQdG8qBqcdYjAsiIcjzaRFBBoOK9sU+sFY7N6B6+xtrlu3c37rQKkI3O2EoiJOris54EjJ5OFuumA0M6riNUuBf/MEPFBVx1JRcUEs+upEBsCnwYski7FT3TTqHrx7v5AjgFN97xhPTkmVpu6sxRnWBi1fxIRp8eWZeFM6mUcGgVk1WeVb1yhdV9hoMo2TsNEPE0tHo/wvuSJSzbZo7wibeXM9v/rRfKcx7X93rfiXVnyQ9f/5CaAQ4lxedPp/6uzLtOS4FyL0bCNeZ6L5w+AiuyWCTDFIYaUzhwfG+/YTQpWyeZCdQIKzhV+3GeXI2cxoP0ER/DlOKymf1gm+zRU3sqf1lBVQ0y+mK/Awl9bS3uaaQmI0FUyUwHUKP7PKuXnO+LcwDv4OfPT6hph8smc1EtMe5ib/apar/qZ9dyaEaElALJ1KKxnHziuvVl8atk1fINSQh7OtXDyqbPw9o/nGIpTnv5iFmwmWJLis2oyEgPkJqyx0vYI8rjkVEzKc8eQavAJBYSpjMwM193Swt+yJyjvaGYWPnqExxKiNarpB2WSO7soCAZXhS1uEYHryrK47BH6W1dRiruqT0xpLih3MXiwU3VDwAAAA==';

/**
 * Client for interacting with the SQLite database.
 */
export class SqliteClient {
  private db: Database | null = null;
  private isInTransaction: boolean = false;

  /**
   * Initialize the SQLite database from a base64 string
   */
  public async initializeFromBase64(base64String: string): Promise<void> {
    try {
      // Convert base64 to Uint8Array
      const binaryString = atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Initialize SQL.js with the WASM file from the local file system.
      const SQL = await initSqlJs({
        /**
         * Locates SQL.js files from the local file system.
         * @param file - The name of the file to locate
         * @returns The complete URL path to the file
         */
        locateFile: (file: string) => `src/${file}`
      });

      // Create database from the binary data
      this.db = new SQL.Database(bytes);
    } catch (error) {
      console.error('Error initializing SQLite database:', error);
      throw error;
    }
  }

  /**
   * Begin a new transaction
   */
  public beginTransaction(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (this.isInTransaction) {
      throw new Error('Transaction already in progress');
    }

    try {
      this.db.run('BEGIN TRANSACTION');
      this.isInTransaction = true;
    } catch (error) {
      console.error('Error beginning transaction:', error);
      throw error;
    }
  }

  /**
   * Commit the current transaction and persist changes to the vault
   */
  public async commitTransaction(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (!this.isInTransaction) {
      throw new Error('No transaction in progress');
    }

    try {
      this.db.run('COMMIT');
      this.isInTransaction = false;
    } catch (error) {
      console.error('Error committing transaction:', error);
      throw error;
    }
  }

  /**
   * Rollback the current transaction
   */
  public rollbackTransaction(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (!this.isInTransaction) {
      throw new Error('No transaction in progress');
    }

    try {
      this.db.run('ROLLBACK');
      this.isInTransaction = false;
    } catch (error) {
      console.error('Error rolling back transaction:', error);
      throw error;
    }
  }

  /**
   * Export the SQLite database to a base64 string
   * @returns Base64 encoded string of the database
   */
  public exportToBase64(): string {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Execute vacuum command to free up space before exporting (because of potential temp tables etc.)
      this.db.run('VACUUM');

      // Export database to Uint8Array
      const binaryArray = this.db.export();

      // Convert Uint8Array to base64 string
      let binaryString = '';
      for (let i = 0; i < binaryArray.length; i++) {
        binaryString += String.fromCharCode(binaryArray[i]);
      }
      return btoa(binaryString);
    } catch (error) {
      console.error('Error exporting SQLite database:', error);
      throw error;
    }
  }

  /**
   * Execute a SELECT query
   */
  public executeQuery<T>(query: string, params: (string | number | null | Uint8Array)[] = []): T[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(query);
      stmt.bind(params);

      const results: T[] = [];
      while (stmt.step()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results.push(stmt.getAsObject() as any);
      }
      stmt.free();

      return results;
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query
   */
  public executeUpdate(query: string, params: (string | number | null | Uint8Array)[] = []): number {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(query);
      stmt.bind(params);
      stmt.step();
      const changes = this.db.getRowsModified();
      stmt.free();
      return changes;
    } catch (error) {
      console.error('Error executing update:', error);
      throw error;
    }
  }

  /**
   * Close the database connection and free resources.
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Fetch a single credential with its associated service information.
   * @param credentialId - The ID of the credential to fetch.
   * @returns Credential object with service details or null if not found.
   */
  public getCredentialById(credentialId: string): Credential | null {
    // WIP: Quick V5 schema refactor - field-based queries
    const query = `
        SELECT DISTINCT
            i.Id,
            i.Name as ServiceName,
            l.FileData as Logo,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM Passkeys pk
                    WHERE pk.ItemId = i.Id AND pk.IsDeleted = 0
                ) THEN 1
                ELSE 0
            END as HasPasskey,
            (SELECT pk.RpId FROM Passkeys pk WHERE pk.ItemId = i.Id AND pk.IsDeleted = 0 LIMIT 1) as PasskeyRpId,
            (SELECT pk.DisplayName FROM Passkeys pk WHERE pk.ItemId = i.Id AND pk.IsDeleted = 0 LIMIT 1) as PasskeyDisplayName
        FROM Items i
        LEFT JOIN Logos l ON i.LogoId = l.Id
        WHERE i.IsDeleted = 0
        AND i.Id = ?`;

    const results = this.executeQuery(query, [credentialId]);

    if (results.length === 0) {
      return null;
    }

    // Get field values for this item (only system fields, which have FieldKey)
    const fieldQuery = `
        SELECT
          fv.FieldKey,
          fv.Value
        FROM FieldValues fv
        WHERE fv.ItemId = ? AND fv.IsDeleted = 0 AND fv.FieldKey IS NOT NULL`;

    const fieldResults = this.executeQuery<{FieldKey: string, Value: string}>(fieldQuery, [credentialId]);

    // Map field values by FieldKey
    const fields: {[key: string]: string} = {};
    fieldResults.forEach(f => {
      if (f.FieldKey) {
        fields[f.FieldKey] = f.Value;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = results[0] as any;
    return {
      Id: row.Id,
      Username: fields[FieldKey.LoginUsername] || undefined,
      Password: fields[FieldKey.LoginPassword] || '',
      ServiceName: row.ServiceName,
      ServiceUrl: fields[FieldKey.LoginUrl] || undefined,
      Logo: row.Logo,
      Notes: fields[FieldKey.LoginNotes] || undefined,
      HasPasskey: row.HasPasskey === 1,
      PasskeyRpId: row.PasskeyRpId,
      PasskeyDisplayName: row.PasskeyDisplayName,
      Alias: {
        FirstName: fields[FieldKey.AliasFirstName] || undefined,
        LastName: fields[FieldKey.AliasLastName] || undefined,
        NickName: fields[FieldKey.AliasNickname] || undefined,
        BirthDate: fields[FieldKey.AliasBirthdate] || '',
        Gender: fields[FieldKey.AliasGender] || undefined,
        Email: fields[FieldKey.AliasEmail] || undefined
      },
    };
  }

  /**
   * Fetch all credentials with their associated service information.
   * @returns Array of Credential objects with service details.
   */
  public getAllCredentials(): Credential[] {
    // WIP: Quick V5 schema refactor - field-based queries
    const query = `
            SELECT DISTINCT
                i.Id,
                i.Name as ServiceName,
                l.FileData as Logo,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM Passkeys pk
                        WHERE pk.ItemId = i.Id AND pk.IsDeleted = 0
                    ) THEN 1
                    ELSE 0
                END as HasPasskey,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM Attachments att
                        WHERE att.ItemId = i.Id AND att.IsDeleted = 0
                    ) THEN 1
                    ELSE 0
                END as HasAttachment
            FROM Items i
            LEFT JOIN Logos l ON i.LogoId = l.Id
            WHERE i.IsDeleted = 0
            ORDER BY i.CreatedAt DESC`;

    const results = this.executeQuery(query);

    // Get all field values in one query for performance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemIds = results.map((r: any) => r.Id);
    if (itemIds.length === 0) {
      return [];
    }

    const fieldQuery = `
        SELECT fv.ItemId, fv.FieldKey, fv.Value
        FROM FieldValues fv
        WHERE fv.ItemId IN (${itemIds.map(() => '?').join(',')})
          AND fv.IsDeleted = 0
          AND fv.FieldKey IS NOT NULL`;

    const fieldResults = this.executeQuery<{ItemId: string, FieldKey: string, Value: string}>(fieldQuery, itemIds);

    // Group fields by item ID
    const fieldsByItem: {[itemId: string]: {[fieldKey: string]: string}} = {};
    fieldResults.forEach(f => {
      if (!fieldsByItem[f.ItemId]) {
        fieldsByItem[f.ItemId] = {};
      }
      if (f.FieldKey) {
        fieldsByItem[f.ItemId][f.FieldKey] = f.Value;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((row: any) => {
      const fields = fieldsByItem[row.Id] || {};
      return {
        Id: row.Id,
        Username: fields[FieldKey.LoginUsername] || undefined,
        Password: fields[FieldKey.LoginPassword] || '',
        ServiceName: row.ServiceName,
        ServiceUrl: fields[FieldKey.LoginUrl] || undefined,
        Logo: row.Logo,
        Notes: fields[FieldKey.LoginNotes] || undefined,
        HasPasskey: row.HasPasskey === 1,
        HasAttachment: row.HasAttachment === 1,
        Alias: {
          FirstName: fields[FieldKey.AliasFirstName] || undefined,
          LastName: fields[FieldKey.AliasLastName] || undefined,
          NickName: fields[FieldKey.AliasNickname] || undefined,
          BirthDate: fields[FieldKey.AliasBirthdate] || '',
          Gender: fields[FieldKey.AliasGender] || undefined,
          Email: fields[FieldKey.AliasEmail] || undefined
        }
      };
    });
  }

  /**
   * Fetch all items with their dynamic fields and tags.
   * @returns Array of Item objects with field-based data.
   */
  public getAllItems(): Item[] {
    const query = `
      SELECT DISTINCT
        i.Id,
        i.Name,
        i.ItemType,
        i.FolderId,
        l.FileData as Logo,
        CASE WHEN EXISTS (SELECT 1 FROM Passkeys pk WHERE pk.ItemId = i.Id AND pk.IsDeleted = 0) THEN 1 ELSE 0 END as HasPasskey,
        CASE WHEN EXISTS (SELECT 1 FROM Attachments att WHERE att.ItemId = i.Id AND att.IsDeleted = 0) THEN 1 ELSE 0 END as HasAttachment,
        CASE WHEN EXISTS (SELECT 1 FROM TotpCodes tc WHERE tc.ItemId = i.Id AND tc.IsDeleted = 0) THEN 1 ELSE 0 END as HasTotp,
        i.CreatedAt,
        i.UpdatedAt
      FROM Items i
      LEFT JOIN Logos l ON i.LogoId = l.Id
      WHERE i.IsDeleted = 0
      ORDER BY i.CreatedAt DESC`;

    const items = this.executeQuery(query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemIds = items.map((i: any) => i.Id);
    if (itemIds.length === 0) {
      return [];
    }

    // Get all field values (both system fields and custom fields)
    const fieldsQuery = `
      SELECT
        fv.ItemId,
        fv.FieldKey,
        fv.FieldDefinitionId,
        fd.Label as CustomLabel,
        fd.FieldType as CustomFieldType,
        fd.IsHidden as CustomIsHidden,
        fv.Value,
        fv.Weight as DisplayOrder
      FROM FieldValues fv
      LEFT JOIN FieldDefinitions fd ON fv.FieldDefinitionId = fd.Id
      WHERE fv.ItemId IN (${itemIds.map(() => '?').join(',')})
        AND fv.IsDeleted = 0
      ORDER BY fv.ItemId, fv.Weight`;

    const fieldRows = this.executeQuery<{
      ItemId: string;
      FieldKey: string | null;
      FieldDefinitionId: string | null;
      CustomLabel: string | null;
      CustomFieldType: string | null;
      CustomIsHidden: number | null;
      Value: string;
      DisplayOrder: number;
    }>(fieldsQuery, itemIds);

    // Process fields - handle system fields vs custom fields
    const fields = fieldRows.map(row => {
      // System field: has FieldKey, get metadata from SystemFieldRegistry
      if (row.FieldKey) {
        const systemField = getSystemField(row.FieldKey);
        return {
          ItemId: row.ItemId,
          FieldKey: row.FieldKey,
          Label: systemField?.Label || row.FieldKey,
          FieldType: systemField?.FieldType || 'Text',
          IsHidden: systemField?.IsHidden ? 1 : 0,
          Value: row.Value,
          DisplayOrder: row.DisplayOrder
        };
      } else {
        // Custom field: has FieldDefinitionId, get metadata from FieldDefinitions
        return {
          ItemId: row.ItemId,
          FieldKey: row.FieldDefinitionId || '', // Use FieldDefinitionId as the key for custom fields
          Label: row.CustomLabel || '',
          FieldType: row.CustomFieldType || 'Text',
          IsHidden: row.CustomIsHidden || 0,
          Value: row.Value,
          DisplayOrder: row.DisplayOrder
        };
      }
    });

    // Get all tags
    const tagsQuery = `
      SELECT
        it.ItemId,
        t.Id,
        t.Name,
        t.Color
      FROM ItemTags it
      INNER JOIN Tags t ON it.TagId = t.Id
      WHERE it.ItemId IN (${itemIds.map(() => '?').join(',')})
        AND it.IsDeleted = 0
        AND t.IsDeleted = 0
      ORDER BY t.DisplayOrder, t.Name`;

    const tags = this.executeQuery<{
      ItemId: string;
      Id: string;
      Name: string;
      Color: string | null;
    }>(tagsQuery, itemIds);

    // Group by ItemId and FieldKey (to handle multi-value fields)
    const fieldsByItem: {[itemId: string]: ItemField[]} = {};
    const fieldValuesByKey: {[itemId_fieldKey: string]: string[]} = {};

    fields.forEach(f => {
      const key = `${f.ItemId}_${f.FieldKey}`;

      // Accumulate values for the same field
      if (!fieldValuesByKey[key]) {
        fieldValuesByKey[key] = [];
      }
      fieldValuesByKey[key].push(f.Value);

      // Create ItemField entry only once per unique FieldKey
      if (!fieldsByItem[f.ItemId]) {
        fieldsByItem[f.ItemId] = [];
      }

      const existingField = fieldsByItem[f.ItemId].find(field => field.FieldKey === f.FieldKey);
      if (!existingField) {
        fieldsByItem[f.ItemId].push({
          FieldKey: f.FieldKey,
          Label: f.Label,
          FieldType: f.FieldType as FieldType,
          Value: '', // Will be set below
          IsHidden: f.IsHidden === 1,
          DisplayOrder: f.DisplayOrder
        });
      }
    });

    // Set Values (single value or array for multi-value fields)
    Object.keys(fieldsByItem).forEach(itemId => {
      fieldsByItem[itemId].forEach(field => {
        const key = `${itemId}_${field.FieldKey}`;
        const values = fieldValuesByKey[key];

        if (values.length === 1) {
          field.Value = values[0];
        } else {
          field.Value = values;
        }
      });
    });

    const tagsByItem: {[itemId: string]: ItemTagRef[]} = {};
    tags.forEach(t => {
      if (!tagsByItem[t.ItemId]) {
        tagsByItem[t.ItemId] = [];
      }
      tagsByItem[t.ItemId].push({
        Id: t.Id,
        Name: t.Name,
        Color: t.Color || undefined
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.map((row: any) => ({
      Id: row.Id,
      Name: row.Name,
      ItemType: row.ItemType,
      Logo: row.Logo,
      FolderId: row.FolderId,
      FolderPath: null,
      Tags: tagsByItem[row.Id] || [],
      Fields: fieldsByItem[row.Id] || [],
      HasPasskey: row.HasPasskey === 1,
      HasAttachment: row.HasAttachment === 1,
      HasTotp: row.HasTotp === 1,
      CreatedAt: row.CreatedAt,
      UpdatedAt: row.UpdatedAt
    }));
  }

  /**
   * Fetch a single item by ID with its dynamic fields and tags.
   * @param itemId - The ID of the item to fetch.
   * @returns Item object or null if not found.
   */
  public getItemById(itemId: string): Item | null {
    const query = `
      SELECT
        i.Id,
        i.Name,
        i.ItemType,
        i.FolderId,
        l.FileData as Logo,
        CASE WHEN EXISTS (SELECT 1 FROM Passkeys pk WHERE pk.ItemId = i.Id AND pk.IsDeleted = 0) THEN 1 ELSE 0 END as HasPasskey,
        CASE WHEN EXISTS (SELECT 1 FROM Attachments att WHERE att.ItemId = i.Id AND att.IsDeleted = 0) THEN 1 ELSE 0 END as HasAttachment,
        CASE WHEN EXISTS (SELECT 1 FROM TotpCodes tc WHERE tc.ItemId = i.Id AND tc.IsDeleted = 0) THEN 1 ELSE 0 END as HasTotp,
        i.CreatedAt,
        i.UpdatedAt
      FROM Items i
      LEFT JOIN Logos l ON i.LogoId = l.Id
      WHERE i.Id = ? AND i.IsDeleted = 0`;

    const results = this.executeQuery(query, [itemId]);
    if (results.length === 0) {
      return null;
    }

    // Get field values (both system fields and custom fields)
    const fieldsQuery = `
      SELECT
        fv.FieldKey,
        fv.FieldDefinitionId,
        fd.Label as CustomLabel,
        fd.FieldType as CustomFieldType,
        fd.IsHidden as CustomIsHidden,
        fv.Value,
        fv.Weight as DisplayOrder
      FROM FieldValues fv
      LEFT JOIN FieldDefinitions fd ON fv.FieldDefinitionId = fd.Id
      WHERE fv.ItemId = ? AND fv.IsDeleted = 0
      ORDER BY fv.Weight`;

    const fieldRows = this.executeQuery<{
      FieldKey: string | null;
      FieldDefinitionId: string | null;
      CustomLabel: string | null;
      CustomFieldType: string | null;
      CustomIsHidden: number | null;
      Value: string;
      DisplayOrder: number;
    }>(fieldsQuery, [itemId]);

    // Process fields - handle system fields vs custom fields AND group multi-value fields
    const fieldValuesByKey: {[fieldKey: string]: string[]} = {};
    const uniqueFields: {[fieldKey: string]: {
      FieldKey: string;
      Label: string;
      FieldType: string;
      IsHidden: number;
      DisplayOrder: number;
    }} = {};

    fieldRows.forEach(row => {
      const fieldKey = row.FieldKey || row.FieldDefinitionId || '';

      // Accumulate values
      if (!fieldValuesByKey[fieldKey]) {
        fieldValuesByKey[fieldKey] = [];
      }
      fieldValuesByKey[fieldKey].push(row.Value);

      // Store field metadata (only once per FieldKey)
      if (!uniqueFields[fieldKey]) {
        if (row.FieldKey) {
          // System field
          const systemField = getSystemField(row.FieldKey);
          uniqueFields[fieldKey] = {
            FieldKey: row.FieldKey,
            Label: systemField?.Label || row.FieldKey,
            FieldType: systemField?.FieldType || 'Text',
            IsHidden: systemField?.IsHidden ? 1 : 0,
            DisplayOrder: row.DisplayOrder
          };
        } else {
          // Custom field
          uniqueFields[fieldKey] = {
            FieldKey: fieldKey,
            Label: row.CustomLabel || '',
            FieldType: row.CustomFieldType || 'Text',
            IsHidden: row.CustomIsHidden || 0,
            DisplayOrder: row.DisplayOrder
          };
        }
      }
    });

    // Build fields array with proper single/multi values
    const fields = Object.keys(uniqueFields).map(fieldKey => ({
      ...uniqueFields[fieldKey],
      Value: fieldValuesByKey[fieldKey].length === 1
        ? fieldValuesByKey[fieldKey][0]
        : fieldValuesByKey[fieldKey]
    }));

    // Get tags
    const tagsQuery = `
      SELECT
        t.Id,
        t.Name,
        t.Color
      FROM ItemTags it
      INNER JOIN Tags t ON it.TagId = t.Id
      WHERE it.ItemId = ? AND it.IsDeleted = 0 AND t.IsDeleted = 0
      ORDER BY t.DisplayOrder, t.Name`;

    const tags = this.executeQuery<{
      Id: string;
      Name: string;
      Color: string | null;
    }>(tagsQuery, [itemId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = results[0] as any;
    return {
      Id: row.Id,
      Name: row.Name,
      ItemType: row.ItemType,
      Logo: row.Logo,
      FolderId: row.FolderId,
      FolderPath: null,
      Tags: tags.map(t => ({
        Id: t.Id,
        Name: t.Name,
        Color: t.Color || undefined
      })),
      Fields: fields.map(f => ({
        FieldKey: f.FieldKey,
        Label: f.Label,
        FieldType: f.FieldType as FieldType,
        Value: f.Value,
        IsHidden: f.IsHidden === 1,
        DisplayOrder: f.DisplayOrder
      })),
      HasPasskey: row.HasPasskey === 1,
      HasAttachment: row.HasAttachment === 1,
      HasTotp: row.HasTotp === 1,
      CreatedAt: row.CreatedAt,
      UpdatedAt: row.UpdatedAt
    };
  }

  /**
   * Fetch all unique email addresses from all credentials.
   * @returns Array of email addresses.
   */
  public getAllEmailAddresses(): string[] {
    const query = `
      SELECT DISTINCT fv.Value as Email
      FROM FieldValues fv
      INNER JOIN Items i ON fv.ItemId = i.Id
      WHERE fv.FieldKey = ?
        AND fv.Value IS NOT NULL
        AND fv.Value != ''
        AND fv.IsDeleted = 0
        AND i.IsDeleted = 0
    `;

    const results = this.executeQuery(query, [FieldKey.AliasEmail]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((row: any) => row.Email);
  }

  /**
   * Fetch all encryption keys.
   */
  public getAllEncryptionKeys(): EncryptionKey[] {
    return this.executeQuery<EncryptionKey>(`SELECT
                x.PublicKey,
                x.PrivateKey,
                x.IsPrimary
            FROM EncryptionKeys x`);
  }

  /**
   * Get setting from database for a given key.
   * Returns default value (empty string by default) if setting is not found.
   */
  public getSetting(key: string, defaultValue: string = ''): string {
    const results = this.executeQuery<{ Value: string }>(`SELECT
                s.Value
            FROM Settings s
            WHERE s.Key = ?`, [key]);

    return results.length > 0 ? results[0].Value : defaultValue;
  }

  /**
   * Get the default email domain from the database.
   * @param privateEmailDomains - Array of private email domains
   * @param publicEmailDomains - Array of public email domains
   * @param hiddenPrivateEmailDomains - Array of hidden private email domains (optional)
   * @returns The default email domain or null if no valid domain is found
   */
  public async getDefaultEmailDomain(): Promise<string | null> {
    const publicEmailDomains = await storage.getItem('session:publicEmailDomains') as string[] ?? [];
    const privateEmailDomains = await storage.getItem('session:privateEmailDomains') as string[] ?? [];
    const hiddenPrivateEmailDomains = await storage.getItem('session:hiddenPrivateEmailDomains') as string[] ?? [];

    const defaultEmailDomain = this.getSetting('DefaultEmailDomain');

    /**
     * Check if a domain is valid (not disabled, not hidden, and exists in domain lists).
     */
    const isValidDomain = (domain: string): boolean => {
      return Boolean(domain &&
        domain !== 'DISABLED.TLD' &&
        domain !== '' &&
        !hiddenPrivateEmailDomains.includes(domain) &&
        (privateEmailDomains.includes(domain) || publicEmailDomains.includes(domain)));
    };

    // First check if the default domain that is configured in the vault is still valid.
    if (defaultEmailDomain && isValidDomain(defaultEmailDomain)) {
      return defaultEmailDomain;
    }

    // If default domain is not valid, fall back to first available private domain (excluding hidden ones).
    const firstPrivate = privateEmailDomains.find(isValidDomain);
    if (firstPrivate) {
      return firstPrivate;
    }

    // Return first valid public domain if no private domains are available.
    const firstPublic = publicEmailDomains.find(isValidDomain);
    if (firstPublic) {
      return firstPublic;
    }

    // Return null if no valid domains are found
    return null;
  }

  /**
   * Get the default identity language from the database.
   * Returns the stored override value if set, otherwise returns empty string to indicate no explicit preference.
   * Use getEffectiveIdentityLanguage() to get the language with smart defaults based on UI language.
   */
  public getDefaultIdentityLanguage(): string {
    return this.getSetting('DefaultIdentityLanguage');
  }

  /**
   * Get the effective identity generator language to use.
   * If user has explicitly set a language preference, use that.
   * Otherwise, intelligently match the UI language to an available identity generator language.
   * Falls back to "en" if no match is found.
   */
  public async getEffectiveIdentityLanguage(): Promise<string> {
    const explicitLanguage = this.getDefaultIdentityLanguage();

    // If user has explicitly set a language preference, use it
    if (explicitLanguage) {
      return explicitLanguage;
    }

    // Otherwise, try to match UI language to an identity generator language
    const { mapUiLanguageToIdentityLanguage } = await import('@/utils/dist/shared/identity-generator');
    const { default: i18n } = await import('@/i18n/i18n');

    const uiLanguage = i18n.language;
    const mappedLanguage = mapUiLanguageToIdentityLanguage(uiLanguage);

    // Return the mapped language, or fall back to "en" if no match found
    return mappedLanguage ?? 'en';
  }

  /**
   * Get the default identity gender preference from the database.
   */
  public getDefaultIdentityGender(): string {
    return this.getSetting('DefaultIdentityGender', 'random');
  }

  /**
   * Get the default identity age range from the database.
   */
  public getDefaultIdentityAgeRange(): string {
    return this.getSetting('DefaultIdentityAgeRange', 'random');
  }

  /**
   * Get the password settings from the database.
   */
  public getPasswordSettings(): PasswordSettings {
    const settingsJson = this.getSetting('PasswordGenerationSettings');

    // Default settings if none found or parsing fails
    const defaultSettings: PasswordSettings = {
      Length: 18,
      UseLowercase: true,
      UseUppercase: true,
      UseNumbers: true,
      UseSpecialChars: true,
      UseNonAmbiguousChars: false
    };

    try {
      if (settingsJson) {
        return { ...defaultSettings, ...JSON.parse(settingsJson) };
      }
    } catch (error) {
      console.warn('Failed to parse password settings:', error);
    }

    return defaultSettings;
  }

  /**
   * Create a new credential with associated entities
   * @param credential The credential object to insert
   * @param attachments The attachments to insert
   * @returns The ID of the created credential
   */
  public async createCredential(credential: Credential, attachments: Attachment[], totpCodes: TotpCode[] = []): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      // 1. Insert Service
      let logoData = null;
      try {
        if (credential.Logo) {
          // Handle object-like array conversion
          if (typeof credential.Logo === 'object' && !ArrayBuffer.isView(credential.Logo)) {
            const values = Object.values(credential.Logo);
            logoData = new Uint8Array(values);
          // Handle existing array types
          } else if (Array.isArray(credential.Logo) || credential.Logo instanceof ArrayBuffer || credential.Logo instanceof Uint8Array) {
            logoData = new Uint8Array(credential.Logo);
          }
        }
      } catch (error) {
        console.warn('Failed to convert logo to Uint8Array:', error);
        logoData = null;
      }

      const serviceQuery = `
                INSERT INTO Services (Id, Name, Url, Logo, CreatedAt, UpdatedAt, IsDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const serviceId = crypto.randomUUID().toUpperCase();
      const currentDateTime = dateFormatter.now();
      this.executeUpdate(serviceQuery, [
        serviceId,
        credential.ServiceName,
        credential.ServiceUrl ?? null,
        logoData,
        currentDateTime,
        currentDateTime,
        0
      ]);

      // 2. Insert Alias
      const aliasQuery = `
                INSERT INTO Aliases (Id, FirstName, LastName, NickName, BirthDate, Gender, Email, CreatedAt, UpdatedAt, IsDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const aliasId = crypto.randomUUID().toUpperCase();
      this.executeUpdate(aliasQuery, [
        aliasId,
        credential.Alias.FirstName ?? null,
        credential.Alias.LastName ?? null,
        credential.Alias.NickName ?? null,
        credential.Alias.BirthDate ?? null,
        credential.Alias.Gender ?? null,
        credential.Alias.Email ?? null,
        currentDateTime,
        currentDateTime,
        0
      ]);

      // 3. Insert Credential
      const credentialQuery = `
                INSERT INTO Credentials (Id, Username, Notes, ServiceId, AliasId, CreatedAt, UpdatedAt, IsDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const credentialId = crypto.randomUUID().toUpperCase();
      this.executeUpdate(credentialQuery, [
        credentialId,
        credential.Username ?? null,
        credential.Notes ?? null,
        serviceId,
        aliasId,
        currentDateTime,
        currentDateTime,
        0
      ]);

      // 4. Insert Password
      if (credential.Password) {
        const passwordQuery = `
                    INSERT INTO Passwords (Id, Value, CredentialId, CreatedAt, UpdatedAt, IsDeleted)
                    VALUES (?, ?, ?, ?, ?, ?)`;
        const passwordId = crypto.randomUUID().toUpperCase();
        this.executeUpdate(passwordQuery, [
          passwordId,
          credential.Password,
          credentialId,
          currentDateTime,
          currentDateTime,
          0
        ]);
      }

      // 5. Insert Attachment
      if (attachments) {
        for (const attachment of attachments) {
          const attachmentQuery = `
            INSERT INTO Attachments (Id, Filename, Blob, CredentialId, CreatedAt, UpdatedAt, IsDeleted)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;

          const attachmentId = crypto.randomUUID().toUpperCase();
          this.executeUpdate(attachmentQuery, [
            attachmentId,
            attachment.Filename,
            attachment.Blob as Uint8Array,
            credentialId,
            currentDateTime,
            currentDateTime,
            0
          ]);
        }
      }

      // 6. Insert TOTP codes
      if (totpCodes) {
        for (const totpCode of totpCodes) {
          // Skip deleted codes
          if (totpCode.IsDeleted) {
            continue;
          }

          const totpCodeQuery = `
            INSERT INTO TotpCodes (Id, Name, SecretKey, CredentialId, CreatedAt, UpdatedAt, IsDeleted)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;

          this.executeUpdate(totpCodeQuery, [
            totpCode.Id || crypto.randomUUID().toUpperCase(),
            totpCode.Name,
            totpCode.SecretKey,
            credentialId,
            currentDateTime,
            currentDateTime,
            0
          ]);
        }
      }

      await this.commitTransaction();
      return credentialId;

    } catch (error) {
      this.rollbackTransaction();
      console.error('Error creating credential:', error);
      throw error;
    }
  }

  /**
   * Get the current database version from the migrations history.
   * Returns the semantic version (e.g., "1.4.1") from the latest migration.
   * Uses semantic versioning to allow backwards-compatible minor/patch versions.
   */
  public async getDatabaseVersion(): Promise<VaultVersion> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Query the migrations history table for the latest migration
      const results = this.executeQuery<{ MigrationId: string }>(`
        SELECT MigrationId
        FROM __EFMigrationsHistory
        ORDER BY MigrationId DESC
        LIMIT 1`);

      if (results.length === 0) {
        throw new Error('No migrations found in the database.');
      }

      // Extract version from migration ID (e.g., "20240917191243_1.4.1-RenameAttachmentsPlural" -> "1.4.1")
      const migrationId = results[0].MigrationId;
      const databaseVersion = extractVersionFromMigrationId(migrationId);

      if (!databaseVersion) {
        throw new Error('Could not extract version from migration ID');
      }

      // Check version compatibility using semantic versioning
      const compatibilityResult = checkVersionCompatibility(databaseVersion);

      if (!compatibilityResult.isCompatible) {
        const errorMessage = await t('common.errors.browserExtensionOutdated');
        throw new VaultVersionIncompatibleError(errorMessage);
      }

      // If the version is known, return the full version info
      if (compatibilityResult.isKnownVersion && compatibilityResult.clientVersion) {
        return compatibilityResult.clientVersion;
      }

      /*
       * Version is unknown but compatible (same major version).
       * Create a VaultVersion object with the actual database version but use the latest client's revision number.
       * This allows older clients to work with newer backwards-compatible database versions.
       */
      const vaultSqlGenerator = new VaultSqlGenerator();
      const latestClientVersion = vaultSqlGenerator.getLatestVersion();

      // Return a version object with the actual database version string but the latest known revision
      return {
        revision: latestClientVersion.revision,
        version: databaseVersion, // Use the actual database version (e.g., "1.7.0")
        description: `Unknown version ${databaseVersion} (backwards compatible)`,
        releaseVersion: latestClientVersion.releaseVersion,
        compatibleUpToVersion: latestClientVersion.compatibleUpToVersion
      };
    } catch (error) {
      console.error('Error getting database version:', error);
      throw error;
    }
  }

  /**
   * Get the latest available database version
   * @returns The latest VaultVersion
   */
  public async getLatestDatabaseVersion(): Promise<VaultVersion> {
    const vaultSqlGenerator = new VaultSqlGenerator();
    const allVersions = vaultSqlGenerator.getAllVersions();
    return allVersions[allVersions.length - 1];
  }

  /**
   * Check if there are pending migrations
   * @returns True if there are pending migrations, false otherwise
   */
  public async hasPendingMigrations(): Promise<boolean> {
    try {
      const currentVersion = await this.getDatabaseVersion();
      const latestVersion = await this.getLatestDatabaseVersion();

      return currentVersion.revision < latestVersion.revision;
    } catch (error) {
      console.error('Error checking pending migrations:', error);
      throw error;
    }
  }

  /**
   * Get TOTP codes for a credential
   * @param credentialId - The ID of the credential to get TOTP codes for
   * @returns Array of TotpCode objects
   */
  public getTotpCodesForCredential(credentialId: string): TotpCode[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      /*
       * Check if TotpCodes table exists (for backward compatibility).
       * TODO: whenever the browser extension has a minimum client DB version of 1.5.0+,
       * we can remove this check as the TotpCodes table then is guaranteed to exist.
       */
      if (!this.tableExists('TotpCodes')) {
        return [];
      }

      const query = `
        SELECT
          Id,
          Name,
          SecretKey,
          CredentialId
        FROM TotpCodes
        WHERE CredentialId = ? AND IsDeleted = 0`;

      return this.executeQuery<TotpCode>(query, [credentialId]);
    } catch (error) {
      console.error('Error getting TOTP codes:', error);
      // Return empty array instead of throwing to be robust
      return [];
    }
  }

  /**
   * Get attachments for a specific credential
   * @param credentialId - The ID of the credential
   * @returns Array of attachments for the credential
   */
  public getAttachmentsForCredential(credentialId: string): Attachment[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      if (!this.tableExists('Attachments')) {
        return [];
      }

      const query = `
        SELECT
          Id,
          Filename,
          Blob,
          CredentialId,
          CreatedAt,
          UpdatedAt,
          IsDeleted
        FROM Attachments
        WHERE CredentialId = ? AND IsDeleted = 0`;
      return this.executeQuery<Attachment>(query, [credentialId]);
    } catch (error) {
      console.error('Error getting attachments:', error);
      return [];
    }
  }

  /**
   * Delete a credential by ID
   * @param credentialId - The ID of the credential to delete
   * @returns The number of rows deleted
   */
  public async deleteCredentialById(credentialId: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      // Update the credential, alias, and service to be deleted
      const query = `
        UPDATE Credentials
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE Id = ?`;

      const aliasQuery = `
        UPDATE Aliases
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE Id = (
          SELECT AliasId
          FROM Credentials
          WHERE Id = ?
        )`;

      const serviceQuery = `
        UPDATE Services
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE Id = (
          SELECT ServiceId
          FROM Credentials
          WHERE Id = ?
        )`;

      const passkeyQuery = `
        UPDATE Passkeys
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE CredentialId = ?`;

      const results = this.executeUpdate(query, [currentDateTime, credentialId]);
      this.executeUpdate(aliasQuery, [currentDateTime, credentialId]);
      this.executeUpdate(serviceQuery, [currentDateTime, credentialId]);
      this.executeUpdate(passkeyQuery, [currentDateTime, credentialId]);

      await this.commitTransaction();
      return results;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error deleting credential:', error);
      throw error;
    }
  }

  /**
   * Update an existing credential with associated entities
   * @param credential The credential object to update
   * @param originalAttachmentIds The IDs of the original attachments
   * @param attachments The attachments to update
   * @returns The number of rows modified
   */
  public async updateCredentialById(credential: Credential, originalAttachmentIds: string[], attachments: Attachment[], originalTotpCodeIds: string[] = [], totpCodes: TotpCode[] = []): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();
      const currentDateTime = dateFormatter.now();

      // Get existing credential to compare changes
      const existingCredential = this.getCredentialById(credential.Id);
      if (!existingCredential) {
        throw new Error('Credential not found');
      }

      // 1. Update Service
      const serviceQuery = `
        UPDATE Services
        SET Name = ?,
            Url = ?,
            Logo = COALESCE(?, Logo),
            UpdatedAt = ?
        WHERE Id = (
          SELECT ServiceId
          FROM Credentials
          WHERE Id = ?
        )`;

      let logoData = null;
      try {
        if (credential.Logo) {
          // Handle object-like array conversion
          if (typeof credential.Logo === 'object' && !ArrayBuffer.isView(credential.Logo)) {
            const values = Object.values(credential.Logo);
            logoData = new Uint8Array(values);
          // Handle existing array types
          } else if (Array.isArray(credential.Logo) || credential.Logo instanceof ArrayBuffer || credential.Logo instanceof Uint8Array) {
            logoData = new Uint8Array(credential.Logo);
          }
        }
      } catch (error) {
        console.warn('Failed to convert logo to Uint8Array:', error);
        logoData = null;
      }

      this.executeUpdate(serviceQuery, [
        credential.ServiceName,
        credential.ServiceUrl ?? null,
        logoData,
        currentDateTime,
        credential.Id
      ]);

      // 2. Update Alias
      const aliasQuery = `
        UPDATE Aliases
        SET FirstName = ?,
            LastName = ?,
            NickName = ?,
            BirthDate = ?,
            Gender = ?,
            Email = ?,
            UpdatedAt = ?
        WHERE Id = (
          SELECT AliasId
          FROM Credentials
          WHERE Id = ?
        )`;

      // Only update BirthDate if it's actually different (accounting for format differences)
      let birthDate = credential.Alias.BirthDate;
      if (birthDate && existingCredential.Alias.BirthDate) {
        const newDate = new Date(birthDate);
        const existingDate = new Date(existingCredential.Alias.BirthDate);
        if (newDate.getTime() === existingDate.getTime()) {
          birthDate = existingCredential.Alias.BirthDate;
        }
      }

      this.executeUpdate(aliasQuery, [
        credential.Alias.FirstName ?? null,
        credential.Alias.LastName ?? null,
        credential.Alias.NickName ?? null,
        birthDate ?? null,
        credential.Alias.Gender ?? null,
        credential.Alias.Email ?? null,
        currentDateTime,
        credential.Id
      ]);

      // 3. Update Credential
      const credentialQuery = `
        UPDATE Credentials
        SET Username = ?,
            Notes = ?,
            UpdatedAt = ?
        WHERE Id = ?`;

      this.executeUpdate(credentialQuery, [
        credential.Username ?? null,
        credential.Notes ?? null,
        currentDateTime,
        credential.Id
      ]);

      // 4. Update Password if changed
      if (credential.Password !== existingCredential.Password) {
        // Check if a password record already exists for this credential, if not, then create one.
        const passwordRecordExistsQuery = `
          SELECT Id
          FROM Passwords
          WHERE CredentialId = ?`;
        const passwordResults = this.executeQuery(passwordRecordExistsQuery, [credential.Id]);

        if (passwordResults.length === 0) {
          // Create a new password record
          const passwordQuery = `
            INSERT INTO Passwords (Id, Value, CredentialId, CreatedAt, UpdatedAt, IsDeleted)
            VALUES (?, ?, ?, ?, ?, ?)`;

          this.executeUpdate(passwordQuery, [
            crypto.randomUUID().toUpperCase(),
            credential.Password,
            credential.Id,
            currentDateTime,
            currentDateTime,
            0
          ]);
        } else {
          // Update the existing password record
          const passwordQuery = `
            UPDATE Passwords
            SET Value = ?, UpdatedAt = ?
            WHERE CredentialId = ?`;

          this.executeUpdate(passwordQuery, [
            credential.Password,
            currentDateTime,
            credential.Id
          ]);
        }
      }

      // 5. Handle Attachments
      if (attachments) {
        // Get current attachment IDs to track what needs to be deleted
        const currentAttachmentIds = attachments.map(a => a.Id);

        // Delete attachments that were removed (in originalAttachmentIds but not in current attachments)
        const attachmentsToDelete = originalAttachmentIds.filter(id => !currentAttachmentIds.includes(id));
        for (const attachmentId of attachmentsToDelete) {
          const deleteQuery = `
            UPDATE Attachments
            SET IsDeleted = 1,
                UpdatedAt = ?
            WHERE Id = ?`;
          this.executeUpdate(deleteQuery, [currentDateTime, attachmentId]);
        }

        // Process each attachment
        for (const attachment of attachments) {
          const isExistingAttachment = originalAttachmentIds.includes(attachment.Id);

          if (!isExistingAttachment) {
            // Insert new attachment
            const insertQuery = `
              INSERT INTO Attachments (Id, Filename, Blob, CredentialId, CreatedAt, UpdatedAt, IsDeleted)
              VALUES (?, ?, ?, ?, ?, ?, ?)`;
            this.executeUpdate(insertQuery, [
              attachment.Id,
              attachment.Filename,
              attachment.Blob as Uint8Array,
              credential.Id,
              currentDateTime,
              currentDateTime,
              0
            ]);
          }
        }
      }

      // 6. Handle TOTP codes
      if (totpCodes) {
        // Get current TOTP code IDs (excluding deleted ones)
        const currentTotpCodeIds = totpCodes
          .filter(tc => !tc.IsDeleted)
          .map(tc => tc.Id);

        // Mark TOTP codes as deleted that were removed
        const totpCodesToDelete = originalTotpCodeIds.filter(id => !currentTotpCodeIds.includes(id));
        for (const totpCodeId of totpCodesToDelete) {
          const deleteQuery = `
            UPDATE TotpCodes
            SET IsDeleted = 1,
                UpdatedAt = ?
            WHERE Id = ?`;
          this.executeUpdate(deleteQuery, [currentDateTime, totpCodeId]);
        }

        // Handle TOTP codes marked for deletion in the array
        const markedForDeletion = totpCodes.filter(tc => tc.IsDeleted && originalTotpCodeIds.includes(tc.Id));
        for (const totpCode of markedForDeletion) {
          const deleteQuery = `
            UPDATE TotpCodes
            SET IsDeleted = 1,
                UpdatedAt = ?
            WHERE Id = ?`;
          this.executeUpdate(deleteQuery, [currentDateTime, totpCode.Id]);
        }

        // Process each TOTP code
        for (const totpCode of totpCodes) {
          // Skip deleted codes
          if (totpCode.IsDeleted) {
            continue;
          }

          const isExistingTotpCode = originalTotpCodeIds.includes(totpCode.Id);

          if (!isExistingTotpCode) {
            // Insert new TOTP code
            const insertQuery = `
              INSERT INTO TotpCodes (Id, Name, SecretKey, CredentialId, CreatedAt, UpdatedAt, IsDeleted)
              VALUES (?, ?, ?, ?, ?, ?, ?)`;
            this.executeUpdate(insertQuery, [
              totpCode.Id || crypto.randomUUID().toUpperCase(),
              totpCode.Name,
              totpCode.SecretKey,
              credential.Id,
              currentDateTime,
              currentDateTime,
              0
            ]);
          } else {
            // Update existing TOTP code
            const updateQuery = `
              UPDATE TotpCodes
              SET Name = ?,
                  SecretKey = ?,
                  UpdatedAt = ?
              WHERE Id = ?`;
            this.executeUpdate(updateQuery, [
              totpCode.Name,
              totpCode.SecretKey,
              currentDateTime,
              totpCode.Id
            ]);
          }
        }
      }

      await this.commitTransaction();
      return 1;

    } catch (error) {
      this.rollbackTransaction();
      console.error('Error updating credential:', error);
      throw error;
    }
  }

  /**
   * Convert binary data to a base64 encoded image source.
   */
  public static imgSrcFromBytes(bytes: Uint8Array<ArrayBufferLike> | number[] | undefined): string {
    // Handle base64 image data
    if (bytes) {
      try {
        const logoBytes = this.toUint8Array(bytes);
        const base64Logo = this.base64Encode(logoBytes);
        // Detect image type from first few bytes
        const mimeType = this.detectMimeType(logoBytes);
        return `data:${mimeType};base64,${base64Logo}`;
      } catch (error) {
        console.error('Error setting logo:', error);
        return `data:image/x-icon;base64,${placeholderBase64}`;
      }
    } else {
      return `data:image/x-icon;base64,${placeholderBase64}`;
    }
  }

  /**
   * Detect MIME type from file signature (magic numbers)
   */
  private static detectMimeType(bytes: Uint8Array): string {
    /**
     * Check if the file is an SVG file.
     */
    const isSvg = () : boolean => {
      const header = new TextDecoder().decode(bytes.slice(0, 5)).toLowerCase();
      return header.includes('<?xml') || header.includes('<svg');
    };

    /**
     * Check if the file is an ICO file.
     */
    const isIco = () : boolean => {
      return bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00;
    };

    /**
     * Check if the file is an PNG file.
     */
    const isPng = () : boolean => {
      return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    };

    if (isSvg()) {
      return 'image/svg+xml';
    }
    if (isIco()) {
      return 'image/x-icon';
    }
    if (isPng()) {
      return 'image/png';
    }

    return 'image/x-icon';
  }

  /**
   * Convert various binary data formats to Uint8Array
   */
  private static toUint8Array(buffer: Uint8Array | number[] | {[key: number]: number}): Uint8Array {
    if (buffer instanceof Uint8Array) {
      return buffer;
    }

    if (Array.isArray(buffer)) {
      return new Uint8Array(buffer);
    }

    const length = Object.keys(buffer).length;
    const arr = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = buffer[i];
    }

    return arr;
  }

  /**
   * Base64 encode binary data.
   */
  private static base64Encode(buffer: Uint8Array | number[] | {[key: number]: number}): string | null {
    try {
      const arr = Array.from(this.toUint8Array(buffer));
      return btoa(arr.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    } catch (error) {
      console.error('Error encoding to base64:', error);
      return null;
    }
  }

  /**
   * Check if a table exists in the database
   * @param tableName - The name of the table to check
   * @returns True if the table exists, false otherwise
   */
  private tableExists(tableName: string): boolean {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const query = `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?`;

      const results = this.executeQuery(query, [tableName]);
      return results.length > 0;
    } catch (error) {
      console.error(`Error checking if table ${tableName} exists:`, error);
      return false;
    }
  }

  /**
   * Execute raw SQL command
   * @param query - The SQL command to execute
   */
  public executeRaw(query: string): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Split the query by semicolons to handle multiple statements
      const statements = query.split(';');

      for (const statement of statements) {
        const trimmedStatement = statement.trim();

        // Skip empty statements and transaction control statements (handled externally)
        if (trimmedStatement.length === 0 ||
            trimmedStatement.toUpperCase().startsWith('BEGIN TRANSACTION') ||
            trimmedStatement.toUpperCase().startsWith('COMMIT') ||
            trimmedStatement.toUpperCase().startsWith('ROLLBACK')) {
          continue;
        }

        this.db.run(trimmedStatement);
      }
    } catch (error) {
      console.error('Error executing raw SQL:', error);
      throw error;
    }
  }

  /**
   * Get all passkeys for a specific relying party (rpId)
   * @param rpId - The relying party identifier (domain)
   * @returns Array of passkey objects with credential info
   */
  public getPasskeysByRpId(rpId: string): Array<Passkey & { Username?: string | null; ServiceName?: string | null }> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const query = `
      SELECT
        p.Id,
        p.CredentialId,
        p.RpId,
        p.UserHandle,
        p.PublicKey,
        p.PrivateKey,
        p.DisplayName,
        p.PrfKey,
        p.AdditionalData,
        p.CreatedAt,
        p.UpdatedAt,
        p.IsDeleted,
        c.Username,
        s.Name as ServiceName
      FROM Passkeys p
      LEFT JOIN Credentials c ON p.CredentialId = c.Id
      LEFT JOIN Services s ON c.ServiceId = s.Id
      WHERE p.RpId = ? AND p.IsDeleted = 0
      ORDER BY p.CreatedAt DESC
    `;

    const results = this.executeQuery(query, [rpId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((row: any) => ({
      Id: row.Id,
      CredentialId: row.CredentialId,
      RpId: row.RpId,
      UserHandle: row.UserHandle,
      PublicKey: row.PublicKey,
      PrivateKey: row.PrivateKey,
      DisplayName: row.DisplayName,
      PrfKey: row.PrfKey,
      AdditionalData: row.AdditionalData,
      CreatedAt: row.CreatedAt,
      UpdatedAt: row.UpdatedAt,
      IsDeleted: row.IsDeleted,
      Username: row.Username,
      ServiceName: row.ServiceName
    }));
  }

  /**
   * Get a passkey by its ID
   * @param passkeyId - The passkey ID
   * @returns The passkey object or null if not found
   */
  public getPasskeyById(passkeyId: string): (Passkey & { Username?: string | null; ServiceName?: string | null }) | null {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const query = `
      SELECT
        p.Id,
        p.CredentialId,
        p.RpId,
        p.UserHandle,
        p.PublicKey,
        p.PrivateKey,
        p.DisplayName,
        p.PrfKey,
        p.AdditionalData,
        p.CreatedAt,
        p.UpdatedAt,
        p.IsDeleted,
        c.Username,
        s.Name as ServiceName
      FROM Passkeys p
      LEFT JOIN Credentials c ON p.CredentialId = c.Id
      LEFT JOIN Services s ON c.ServiceId = s.Id
      WHERE p.Id = ? AND p.IsDeleted = 0
    `;

    const results = this.executeQuery(query, [passkeyId]);

    if (results.length === 0) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = results[0];
    return {
      Id: row.Id,
      CredentialId: row.CredentialId,
      RpId: row.RpId,
      UserHandle: row.UserHandle,
      PublicKey: row.PublicKey,
      PrivateKey: row.PrivateKey,
      DisplayName: row.DisplayName,
      PrfKey: row.PrfKey,
      AdditionalData: row.AdditionalData,
      CreatedAt: row.CreatedAt,
      UpdatedAt: row.UpdatedAt,
      IsDeleted: row.IsDeleted,
      Username: row.Username,
      ServiceName: row.ServiceName
    };
  }

  /**
   * Get all passkeys for a specific credential
   * @param credentialId - The credential ID
   * @returns Array of passkey objects
   */
  public getPasskeysByCredentialId(credentialId: string): Passkey[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const query = `
      SELECT
        p.Id,
        p.CredentialId,
        p.RpId,
        p.UserHandle,
        p.PublicKey,
        p.PrivateKey,
        p.DisplayName,
        p.PrfKey,
        p.AdditionalData,
        p.CreatedAt,
        p.UpdatedAt,
        p.IsDeleted
      FROM Passkeys p
      WHERE p.CredentialId = ? AND p.IsDeleted = 0
      ORDER BY p.CreatedAt DESC
    `;

    const results = this.executeQuery(query, [credentialId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((row: any) => ({
      Id: row.Id,
      CredentialId: row.CredentialId,
      RpId: row.RpId,
      UserHandle: row.UserHandle,
      PublicKey: row.PublicKey,
      PrivateKey: row.PrivateKey,
      DisplayName: row.DisplayName,
      PrfKey: row.PrfKey,
      AdditionalData: row.AdditionalData,
      CreatedAt: row.CreatedAt,
      UpdatedAt: row.UpdatedAt,
      IsDeleted: row.IsDeleted
    }));
  }

  /**
   * Create a new passkey linked to a credential
   * @param passkey - The passkey object to create
   */
  public async createPasskey(passkey: Omit<Passkey, 'CreatedAt' | 'UpdatedAt' | 'IsDeleted'>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      const query = `
        INSERT INTO Passkeys (
          Id, CredentialId, RpId, UserHandle, PublicKey, PrivateKey,
          PrfKey, DisplayName, AdditionalData, CreatedAt, UpdatedAt, IsDeleted
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Convert PrfKey to Uint8Array if it's a number array
      let prfKeyData: Uint8Array | null = null;
      if (passkey.PrfKey) {
        prfKeyData = passkey.PrfKey instanceof Uint8Array ? passkey.PrfKey : new Uint8Array(passkey.PrfKey);
      }

      // Convert UserHandle to Uint8Array if it's a number array
      let userHandleData: Uint8Array | null = null;
      if (passkey.UserHandle) {
        userHandleData = passkey.UserHandle instanceof Uint8Array ? passkey.UserHandle : new Uint8Array(passkey.UserHandle);
      }

      this.executeUpdate(query, [
        passkey.Id,
        passkey.CredentialId,
        passkey.RpId,
        userHandleData,
        passkey.PublicKey,
        passkey.PrivateKey,
        prfKeyData,
        passkey.DisplayName,
        passkey.AdditionalData ?? null,
        currentDateTime,
        currentDateTime,
        0
      ]);

      await this.commitTransaction();
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error creating passkey:', error);
      throw error;
    }
  }

  /**
   * Delete a passkey by its ID (soft delete)
   * @param passkeyId - The ID of the passkey to delete
   * @returns The number of rows updated
   */
  public async deletePasskeyById(passkeyId: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      const query = `
        UPDATE Passkeys
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE Id = ?
      `;

      const result = this.executeUpdate(query, [currentDateTime, passkeyId]);

      await this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error deleting passkey:', error);
      throw error;
    }
  }

  /**
   * Delete all passkeys for a specific credential (soft delete)
   * @param credentialId - The ID of the credential
   * @returns The number of rows updated
   */
  public async deletePasskeysByCredentialId(credentialId: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      const query = `
        UPDATE Passkeys
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE CredentialId = ?
      `;

      const result = this.executeUpdate(query, [currentDateTime, credentialId]);

      await this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error deleting passkeys for credential:', error);
      throw error;
    }
  }

  /**
   * Update a passkey's display name
   * @param passkeyId - The ID of the passkey to update
   * @param displayName - The new display name
   * @returns The number of rows updated
   */
  public async updatePasskeyDisplayName(passkeyId: string, displayName: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      const query = `
        UPDATE Passkeys
        SET DisplayName = ?,
            UpdatedAt = ?
        WHERE Id = ?
      `;

      const result = this.executeUpdate(query, [displayName, currentDateTime, passkeyId]);

      await this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error updating passkey display name:', error);
      throw error;
    }
  }

  /**
   * Create a new item with field-based structure
   * @param item The item object to insert
   * @returns The ID of the created item
   */
  public async createItem(item: Item): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();
      const itemId = item.Id || crypto.randomUUID().toUpperCase();

      // 1. Insert Item
      const itemQuery = `
        INSERT INTO Items (Id, Name, ItemType, LogoId, FolderId, CreatedAt, UpdatedAt, IsDeleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

      this.executeUpdate(itemQuery, [
        itemId,
        item.Name ?? null,
        item.ItemType,
        null, // LogoId - handle logo separately if needed
        item.FolderId ?? null,
        currentDateTime,
        currentDateTime,
        0
      ]);

      // 2. Insert FieldValues for all fields
      if (item.Fields && item.Fields.length > 0) {
        for (const field of item.Fields) {
          // Skip empty fields
          if (!field.Value || (typeof field.Value === 'string' && field.Value.trim() === '')) {
            continue;
          }

          const isCustomField = field.FieldKey.startsWith('custom_');
          let fieldDefinitionId = null;

          // For custom fields, create or get FieldDefinition
          if (isCustomField) {
            // Check if FieldDefinition already exists for this custom field
            const existingDefQuery = `
              SELECT Id FROM FieldDefinitions
              WHERE Id = ?`;

            const existingDef = this.executeQuery<{ Id: string }>(existingDefQuery, [field.FieldKey]);

            if (existingDef.length === 0) {
              // Create new FieldDefinition for custom field
              const fieldDefQuery = `
                INSERT INTO FieldDefinitions (Id, FieldType, Label, IsMultiValue, IsHidden, EnableHistory, Weight, ApplicableToTypes, CreatedAt, UpdatedAt, IsDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

              this.executeUpdate(fieldDefQuery, [
                field.FieldKey, // Use the custom_ ID as the FieldDefinition ID
                field.FieldType,
                field.Label,
                0, // IsMultiValue
                field.IsHidden ? 1 : 0,
                0, // EnableHistory
                field.DisplayOrder ?? 0,
                item.ItemType, // ApplicableToTypes (single type for now)
                currentDateTime,
                currentDateTime,
                0
              ]);
            }

            fieldDefinitionId = field.FieldKey; // FieldDefinitionId = custom field ID
          }

          // Handle multi-value fields by creating separate FieldValue records
          const values = Array.isArray(field.Value) ? field.Value : [field.Value];

          for (let i = 0; i < values.length; i++) {
            const value = values[i];

            // Skip empty values
            if (!value || (typeof value === 'string' && value.trim() === '')) {
              continue;
            }

            const fieldValueId = crypto.randomUUID().toUpperCase();
            const fieldQuery = `
              INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, FieldKey, Value, Weight, CreatedAt, UpdatedAt, IsDeleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            this.executeUpdate(fieldQuery, [
              fieldValueId,
              itemId,
              fieldDefinitionId, // NULL for system fields, custom field ID for custom fields
              isCustomField ? null : field.FieldKey, // FieldKey set for system fields only
              value, // Store each value separately, not as JSON
              field.DisplayOrder ?? 0,
              currentDateTime,
              currentDateTime,
              0
            ]);
          }
        }
      }

      await this.commitTransaction();
      return itemId;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error creating item:', error);
      throw error;
    }
  }

  /**
   * Update an existing item with field-based structure
   * @param item The item object to update
   * @returns The number of rows modified
   */
  public async updateItem(item: Item): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      // 1. Update Item
      const itemQuery = `
        UPDATE Items
        SET Name = ?,
            ItemType = ?,
            FolderId = ?,
            UpdatedAt = ?
        WHERE Id = ?`;

      this.executeUpdate(itemQuery, [
        item.Name ?? null,
        item.ItemType,
        item.FolderId ?? null,
        currentDateTime,
        item.Id
      ]);

      // 2. Delete all existing FieldValues for this item
      const deleteFieldsQuery = `
        UPDATE FieldValues
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE ItemId = ?`;

      this.executeUpdate(deleteFieldsQuery, [currentDateTime, item.Id]);

      // 3. Insert new FieldValues
      if (item.Fields && item.Fields.length > 0) {
        for (const field of item.Fields) {
          // Skip empty fields
          if (!field.Value || (typeof field.Value === 'string' && field.Value.trim() === '')) {
            continue;
          }

          const isCustomField = field.FieldKey.startsWith('custom_');
          let fieldDefinitionId = null;

          // For custom fields, create or update FieldDefinition
          if (isCustomField) {
            // Check if FieldDefinition already exists
            const existingDefQuery = `
              SELECT Id FROM FieldDefinitions
              WHERE Id = ? AND IsDeleted = 0`;

            const existingDef = this.executeQuery<{ Id: string }>(existingDefQuery, [field.FieldKey]);

            if (existingDef.length === 0) {
              // Create new FieldDefinition
              const fieldDefQuery = `
                INSERT INTO FieldDefinitions (Id, FieldType, Label, IsMultiValue, IsHidden, EnableHistory, Weight, ApplicableToTypes, CreatedAt, UpdatedAt, IsDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

              this.executeUpdate(fieldDefQuery, [
                field.FieldKey,
                field.FieldType,
                field.Label,
                0, // IsMultiValue
                field.IsHidden ? 1 : 0,
                0, // EnableHistory
                field.DisplayOrder ?? 0,
                item.ItemType,
                currentDateTime,
                currentDateTime,
                0
              ]);
            } else {
              // Update existing FieldDefinition (label might have changed)
              const updateDefQuery = `
                UPDATE FieldDefinitions
                SET Label = ?,
                    FieldType = ?,
                    IsHidden = ?,
                    Weight = ?,
                    UpdatedAt = ?
                WHERE Id = ?`;

              this.executeUpdate(updateDefQuery, [
                field.Label,
                field.FieldType,
                field.IsHidden ? 1 : 0,
                field.DisplayOrder ?? 0,
                currentDateTime,
                field.FieldKey
              ]);
            }

            fieldDefinitionId = field.FieldKey;
          }

          // Handle multi-value fields by creating separate FieldValue records
          const values = Array.isArray(field.Value) ? field.Value : [field.Value];

          for (let i = 0; i < values.length; i++) {
            const value = values[i];

            // Skip empty values
            if (!value || (typeof value === 'string' && value.trim() === '')) {
              continue;
            }

            const fieldValueId = crypto.randomUUID().toUpperCase();
            const fieldQuery = `
              INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, FieldKey, Value, Weight, CreatedAt, UpdatedAt, IsDeleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            this.executeUpdate(fieldQuery, [
              fieldValueId,
              item.Id,
              fieldDefinitionId, // NULL for system fields, custom field ID for custom fields
              isCustomField ? null : field.FieldKey, // FieldKey set for system fields only
              value, // Store each value separately, not as JSON
              field.DisplayOrder ?? 0,
              currentDateTime,
              currentDateTime,
              0
            ]);
          }
        }
      }

      await this.commitTransaction();
      return 1;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error updating item:', error);
      throw error;
    }
  }

  /**
   * Delete an item by ID (soft delete)
   * @param itemId - The ID of the item to delete
   * @returns The number of rows updated
   */
  public async deleteItemById(itemId: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.beginTransaction();

      const currentDateTime = dateFormatter.now();

      // 1. Soft delete the item
      const itemQuery = `
        UPDATE Items
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE Id = ?`;

      const result = this.executeUpdate(itemQuery, [currentDateTime, itemId]);

      // 2. Soft delete all associated FieldValues
      const fieldsQuery = `
        UPDATE FieldValues
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE ItemId = ?`;

      this.executeUpdate(fieldsQuery, [currentDateTime, itemId]);

      // 3. Soft delete associated Passkeys
      const passkeysQuery = `
        UPDATE Passkeys
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE ItemId = ?`;

      this.executeUpdate(passkeysQuery, [currentDateTime, itemId]);

      // 4. Soft delete associated TotpCodes
      const totpQuery = `
        UPDATE TotpCodes
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE ItemId = ?`;

      this.executeUpdate(totpQuery, [currentDateTime, itemId]);

      // 5. Soft delete associated Attachments
      const attachmentsQuery = `
        UPDATE Attachments
        SET IsDeleted = 1,
            UpdatedAt = ?
        WHERE ItemId = ?`;

      this.executeUpdate(attachmentsQuery, [currentDateTime, itemId]);

      await this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      console.error('Error deleting item:', error);
      throw error;
    }
  }
}

export default SqliteClient;