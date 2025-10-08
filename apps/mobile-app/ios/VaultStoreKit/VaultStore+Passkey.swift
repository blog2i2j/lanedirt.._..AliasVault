import Foundation
import SQLite
import VaultModels

/**
 * VaultStore+Passkey
 * Extension to VaultStore for passkey operations
 * TODO: review file
 */
extension VaultStore {

    // MARK: - Passkey Queries

    /**
     * Get a passkey by its credential ID (the WebAuthn credential ID, not the parent Credential UUID)
     */
    public func getPasskey(byCredentialId credentialId: Data) throws -> Passkey? {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let query = """
            SELECT
                Id,
                CredentialId,
                RpId,
                UserId,
                PublicKey,
                PrivateKey,
                PrfKey,
                DisplayName,
                AdditionalData,
                CreatedAt,
                UpdatedAt,
                IsDeleted
            FROM Passkeys
            WHERE AdditionalData = ? AND IsDeleted = 0
            LIMIT 1
        """

        let credentialIdBlob = Blob(bytes: [UInt8](credentialId))

        for row in try dbConn.prepare(query, [credentialIdBlob]) {
            guard let idString = row[0] as? String,
                  let credentialIdString = row[1] as? String,
                  let rpId = row[2] as? String,
                  let publicKeyString = row[4] as? String,
                  let privateKeyString = row[5] as? String,
                  let displayName = row[7] as? String,
                  let createdAtString = row[9] as? String,
                  let updatedAtString = row[10] as? String,
                  let isDeletedInt64 = row[11] as? Int64,
                  let id = UUID(uuidString: idString),
                  let parentCredentialId = UUID(uuidString: credentialIdString),
                  let publicKeyData = publicKeyString.data(using: .utf8),
                  let privateKeyData = privateKeyString.data(using: .utf8) else {
                continue
            }

            guard let createdAt = parseDateString(createdAtString),
                  let updatedAt = parseDateString(updatedAtString) else {
                continue
            }

            let userId = (row[3] as? String)?.data(using: .utf8)
            let prfKey = (row[6] as? SQLite.Blob).map { Data($0.bytes) }
            let isDeleted = isDeletedInt64 == 1

            // Get the actual WebAuthn credential ID from AdditionalData column
            let webauthnCredentialId: Data
            if let additionalDataBlob = row[8] as? SQLite.Blob {
                webauthnCredentialId = Data(additionalDataBlob.bytes)
            } else {
                // Fallback: use the passkey ID as a GUID and convert to bytes
                webauthnCredentialId = (try? PasskeyHelper.guidToBytes(idString)) ?? Data()
            }

            return Passkey(
                id: id,
                credentialId: webauthnCredentialId,
                credentialIdString: parentCredentialId.uuidString,
                rpId: rpId,
                userId: userId,
                userName: nil,
                publicKey: publicKeyData,
                privateKey: privateKeyData,
                prfKey: prfKey,
                displayName: displayName,
                createdAt: createdAt,
                updatedAt: updatedAt,
                isDeleted: isDeleted
            )
        }

        return nil
    }

    /**
     * Get all passkeys for a credential
     */
    public func getPasskeys(forCredentialId credentialId: UUID) throws -> [Passkey] {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let query = """
            SELECT
                Id,
                CredentialId,
                RpId,
                UserId,
                PublicKey,
                PrivateKey,
                PrfKey,
                DisplayName,
                AdditionalData,
                CreatedAt,
                UpdatedAt,
                IsDeleted
            FROM Passkeys
            WHERE CredentialId = ? AND IsDeleted = 0
            ORDER BY CreatedAt DESC
        """

        var passkeys: [Passkey] = []
        for row in try dbConn.prepare(query, [credentialId.uuidString]) {
            guard let idString = row[0] as? String,
                  let credentialIdString = row[1] as? String,
                  let rpId = row[2] as? String,
                  let publicKeyString = row[4] as? String,
                  let privateKeyString = row[5] as? String,
                  let displayName = row[7] as? String,
                  let createdAtString = row[9] as? String,
                  let updatedAtString = row[10] as? String,
                  let isDeletedInt64 = row[11] as? Int64,
                  let id = UUID(uuidString: idString),
                  let parentCredentialId = UUID(uuidString: credentialIdString),
                  let publicKeyData = publicKeyString.data(using: .utf8),
                  let privateKeyData = privateKeyString.data(using: .utf8) else {
                continue
            }

            guard let createdAt = parseDateString(createdAtString),
                  let updatedAt = parseDateString(updatedAtString) else {
                continue
            }

            let userId = (row[3] as? String)?.data(using: .utf8)
            let prfKey = (row[6] as? SQLite.Blob).map { Data($0.bytes) }
            let isDeleted = isDeletedInt64 == 1

            // Get the actual WebAuthn credential ID from AdditionalData column
            let webauthnCredentialId: Data
            if let additionalDataBlob = row[8] as? SQLite.Blob {
                webauthnCredentialId = Data(additionalDataBlob.bytes)
            } else {
                // Fallback: use the passkey ID as a GUID and convert to bytes
                webauthnCredentialId = (try? PasskeyHelper.guidToBytes(idString)) ?? Data()
            }

            let passkey = Passkey(
                id: id,
                credentialId: webauthnCredentialId,
                credentialIdString: parentCredentialId.uuidString,
                rpId: rpId,
                userId: userId,
                userName: nil,
                publicKey: publicKeyData,
                privateKey: privateKeyData,
                prfKey: prfKey,
                displayName: displayName,
                createdAt: createdAt,
                updatedAt: updatedAt,
                isDeleted: isDeleted
            )

            passkeys.append(passkey)
        }

        return passkeys
    }

    /**
     * Get all passkeys for a specific relying party identifier (RP ID)
     */
    public func getPasskeys(forRpId rpId: String) throws -> [Passkey] {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let query = """
            SELECT
                Id,
                CredentialId,
                RpId,
                UserId,
                PublicKey,
                PrivateKey,
                PrfKey,
                DisplayName,
                AdditionalData,
                CreatedAt,
                UpdatedAt,
                IsDeleted
            FROM Passkeys
            WHERE RpId = ? AND IsDeleted = 0
            ORDER BY CreatedAt DESC
        """

        var passkeys: [Passkey] = []
        for row in try dbConn.prepare(query, [rpId]) {
            guard let idString = row[0] as? String,
                  let credentialIdString = row[1] as? String,
                  let rpId = row[2] as? String,
                  let publicKeyString = row[4] as? String,
                  let privateKeyString = row[5] as? String,
                  let displayName = row[7] as? String,
                  let createdAtString = row[9] as? String,
                  let updatedAtString = row[10] as? String,
                  let isDeletedInt64 = row[11] as? Int64,
                  let id = UUID(uuidString: idString),
                  let parentCredentialId = UUID(uuidString: credentialIdString),
                  let publicKeyData = publicKeyString.data(using: .utf8),
                  let privateKeyData = privateKeyString.data(using: .utf8) else {
                continue
            }

            guard let createdAt = parseDateString(createdAtString),
                  let updatedAt = parseDateString(updatedAtString) else {
                continue
            }

            let userId = (row[3] as? String)?.data(using: .utf8)
            let prfKey = (row[6] as? SQLite.Blob).map { Data($0.bytes) }
            let isDeleted = isDeletedInt64 == 1

            // Get the actual WebAuthn credential ID from AdditionalData column
            let webauthnCredentialId: Data
            if let additionalDataBlob = row[8] as? SQLite.Blob {
                webauthnCredentialId = Data(additionalDataBlob.bytes)
            } else {
                // Fallback: use the passkey ID as a GUID and convert to bytes
                webauthnCredentialId = (try? PasskeyHelper.guidToBytes(idString)) ?? Data()
            }

            let passkey = Passkey(
                id: id,
                credentialId: webauthnCredentialId,
                credentialIdString: parentCredentialId.uuidString,
                rpId: rpId,
                userId: userId,
                userName: nil,
                publicKey: publicKeyData,
                privateKey: privateKeyData,
                prfKey: prfKey,
                displayName: displayName,
                createdAt: createdAt,
                updatedAt: updatedAt,
                isDeleted: isDeleted
            )

            passkeys.append(passkey)
        }

        return passkeys
    }

    /**
     * Get all credentials that have passkeys attached
     */
    // swiftlint:disable:next function_body_length
    public func getAllCredentialsWithPasskeys() throws -> [Credential] {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let query = """
            WITH LatestPasswords AS (
                SELECT
                    p.Id as password_id,
                    p.CredentialId,
                    p.Value,
                    p.CreatedAt,
                    p.UpdatedAt,
                    p.IsDeleted,
                    ROW_NUMBER() OVER (PARTITION BY p.CredentialId ORDER BY p.CreatedAt DESC) as rn
                FROM Passwords p
                WHERE p.IsDeleted = 0
            )
            SELECT
                c.Id,
                c.AliasId,
                c.Username,
                c.Notes,
                c.CreatedAt,
                c.UpdatedAt,
                c.IsDeleted,
                s.Id as service_id,
                s.Name as service_name,
                s.Url as service_url,
                s.Logo as service_logo,
                s.CreatedAt as service_created_at,
                s.UpdatedAt as service_updated_at,
                s.IsDeleted as service_is_deleted,
                lp.password_id,
                lp.Value as password_value,
                lp.CreatedAt as password_created_at,
                lp.UpdatedAt as password_updated_at,
                lp.IsDeleted as password_is_deleted,
                a.Id as alias_id,
                a.Gender as alias_gender,
                a.FirstName as alias_first_name,
                a.LastName as alias_last_name,
                a.NickName as alias_nick_name,
                a.BirthDate as alias_birth_date,
                a.Email as alias_email,
                a.CreatedAt as alias_created_at,
                a.UpdatedAt as alias_updated_at,
                a.IsDeleted as alias_is_deleted
            FROM Credentials c
            INNER JOIN Passkeys pk ON pk.CredentialId = c.Id AND pk.IsDeleted = 0
            LEFT JOIN Services s ON s.Id = c.ServiceId AND s.IsDeleted = 0
            LEFT JOIN LatestPasswords lp ON lp.CredentialId = c.Id AND lp.rn = 1
            LEFT JOIN Aliases a ON a.Id = c.AliasId AND a.IsDeleted = 0
            WHERE c.IsDeleted = 0
            GROUP BY c.Id
            ORDER BY c.CreatedAt DESC
        """

        var credentials: [Credential] = []
        for row in try dbConn.prepare(query) {
            guard let idString = row[0] as? String else {
                continue
            }

            let createdAtString = row[4] as? String
            let updatedAtString = row[5] as? String

            guard let createdAtString = createdAtString,
                  let updatedAtString = updatedAtString else {
                continue
            }

            guard let createdAt = parseDateString(createdAtString),
                  let updatedAt = parseDateString(updatedAtString) else {
                continue
            }

            guard let isDeletedInt64 = row[6] as? Int64 else { continue }
            let isDeleted = isDeletedInt64 == 1

            guard let serviceId = row[7] as? String,
                  let serviceCreatedAtString = row[11] as? String,
                  let serviceUpdatedAtString = row[12] as? String,
                  let serviceIsDeletedInt64 = row[13] as? Int64,
                  let serviceCreatedAt = parseDateString(serviceCreatedAtString),
                  let serviceUpdatedAt = parseDateString(serviceUpdatedAtString) else {
                continue
            }

            let serviceIsDeleted = serviceIsDeletedInt64 == 1

            let service = Service(
                id: UUID(uuidString: serviceId)!,
                name: row[8] as? String,
                url: row[9] as? String,
                logo: (row[10] as? SQLite.Blob).map { Data($0.bytes) },
                createdAt: serviceCreatedAt,
                updatedAt: serviceUpdatedAt,
                isDeleted: serviceIsDeleted
            )

            var alias: Alias?
            if let aliasIdString = row[19] as? String,
               let aliasCreatedAtString = row[26] as? String,
               let aliasUpdatedAtString = row[27] as? String,
               let aliasIsDeletedInt64 = row[28] as? Int64,
               let aliasCreatedAt = parseDateString(aliasCreatedAtString),
               let aliasUpdatedAt = parseDateString(aliasUpdatedAtString) {

                let aliasIsDeleted = aliasIsDeletedInt64 == 1

                let aliasBirthDate: Date
                if let aliasBirthDateString = row[24] as? String,
                   let parsedBirthDate = parseDateString(aliasBirthDateString) {
                    aliasBirthDate = parsedBirthDate
                } else {
                    var dateComponents = DateComponents()
                    dateComponents.year = 1
                    dateComponents.month = 1
                    dateComponents.day = 1
                    aliasBirthDate = Calendar(identifier: .gregorian).date(from: dateComponents)!
                }

                alias = Alias(
                    id: UUID(uuidString: aliasIdString)!,
                    gender: row[20] as? String,
                    firstName: row[21] as? String,
                    lastName: row[22] as? String,
                    nickName: row[23] as? String,
                    birthDate: aliasBirthDate,
                    email: row[25] as? String,
                    createdAt: aliasCreatedAt,
                    updatedAt: aliasUpdatedAt,
                    isDeleted: aliasIsDeleted
                )
            }

            var password: Password?
            if let passwordIdString = row[14] as? String,
               let passwordValue = row[15] as? String,
               let passwordCreatedAtString = row[16] as? String,
               let passwordUpdatedAtString = row[17] as? String,
               let passwordIsDeletedInt64 = row[18] as? Int64,
               let passwordCreatedAt = parseDateString(passwordCreatedAtString),
               let passwordUpdatedAt = parseDateString(passwordUpdatedAtString) {

                let passwordIsDeleted = passwordIsDeletedInt64 == 1

                password = Password(
                    id: UUID(uuidString: passwordIdString)!,
                    credentialId: UUID(uuidString: idString)!,
                    value: passwordValue,
                    createdAt: passwordCreatedAt,
                    updatedAt: passwordUpdatedAt,
                    isDeleted: passwordIsDeleted
                )
            }

            // Load passkeys for this credential
            let passkeys = try getPasskeys(forCredentialId: UUID(uuidString: idString)!)

            let credential = Credential(
                id: UUID(uuidString: idString)!,
                alias: alias,
                service: service,
                username: row[2] as? String,
                notes: row[3] as? String,
                password: password,
                passkeys: passkeys,
                createdAt: createdAt,
                updatedAt: updatedAt,
                isDeleted: isDeleted
            )

            credentials.append(credential)
        }

        return credentials
    }

    // MARK: - Helper Methods

    /**
     * Parse a date string to a Date object for use in queries.
     */
    private func parseDateString(_ dateString: String) -> Date? {
        struct StaticFormatters {
            static let formatterWithMillis: DateFormatter = {
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = TimeZone(secondsFromGMT: 0)
                return formatter
            }()

            static let formatterWithoutMillis: DateFormatter = {
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = TimeZone(secondsFromGMT: 0)
                return formatter
            }()

            static let isoFormatter: ISO8601DateFormatter = {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                formatter.timeZone = TimeZone(secondsFromGMT: 0)
                return formatter
            }()
        }

        let cleanedDateString = dateString.trimmingCharacters(in: .whitespacesAndNewlines)

        if cleanedDateString.contains("Z") || cleanedDateString.contains("+") || cleanedDateString.contains("-") {
            if let isoDate = StaticFormatters.isoFormatter.date(from: cleanedDateString) {
                return isoDate
            }
        }

        if let dateWithMillis = StaticFormatters.formatterWithMillis.date(from: cleanedDateString) {
            return dateWithMillis
        }

        if let dateWithoutMillis = StaticFormatters.formatterWithoutMillis.date(from: cleanedDateString) {
            return dateWithoutMillis
        }

        return nil
    }
}

/**
 * VaultStore errors
 */
public enum VaultStoreError: Error {
    case vaultNotUnlocked
    case passkeyNotFound
    case credentialNotFound
    case databaseError(String)
}
