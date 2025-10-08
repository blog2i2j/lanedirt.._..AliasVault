import AuthenticationServices
import LocalAuthentication
import SwiftUI
import VaultStoreKit
import VaultUI
import VaultModels

/**
 * This class is the main entry point for the autofill extension.
 * It is responsible for displaying the credential provider view and handling user interactions.
 *
 * It also contains interface implementations for ASCredentialProviderViewController that allow
 * us to provide credentials to native system operations that request credentials (e.g. suggesting
 * logins in the keyboard).
 */
public class CredentialProviderViewController: ASCredentialProviderViewController {
    internal var hostingController: UIHostingController<CredentialProviderView>?
    internal var passkeyHostingController: UIViewController?
    internal var isPasskeyRegistrationMode = false
    private var viewModel: CredentialProviderViewModel?
    private var isChoosingTextToInsert = false
    private var initialServiceUrl: String?

    override public func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)

        // Don't set up credential view if we're in passkey registration mode
        // TODO: make this more clear by design which action is taken for which mode in the viewWillAppear for autofill vs passkey
        if isPasskeyRegistrationMode {
            return
        }

        // Check if there is a stored vault. If not, it means the user has not logged in yet and we
        // should redirect to the main app login screen automatically.
        let vaultStore = VaultStore()

        if !sanityChecks(vaultStore: vaultStore) {
            // Sanity checks failed and dialog has been shown.
            // Do not open the view so return here.
            return
        }

        // Try to unlock the vault. If it fails, we return and do not show the dialog.
        do {
            try vaultStore.unlockVault()
        } catch {
            print("Failed to unlock vault: \(error)")
            self.extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue,
                userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]
            ))
            return
        }

        // Only set up the view if we haven't already
        if hostingController == nil {
            do {
                try setupView(vaultStore: vaultStore)
            } catch {
                print("Failed to setup view: \(error)")
                let alert = UIAlertController(
                    title: NSLocalizedString("loading_error", comment: ""),
                    message: NSLocalizedString("loading_error_message", comment: ""),
                    preferredStyle: .alert
                )
                alert.addAction(UIAlertAction(title: NSLocalizedString("ok", comment: ""), style: .default) { [weak self] _ in
                    self?.extensionContext.cancelRequest(withError: NSError(
                        domain: ASExtensionErrorDomain,
                        code: ASExtensionError.failed.rawValue,
                        userInfo: [NSLocalizedDescriptionKey: NSLocalizedString("failed_to_load_credentials", comment: "")]
                    ))
                })
                present(alert, animated: true)
                return
            }
        }
    }

    private func setupView(vaultStore: VaultStore) throws {
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
            serviceUrl: initialServiceUrl
        )

        self.viewModel = viewModel

        let hostingController = UIHostingController(
            rootView: CredentialProviderView(viewModel: viewModel)
        )

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
        self.hostingController = hostingController
    }

    override public func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        let matchedDomains = serviceIdentifiers.map { $0.identifier.lowercased() }
        if let firstDomain = matchedDomains.first {
            initialServiceUrl = firstDomain

            // Set the search text to the first domain which will auto filter the credentials
            // to show the most likely credentials first as suggestion.
            viewModel?.setSearchFilter(firstDomain)

            // Set the service URL to the first domain which will be used to pass onto the
            // add credential view when the user taps the "+" button and prefill it with the
            // domain name.
            viewModel?.serviceUrl = firstDomain
        }
    }

    override public func prepareInterfaceForUserChoosingTextToInsert() {
        isChoosingTextToInsert = true
        viewModel?.isChoosingTextToInsert = true
    }

    override public func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        // QuickType bar suggestions are disabled on iOS <26, so this should only be called on iOS 26+
        if #available(iOS 26.0, *) {
            // iOS 26+ - proceed with background authentication
        } else {
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

    // MARK: - Passkey Support

    override public func prepareInterface(forPasskeyRegistration registrationRequest: ASCredentialRequest) {
        handlePasskeyRegistration(registrationRequest)
    }

    override public func prepareInterfaceToProvideCredential(for credentialRequest: ASCredentialRequest) {
        // Check if this is a passkey request
        if let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest {
            handlePasskeyAuthentication(passkeyRequest)
            return
        }

        // Otherwise, handle as password credential (existing behavior)
        // The existing prepareCredentialList method will be called by the system
    }

    override public func provideCredentialWithoutUserInteraction(for credentialRequest: ASCredentialRequest) {
        // Check if this is a passkey request
        if let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest {
            providePasskeyCredentialWithoutUserInteraction(for: passkeyRequest)
            return
        }

        // For password credentials, call the legacy method
        if let credentialIdentity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity {
            provideCredentialWithoutUserInteraction(for: credentialIdentity)
            return
        }

        // Unknown credential type
        self.extensionContext.cancelRequest(withError: NSError(
            domain: ASExtensionErrorDomain,
            code: ASExtensionError.userInteractionRequired.rawValue
        ))
    }

    /**
     * Provide passkey credential without user interaction
     */
    private func providePasskeyCredentialWithoutUserInteraction(for request: ASPasskeyCredentialRequest) {
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

    /// This registers all known AliasVault credentials into iOS native credential storage, which iOS can then use to
    /// suggest autofill credentials when a user focuses an input field on a login form. These suggestions will then be s
    /// hown above the iOS keyboard, which saves the user one step.
    ///
    /// Note: QuickType bar suggestions are only enabled on iOS 26+ due to biometric authentication limitations
    /// in iOS 17 and 18 where background authentication doesn't work reliably.
    private func registerCredentialIdentities(credentials: [Credential]) async {
        // Only register credentials for QuickType on iOS 26+
        // iOS 17 and 18 have issues with background biometric authentication, so we disable QuickType there
        if #available(iOS 26.0, *) {
            do {
                try await CredentialIdentityStore.shared.saveCredentialIdentities(credentials)
                print("Registered credential identities for QuickType on iOS 26+")
            } catch {
                print("Failed to save credential identities: \(error)")
            }
        } else {
            // On iOS 17-18, clear any existing identities to ensure nothing shows in QuickType
            do {
                try await CredentialIdentityStore.shared.removeAllCredentialIdentities()
                print("Cleared credential identities on iOS <26 to disable QuickType suggestions")
            } catch {
                print("Failed to clear credential identities: \(error)")
            }
        }
    }

    /// Run sanity checks on the vault store before opening the autofill view to check things like if user is logged in,
    /// vault is available etc.
    /// - Returns
    ///  true if sanity checks succeeded and view can open
    ///  false if sanity checks failed and a notice windows has been shown.
    func sanityChecks(vaultStore: VaultStore) -> Bool {
        if !vaultStore.hasEncryptedDatabase {
            let alert = UIAlertController(
                title: NSLocalizedString("login_required", comment: ""),
                message: NSLocalizedString("login_required_message", comment: ""),
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: NSLocalizedString("ok", comment: ""), style: .default) { [weak self] _ in
                self?.extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userCanceled.rawValue
                ))
            })
            present(alert, animated: true)
            return false
        }

        // Check if Face ID/Touch ID is enabled
        let context = LAContext()
        var authMethod = NSLocalizedString("face_id_touch_id", comment: "")
        var biometricsAvailable = false
        var biometricsError: NSError?

        // Check if device supports biometrics
        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricsError) {
            biometricsAvailable = true
            switch context.biometryType {
            case .faceID:
                authMethod = NSLocalizedString("face_id", comment: "")
            case .touchID:
                authMethod = NSLocalizedString("touch_id", comment: "")
            default:
                break
            }
        }

        // First check if biometrics are available on the device
        if !biometricsAvailable {
            let alert = UIAlertController(
                title: String(format: NSLocalizedString("biometric_required", comment: ""), authMethod),
                message: String(format: NSLocalizedString("biometric_required_message", comment: ""), authMethod),
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: NSLocalizedString("ok", comment: ""), style: .default) { [weak self] _ in
                self?.extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userCanceled.rawValue
                ))
            })
            present(alert, animated: true)
            return false
        }

        // Then check if Face ID/Touch ID is enabled in the app settings
        if !vaultStore.getAuthMethods().contains(.faceID) {
            let alert = UIAlertController(
                title: String(format: NSLocalizedString("biometric_required", comment: ""), authMethod),
                message: String(format: NSLocalizedString("biometric_app_required_message", comment: ""), authMethod),
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: NSLocalizedString("ok", comment: ""), style: .default) { [weak self] _ in
                self?.extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userCanceled.rawValue
                ))
            })
            present(alert, animated: true)
            return false
        }

        return true
    }

    /// Load credentials from the vault store and register them as credential identities
    /// and then return them to the caller (view model).
    private func loadCredentials(vaultStore: VaultStore) async throws -> [Credential] {
        let credentials = try vaultStore.getAllCredentials()
        await self.registerCredentialIdentities(credentials: credentials)
        return credentials
    }

    /// Handle autofill view credential selection.
    private func handleCredentialSelection(identifier: String, password: String) {
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

    /// Handle autofill view cancel action.
    internal func handleCancel() {
        self.extensionContext.cancelRequest(withError: NSError(
            domain: ASExtensionErrorDomain,
            code: ASExtensionError.userCanceled.rawValue
        ))
    }
}
