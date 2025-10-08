import AuthenticationServices
import VaultModels
import VaultUI

/**
 * Native iOS implementation of the CredentialIdentityStore protocol.
 *
 * This class is used to save and remove credential identities from the system.
 * It is used to provide credentials to the system when the user is autocompleting a password.
 */
public class CredentialIdentityStore {
    static let shared = CredentialIdentityStore()
    private let store = ASCredentialIdentityStore.shared

    private init() {}

    /// Save credentials into the native iOS credential store.
    /// - Parameters:
    ///   - credentials: The credentials to register
    ///   - passkeyOnly: If true, only register passkey identities (skip passwords). Default is false.
    public func saveCredentialIdentities(_ credentials: [Credential], passkeyOnly: Bool = false) async throws {
        // TODO: improve implementation to better separate password and passkey identities.
        // As if a record has both a password and passkey, it will not only show up as a password identity.
        var allIdentities: [ASCredentialIdentity] = []

        // Create password identities (skip if passkeyOnly mode)
        let passwordIdentities: [ASPasswordCredentialIdentity] = passkeyOnly ? [] : credentials.compactMap { credential in
            guard let urlString = credential.service.url,
                  let url = URL(string: urlString),
                  let host = url.host else {
                return nil
            }

            // Use the same logic as the UI for determining the identifier
            let identifier = usernameOrEmail(credential: credential)
            guard !identifier.isEmpty else {
                return nil // Skip credentials with no identifier
            }

            guard let password = credential.password, !password.value.isEmpty else {
                return nil // Skip credentials with no password (e.g. applies when this record is a passkey)
            }

            let effectiveDomain = Self.effectiveDomain(from: host)

            return ASPasswordCredentialIdentity(
                serviceIdentifier: ASCredentialServiceIdentifier(identifier: effectiveDomain, type: .domain),
                user: identifier,
                recordIdentifier: credential.id.uuidString
            )
        }

        allIdentities.append(contentsOf: passwordIdentities)

        // Create passkey identities
        let passkeyIdentities: [ASPasskeyCredentialIdentity] = credentials.flatMap { credential -> [ASPasskeyCredentialIdentity] in
            guard let passkeys = credential.passkeys else {
                return []
            }

            return passkeys.filter { !($0.isDeleted) }
                .compactMap { passkey in
                    // Get the userName for display in iOS AutoFill UI
                    // Passkeys don't store userName in the database, so we use the credential's username or email
                    let userName = passkey.userName ?? usernameOrEmail(credential: credential)

                    // iOS requires a non-empty userName to display the passkey in AutoFill
                    if userName.isEmpty {
                        print("CredentialIdentityStore: Skipping passkey \(passkey.id) - userName is empty")
                        return nil
                    }

                    // For passkeys, we use the rpId from the passkey itself, not the service URL
                    // This is because passkeys are tied to the RP ID, which may differ from the service URL
                    return ASPasskeyCredentialIdentity(
                        relyingPartyIdentifier: passkey.rpId,
                        userName: userName,
                        credentialID: passkey.credentialId,
                        userHandle: passkey.userHandle ?? Data(),
                        recordIdentifier: passkey.id.uuidString
                    )
                }
        }

        allIdentities.append(contentsOf: passkeyIdentities)

        print("CredentialIdentityStore: Registering \(passwordIdentities.count) password identities and \(passkeyIdentities.count) passkey identities")

        guard !allIdentities.isEmpty else {
            print("CredentialIdentityStore: No valid identities to save.")
            return
        }

        let state = await storeState()
        guard state.isEnabled else {
            print("CredentialIdentityStore: Credential identity store is not enabled. Please enable AutoFill in iOS Settings.")
            return
        }

        print("CredentialIdentityStore: Store is enabled, saving \(allIdentities.count) total identities")

        do {
            try await store.saveCredentialIdentities(allIdentities)
            print("CredentialIdentityStore: Successfully saved all identities")
        } catch {
            print("CredentialIdentityStore: Failed to save credential identities: \(error)")
        }
    }

    /// Remove all credentials from iOS credential store.
    public func removeAllCredentialIdentities() async throws {
        try await store.removeAllCredentialIdentities()
    }

    /// Remove one or more specific credentials from iOS credential store.
    public func removeCredentialIdentities(_ credentials: [Credential]) async throws {
        let identities = credentials.compactMap { credential -> ASPasswordCredentialIdentity? in
            let serviceIdentifier = ASCredentialServiceIdentifier(
                identifier: credential.service.name ?? "",
                type: .domain
            )

            // Use the same logic as the UI for determining the identifier
            let identifier = usernameOrEmail(credential: credential)
            guard !identifier.isEmpty else {
                return nil // Skip credentials with no identifier
            }

            return ASPasswordCredentialIdentity(
                serviceIdentifier: serviceIdentifier,
                user: identifier,
                recordIdentifier: credential.id.uuidString
            )
        }

        try await store.removeCredentialIdentities(identities)
    }

    private func storeState() async -> ASCredentialIdentityStoreState {
        await withCheckedContinuation { continuation in
            store.getState { state in
                continuation.resume(returning: state)
            }
        }
    }

    private static func effectiveDomain(from host: String) -> String {
        let parts = host.split(separator: ".")
        guard parts.count >= 2 else { return host }
        return parts.suffix(2).joined(separator: ".")
    }
}
