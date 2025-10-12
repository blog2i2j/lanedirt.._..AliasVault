import AuthenticationServices
import SwiftUI
import VaultStoreKit
import VaultUI
import VaultModels
import CryptoKit

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

            // Extract PRF inputs if available (iOS 18+)
            var prfInputs: PrfInputs? = nil
            
            if #available(iOS 18.0, *) {
                prfInputs = extractPrfInputs(from: request.extensionInput)
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
                prfInputs: prfInputs,
                prfSecret: passkey.prfKey
            )

            // Build extension output if PRF results are available (iOS 18+)
            if #available(iOS 18.0, *), let prfResults = assertion.prfResults {
                // Convert Data to SymmetricKey for PRF output
                let firstKey = SymmetricKey(data: prfResults.first)
                let secondKey = prfResults.second.map { SymmetricKey(data: $0) }

                let prfOutput = ASAuthorizationPublicKeyCredentialPRFAssertionOutput(
                    first: firstKey,
                    second: secondKey
                )
                let extensionOutput = ASPasskeyAssertionCredentialExtensionOutput(prf: prfOutput)

                // Complete the request with extension output
                let credential = ASPasskeyAssertionCredential(
                    userHandle: assertion.userHandle ?? Data(),
                    relyingParty: rpId,
                    signature: assertion.signature,
                    clientDataHash: clientDataHash,
                    authenticatorData: assertion.authenticatorData,
                    credentialID: assertion.credentialId,
                    extensionOutput: extensionOutput
                )

                extensionContext.completeAssertionRequest(using: credential)
                return
            }

            // Complete the request without PRF extension output
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

        // Check if PRF extension is requested (iOS 18+)
        var prfEnabled = false
        var prfInputs: PrfInputs? = nil
        if #available(iOS 18.0, *) {
            let extensionInput = passkeyRequest.extensionInput
            
            if case .registration(let reg) = extensionInput {
                if let prf = reg.prf {
                    prfEnabled = true
                }
            }
            
            prfInputs = extractPrfInputs(from: extensionInput)
        }

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
            vaultStore: vaultStore,
            enablePrf: prfEnabled,
            prfInputs: prfInputs
        )
    }

    /**
     * Check if PRF extension is requested in the registration request
     */
    @available(iOS 18.0, *)
    private func checkPrfSupport(in requestParameters: ASPasskeyCredentialRequestParameters) -> Bool {
        guard let supportedExtensions = requestParameters.extensionInput else {
            return false
        }

        guard supportedExtensions.prf?.inputValues?.saltInput1 != nil else {
            return false
        }

        return true
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
        vaultStore: VaultStore,
        enablePrf: Bool = false,
        prfInputs: PrfInputs? = nil
    ) {
        // Store parameters for closure capture
        let capturedRpId = rpId
        let capturedUserName = userName
        let capturedUserDisplayName = userDisplayName
        let capturedUserId = userId
        let capturedClientDataHash = clientDataHash
        let capturedVaultStore = vaultStore
        let capturedEnablePrf = enablePrf
        let capturedPrfInputs = prfInputs

        // Create view model with handlers
        // Use lazy initialization to avoid capturing viewModel before it's assigned
        var viewModel: PasskeyRegistrationViewModel!
        viewModel = PasskeyRegistrationViewModel(
            requestId: "",  // Not needed for direct creation
            rpId: rpId,
            origin: "https://\(rpId)",
            userName: userName,
            userDisplayName: userDisplayName,
            completionHandler: { [weak self] success in
                guard let self = self else { return }

                // Button was clicked - create the passkey directly in Swift
                self.createPasskeyInSwift(
                    rpId: capturedRpId,
                    userName: capturedUserName,
                    userDisplayName: capturedUserDisplayName,
                    userId: capturedUserId,
                    clientDataHash: capturedClientDataHash,
                    vaultStore: capturedVaultStore,
                    viewModel: viewModel,
                    enablePrf: capturedEnablePrf,
                    prfInputs: capturedPrfInputs
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
        vaultStore: VaultStore,
        viewModel: PasskeyRegistrationViewModel,
        enablePrf: Bool = false,
        prfInputs: PrfInputs? = nil
    ) {
        // Create a Task to handle async operations
        Task {
            do {
                // Initialize WebApiService for vault sync/mutate and favicon extraction
                let webApiService = WebApiService()

                // Step 1: Sync vault before creating passkey (to avoid conflicts)
                await viewModel.setLoading(true, message: NSLocalizedString("creating_passkey", comment: "Syncing vault..."))

                try await vaultStore.syncVault(using: webApiService)

                // Step 2: Extract favicon from service URL
                await viewModel.setLoading(true, message: NSLocalizedString("creating_passkey", comment: "Syncing vault..."))
                var logo: Data?
                do {
                    logo = try await webApiService.extractFavicon(url: "https://\(rpId)")
                } catch {
                    // Continue if favicon extraction fails
                }

                // Step 3: Create passkey credentials
                await viewModel.setLoading(true, message: NSLocalizedString("creating_passkey", comment: "Creating passkey..."))

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
                    enablePrf: enablePrf,
                    prfInputs: prfInputs
                )

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

                // Step 4: Store credential with passkey in database
                await viewModel.setLoading(true, message: NSLocalizedString("vault_syncing", comment: "Saving to vault..."))
                // Begin transaction
                try vaultStore.beginTransaction()

                // Store credential with passkey and logo in database
                let credential = try vaultStore.createCredentialWithPasskey(
                    rpId: rpId,
                    userName: userName,
                    userDisplayName: userDisplayName,
                    passkey: passkey,
                    logo: logo
                )

                // Commit transaction to persist the data
                try vaultStore.commitTransaction()

                // Step 5: Upload vault changes to server
                await viewModel.setLoading(true, message: NSLocalizedString("vault_syncing", comment: "Uploading vault..."))
                do {
                    try await vaultStore.mutateVault(using: webApiService)
                } catch {
                    // Continue even if upload fails - passkey is saved locally
                }

                // Step 6: Update the IdentityStore with the new credential (async call)
                let credentials = try vaultStore.getAllCredentials()
                try await CredentialIdentityStore.shared.saveCredentialIdentities(credentials)

                // Step 7: Create the ASPasskeyRegistrationCredential to return to the system
                var asCredential = ASPasskeyRegistrationCredential(
                    relyingParty: rpId,
                    clientDataHash: clientDataHash,
                    credentialID: credentialId,
                    attestationObject: passkeyResult.attestationObject
                )
                
                if #available(iOS 18.0, *) {
                    var prfOutput = ASPasskeyRegistrationCredentialExtensionOutput(prf: enablePrf ? .supported : .unsupported)

                    if enablePrf {
                        if let prfResults = passkeyResult.prfResults {
                            // Include evaluated prfResults if available
                            let firstKey = SymmetricKey(data: prfResults.first)
                            
                            var secondKey: SymmetricKey?
                            if let prfSecond = passkeyResult.prfResults?.second {
                                secondKey = SymmetricKey(data: prfSecond)
                            }

                            let prf = ASAuthorizationPublicKeyCredentialPRFRegistrationOutput(first: firstKey, second: secondKey)
                            prfOutput = ASPasskeyRegistrationCredentialExtensionOutput(prf: prf)
                        }
                    }
                    
                    asCredential.extensionOutput = prfOutput
                }
                
                // Hide loading overlay
                await viewModel.setLoading(false)

                // Complete the registration request (must be on main thread)
                await MainActor.run {
                    self.extensionContext.completeRegistrationRequest(using: asCredential)
                }

            } catch {
                // Hide loading overlay
                await viewModel.setLoading(false)

                // Cancel request (must be on main thread)
                await MainActor.run {
                    self.extensionContext.cancelRequest(withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.failed.rawValue,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to create passkey: \(error.localizedDescription)"]
                    ))
                }
            }
        }
    }

    // MARK: - Passkey Authentication

    /**
     * Authenticate with a specific passkey
     */
    private func authenticateWithPasskey(
        _ passkey: Passkey,
        clientDataHash: Data,
        rpId: String,
        prfInputs: PrfInputs? = nil
    ) throws {
        // Generate assertion using PasskeyAuthenticator
        let credentialId = try? PasskeyHelper.guidToBytes(passkey.id.uuidString)

        let assertion = try PasskeyAuthenticator.getAssertion(
            credentialId: credentialId ?? Data(),
            clientDataHash: clientDataHash,
            rpId: rpId,
            privateKeyJWK: passkey.privateKey,
            userId: passkey.userHandle,
            uvPerformed: true,
            prfInputs: prfInputs,
            prfSecret: passkey.prfKey
        )

        // Build extension output if PRF results are available (iOS 18+)
        if #available(iOS 18.0, *), let prfResults = assertion.prfResults {
            // Convert Data to SymmetricKey for PRF output
            let firstKey = SymmetricKey(data: prfResults.first)
            let secondKey = prfResults.second.map { SymmetricKey(data: $0) }

            let prfOutput = ASAuthorizationPublicKeyCredentialPRFAssertionOutput(
                first: firstKey,
                second: secondKey
            )
            let extensionOutput = ASPasskeyAssertionCredentialExtensionOutput(prf: prfOutput)

            // Complete the request with extension output
            let credential = ASPasskeyAssertionCredential(
                userHandle: assertion.userHandle ?? Data(),
                relyingParty: rpId,
                signature: assertion.signature,
                clientDataHash: clientDataHash,
                authenticatorData: assertion.authenticatorData,
                credentialID: assertion.credentialId,
                extensionOutput: extensionOutput
            )

            extensionContext.completeAssertionRequest(using: credential)
            return
        }

        // Complete the request without PRF extension output
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

            // Extract PRF inputs from the passkey request if available
            var prfInputs: PrfInputs?
            // TODO: Enable prf inputs via this manual credential selection flow
            if #available(iOS 18.0, *), let extensionInput = self.currentPasskeyRequest?.extensionInput {
                prfInputs = extractPrfInputs(from: extensionInput)
            }

            try authenticateWithPasskey(passkey, clientDataHash: clientDataHash, rpId: rpId, prfInputs: prfInputs)
        } catch {
            print("PasskeyAuthentication error: \(error)")
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue,
                userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]
            ))
        }
    }

    /**
     * Extract PRF inputs from passkey credential request parameters
     * Returns nil if PRF extension is not requested or not available
     */
    @available(iOS 18.0, *)
    private func extractPrfInputs(from extensionInput: ASPasskeyCredentialExtensionInput) -> PrfInputs? {
        if case .registration(let reg) = extensionInput {
            if let prf = reg.prf {
                return PrfInputs(first: prf.inputValues?.saltInput1, second: prf.inputValues?.saltInput2)
            } else {
                return nil
            }
        }
        else if case .assertion(let ass) = extensionInput {
            if let prf = ass.prf {
                return PrfInputs(first: prf.inputValues?.saltInput1, second: prf.inputValues?.saltInput2)
            } else {
                return nil
            }
        }
        
        return nil
    }
    
    /**
     * Extract PRF inputs from passkey credential request parameters
     * Returns nil if PRF extension is not requested or not available
     */
    @available(iOS 18.0, *)
    private func extractPrfInputs(from extensionInput: ASPasskeyAssertionCredentialExtensionInput) -> PrfInputs? {
        if let prf = extensionInput.prf {
            return PrfInputs(first: prf.inputValues?.saltInput1, second: prf.inputValues?.saltInput2)
        }
        
        return nil
    }
}
