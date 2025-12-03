BEGIN TRANSACTION;
DROP INDEX "IX_FieldDefinitions_FieldKey";

ALTER TABLE "FieldValues" ADD "FieldKey" TEXT NULL;

CREATE INDEX "IX_FieldValues_FieldKey" ON "FieldValues" ("FieldKey");

CREATE INDEX "IX_FieldValues_ItemId_FieldKey" ON "FieldValues" ("ItemId", "FieldKey");

CREATE TABLE "ef_temp_FieldDefinitions" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldDefinitions" PRIMARY KEY,
    "ApplicableToTypes" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "EnableHistory" INTEGER NOT NULL,
    "FieldType" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "IsHidden" INTEGER NOT NULL,
    "IsMultiValue" INTEGER NOT NULL,
    "Label" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "Weight" INTEGER NOT NULL
);

INSERT INTO "ef_temp_FieldDefinitions" ("Id", "ApplicableToTypes", "CreatedAt", "EnableHistory", "FieldType", "IsDeleted", "IsHidden", "IsMultiValue", "Label", "UpdatedAt", "Weight")
SELECT "Id", "ApplicableToTypes", "CreatedAt", "EnableHistory", "FieldType", "IsDeleted", "IsHidden", "IsMultiValue", "Label", "UpdatedAt", "Weight"
FROM "FieldDefinitions";

CREATE TABLE "ef_temp_FieldValues" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldValues" PRIMARY KEY,
    "CreatedAt" TEXT NOT NULL,
    "FieldDefinitionId" TEXT NULL,
    "FieldKey" TEXT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "ItemId" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "Value" TEXT NULL,
    "Weight" INTEGER NOT NULL,
    CONSTRAINT "FK_FieldValues_FieldDefinitions_FieldDefinitionId" FOREIGN KEY ("FieldDefinitionId") REFERENCES "FieldDefinitions" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_FieldValues_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_FieldValues" ("Id", "CreatedAt", "FieldDefinitionId", "FieldKey", "IsDeleted", "ItemId", "UpdatedAt", "Value", "Weight")
SELECT "Id", "CreatedAt", "FieldDefinitionId", "FieldKey", "IsDeleted", "ItemId", "UpdatedAt", "Value", "Weight"
FROM "FieldValues";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "FieldDefinitions";

ALTER TABLE "ef_temp_FieldDefinitions" RENAME TO "FieldDefinitions";

DROP TABLE "FieldValues";

ALTER TABLE "ef_temp_FieldValues" RENAME TO "FieldValues";

COMMIT;

PRAGMA foreign_keys = 1;

BEGIN TRANSACTION;
CREATE INDEX "IX_FieldValues_FieldDefinitionId" ON "FieldValues" ("FieldDefinitionId");

CREATE INDEX "IX_FieldValues_FieldKey" ON "FieldValues" ("FieldKey");

CREATE INDEX "IX_FieldValues_ItemId" ON "FieldValues" ("ItemId");

CREATE INDEX "IX_FieldValues_ItemId_FieldDefinitionId_Weight" ON "FieldValues" ("ItemId", "FieldDefinitionId", "Weight");

CREATE INDEX "IX_FieldValues_ItemId_FieldKey" ON "FieldValues" ("ItemId", "FieldKey");

COMMIT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251203161105_1.8.0-SystemFieldRefactor', '9.0.4');

