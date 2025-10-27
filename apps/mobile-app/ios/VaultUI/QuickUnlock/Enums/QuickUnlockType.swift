import Foundation

/// Type of credential being retrieved during quick unlock
public enum QuickUnlockType: Hashable {
    case credential
    case passkey
}
