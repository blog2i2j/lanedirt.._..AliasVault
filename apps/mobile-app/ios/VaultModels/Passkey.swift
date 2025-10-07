import Foundation

/**
 * Passkey model representing a WebAuthn credential
 * Linked to a parent Credential for UI display (service name, logo, etc.)
 */
public struct Passkey: Codable, Hashable, Equatable {
    public let id: UUID
    public let credentialId: Data  // 16-byte GUID, converted to base64url for WebAuthn
    public let credentialIdString: String  // Parent credential UUID
    public let rpId: String  // Relying party identifier (domain)
    public let userId: Data?  // User identifier from RP (optional)
    public let userName: String?  // User-visible identifier (typically email)
    public let publicKey: Data  // JWK format (JSON)
    public let privateKey: Data  // JWK format (JSON), encrypted in storage
    public let prfKey: Data?  // PRF secret (32 bytes) if extension enabled
    public let displayName: String  // User-facing name for this passkey
    public let createdAt: Date
    public let updatedAt: Date
    public let isDeleted: Bool

    public init(
        id: UUID,
        credentialId: Data,
        credentialIdString: String,
        rpId: String,
        userId: Data?,
        userName: String?,
        publicKey: Data,
        privateKey: Data,
        prfKey: Data?,
        displayName: String,
        createdAt: Date,
        updatedAt: Date,
        isDeleted: Bool
    ) {
        self.id = id
        self.credentialId = credentialId
        self.credentialIdString = credentialIdString
        self.rpId = rpId
        self.userId = userId
        self.userName = userName
        self.publicKey = publicKey
        self.privateKey = privateKey
        self.prfKey = prfKey
        self.displayName = displayName
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isDeleted = isDeleted
    }

    public static func == (lhs: Passkey, rhs: Passkey) -> Bool {
        return lhs.id == rhs.id
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
