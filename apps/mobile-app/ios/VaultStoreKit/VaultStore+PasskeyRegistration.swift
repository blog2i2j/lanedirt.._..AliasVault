import Foundation

/**
 * VaultStore extension for handling passkey registration requests
 * from the iOS Autofill extension to the React Native app.
 *
 * This allows the extension to store registration request data that
 * the React Native app can pick up via deep link, process the request,
 * and store the result back for the extension to complete.
 */
extension VaultStore {
    private enum PasskeyRegistrationKeys {
        static let requestPrefix = "passkeyRegistrationRequest_"
        static let resultPrefix = "passkeyRegistrationResult_"
        static let cancelledPrefix = "passkeyRegistrationCancelled_"
    }

    /**
     * Store a passkey registration request
     */
    public func storePasskeyRegistrationRequest(requestId: String, requestData: String) throws {
        let key = PasskeyRegistrationKeys.requestPrefix + requestId
        userDefaults.set(requestData, forKey: key)
        userDefaults.synchronize()
    }

    /**
     * Get a passkey registration request
     */
    public func getPasskeyRegistrationRequest(_ requestId: String) throws -> String? {
        let key = PasskeyRegistrationKeys.requestPrefix + requestId
        return userDefaults.string(forKey: key)
    }

    /**
     * Store a passkey registration result
     */
    public func storePasskeyRegistrationResult(requestId: String, result: String) throws {
        let key = PasskeyRegistrationKeys.resultPrefix + requestId
        userDefaults.set(result, forKey: key)
        userDefaults.synchronize()
    }

    /**
     * Get a passkey registration result
     */
    public func getPasskeyRegistrationResult(_ requestId: String) throws -> String? {
        let key = PasskeyRegistrationKeys.resultPrefix + requestId
        return userDefaults.string(forKey: key)
    }

    /**
     * Cancel a passkey registration
     */
    public func cancelPasskeyRegistration(_ requestId: String) throws {
        let key = PasskeyRegistrationKeys.cancelledPrefix + requestId
        userDefaults.set(true, forKey: key)
        userDefaults.synchronize()
    }

    /**
     * Check if a passkey registration was cancelled
     */
    public func isPasskeyRegistrationCancelled(_ requestId: String) -> Bool {
        let key = PasskeyRegistrationKeys.cancelledPrefix + requestId
        return userDefaults.bool(forKey: key)
    }

    /**
     * Clean up passkey registration request data
     */
    public func cleanupPasskeyRegistrationRequest(_ requestId: String) {
        userDefaults.removeObject(forKey: PasskeyRegistrationKeys.requestPrefix + requestId)
        userDefaults.removeObject(forKey: PasskeyRegistrationKeys.resultPrefix + requestId)
        userDefaults.removeObject(forKey: PasskeyRegistrationKeys.cancelledPrefix + requestId)
        userDefaults.synchronize()
    }
}
