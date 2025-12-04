BEGIN TRANSACTION;
ALTER TABLE "FieldHistories" ADD "FieldKey" TEXT NULL;

CREATE TABLE "ef_temp_FieldHistories" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldHistories" PRIMARY KEY,
    "ChangedAt" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "FieldDefinitionId" TEXT NULL,
    "FieldKey" TEXT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "ItemId" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "ValueSnapshot" TEXT NOT NULL,
    CONSTRAINT "FK_FieldHistories_FieldDefinitions_FieldDefinitionId" FOREIGN KEY ("FieldDefinitionId") REFERENCES "FieldDefinitions" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_FieldHistories_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_FieldHistories" ("Id", "ChangedAt", "CreatedAt", "FieldDefinitionId", "FieldKey", "IsDeleted", "ItemId", "UpdatedAt", "ValueSnapshot")
SELECT "Id", "ChangedAt", "CreatedAt", "FieldDefinitionId", "FieldKey", "IsDeleted", "ItemId", "UpdatedAt", "ValueSnapshot"
FROM "FieldHistories";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "FieldHistories";

ALTER TABLE "ef_temp_FieldHistories" RENAME TO "FieldHistories";

COMMIT;

PRAGMA foreign_keys = 1;

BEGIN TRANSACTION;
CREATE INDEX "IX_FieldHistories_FieldDefinitionId" ON "FieldHistories" ("FieldDefinitionId");

CREATE INDEX "IX_FieldHistories_ItemId" ON "FieldHistories" ("ItemId");

COMMIT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251204142538_1.7.1-MakeFieldHistoryFlexible', '9.0.4');

