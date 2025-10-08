import AuthenticationServices
import SwiftUI
import VaultStoreKit
import VaultUI
import VaultModels

/**
 * Credential-specific functionality for CredentialProviderViewController
 * This extension handles all password credential operations
 */
extension CredentialProviderViewController: CredentialProviderDelegate {

    // MARK: - CredentialProviderDelegate Implementation

    func setupCredentialView(vaultStore: VaultStore, serviceUrl: String?) throws -> UIViewController {
        // Create the ViewModel with injected behaviors
        let viewModel = CredentialProviderViewModel(
            loader: {
                return try await self.loadCredentials(vaultStore: vaultStore)
            },
            selectionHandler: { identifier, password in
                self.handleCredentialSelection(identifier: identifier, password: password)
            },
            cancelHandler: {
                self.handleCancel()
            },
            serviceUrl: serviceUrl
        )

        // Set text insertion mode if needed
        if isChoosingTextToInsert {
            viewModel.isChoosingTextToInsert = true
        }

        let hostingController = UIHostingController(
            rootView: CredentialProviderView(viewModel: viewModel)
        )

        return hostingController
    }

    func handleCredentialSelection(identifier: String, password: String) {
        if isChoosingTextToInsert {
            // For text insertion, insert only the selected text
            if #available(iOS 18.0, *) {
                self.extensionContext.completeRequest(
                    withTextToInsert: identifier,
                    completionHandler: nil
                )
            } else {
                // Fallback on earlier versions: do nothing as this feature
                // is not supported and we should not reach this point?
            }
        } else {
            // For regular credential selection
            let passwordCredential = ASPasswordCredential(
                user: identifier,
                password: password
            )
            self.extensionContext.completeRequest(withSelectedCredential: passwordCredential, completionHandler: nil)
        }
    }

    func loadCredentials(vaultStore: VaultStore) async throws -> [Credential] {
        // getAllCredentials now includes passkeys for each credential
        let credentials = try vaultStore.getAllCredentials()

        // Register all credential identities (passwords and passkeys)
        await self.registerCredentialIdentities(credentials: credentials)

        return credentials
    }

    // MARK: - Credential-specific Methods

    override public func prepareInterfaceForUserChoosingTextToInsert() {
        isChoosingTextToInsert = true
        // This will be handled by the credential view model when it's created
    }

    override public func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        // QuickType bar suggestions are disabled on iOS <26, so this should only be called on iOS 26+
        if #unavailable(iOS 26.0) {
            // iOS < 26 - we do not support quick autofill due to buggy behavior
            print("provideCredentialWithoutUserInteraction called on iOS <26 (unexpected)")
            self.extensionContext.cancelRequest(
                withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userInteractionRequired.rawValue
                )
            )
            return
        }

        do {
            let vaultStore = VaultStore()

            // Check if vault database exists
            guard vaultStore.hasEncryptedDatabase else {
                self.extensionContext.cancelRequest(
                    withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.userInteractionRequired.rawValue
                    )
                )
                return
            }

            // Unlock vault with biometrics (iOS 26+ works reliably)
            try vaultStore.unlockVault()

            let credentials = try vaultStore.getAllCredentials()

            if let matchingCredential = credentials.first(where: { credential in
                return credential.id.uuidString == credentialIdentity.recordIdentifier
            }) {
                // Use the identifier that matches the credential identity
                let identifier = credentialIdentity.user
                let passwordCredential = ASPasswordCredential(
                    user: identifier,
                    password: matchingCredential.password?.value ?? ""
                )
                self.extensionContext.completeRequest(withSelectedCredential: passwordCredential, completionHandler: nil)
            } else {
                self.extensionContext.cancelRequest(
                    withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.credentialIdentityNotFound.rawValue
                    )
                )
            }
        } catch {
            print("provideCredentialWithoutUserInteraction error: \(error)")
            // On any error, request user interaction
            self.extensionContext.cancelRequest(
                withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userInteractionRequired.rawValue
                )
            )
        }
    }

    /// Register credential identities for QuickType suggestions
    private func registerCredentialIdentities(credentials: [Credential]) async {
        do {
            if #available(iOS 26.0, *) {
                // iOS 26+: Register both passwords and passkeys for QuickType and manual selection
                try await CredentialIdentityStore.shared.saveCredentialIdentities(credentials)
                print("Registered credential identities (passwords + passkeys) for QuickType on iOS 26+")
            } else {
                // iOS 17-25: Only register passkeys (skip passwords for QuickType to avoid biometric issues)
                // But passkeys MUST be registered so iOS knows to offer this extension for passkey authentication
                let passkeyOnlyCredentials = credentials.filter { credential in
                    guard let passkeys = credential.passkeys else { return false }
                    return !passkeys.isEmpty
                }
                try await CredentialIdentityStore.shared.saveCredentialIdentities(passkeyOnlyCredentials, passkeyOnly: true)
                print("Registered \(passkeyOnlyCredentials.count) passkey identities on iOS <26 (password QuickType disabled)")
            }
        } catch {
            print("Failed to save credential identities: \(error)")
        }
    }
}
