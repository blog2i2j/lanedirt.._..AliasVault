BEGIN TRANSACTION;
ALTER TABLE "Folders" RENAME COLUMN "DisplayOrder" TO "Weight";

ALTER TABLE "FieldValues" RENAME COLUMN "ValueIndex" TO "Weight";

DROP INDEX "IX_FieldValues_ItemId_FieldDefinitionId_ValueIndex";

CREATE INDEX "IX_FieldValues_ItemId_FieldDefinitionId_Weight" ON "FieldValues" ("ItemId", "FieldDefinitionId", "Weight");

ALTER TABLE "FieldDefinitions" RENAME COLUMN "DisplayOrder" TO "Weight";

ALTER TABLE "FieldDefinitions" ADD "IsHidden" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ef_temp_FieldDefinitions" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldDefinitions" PRIMARY KEY,
    "ApplicableToTypes" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "EnableHistory" INTEGER NOT NULL,
    "FieldKey" TEXT NULL,
    "FieldType" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "IsHidden" INTEGER NOT NULL,
    "IsMultiValue" INTEGER NOT NULL,
    "Label" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "Weight" INTEGER NOT NULL
);

INSERT INTO "ef_temp_FieldDefinitions" ("Id", "ApplicableToTypes", "CreatedAt", "EnableHistory", "FieldKey", "FieldType", "IsDeleted", "IsHidden", "IsMultiValue", "Label", "UpdatedAt", "Weight")
SELECT "Id", "ApplicableToTypes", "CreatedAt", "EnableHistory", "FieldKey", "FieldType", "IsDeleted", "IsHidden", "IsMultiValue", "Label", "UpdatedAt", "Weight"
FROM "FieldDefinitions";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "FieldDefinitions";

ALTER TABLE "ef_temp_FieldDefinitions" RENAME TO "FieldDefinitions";

COMMIT;

PRAGMA foreign_keys = 1;

BEGIN TRANSACTION;
CREATE INDEX "IX_FieldDefinitions_FieldKey" ON "FieldDefinitions" ("FieldKey");

COMMIT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251126221717_1.7.1-RenameColumns', '9.0.4');

