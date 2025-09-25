BEGIN TRANSACTION;
CREATE TABLE "Passkeys" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Passkeys" PRIMARY KEY,
    "ItemVersion" INTEGER NOT NULL,
    "RpId" TEXT COLLATE NOCASE NOT NULL,
    "CredentialId" BLOB NOT NULL,
    "SignCount" INTEGER NOT NULL,
    "IsBackupEligible" INTEGER NOT NULL,
    "IsBackupState" INTEGER NOT NULL,
    "DisplayName" TEXT NOT NULL,
    "LastUsedAt" TEXT NULL,
    "AdditionalData" BLOB NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL
);

CREATE UNIQUE INDEX "IX_Passkeys_CredentialId" ON "Passkeys" ("CredentialId");

CREATE INDEX "IX_Passkeys_RpId" ON "Passkeys" ("RpId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20250925085843_1.6.0-AddPasskeyEntity', '9.0.4');

COMMIT;

