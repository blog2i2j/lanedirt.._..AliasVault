BEGIN TRANSACTION;
CREATE TABLE "Tags" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Tags" PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "Color" TEXT NULL,
    "DisplayOrder" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL
);

CREATE TABLE "ItemTags" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_ItemTags" PRIMARY KEY,
    "ItemId" TEXT NOT NULL,
    "TagId" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_ItemTags_Items_ItemId" FOREIGN KEY ("ItemId") REFERENCES "Items" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ItemTags_Tags_TagId" FOREIGN KEY ("TagId") REFERENCES "Tags" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_ItemTags_ItemId" ON "ItemTags" ("ItemId");

CREATE UNIQUE INDEX "IX_ItemTags_ItemId_TagId" ON "ItemTags" ("ItemId", "TagId");

CREATE INDEX "IX_ItemTags_TagId" ON "ItemTags" ("TagId");

CREATE INDEX "IX_Tags_Name" ON "Tags" ("Name");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251202211204_1.7.2-AddTagTables', '9.0.4');

COMMIT;

