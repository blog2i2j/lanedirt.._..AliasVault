import Foundation
import SwiftUI

private let locBundle = Bundle.vaultUI

/// ViewModel for password unlock
@MainActor
public class PasswordUnlockViewModel: ObservableObject {
    @Published public var password: String = ""
    @Published public var error: String?
    @Published public var isProcessing: Bool = false

    public let customTitle: String?
    public let customSubtitle: String?
    public let customButtonText: String?

    private let unlockHandler: (String) async throws -> Void
    private let cancelHandler: () -> Void
    private let logoutHandler: (() async throws -> Void)?

    // Brute force protection
    private static let maxFailedAttempts = 10
    private static let warningThreshold = 5
    private static let failedAttemptsKey = "password_unlock_failed_attempts"

    @Published private var failedAttempts: Int = 0
    private var isMaxAttemptsReached = false

    public init(
        customTitle: String?,
        customSubtitle: String?,
        customButtonText: String?,
        unlockHandler: @escaping (String) async throws -> Void,
        cancelHandler: @escaping () -> Void,
        logoutHandler: (() async throws -> Void)? = nil
    ) {
        self.customTitle = customTitle
        self.customSubtitle = customSubtitle
        self.customButtonText = customButtonText
        self.unlockHandler = unlockHandler
        self.cancelHandler = cancelHandler
        self.logoutHandler = logoutHandler

        // Load failed attempts from UserDefaults
        self.failedAttempts = UserDefaults.standard.integer(forKey: Self.failedAttemptsKey)
    }

    public func unlock() async {
        guard !password.isEmpty else { return }
        guard !isProcessing else { return }

        isProcessing = true
        error = nil

        do {
            try await unlockHandler(password)
            // Success - reset failed attempts
            resetFailedAttempts()
        } catch {
            // Handle failed attempt
            await handleFailedAttempt()
        }
    }

    public func cancel() {
        // If max attempts was reached, this will be handled in logoutUser
        if !isMaxAttemptsReached {
            cancelHandler()
        }
    }

    private func handleFailedAttempt() async {
        failedAttempts += 1
        saveFailedAttempts()

        let remainingAttempts = Self.maxFailedAttempts - failedAttempts

        if failedAttempts >= Self.maxFailedAttempts {
            // Max attempts reached - logout user
            isMaxAttemptsReached = true
            self.error = String(localized: "max_attempts_reached", bundle: locBundle)
            await logoutUser()
        } else if failedAttempts >= Self.warningThreshold {
            // Show warning about remaining attempts
            let format = String(localized: "attempts_warning", bundle: locBundle)
            self.error = String(format: format, remainingAttempts)
            self.password = ""
            self.isProcessing = false
        } else {
            // Show standard incorrect password error
            self.error = String(localized: "incorrect_password", bundle: locBundle)
            self.password = ""
            self.isProcessing = false
        }
    }

    private func saveFailedAttempts() {
        UserDefaults.standard.set(failedAttempts, forKey: Self.failedAttemptsKey)
    }

    private func resetFailedAttempts() {
        failedAttempts = 0
        UserDefaults.standard.removeObject(forKey: Self.failedAttemptsKey)
    }

    private func logoutUser() async {
        // Delay to let user read the message
        try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds

        // Call logout handler if provided - this will throw MAX_ATTEMPTS_REACHED error
        do {
            try await logoutHandler?()
        } catch {
            // Error from logout handler (will be caught by calling code)
        }
    }
}
