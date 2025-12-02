CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
    "ProductVersion" TEXT NOT NULL
);

BEGIN TRANSACTION;
CREATE TABLE "Aliases" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Aliases" PRIMARY KEY,
    "Gender" VARCHAR NULL,
    "FirstName" VARCHAR NULL,
    "LastName" VARCHAR NULL,
    "NickName" VARCHAR NULL,
    "BirthDate" TEXT NOT NULL,
    "AddressStreet" VARCHAR NULL,
    "AddressCity" VARCHAR NULL,
    "AddressState" VARCHAR NULL,
    "AddressZipCode" VARCHAR NULL,
    "AddressCountry" VARCHAR NULL,
    "Hobbies" TEXT NULL,
    "EmailPrefix" TEXT NULL,
    "PhoneMobile" TEXT NULL,
    "BankAccountIBAN" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL
);

CREATE TABLE "Services" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Services" PRIMARY KEY,
    "Name" TEXT NULL,
    "Url" TEXT NULL,
    "Logo" BLOB NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL
);

CREATE TABLE "Credentials" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Credentials" PRIMARY KEY,
    "AliasId" TEXT NOT NULL,
    "Notes" TEXT NULL,
    "Username" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "ServiceId" TEXT NOT NULL,
    CONSTRAINT "FK_Credentials_Aliases_AliasId" FOREIGN KEY ("AliasId") REFERENCES "Aliases" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Credentials_Services_ServiceId" FOREIGN KEY ("ServiceId") REFERENCES "Services" ("Id") ON DELETE CASCADE
);

CREATE TABLE "Attachment" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Attachment" PRIMARY KEY,
    "Filename" TEXT NOT NULL,
    "Blob" BLOB NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    CONSTRAINT "FK_Attachment_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

CREATE TABLE "Passwords" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Passwords" PRIMARY KEY,
    "Value" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    CONSTRAINT "FK_Passwords_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_Attachment_CredentialId" ON "Attachment" ("CredentialId");

CREATE INDEX "IX_Credentials_AliasId" ON "Credentials" ("AliasId");

CREATE INDEX "IX_Credentials_ServiceId" ON "Credentials" ("ServiceId");

CREATE INDEX "IX_Passwords_CredentialId" ON "Passwords" ("CredentialId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240708094944_1.0.0-InitialMigration', '9.0.4');

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240708224522_1.0.1-EmptyTestMigration', '9.0.4');

ALTER TABLE "Aliases" RENAME COLUMN "EmailPrefix" TO "Email";

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240711204207_1.0.2-ChangeEmailColumn', '9.0.4');

CREATE TABLE "EncryptionKeys" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_EncryptionKeys" PRIMARY KEY,
    "PublicKey" TEXT NOT NULL,
    "PrivateKey" TEXT NOT NULL,
    "IsPrimary" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL
);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240729105618_1.1.0-AddPkiTables', '9.0.4');

CREATE TABLE "Settings" (
    "Key" TEXT NOT NULL CONSTRAINT "PK_Settings" PRIMARY KEY,
    "Value" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL
);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240805073413_1.2.0-AddSettingsTable', '9.0.4');

CREATE TABLE "ef_temp_Aliases" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Aliases" PRIMARY KEY,
    "BirthDate" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "Email" TEXT NULL,
    "FirstName" VARCHAR NULL,
    "Gender" VARCHAR NULL,
    "LastName" VARCHAR NULL,
    "NickName" VARCHAR NULL,
    "UpdatedAt" TEXT NOT NULL
);

INSERT INTO "ef_temp_Aliases" ("Id", "BirthDate", "CreatedAt", "Email", "FirstName", "Gender", "LastName", "NickName", "UpdatedAt")
SELECT "Id", "BirthDate", "CreatedAt", "Email", "FirstName", "Gender", "LastName", "NickName", "UpdatedAt"
FROM "Aliases";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "Aliases";

ALTER TABLE "ef_temp_Aliases" RENAME TO "Aliases";

COMMIT;

PRAGMA foreign_keys = 1;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240805122422_1.3.0-UpdateIdentityStructure', '9.0.4');

BEGIN TRANSACTION;
CREATE TABLE "ef_temp_Credentials" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Credentials" PRIMARY KEY,
    "AliasId" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "Notes" TEXT NULL,
    "ServiceId" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "Username" TEXT NULL,
    CONSTRAINT "FK_Credentials_Aliases_AliasId" FOREIGN KEY ("AliasId") REFERENCES "Aliases" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Credentials_Services_ServiceId" FOREIGN KEY ("ServiceId") REFERENCES "Services" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_Credentials" ("Id", "AliasId", "CreatedAt", "Notes", "ServiceId", "UpdatedAt", "Username")
SELECT "Id", "AliasId", "CreatedAt", "Notes", "ServiceId", "UpdatedAt", "Username"
FROM "Credentials";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "Credentials";

ALTER TABLE "ef_temp_Credentials" RENAME TO "Credentials";

COMMIT;

PRAGMA foreign_keys = 1;

BEGIN TRANSACTION;
CREATE INDEX "IX_Credentials_AliasId" ON "Credentials" ("AliasId");

CREATE INDEX "IX_Credentials_ServiceId" ON "Credentials" ("ServiceId");

COMMIT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240812141727_1.3.1-MakeUsernameOptional', '9.0.4');

BEGIN TRANSACTION;
ALTER TABLE "Settings" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Services" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Passwords" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "EncryptionKeys" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Credentials" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Attachment" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Aliases" ADD "IsDeleted" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240916105320_1.4.0-AddSyncSupport', '9.0.4');

ALTER TABLE "Attachment" RENAME TO "Attachments";

CREATE TABLE "ef_temp_Attachments" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Attachments" PRIMARY KEY,
    "Blob" BLOB NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    "Filename" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_Attachments_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

INSERT INTO "ef_temp_Attachments" ("Id", "Blob", "CreatedAt", "CredentialId", "Filename", "IsDeleted", "UpdatedAt")
SELECT "Id", "Blob", "CreatedAt", "CredentialId", "Filename", "IsDeleted", "UpdatedAt"
FROM "Attachments";

COMMIT;

PRAGMA foreign_keys = 0;

BEGIN TRANSACTION;
DROP TABLE "Attachments";

ALTER TABLE "ef_temp_Attachments" RENAME TO "Attachments";

COMMIT;

PRAGMA foreign_keys = 1;

BEGIN TRANSACTION;
CREATE INDEX "IX_Attachments_CredentialId" ON "Attachments" ("CredentialId");

COMMIT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20240917191243_1.4.1-RenameAttachmentsPlural', '9.0.4');

BEGIN TRANSACTION;
CREATE TABLE "TotpCodes" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_TotpCodes" PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "SecretKey" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_TotpCodes_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_TotpCodes_CredentialId" ON "TotpCodes" ("CredentialId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20250310131554_1.5.0-AddTotpCodes', '9.0.4');


PRAGMA foreign_keys = OFF;

-- Clean up any existing temp tables first
DROP TABLE IF EXISTS "__EFMigrationsHistory_temp";
DROP TABLE IF EXISTS "Aliases_temp";
DROP TABLE IF EXISTS "Services_temp";
DROP TABLE IF EXISTS "EncryptionKeys_temp";
DROP TABLE IF EXISTS "Settings_temp";
DROP TABLE IF EXISTS "Credentials_temp";
DROP TABLE IF EXISTS "Attachments_temp";
DROP TABLE IF EXISTS "Passwords_temp";
DROP TABLE IF EXISTS "TotpCodes_temp";

-- Create backup tables for all data
CREATE TABLE "__EFMigrationsHistory_temp" AS SELECT * FROM "__EFMigrationsHistory";
CREATE TABLE "Aliases_temp" AS SELECT * FROM "Aliases";
CREATE TABLE "Services_temp" AS SELECT * FROM "Services";
CREATE TABLE "EncryptionKeys_temp" AS SELECT * FROM "EncryptionKeys";
CREATE TABLE "Settings_temp" AS SELECT * FROM "Settings";
CREATE TABLE "Credentials_temp" AS SELECT * FROM "Credentials";
CREATE TABLE "Attachments_temp" AS SELECT * FROM "Attachments";
CREATE TABLE "Passwords_temp" AS SELECT * FROM "Passwords";
CREATE TABLE "TotpCodes_temp" AS SELECT * FROM "TotpCodes";

-- Delete orphaned records that do not have a valid FK to the credential object
DELETE FROM "Attachments_temp" WHERE "CredentialId" NOT IN (SELECT "Id" FROM "Credentials_temp");
DELETE FROM "Passwords_temp" WHERE "CredentialId" NOT IN (SELECT "Id" FROM "Credentials_temp");
DELETE FROM "TotpCodes_temp" WHERE "CredentialId" NOT IN (SELECT "Id" FROM "Credentials_temp");

-- Delete orphaned credentials that do not have valid FKs to alias or service objects
DELETE FROM "Credentials_temp" WHERE "AliasId" NOT IN (SELECT "Id" FROM "Aliases_temp");
DELETE FROM "Credentials_temp" WHERE "ServiceId" NOT IN (SELECT "Id" FROM "Services_temp");

-- After cleaning credentials, clean dependent tables again in case we removed credentials
DELETE FROM "Attachments_temp" WHERE "CredentialId" NOT IN (SELECT "Id" FROM "Credentials_temp");
DELETE FROM "Passwords_temp" WHERE "CredentialId" NOT IN (SELECT "Id" FROM "Credentials_temp");
DELETE FROM "TotpCodes_temp" WHERE "CredentialId" NOT IN (SELECT "Id" FROM "Credentials_temp");

-- Drop all existing tables
DROP TABLE "TotpCodes";
DROP TABLE "Passwords";
DROP TABLE "Attachments";
DROP TABLE "Credentials";
DROP TABLE "Settings";
DROP TABLE "EncryptionKeys";
DROP TABLE "Services";
DROP TABLE "Aliases";
DROP TABLE "__EFMigrationsHistory";

-- Recreate tables with proper constraints (no dependencies first)
CREATE TABLE "__EFMigrationsHistory" (
    "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
    "ProductVersion" TEXT NOT NULL
);

CREATE TABLE "Aliases" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Aliases" PRIMARY KEY,
    "BirthDate" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "Email" TEXT NULL,
    "FirstName" VARCHAR NULL,
    "Gender" VARCHAR NULL,
    "LastName" VARCHAR NULL,
    "NickName" VARCHAR NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "Services" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Services" PRIMARY KEY,
    "Name" TEXT NULL,
    "Url" TEXT NULL,
    "Logo" BLOB NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "EncryptionKeys" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_EncryptionKeys" PRIMARY KEY,
    "PublicKey" TEXT NOT NULL,
    "PrivateKey" TEXT NOT NULL,
    "IsPrimary" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "Settings" (
    "Key" TEXT NOT NULL CONSTRAINT "PK_Settings" PRIMARY KEY,
    "Value" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0
);

-- Tables with foreign keys
CREATE TABLE "Credentials" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Credentials" PRIMARY KEY,
    "AliasId" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "Notes" TEXT NULL,
    "ServiceId" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "Username" TEXT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FK_Credentials_Aliases_AliasId" FOREIGN KEY ("AliasId") REFERENCES "Aliases" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Credentials_Services_ServiceId" FOREIGN KEY ("ServiceId") REFERENCES "Services" ("Id") ON DELETE CASCADE
);

CREATE TABLE "Attachments" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Attachments" PRIMARY KEY,
    "Blob" BLOB NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    "Filename" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0,
    "UpdatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_Attachments_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

CREATE TABLE "Passwords" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Passwords" PRIMARY KEY,
    "Value" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FK_Passwords_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

CREATE TABLE "TotpCodes" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_TotpCodes" PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "SecretKey" TEXT NOT NULL,
    "CredentialId" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FK_TotpCodes_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);


-- Restore data from temp tables
INSERT INTO "__EFMigrationsHistory" SELECT * FROM "__EFMigrationsHistory_temp";
INSERT INTO "Aliases" SELECT * FROM "Aliases_temp";
INSERT INTO "Services" SELECT * FROM "Services_temp";
INSERT INTO "EncryptionKeys" SELECT * FROM "EncryptionKeys_temp";
INSERT INTO "Settings" SELECT * FROM "Settings_temp";
INSERT INTO "Credentials" SELECT * FROM "Credentials_temp";
INSERT INTO "Attachments" SELECT * FROM "Attachments_temp";
INSERT INTO "Passwords" SELECT * FROM "Passwords_temp";
INSERT INTO "TotpCodes" SELECT * FROM "TotpCodes_temp";

-- =====================================================================================
-- Date Format Normalization Migration
-- =====================================================================================
-- This migration normalizes ALL date fields to the standard format: 'yyyy-MM-dd HH:mm:ss.fff'
-- Previously the different clients used different date formats which complicate date parsing.
-- From version 0.24.0 onwards, all new dates are stored in this standard format.

-- Update Aliases table (CreatedAt, UpdatedAt, BirthDate)
UPDATE "Aliases" SET "CreatedAt" =
    CASE
        -- Already in correct format (yyyy-MM-dd HH:mm:ss.fff) - no change
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"

        -- ISO 8601 with milliseconds (yyyy-MM-ddTHH:mm:ss.fffZ) -> Replace T with space, remove Z and everything after .fff
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)

        -- Without milliseconds (yyyy-MM-dd HH:mm:ss or yyyy-MM-ddTHH:mm:ssZ) -> Add .000
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'

        -- Fallback: if none match, keep as-is (edge case)
        ELSE "CreatedAt"
    END;

UPDATE "Aliases" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- BirthDate: Always set time to 00:00:00 (no milliseconds for birth dates)
UPDATE "Aliases" SET "BirthDate" =
    CASE
        -- If empty or already '0001-01-01 00:00:00', keep as-is
        WHEN "BirthDate" = '' OR "BirthDate" = '0001-01-01 00:00:00'
            THEN "BirthDate"

        -- If already in correct format (yyyy-MM-dd 00:00:00), keep as-is
        WHEN "BirthDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] 00:00:00'
            THEN "BirthDate"

        -- Extract date part and set time to 00:00:00
        WHEN "BirthDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
            THEN substr("BirthDate", 1, 10) || ' 00:00:00'

        -- Fallback
        ELSE "BirthDate"
    END;

-- Update Services table (CreatedAt, UpdatedAt)
UPDATE "Services" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "Services" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- Update EncryptionKeys table (CreatedAt, UpdatedAt)
UPDATE "EncryptionKeys" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "EncryptionKeys" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- Update Settings table (CreatedAt, UpdatedAt)
UPDATE "Settings" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "Settings" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- Update Credentials table (CreatedAt, UpdatedAt)
UPDATE "Credentials" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "Credentials" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- Update Attachments table (CreatedAt, UpdatedAt)
UPDATE "Attachments" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "Attachments" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- Update Passwords table (CreatedAt, UpdatedAt)
UPDATE "Passwords" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "Passwords" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- Update TotpCodes table (CreatedAt, UpdatedAt)
UPDATE "TotpCodes" SET "CreatedAt" =
    CASE
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "CreatedAt"
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr("CreatedAt", 12, 12)
        WHEN "CreatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("CreatedAt", 1, 10) || ' ' || substr(replace("CreatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "CreatedAt"
    END;

UPDATE "TotpCodes" SET "UpdatedAt" =
    CASE
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]'
            THEN "UpdatedAt"
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr("UpdatedAt", 12, 12)
        WHEN "UpdatedAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'
            THEN substr("UpdatedAt", 1, 10) || ' ' || substr(replace("UpdatedAt", 'T', ' '), 12, 8) || '.000'
        ELSE "UpdatedAt"
    END;

-- =====================================================================================
-- End of Date Format Normalization Migration
-- =====================================================================================

-- Recreate indexes
CREATE INDEX "IX_Credentials_AliasId" ON "Credentials" ("AliasId");
CREATE INDEX "IX_Credentials_ServiceId" ON "Credentials" ("ServiceId");
CREATE INDEX "IX_Attachments_CredentialId" ON "Attachments" ("CredentialId");
CREATE INDEX "IX_Passwords_CredentialId" ON "Passwords" ("CredentialId");
CREATE INDEX "IX_TotpCodes_CredentialId" ON "TotpCodes" ("CredentialId");

-- Clean up temp tables
DROP TABLE "__EFMigrationsHistory_temp";
DROP TABLE "Aliases_temp";
DROP TABLE "Services_temp";
DROP TABLE "EncryptionKeys_temp";
DROP TABLE "Settings_temp";
DROP TABLE "Credentials_temp";
DROP TABLE "Attachments_temp";
DROP TABLE "Passwords_temp";
DROP TABLE "TotpCodes_temp";

PRAGMA foreign_keys = ON;


CREATE TABLE "Passkeys" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Passkeys" PRIMARY KEY,
    "RpId" TEXT COLLATE NOCASE NOT NULL,
    "UserHandle" BLOB NOT NULL,
    "PublicKey" TEXT NOT NULL,
    "PrivateKey" TEXT NOT NULL,
    "PrfKey" BLOB NULL,
    "DisplayName" TEXT NOT NULL,
    "AdditionalData" BLOB NULL,
    "CredentialId" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "IsDeleted" INTEGER NOT NULL,
    CONSTRAINT "FK_Passkeys_Credentials_CredentialId" FOREIGN KEY ("CredentialId") REFERENCES "Credentials" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_Passkeys_CredentialId" ON "Passkeys" ("CredentialId");

CREATE INDEX "IX_Passkeys_RpId" ON "Passkeys" ("RpId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251014122838_1.6.0-AddPasskeys', '9.0.4');

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
                  (lower(hex(randomblob(16))), 'login.url', 'Item', 'URL', 'Website URLs', 1, 'Visible', 0, 0, '["Login"]', datetime('now'), datetime('now'), 0);

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

