import Foundation
import SQLite
import VaultModels
import VaultUtils

/**
 * VaultStore+Passkey
 * Extension to VaultStore for passkey operations
 */
extension VaultStore {

    // MARK: - Column Expressions

    private static let passkeysTable = Table("Passkeys")

    private static let colId = Expression<String>("Id")
    private static let colItemId = Expression<String>("ItemId")
    private static let colRpId = Expression<String>("RpId")
    private static let colUserHandle = Expression<Blob?>("UserHandle")
    private static let colPublicKey = Expression<String>("PublicKey")
    private static let colPrivateKey = Expression<String>("PrivateKey")
    private static let colPrfKey = Expression<Blob?>("PrfKey")
    private static let colDisplayName = Expression<String>("DisplayName")
    private static let colAdditionalData = Expression<Blob?>("AdditionalData")
    private static let colCreatedAt = Expression<String>("CreatedAt")
    private static let colUpdatedAt = Expression<String>("UpdatedAt")
    private static let colIsDeleted = Expression<Int64>("IsDeleted")

    // MARK: - Passkey Queries

    /**
     * Get a passkey by its credential ID (the WebAuthn credential ID, not the parent Credential UUID)
     */
    public func getPasskey(byCredentialId credentialId: Data) throws -> Passkey? {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        // The Passkeys.Id column is a string UUID (not a blob), so we need to convert the credentialId bytes to a UUID string.
        // Use PasskeyHelper to convert the credentialId (Data) to a UUID string for lookup.
        guard let credentialIdString = try? PasskeyHelper.bytesToGuid(credentialId) else {
            print("VaultStore+Passkey: Failed to convert credentialId bytes to UUID string")
            return nil
        }
        let query = Self.passkeysTable
            .filter(Self.colId == credentialIdString)
            .filter(Self.colIsDeleted == 0)
            .limit(1)

        for row in try dbConn.prepare(query) {
            if let passkey = try parsePasskeyRow(row) {
                return passkey
            }
        }

        return nil
    }

    /**
     * Get all passkeys for an item (new model)
     */
    public func getPasskeys(forItemId itemId: UUID) throws -> [Passkey] {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let query = Self.passkeysTable
            .filter(Self.colItemId == itemId.uuidString)
            .filter(Self.colIsDeleted == 0)
            .order(Self.colCreatedAt.desc)

        var passkeys: [Passkey] = []
        for row in try dbConn.prepare(query) {
            if let passkey = try parsePasskeyRow(row) {
                passkeys.append(passkey)
            }
        }

        return passkeys
    }

    /**
     * Get all passkeys for a credential (legacy alias for backwards compatibility)
     */
    public func getPasskeys(forCredentialId credentialId: UUID) throws -> [Passkey] {
        return try getPasskeys(forItemId: credentialId)
    }

    /**
     * Get all passkeys for a specific relying party identifier (RP ID)
     */
    public func getPasskeys(forRpId rpId: String) throws -> [Passkey] {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let query = Self.passkeysTable
            .filter(Self.colRpId == rpId)
            .filter(Self.colIsDeleted == 0)
            .order(Self.colCreatedAt.desc)

        var passkeys: [Passkey] = []
        for row in try dbConn.prepare(query) {
            if let passkey = try parsePasskeyRow(row) {
                passkeys.append(passkey)
            }
        }

        return passkeys
    }

    /**
     * Get passkeys with item info for a specific rpId and optionally username
     * Used for finding existing passkeys that might be replaced during registration
     */
    public func getPasskeysWithCredentialInfo(forRpId rpId: String, userName: String? = nil, userId: Data? = nil) throws -> [(passkey: Passkey, serviceName: String?, username: String?)] {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        // Join passkeys with items and field values to get display info
        let passkeysTable = Table("Passkeys")
        let itemsTable = Table("Items")
        let fieldValuesTable = Table("FieldValues")

        // First get passkeys joined with items
        let query = passkeysTable
            .select(passkeysTable[*], itemsTable[Expression<String?>("Name")])
            .join(itemsTable, on: passkeysTable[Expression<String>("ItemId")] == itemsTable[Expression<String>("Id")])
            .filter(passkeysTable[Expression<String>("RpId")] == rpId)
            .filter(passkeysTable[Expression<Int64>("IsDeleted")] == 0)
            .filter(itemsTable[Expression<Int64>("IsDeleted")] == 0)
            .order(passkeysTable[Expression<String>("CreatedAt")].desc)

        var results: [(passkey: Passkey, serviceName: String?, username: String?)] = []

        for row in try dbConn.prepare(query) {
            if let passkey = try parsePasskeyRow(row) {
                let serviceName = try? row.get(Expression<String?>("Name"))

                // Get username from field values (login.username)
                let usernameQuery = fieldValuesTable
                    .filter(Expression<String>("ItemId") == passkey.parentCredentialId.uuidString)
                    .filter(Expression<String?>("FieldKey") == FieldKey.loginUsername)
                    .filter(Expression<Int64>("IsDeleted") == 0)
                    .limit(1)

                var credUsername: String?
                if let usernameRow = try? dbConn.pluck(usernameQuery) {
                    credUsername = try? usernameRow.get(Expression<String?>("Value"))
                }

                // Filter by username or userId if provided
                var matches = true
                if let userName = userName {
                    if credUsername != userName {
                        matches = false
                    }
                }
                if let userId = userId {
                    if passkey.userHandle != userId {
                        matches = false
                    }
                }

                if matches {
                    results.append((passkey: passkey, serviceName: serviceName, username: credUsername))
                }
            }
        }

        return results
    }

    // MARK: - Helper Methods

    /**
     * Parse a passkey row from database query using type-safe column expressions
     */
    private func parsePasskeyRow(_ row: Row) throws -> Passkey? {
        // Extract required fields using column expressions
        let idString = try row.get(Self.colId)
        let parentCredentialIdString = try row.get(Self.colItemId)
        let rpId = try row.get(Self.colRpId)
        let userHandleBlob = try? row.get(Self.colUserHandle)
        let publicKeyString = try row.get(Self.colPublicKey)
        let privateKeyString = try row.get(Self.colPrivateKey)
        let displayName = try row.get(Self.colDisplayName)
        let createdAtString = try row.get(Self.colCreatedAt)
        let updatedAtString = try row.get(Self.colUpdatedAt)
        let isDeletedInt64 = try row.get(Self.colIsDeleted)

        // Parse UUIDs
        guard let id = UUID(uuidString: idString),
              let parentCredentialId = UUID(uuidString: parentCredentialIdString) else {
            print("VaultStore+Passkey: Invalid UUID in passkey row - id=\(idString), credentialId=\(parentCredentialIdString)")
            return nil
        }

        // Parse dates
        guard let createdAt = DateHelpers.parseDateString(createdAtString),
              let updatedAt = DateHelpers.parseDateString(updatedAtString) else {
            print("VaultStore+Passkey: Invalid date in passkey row - created=\(createdAtString), updated=\(updatedAtString)")
            return nil
        }

        // Parse public/private keys
        guard let publicKeyData = publicKeyString.data(using: .utf8),
              let privateKeyData = privateKeyString.data(using: .utf8) else {
            print("VaultStore+Passkey: Invalid key data in passkey row")
            return nil
        }

        // Parse userHandle (stored as blob - raw bytes)
        let userHandle: Data?
        if let userHandleBlob = userHandleBlob {
            userHandle = Data(userHandleBlob.bytes)
        } else {
            userHandle = nil
        }

        // Parse PrfKey (stored as blob)
        let prfKey: Data?
        if let prfKeyBlob = try? row.get(Self.colPrfKey) {
            prfKey = Data(prfKeyBlob.bytes)
        } else {
            prfKey = nil
        }

        let isDeleted = isDeletedInt64 == 1

        return Passkey(
            id: id,
            parentCredentialId: parentCredentialId,  // Parent Credential UUID
            rpId: rpId,
            userHandle: userHandle,
            userName: nil,  // userName not stored in DB, derived from parent credential
            publicKey: publicKeyData,
            privateKey: privateKeyData,
            prfKey: prfKey,
            displayName: displayName,
            createdAt: createdAt,
            updatedAt: updatedAt,
            isDeleted: isDeleted
        )
    }

    // MARK: - Passkey Storage

    /**
     * Format a date for database insertion
     * Format: yyyy-MM-dd HH:mm:ss
     */
    private func formatDateForDatabase(_ date: Date) -> String {
        return DateHelpers.toStandardFormat(date)
    }

    /**
     * Create an item with a passkey (for passkey registration)
     * This creates an Item record with field values and links the passkey to it
     */
    public func createCredentialWithPasskey(
        rpId: String,
        userName: String?,
        displayName: String,
        passkey: Passkey,
        logo: Data? = nil
    ) throws -> Credential {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let itemId = passkey.parentCredentialId
        let now = Date()
        let timestamp = formatDateForDatabase(now)

        // Create logo if provided
        var logoId: UUID?
        if let logo = logo {
            logoId = UUID()
            let logosTable = Table("Logos")
            let logoBlob = Blob(bytes: [UInt8](logo))

            // Extract normalized domain from rpId for source
            let source = rpId.lowercased().replacingOccurrences(of: "www.", with: "")

            let logoInsert = logosTable.insert(
                Expression<String>("Id") <- logoId!.uuidString,
                Expression<String>("Source") <- source,
                Expression<SQLite.Blob?>("FileData") <- logoBlob,
                Expression<String?>("MimeType") <- "image/png",
                Expression<String?>("FetchedAt") <- nil,
                Expression<String>("CreatedAt") <- timestamp,
                Expression<String>("UpdatedAt") <- timestamp,
                Expression<Int64>("IsDeleted") <- 0
            )
            try dbConn.run(logoInsert)
        }

        // Create the Item
        let itemsTable = Table("Items")
        let itemInsert = itemsTable.insert(
            Expression<String>("Id") <- itemId.uuidString,
            Expression<String?>("Name") <- displayName,
            Expression<String>("ItemType") <- ItemType.login,
            Expression<String?>("LogoId") <- logoId?.uuidString,
            Expression<String?>("FolderId") <- nil,
            Expression<String?>("DeletedAt") <- nil,
            Expression<String>("CreatedAt") <- timestamp,
            Expression<String>("UpdatedAt") <- timestamp,
            Expression<Int64>("IsDeleted") <- 0
        )
        try dbConn.run(itemInsert)

        // Create field values
        let fieldValuesTable = Table("FieldValues")

        // Add login.url field
        let urlFieldId = UUID()
        let urlFieldInsert = fieldValuesTable.insert(
            Expression<String>("Id") <- urlFieldId.uuidString,
            Expression<String>("ItemId") <- itemId.uuidString,
            Expression<String?>("FieldDefinitionId") <- nil,
            Expression<String?>("FieldKey") <- FieldKey.loginUrl,
            Expression<String?>("Value") <- "https://\(rpId)",
            Expression<Int64>("Weight") <- 0,
            Expression<String>("CreatedAt") <- timestamp,
            Expression<String>("UpdatedAt") <- timestamp,
            Expression<Int64>("IsDeleted") <- 0
        )
        try dbConn.run(urlFieldInsert)

        // Add login.username field if provided
        if let userName = userName, !userName.isEmpty {
            let usernameFieldId = UUID()
            let usernameFieldInsert = fieldValuesTable.insert(
                Expression<String>("Id") <- usernameFieldId.uuidString,
                Expression<String>("ItemId") <- itemId.uuidString,
                Expression<String?>("FieldDefinitionId") <- nil,
                Expression<String?>("FieldKey") <- FieldKey.loginUsername,
                Expression<String?>("Value") <- userName,
                Expression<Int64>("Weight") <- 0,
                Expression<String>("CreatedAt") <- timestamp,
                Expression<String>("UpdatedAt") <- timestamp,
                Expression<Int64>("IsDeleted") <- 0
            )
            try dbConn.run(usernameFieldInsert)
        }

        // Insert the passkey
        try insertPasskey(passkey)

        // Return the credential (legacy format for backwards compatibility)
        let service = Service(
            id: itemId,
            name: displayName,
            url: "https://\(rpId)",
            logo: logo,
            createdAt: now,
            updatedAt: now,
            isDeleted: false
        )

        return Credential(
            id: itemId,
            alias: nil,
            service: service,
            username: userName,
            notes: nil,
            password: nil,
            passkeys: [passkey],
            createdAt: now,
            updatedAt: now,
            isDeleted: false
        )
    }

    /**
     * Insert a new passkey into the database
     */
    public func insertPasskey(_ passkey: Passkey) throws {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        let insert = Self.passkeysTable.insert(
            Self.colId <- passkey.id.uuidString,
            Self.colItemId <- passkey.parentCredentialId.uuidString,
            Self.colRpId <- passkey.rpId,
            Self.colUserHandle <- passkey.userHandle.map { Blob(bytes: [UInt8]($0)) },
            Self.colPublicKey <- String(data: passkey.publicKey, encoding: .utf8)!,
            Self.colPrivateKey <- String(data: passkey.privateKey, encoding: .utf8)!,
            Self.colPrfKey <- passkey.prfKey.map { Blob(bytes: [UInt8]($0)) },
            Self.colDisplayName <- passkey.displayName,
            Self.colCreatedAt <- formatDateForDatabase(passkey.createdAt),
            Self.colUpdatedAt <- formatDateForDatabase(passkey.updatedAt),
            Self.colIsDeleted <- Int64(passkey.isDeleted ? 1 : 0)
        )

        try dbConn.run(insert)
    }

    /**
     * Replace an existing passkey with a new one
     * This deletes the old passkey and creates a new one with the same item
     */
    public func replacePasskey(oldPasskeyId: UUID, newPasskey: Passkey, displayName: String, logo: Data? = nil) throws {
        guard let dbConn = dbConnection else {
            throw VaultStoreError.vaultNotUnlocked
        }

        // Get the old passkey to find its item
        let oldPasskeyQuery = Self.passkeysTable
            .filter(Self.colId == oldPasskeyId.uuidString)
            .filter(Self.colIsDeleted == 0)
            .limit(1)

        guard let oldPasskeyRow = try dbConn.pluck(oldPasskeyQuery),
              let oldPasskey = try parsePasskeyRow(oldPasskeyRow) else {
            throw VaultStoreError.databaseError("Passkey not found")
        }

        let itemId = oldPasskey.parentCredentialId
        let now = Date()
        let timestamp = formatDateForDatabase(now)

        // Update the item's logo if provided
        if let logo = logo {
            let itemsTable = Table("Items")
            let logosTable = Table("Logos")

            // Get the current logo ID from the item
            let itemQuery = itemsTable
                .filter(Expression<String>("Id") == itemId.uuidString)
                .limit(1)

            if let itemRow = try dbConn.pluck(itemQuery) {
                let existingLogoId = try? itemRow.get(Expression<String?>("LogoId"))

                let logoBlob = Blob(bytes: [UInt8](logo))

                if let logoIdString = existingLogoId, let logoId = UUID(uuidString: logoIdString) {
                    // Update existing logo
                    let logoUpdate = logosTable
                        .filter(Expression<String>("Id") == logoId.uuidString)
                        .update(
                            Expression<SQLite.Blob?>("FileData") <- logoBlob,
                            Expression<String>("UpdatedAt") <- timestamp
                        )
                    try dbConn.run(logoUpdate)
                } else {
                    // Create new logo
                    let newLogoId = UUID()
                    let source = newPasskey.rpId.lowercased().replacingOccurrences(of: "www.", with: "")
                    let logoInsert = logosTable.insert(
                        Expression<String>("Id") <- newLogoId.uuidString,
                        Expression<String>("Source") <- source,
                        Expression<SQLite.Blob?>("FileData") <- logoBlob,
                        Expression<String?>("MimeType") <- "image/png",
                        Expression<String?>("FetchedAt") <- nil,
                        Expression<String>("CreatedAt") <- timestamp,
                        Expression<String>("UpdatedAt") <- timestamp,
                        Expression<Int64>("IsDeleted") <- 0
                    )
                    try dbConn.run(logoInsert)

                    // Update item with new logo ID
                    let itemUpdate = itemsTable
                        .filter(Expression<String>("Id") == itemId.uuidString)
                        .update(
                            Expression<String?>("LogoId") <- newLogoId.uuidString,
                            Expression<String>("UpdatedAt") <- timestamp
                        )
                    try dbConn.run(itemUpdate)
                }

                // Update item name with displayName
                let nameUpdate = itemsTable
                    .filter(Expression<String>("Id") == itemId.uuidString)
                    .update(
                        Expression<String?>("Name") <- displayName,
                        Expression<String>("UpdatedAt") <- timestamp
                    )
                try dbConn.run(nameUpdate)
            }
        }

        // Delete the old passkey
        let deleteQuery = Self.passkeysTable
            .filter(Self.colId == oldPasskeyId.uuidString)
            .update(
                Self.colIsDeleted <- 1,
                Self.colUpdatedAt <- timestamp
            )

        try dbConn.run(deleteQuery)

        // Create the new passkey with the same item ID
        let updatedPasskey = Passkey(
            id: newPasskey.id,
            parentCredentialId: itemId,  // Use the old item ID
            rpId: newPasskey.rpId,
            userHandle: newPasskey.userHandle,
            userName: newPasskey.userName,
            publicKey: newPasskey.publicKey,
            privateKey: newPasskey.privateKey,
            prfKey: newPasskey.prfKey,
            displayName: displayName,
            createdAt: now,
            updatedAt: now,
            isDeleted: false
        )

        try insertPasskey(updatedPasskey)
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
