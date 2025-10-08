import AuthenticationServices
import SwiftUI
import VaultStoreKit
import VaultUI
import VaultModels

/**
 * Passkey-related functionality for CredentialProviderViewController
 * This extension handles all passkey registration and authentication operations
 */
extension CredentialProviderViewController {

    // MARK: - Passkey Registration

    /**
     * Handle passkey registration request from the system
     */
    func handlePasskeyRegistration(_ registrationRequest: ASCredentialRequest) {
        // Set flag to prevent normal credential view from loading
        self.isPasskeyRegistrationMode = true

        guard let passkeyRequest = registrationRequest as? ASPasskeyCredentialRequest else {
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue
            ))
            return
        }

        // Generate a unique request ID
        let requestId = UUID().uuidString

        // Extract registration request data
        let credentialIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = credentialIdentity?.relyingPartyIdentifier ?? ""
        let userId = credentialIdentity?.userHandle
        let userName = credentialIdentity?.userName
        let clientDataHash = passkeyRequest.clientDataHash

        // Build request data dictionary
        var requestData: [String: Any] = [
            "requestId": requestId,
            "origin": "https://\(rpId)",
            "rpId": rpId,
            "challenge": clientDataHash.base64EncodedString(),
            "enablePrf": false // TODO: Extract from extensions if available
        ]

        if let userId = userId {
            requestData["userId"] = userId.base64EncodedString()
        }

        if let userName = userName {
            requestData["userName"] = userName
        }

        do {
            // Convert to JSON string
            let jsonData = try JSONSerialization.data(withJSONObject: requestData)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? ""

            // Store request in shared storage
            let vaultStore = VaultStore()
            try vaultStore.storePasskeyRegistrationRequest(requestId: requestId, requestData: jsonString)

            // Show passkey registration UI
            showPasskeyRegistrationView(
                requestId: requestId,
                rpId: rpId,
                userName: userName,
                vaultStore: vaultStore
            )

        } catch {
            print("PasskeyRegistration error: \(error)")
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue,
                userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]
            ))
        }
    }

    /**
     * Show the passkey registration view
     */
    private func showPasskeyRegistrationView(
        requestId: String,
        rpId: String,
        userName: String?,
        vaultStore: VaultStore
    ) {
        // Create view model with handlers
        let viewModel = PasskeyRegistrationViewModel(
            requestId: requestId,
            rpId: rpId,
            origin: "https://\(rpId)",
            userName: userName,
            userDisplayName: userName,
            completionHandler: { [weak self] success in
                guard let self = self else { return }

                if success {
                    print("PasskeyRegistration: App opened successfully, starting to poll for result")
                    // The app was opened successfully
                    // Now we need to poll for the result or cancellation
                    self.pollForPasskeyRegistrationResult(requestId: requestId, vaultStore: vaultStore)
                } else {
                    print("PasskeyRegistration: Failed to open app")
                    self.extensionContext.cancelRequest(withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.failed.rawValue,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to open main app"]
                    ))
                }
            },
            cancelHandler: { [weak self] in
                self?.cancelPasskeyRegistration(requestId: requestId, vaultStore: vaultStore)
            }
        )

        // Create and present the view
        let passkeyView = PasskeyRegistrationView(viewModel: viewModel)
        let hostingController = UIHostingController(rootView: passkeyView)

        // Remove existing passkey hosting controller if present
        if let existingController = self.passkeyHostingController {
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
        self.passkeyHostingController = hostingController
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
     * Handle passkey authentication request
     */
    func handlePasskeyAuthentication(_ request: ASPasskeyCredentialRequest) {
        // Set flags to indicate passkey authentication mode (not registration, not password)
        self.isPasskeyRegistrationMode = false
        self.isPasskeyAuthenticationMode = true

        do {
            let vaultStore = VaultStore()

            // Check sanity before proceeding
            guard sanityChecks(vaultStore: vaultStore) else {
                return
            }

            // Unlock the vault
            try vaultStore.unlockVault()

            let clientDataHash = request.clientDataHash
            let credentialIdentity = request.credentialIdentity as? ASPasskeyCredentialIdentity
            let rpId = credentialIdentity?.relyingPartyIdentifier ?? ""

            print("PasskeyAuthentication: rpId=\(rpId)")

            // Check if we have a specific credential ID provided by the system
            if let credentialID = credentialIdentity?.credentialID, !credentialID.isEmpty {
                print("PasskeyAuthentication: Direct credential lookup with ID")
                // Direct credential ID lookup - authenticate immediately
                guard let passkey = try vaultStore.getPasskey(byCredentialId: credentialID) else {
                    print("PasskeyAuthentication: Credential not found")
                    extensionContext.cancelRequest(withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.credentialIdentityNotFound.rawValue
                    ))
                    return
                }

                print("PasskeyAuthentication: Found passkey, authenticating")
                try authenticateWithPasskey(passkey, clientDataHash: clientDataHash, rpId: rpId)
            } else {
                print("PasskeyAuthentication: No specific credential ID, showing picker")
                // No specific credential - show picker for user to select
                showPasskeyPickerView(rpId: rpId, clientDataHash: clientDataHash, vaultStore: vaultStore)
            }

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
     * Authenticate with a specific passkey
     */
    private func authenticateWithPasskey(_ passkey: Passkey, clientDataHash: Data, rpId: String) throws {
        // Generate assertion using PasskeyAuthenticator
        let assertion = try PasskeyAuthenticator.getAssertion(
            credentialId: passkey.credentialId,
            clientDataHash: clientDataHash,
            rpId: rpId,
            privateKeyJWK: passkey.privateKey,
            userId: passkey.userId,
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
     */
    private func showPasskeyPickerView(rpId: String, clientDataHash: Data, vaultStore: VaultStore) {
        let viewModel = PasskeyProviderViewModel(
            loader: {
                return try await self.loadPasskeyCredentials(vaultStore: vaultStore, rpId: rpId)
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
        if let existingController = self.passkeyHostingController {
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
        self.passkeyHostingController = hostingController
    }

    /**
     * Load credentials with passkeys for the specified RP ID
     */
    private func loadPasskeyCredentials(vaultStore: VaultStore, rpId: String) async throws -> [Credential] {
        // getAllCredentials now includes passkeys for each credential
        let credentials = try vaultStore.getAllCredentials()

        // Filter by RP ID if specified
        if !rpId.isEmpty {
            let lowercasedRpId = rpId.lowercased()
            return credentials.filter { credential in
                guard let passkeys = credential.passkeys else { return false }
                // Match exact RP ID or check if RP ID is a suffix of the credential's service domain
                return passkeys.contains { passkey in
                    let passkeyRpId = passkey.rpId.lowercased()
                    // Exact match
                    if passkeyRpId == lowercasedRpId {
                        return true
                    }
                    // Check if they are related domains (e.g., rpId="example.com", passkey.rpId="www.example.com")
                    if passkeyRpId.hasSuffix(lowercasedRpId) || lowercasedRpId.hasSuffix(passkeyRpId) {
                        return true
                    }
                    // Check against service URL domain as well
                    if let serviceUrl = credential.service.url?.lowercased(),
                       let url = URL(string: serviceUrl),
                       let host = url.host?.lowercased() {
                        return host == lowercasedRpId || host.hasSuffix(".\(lowercasedRpId)") || lowercasedRpId.hasSuffix(".\(host)")
                    }
                    return false
                }
            }
        }

        return credentials
    }

    /**
     * Handle passkey credential selection from picker
     */
    private func handlePasskeyCredentialSelection(credential: Credential, clientDataHash: Data, rpId: String) {
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
