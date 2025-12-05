BEGIN TRANSACTION;
ALTER TABLE "Items" ADD "DeletedAt" TEXT NULL;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20251205212831_1.7.2-AddDeletedAtToItem', '9.0.4');

COMMIT;

