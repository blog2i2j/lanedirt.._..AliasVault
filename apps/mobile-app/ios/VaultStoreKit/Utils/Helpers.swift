import Foundation
import VaultModels

/**
 * Helpers
 * -------------------------
 * Generic utility class for general helper functions.
 */
public class Helpers {
    /// Returns username or email depending on if they are not null
    public static func usernameOrEmail(credential: Credential) -> String {
        if let username = credential.username, !username.isEmpty {
            return username
        }
        if let email = credential.alias?.email, !email.isEmpty {
            return email
        }
        return ""
    }
}
