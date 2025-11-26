BEGIN TRANSACTION;
ALTER TABLE "TotpCodes" RENAME COLUMN "CredentialId" TO "ItemId";

DROP INDEX IF EXISTS "IX_TotpCodes_CredentialId";

CREATE INDEX IF NOT EXISTS "IX_TotpCodes_ItemId" ON "TotpCodes" ("ItemId");

ALTER TABLE "Passkeys" RENAME COLUMN "CredentialId" TO "ItemId";

DROP INDEX IF EXISTS "IX_Passkeys_CredentialId";

CREATE INDEX IF NOT EXISTS "IX_Passkeys_ItemId" ON "Passkeys" ("ItemId");

ALTER TABLE "Attachments" RENAME COLUMN "CredentialId" TO "ItemId";

DROP INDEX IF EXISTS "IX_Attachments_CredentialId";

CREATE INDEX IF NOT EXISTS "IX_Attachments_ItemId" ON "Attachments" ("ItemId");

CREATE TABLE "FieldDefinitions" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldDefinitions" PRIMARY KEY,
    "FieldKey" TEXT NULL,
    "EntityType" TEXT NULL,
    "FieldType" TEXT NOT NULL,
    "Label" TEXT NOT NULL,
    "IsMultiValue" INTEGER NOT NULL,
    "DefaultVisibility" TEXT NULL,
    "EnableHistory" INTEGER NOT NULL,
    "DisplayOrder" INTEGER NOT NULL,
    "ApplicableToTypes" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL
);

CREATE TABLE "Folders" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Folders" PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "ParentFolderId" TEXT NULL,
    "DisplayOrder" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_Folders_Folders_ParentFolderId" FOREIGN KEY ("ParentFolderId") REFERENCES "Folders" ("Id") ON DELETE CASCADE
);

CREATE TABLE "Logos" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Logos" PRIMARY KEY,
    "Source" TEXT NOT NULL,
    "FileData" BLOB NULL,
    "MimeType" TEXT NULL,
    "FetchedAt" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL
);

CREATE TABLE "Items" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Items" PRIMARY KEY,
    "Name" TEXT NULL,
    "ItemType" TEXT NOT NULL,
    "LogoId" TEXT NULL,
    "FolderId" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_Items_Folders_FolderId" FOREIGN KEY ("FolderId") REFERENCES "Folders" ("Id") ON DELETE SET NULL,
    CONSTRAINT "FK_Items_Logos_LogoId" FOREIGN KEY ("LogoId") REFERENCES "Logos" ("Id") ON DELETE SET NULL
);

CREATE TABLE "FieldHistories" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldHistories" PRIMARY KEY,
    "ItemId" TEXT NOT NULL,
    "FieldDefinitionId" TEXT NOT NULL,
    "ValueSnapshot" TEXT NOT NULL,
    "ChangedAt" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_FieldHistories_FieldDefinitions_FieldDefinitionId" FOREIGN KEY ("FieldDefinitionId") REFERENCES "FieldDefinitions" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_FieldHistories_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

CREATE TABLE "FieldValues" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldValues" PRIMARY KEY,
    "ItemId" TEXT NOT NULL,
    "FieldDefinitionId" TEXT NOT NULL,
    "Value" TEXT NULL,
    "ValueIndex" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_FieldValues_FieldDefinitions_FieldDefinitionId" FOREIGN KEY ("FieldDefinitionId") REFERENCES "FieldDefinitions" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_FieldValues_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_FieldDefinitions_FieldKey" ON "FieldDefinitions" ("FieldKey");

CREATE INDEX "IX_FieldHistories_FieldDefinitionId" ON "FieldHistories" ("FieldDefinitionId");

CREATE INDEX "IX_FieldHistories_ItemId" ON "FieldHistories" ("ItemId");

CREATE INDEX "IX_FieldValues_FieldDefinitionId" ON "FieldValues" ("FieldDefinitionId");

CREATE INDEX "IX_FieldValues_ItemId" ON "FieldValues" ("ItemId");

CREATE INDEX "IX_FieldValues_ItemId_FieldDefinitionId_ValueIndex" ON "FieldValues" ("ItemId", "FieldDefinitionId", "ValueIndex");

CREATE INDEX "IX_Folders_ParentFolderId" ON "Folders" ("ParentFolderId");

CREATE INDEX "IX_Items_FolderId" ON "Items" ("FolderId");

CREATE INDEX "IX_Items_LogoId" ON "Items" ("LogoId");

CREATE UNIQUE INDEX "IX_Logos_Source" ON "Logos" ("Source");


                -- Login fields
                INSERT INTO FieldDefinitions (Id, FieldKey, EntityType, FieldType, Label, IsMultiValue, DefaultVisibility, EnableHistory, DisplayOrder, ApplicableToTypes, CreatedAt, UpdatedAt, IsDeleted)
                VALUES
                  (lower(hex(randomblob(16))), 'login.username', 'Item', 'Text', 'Username', 0, 'Visible', 1, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'login.password', 'Item', 'Password', 'Password', 0, 'Hidden', 1, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'login.notes', 'Item', 'Text', 'Notes', 0, 'Collapsed', 0, 0, NULL, datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'login.url', 'Item', 'URL', 'Website URLs', 1, 'Visible', 0, 0, '["Login","ApiKey"]', datetime('now'), datetime('now'), 0);

                -- Alias fields
                INSERT INTO FieldDefinitions (Id, FieldKey, EntityType, FieldType, Label, IsMultiValue, DefaultVisibility, EnableHistory, DisplayOrder, ApplicableToTypes, CreatedAt, UpdatedAt, IsDeleted)
                VALUES
                  (lower(hex(randomblob(16))), 'alias.email', 'Item', 'Email', 'Alias Email', 0, 'Visible', 1, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'alias.first_name', 'Item', 'Text', 'First Name', 0, 'Visible', 0, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'alias.last_name', 'Item', 'Text', 'Last Name', 0, 'Visible', 0, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'alias.nickname', 'Item', 'Text', 'Nickname', 0, 'Visible', 0, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'alias.gender', 'Item', 'Text', 'Gender', 0, 'Visible', 0, 0, '["Login"]', datetime('now'), datetime('now'), 0),
                  (lower(hex(randomblob(16))), 'alias.birthdate', 'Item', 'Date', 'Birth Date', 0, 'Visible', 0, 0, '["Login"]', datetime('now'), datetime('now'), 0);
            


                INSERT INTO Items (Id, Name, ItemType, LogoId, FolderId, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  c.Id,
                  s.Name AS Name,
                  'Login' AS ItemType,
                  NULL AS LogoId,
                  NULL AS FolderId,
                  c.CreatedAt,
                  c.UpdatedAt,
                  c.IsDeleted
                FROM Credentials c
                LEFT JOIN Services s ON s.Id = c.ServiceId;
            


                INSERT INTO Logos (Id, Source, FileData, MimeType, FetchedAt, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  s.Url AS Source,
                  s.Logo AS FileData,
                  'image/png' AS MimeType,
                  NULL AS FetchedAt,
                  MIN(s.CreatedAt) AS CreatedAt,
                  MAX(s.UpdatedAt) AS UpdatedAt,
                  0 AS IsDeleted
                FROM Services s
                WHERE s.Logo IS NOT NULL AND s.Url IS NOT NULL AND s.Url != ''
                GROUP BY s.Url;
            


                UPDATE Items
                SET LogoId = (
                  SELECT l.Id FROM Logos l
                  INNER JOIN Services s ON s.Url = l.Source
                  INNER JOIN Credentials c ON c.ServiceId = s.Id
                  WHERE c.Id = Items.Id
                  LIMIT 1
                )
                WHERE EXISTS (
                  SELECT 1 FROM Credentials c
                  INNER JOIN Services s ON s.Id = c.ServiceId
                  WHERE c.Id = Items.Id AND s.Logo IS NOT NULL
                );
            


                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'login.url' LIMIT 1) AS FieldDefinitionId,
                  s.Url AS Value,
                  0 AS ValueIndex,
                  s.UpdatedAt AS CreatedAt,
                  s.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Services s ON s.Id = c.ServiceId
                WHERE s.Url IS NOT NULL AND s.Url != '';
            


                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'login.username' LIMIT 1) AS FieldDefinitionId,
                  c.Username AS Value,
                  0 AS ValueIndex,
                  c.UpdatedAt AS CreatedAt,
                  c.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                WHERE c.Username IS NOT NULL AND c.Username != '';
            


                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'login.notes' LIMIT 1) AS FieldDefinitionId,
                  c.Notes AS Value,
                  0 AS ValueIndex,
                  c.UpdatedAt AS CreatedAt,
                  c.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                WHERE c.Notes IS NOT NULL AND c.Notes != '';
            


                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  p.CredentialId AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'login.password' LIMIT 1) AS FieldDefinitionId,
                  p.Value AS Value,
                  0 AS ValueIndex,
                  p.UpdatedAt AS CreatedAt,
                  p.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Passwords p
                INNER JOIN (
                  SELECT CredentialId, MAX(UpdatedAt) AS MaxUpdated
                  FROM Passwords
                  GROUP BY CredentialId
                ) pm ON p.CredentialId = pm.CredentialId AND p.UpdatedAt = pm.MaxUpdated;
            


                INSERT INTO FieldHistories (Id, ItemId, FieldDefinitionId, ValueSnapshot, ChangedAt, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  p.CredentialId AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'login.password' LIMIT 1) AS FieldDefinitionId,
                  '{"values":["' || p.Value || '"]}' AS ValueSnapshot,
                  p.UpdatedAt AS ChangedAt,
                  p.CreatedAt AS CreatedAt,
                  p.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Passwords p
                WHERE p.Id NOT IN (
                  SELECT p2.Id FROM Passwords p2
                  INNER JOIN (
                    SELECT CredentialId, MAX(UpdatedAt) AS MaxUpdated
                    FROM Passwords
                    GROUP BY CredentialId
                  ) pm ON p2.CredentialId = pm.CredentialId AND p2.UpdatedAt = pm.MaxUpdated
                );
            


                -- Migrate Alias.Email
                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'alias.email' LIMIT 1) AS FieldDefinitionId,
                  a.Email AS Value,
                  0 AS ValueIndex,
                  a.UpdatedAt AS CreatedAt,
                  a.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Aliases a ON a.Id = c.AliasId
                WHERE a.Email IS NOT NULL AND a.Email != '';

                -- Migrate Alias.FirstName
                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'alias.first_name' LIMIT 1) AS FieldDefinitionId,
                  a.FirstName AS Value,
                  0 AS ValueIndex,
                  a.UpdatedAt AS CreatedAt,
                  a.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Aliases a ON a.Id = c.AliasId
                WHERE a.FirstName IS NOT NULL AND a.FirstName != '';

                -- Migrate Alias.LastName
                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'alias.last_name' LIMIT 1) AS FieldDefinitionId,
                  a.LastName AS Value,
                  0 AS ValueIndex,
                  a.UpdatedAt AS CreatedAt,
                  a.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Aliases a ON a.Id = c.AliasId
                WHERE a.LastName IS NOT NULL AND a.LastName != '';

                -- Migrate Alias.NickName
                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'alias.nickname' LIMIT 1) AS FieldDefinitionId,
                  a.NickName AS Value,
                  0 AS ValueIndex,
                  a.UpdatedAt AS CreatedAt,
                  a.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Aliases a ON a.Id = c.AliasId
                WHERE a.NickName IS NOT NULL AND a.NickName != '';

                -- Migrate Alias.Gender
                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'alias.gender' LIMIT 1) AS FieldDefinitionId,
                  a.Gender AS Value,
                  0 AS ValueIndex,
                  a.UpdatedAt AS CreatedAt,
                  a.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Aliases a ON a.Id = c.AliasId
                WHERE a.Gender IS NOT NULL AND a.Gender != '';

                -- Migrate Alias.BirthDate
                INSERT INTO FieldValues (Id, ItemId, FieldDefinitionId, Value, ValueIndex, CreatedAt, UpdatedAt, IsDeleted)
                SELECT
                  lower(hex(randomblob(16))) AS Id,
                  c.Id AS ItemId,
                  (SELECT Id FROM FieldDefinitions WHERE FieldKey = 'alias.birthdate' LIMIT 1) AS FieldDefinitionId,
                  a.BirthDate AS Value,
                  0 AS ValueIndex,
                  a.UpdatedAt AS CreatedAt,
                  a.UpdatedAt AS UpdatedAt,
                  0 AS IsDeleted
                FROM Credentials c
                INNER JOIN Aliases a ON a.Id = c.AliasId
                WHERE a.BirthDate IS NOT NULL AND a.BirthDate != '' AND a.BirthDate != '0001-01-01 00:00:00.000';
            

DROP TABLE "Passwords";

DROP TABLE "Credentials";

DROP TABLE "Aliases";

DROP TABLE "Services";

CREATE TABLE "ef_temp_Attachments" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Attachments" PRIMARY KEY,
    "Blob" BLOB NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "Filename" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "ItemId" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_Attachments_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_Attachments" ("Id", "Blob", "CreatedAt", "Filename", "IsDeleted", "ItemId", "UpdatedAt")
SELECT "Id", "Blob", "CreatedAt", "Filename", "IsDeleted", "ItemId", "UpdatedAt"
FROM "Attachments";

CREATE TABLE "ef_temp_Passkeys" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Passkeys" PRIMARY KEY,
    "AdditionalData" BLOB NULL,
    "CreatedAt" TEXT NOT NULL,
    "DisplayName" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "ItemId" TEXT NOT NULL,
    "PrfKey" BLOB NULL,
    "PrivateKey" TEXT NOT NULL,
    "PublicKey" TEXT NOT NULL,
    "RpId" TEXT COLLATE NOCASE NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "UserHandle" BLOB NOT NULL,
    CONSTRAINT "FK_Passkeys_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_Passkeys" ("Id", "AdditionalData", "CreatedAt", "DisplayName", "IsDeleted", "ItemId", "PrfKey", "PrivateKey", "PublicKey", "RpId", "UpdatedAt", "UserHandle")
SELECT "Id", "AdditionalData", "CreatedAt", "DisplayName", "IsDeleted", "ItemId", "PrfKey", "PrivateKey", "PublicKey", "RpId", "UpdatedAt", "UserHandle"
FROM "Passkeys";

CREATE TABLE "ef_temp_TotpCodes" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_TotpCodes" PRIMARY KEY,
    "CreatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "ItemId" TEXT NOT NULL,
    "Name" TEXT NOT NULL,
    "SecretKey" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_TotpCodes_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_TotpCodes" ("Id", "CreatedAt", "IsDeleted", "ItemId", "Name", "SecretKey", "UpdatedAt")
SELECT "Id", "CreatedAt", "IsDeleted", "ItemId", "Name", "SecretKey", "UpdatedAt"
FROM "TotpCodes";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "Attachments";

ALTER TABLE "ef_temp_Attachments" RENAME TO "Attachments";

DROP TABLE "Passkeys";

ALTER TABLE "ef_temp_Passkeys" RENAME TO "Passkeys";

DROP TABLE "TotpCodes";

ALTER TABLE "ef_temp_TotpCodes" RENAME TO "TotpCodes";

COMMIT;

PRAGMA foreign_keys = 1;

BEGIN TRANSACTION;
CREATE INDEX "IX_Attachments_ItemId" ON "Attachments" ("ItemId");

CREATE INDEX "IX_Passkeys_ItemId" ON "Passkeys" ("ItemId");

CREATE INDEX "IX_Passkeys_RpId" ON "Passkeys" ("RpId");

CREATE INDEX "IX_TotpCodes_ItemId" ON "TotpCodes" ("ItemId");

COMMIT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251126211441_1.7.0-FieldBasedDataModelUpdate', '9.0.4');

