import AuthenticationServices
import SwiftUI
import VaultStoreKit
import VaultUI
import VaultModels

/**
 * Passkey-related functionality for CredentialProviderViewController
 * This extension handles all passkey registration and authentication operations
 */
extension CredentialProviderViewController: PasskeyProviderDelegate {
    // MARK: - PasskeyProviderDelegate Implementation

    func setupPasskeyView(vaultStore: VaultStore, rpId: String, clientDataHash: Data) throws -> UIViewController {
        let viewModel = PasskeyProviderViewModel(
            loader: {
                // getAllCredentials now includes passkeys for each credential
                // TODO: call a separate method for only retrieving passkeys?
                var credentials = try vaultStore.getAllCredentials()

                // Filter to only include credentials that actually have passkeys
                credentials = credentials.filter { credential in
                    guard let passkeys = credential.passkeys else { return false }
                    return !passkeys.isEmpty
                }

                return credentials
            },
            selectionHandler: { credential in
                // For passkey authentication, we assume the data is available
                self.handlePasskeyCredentialSelection(credential: credential, clientDataHash: clientDataHash, rpId: rpId)
            },
            cancelHandler: {
                self.handleCancel()
            },
            rpId: rpId
        )

        let passkeyView = PasskeyProviderView(viewModel: viewModel)
        let hostingController = UIHostingController(rootView: passkeyView)

        return hostingController
    }

    func handlePasskeySelection(credential: Credential, clientDataHash: Data, rpId: String) {
        handlePasskeyCredentialSelection(credential: credential, clientDataHash: clientDataHash, rpId: rpId)
    }

    func loadPasskeyCredentials(vaultStore: VaultStore, rpId: String?) async throws -> [Credential] {
        return try await loadPasskeyCredentials(vaultStore: vaultStore, rpId: rpId ?? "")
    }

    /**
     * Provide passkey credential without user interaction
     */
    internal func providePasskeyCredentialWithoutUserInteraction(for request: ASPasskeyCredentialRequest) {
        do {
            let vaultStore = VaultStore()

            // Check vault state
            guard sanityChecks(vaultStore: vaultStore) else {
                return
            }

            // Unlock vault
            try vaultStore.unlockVault()

            let clientDataHash = request.clientDataHash
            let credentialIdentity = request.credentialIdentity as? ASPasskeyCredentialIdentity
            let rpId = credentialIdentity?.relyingPartyIdentifier ?? ""
            let credentialID = credentialIdentity?.credentialID ?? Data()

            // Look up passkey by credential ID
            guard let passkey = try vaultStore.getPasskey(byCredentialId: credentialID) else {
                extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.credentialIdentityNotFound.rawValue
                ))
                return
            }

            // Generate assertion
            let credentialId = try? PasskeyHelper.guidToBytes(passkey.id.uuidString)
            let assertion = try PasskeyAuthenticator.getAssertion(
                credentialId: credentialId ?? Data(),
                clientDataHash: clientDataHash,
                rpId: rpId,
                privateKeyJWK: passkey.privateKey,
                userId: passkey.userHandle,
                uvPerformed: true,
                prfInputs: nil,
                prfSecret: passkey.prfKey
            )

            // Complete the request
            let credential = ASPasskeyAssertionCredential(
                userHandle: assertion.userHandle ?? Data(),
                relyingParty: rpId,
                signature: assertion.signature,
                clientDataHash: clientDataHash,
                authenticatorData: assertion.authenticatorData,
                credentialID: assertion.credentialId
            )

            extensionContext.completeAssertionRequest(using: credential)

        } catch {
            print("Passkey authentication without UI error: \(error)")
            // Require user interaction if we can't authenticate silently
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.userInteractionRequired.rawValue
            ))
        }
    }

    // MARK: - Passkey Registration

    /**
     * Handle passkey registration request from the system
     */
    func handlePasskeyRegistration(_ registrationRequest: ASCredentialRequest) {
        // Set flag to prevent normal credential view from loading
        self.isPasskeyRegistrationMode = true


    }

    override public func prepareInterface(forPasskeyRegistration registrationRequest: any ASCredentialRequest) {
        self.isPasskeyRegistrationMode = true

        guard let passkeyRequest = registrationRequest as? ASPasskeyCredentialRequest else {
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue
            ))
            return
        }

        // Extract registration request data
        let credentialIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = credentialIdentity?.relyingPartyIdentifier ?? ""
        let userId = credentialIdentity?.userHandle
        let userName = credentialIdentity?.userName
        let userDisplayName = credentialIdentity?.userName // Use userName as displayName for now
        let clientDataHash = passkeyRequest.clientDataHash

        // Initialize vault store
        let vaultStore = VaultStore()

        // Check vault state
        guard sanityChecks(vaultStore: vaultStore) else {
            return
        }

        // Unlock vault
        do {
            try vaultStore.unlockVault()
        } catch {
            print("PasskeyRegistration: Failed to unlock vault: \(error)")
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "Failed to unlock vault"]
            ))
            return
        }

        // Show passkey registration UI
        showPasskeyRegistrationView(
            rpId: rpId,
            userName: userName,
            userDisplayName: userDisplayName,
            userId: userId,
            clientDataHash: clientDataHash,
            vaultStore: vaultStore
        )
    }


    /**
     * Show the passkey registration view
     */
    internal func showPasskeyRegistrationView(
        rpId: String,
        userName: String?,
        userDisplayName: String?,
        userId: Data?,
        clientDataHash: Data,
        vaultStore: VaultStore
    ) {
        // Create view model with handlers
        let viewModel = PasskeyRegistrationViewModel(
            requestId: "",  // Not needed for direct creation
            rpId: rpId,
            origin: "https://\(rpId)",
            userName: userName,
            userDisplayName: userDisplayName,
            completionHandler: { [weak self] success in
                guard let self = self else { return }

                // Button was clicked - create the passkey directly in Swift
                self.createPasskeyInSwift(
                    rpId: rpId,
                    userName: userName,
                    userDisplayName: userDisplayName,
                    userId: userId,
                    clientDataHash: clientDataHash,
                    vaultStore: vaultStore
                )
            },
            cancelHandler: { [weak self] in
                self?.extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userCanceled.rawValue
                ))
            }
        )

        // Create and present the view
        let passkeyView = PasskeyRegistrationView(viewModel: viewModel)
        let hostingController = UIHostingController(rootView: passkeyView)

        // Remove existing passkey hosting controller if present
        if let existingController = self.currentHostingController {
            existingController.willMove(toParent: nil)
            existingController.view.removeFromSuperview()
            existingController.removeFromParent()
        }

        // Add new hosting controller
        addChild(hostingController)
        view.addSubview(hostingController.view)

        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
        self.currentHostingController = hostingController
    }

    /**
     * Create passkey directly in Swift (called when user clicks the button)
     */
    internal func createPasskeyInSwift(
        rpId: String,
        userName: String?,
        userDisplayName: String?,
        userId: Data?,
        clientDataHash: Data,
        vaultStore: VaultStore
    ) {
        do {
            print("PasskeyRegistration: Creating passkey directly in Swift layer")

            // Generate new credential ID (UUID that will be used as the passkey ID)
            let passkeyId = UUID()
            let credentialId = try PasskeyHelper.guidToBytes(passkeyId.uuidString)

            // Create the passkey using PasskeyAuthenticator
            let passkeyResult = try PasskeyAuthenticator.createPasskey(
                credentialId: credentialId,
                clientDataHash: clientDataHash,
                rpId: rpId,
                userId: userId,
                userName: userName,
                userDisplayName: userDisplayName,
                uvPerformed: true,
                enablePrf: false
            )

            print("PasskeyRegistration: Passkey created successfully")

            // Create a Passkey model object
            let now = Date()
            let passkey = Passkey(
                id: passkeyId,
                parentCredentialId: UUID(), // Will be set by createCredentialWithPasskey
                rpId: rpId,
                userHandle: userId,
                userName: userName,
                publicKey: passkeyResult.publicKey,
                privateKey: passkeyResult.privateKey,
                prfKey: passkeyResult.prfSecret,
                displayName: userDisplayName ?? userName ?? rpId,
                createdAt: now,
                updatedAt: now,
                isDeleted: false
            )

            // Begin transaction
            try vaultStore.beginTransaction()

            // Store credential with passkey in database
            let credential = try vaultStore.createCredentialWithPasskey(
                rpId: rpId,
                userName: userName,
                userDisplayName: userDisplayName,
                passkey: passkey
            )

            // Commit transaction to persist the data
            try vaultStore.commitTransaction()

            print("PasskeyRegistration: Credential and passkey stored in database - credentialId=\(credential.id.uuidString)")

            // Create the ASPasskeyRegistrationCredential to return to the system
            let asCredential = ASPasskeyRegistrationCredential(
                relyingParty: rpId,
                clientDataHash: clientDataHash,
                credentialID: credentialId,
                attestationObject: passkeyResult.attestationObject
            )

            print("PasskeyRegistration: Completing registration request")

            // Complete the registration request
            extensionContext.completeRegistrationRequest(using: asCredential)

        } catch {
            print("PasskeyRegistration error: \(error)")
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create passkey: \(error.localizedDescription)"]
            ))
        }
    }

    /**
     * Cancel passkey registration
     */
    private func cancelPasskeyRegistration(requestId: String, vaultStore: VaultStore) {
        print("PasskeyRegistration: User cancelled registration")
        vaultStore.cleanupPasskeyRegistrationRequest(requestId)
        extensionContext.cancelRequest(withError: NSError(
            domain: ASExtensionErrorDomain,
            code: ASExtensionError.userCanceled.rawValue
        ))
    }

    /**
     * Poll for passkey registration result from the React Native app
     */
    func pollForPasskeyRegistrationResult(requestId: String, vaultStore: VaultStore, pollCount: Int = 0) {
        // Check if cancelled
        if vaultStore.isPasskeyRegistrationCancelled(requestId) {
            vaultStore.cleanupPasskeyRegistrationRequest(requestId)
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.userCanceled.rawValue
            ))
            return
        }

        // Check if result is available
        if let resultJson = try? vaultStore.getPasskeyRegistrationResult(requestId),
           let resultData = resultJson.data(using: .utf8),
           let result = try? JSONSerialization.jsonObject(with: resultData) as? [String: Any] {

            // Parse result
            guard let credentialIdString = result["credentialId"] as? String,
                  let attestationObjectB64 = result["attestationObject"] as? String,
                  let attestationObject = Data(base64Encoded: attestationObjectB64) else {
                vaultStore.cleanupPasskeyRegistrationRequest(requestId)
                extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.failed.rawValue,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid result data"]
                ))
                return
            }

            do {
                let credentialId = try PasskeyHelper.guidToBytes(credentialIdString)

                // Get client data hash and RP ID from original request
                guard let passkeyRequest = self.extensionContext as? ASPasskeyCredentialRequest,
                      let credentialIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity else {
                    vaultStore.cleanupPasskeyRegistrationRequest(requestId)
                    extensionContext.cancelRequest(withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.failed.rawValue
                    ))
                    return
                }

                let clientDataHash = passkeyRequest.clientDataHash
                let rpId = credentialIdentity.relyingPartyIdentifier

                // Create passkey registration credential
                let credential = ASPasskeyRegistrationCredential(
                    relyingParty: rpId,
                    clientDataHash: clientDataHash,
                    credentialID: credentialId,
                    attestationObject: attestationObject
                )

                // Clean up stored data
                vaultStore.cleanupPasskeyRegistrationRequest(requestId)

                // Complete the request
                extensionContext.completeRegistrationRequest(using: credential)
                return
            } catch {
                vaultStore.cleanupPasskeyRegistrationRequest(requestId)
                extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.failed.rawValue,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to parse credential ID: \(error.localizedDescription)"]
                ))
                return
            }
        }

        // Timeout after 60 seconds (120 polls * 0.5 seconds)
        if pollCount >= 120 {
            vaultStore.cleanupPasskeyRegistrationRequest(requestId)
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.userCanceled.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "Registration timed out"]
            ))
            return
        }

        // Poll again after 0.5 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.pollForPasskeyRegistrationResult(requestId: requestId, vaultStore: vaultStore, pollCount: pollCount + 1)
        }
    }

    // MARK: - Passkey Authentication

    /**
     * Authenticate with a specific passkey
     */
    private func authenticateWithPasskey(_ passkey: Passkey, clientDataHash: Data, rpId: String) throws {
        // Generate assertion using PasskeyAuthenticator
        let credentialId = try? PasskeyHelper.guidToBytes(passkey.id.uuidString)

        let assertion = try PasskeyAuthenticator.getAssertion(
            credentialId: credentialId ?? Data(),
            clientDataHash: clientDataHash,
            rpId: rpId,
            privateKeyJWK: passkey.privateKey,
            userId: passkey.userHandle,
            uvPerformed: true,
            prfInputs: nil,
            prfSecret: passkey.prfKey
        )

        // Complete the request with passkey assertion credential
        let credential = ASPasskeyAssertionCredential(
            userHandle: assertion.userHandle ?? Data(),
            relyingParty: rpId,
            signature: assertion.signature,
            clientDataHash: clientDataHash,
            authenticatorData: assertion.authenticatorData,
            credentialID: assertion.credentialId
        )

        extensionContext.completeAssertionRequest(using: credential)
    }

    /**
     * Show passkey picker view for user selection
     * TODO: check usages
     */
    private func showPasskeyPickerView(rpId: String, clientDataHash: Data, vaultStore: VaultStore) {
        let viewModel = PasskeyProviderViewModel(
            loader: {
                // getAllCredentials now includes passkeys for each credential
                // TODO: call a separate method for only retrieving passkeys?
                var credentials = try vaultStore.getAllCredentials()

                // Filter to only include credentials that actually have passkeys
                credentials = credentials.filter { credential in
                    guard let passkeys = credential.passkeys else { return false }
                    return !passkeys.isEmpty
                }

                return credentials
            },
            selectionHandler: { [weak self, clientDataHash, rpId] credential in
                guard let self = self else { return }
                self.handlePasskeyCredentialSelection(credential: credential, clientDataHash: clientDataHash, rpId: rpId)
            },
            cancelHandler: { [weak self] in
                guard let self = self else { return }
                self.handleCancel()
            },
            rpId: rpId
        )

        let passkeyView = PasskeyProviderView(viewModel: viewModel)
        let hostingController = UIHostingController(rootView: passkeyView)

        // Remove existing passkey hosting controller if present
        if let existingController = self.currentHostingController {
            existingController.willMove(toParent: nil)
            existingController.view.removeFromSuperview()
            existingController.removeFromParent()
        }

        // Add new hosting controller
        addChild(hostingController)
        view.addSubview(hostingController.view)

        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
        self.currentHostingController = hostingController
    }

    /**
     * Load credentials with passkeys for the specified RP ID
     */
    internal func loadPasskeyCredentials(vaultStore: VaultStore, rpId: String) async throws -> [Credential] {
        // getAllCredentials now includes passkeys for each credential
        // TODO: call a separate method for only retrieving passkeys?
        var credentials = try vaultStore.getAllCredentials()

        // Filter to only include credentials that actually have passkeys
        credentials = credentials.filter { credential in
            guard let passkeys = credential.passkeys else { return false }
            return !passkeys.isEmpty
        }

        return credentials
    }

    /**
     * Handle passkey credential selection from picker
     */
    internal func handlePasskeyCredentialSelection(credential: Credential, clientDataHash: Data, rpId: String) {
        do {
            // Get the first matching passkey for the RP ID
            guard let passkeys = credential.passkeys,
                  let passkey = passkeys.first(where: { $0.rpId.lowercased() == rpId.lowercased() }) else {
                extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.credentialIdentityNotFound.rawValue
                ))
                return
            }

            try authenticateWithPasskey(passkey, clientDataHash: clientDataHash, rpId: rpId)
        } catch {
            print("PasskeyAuthentication error: \(error)")
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue,
                userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]
            ))
        }
    }
}
