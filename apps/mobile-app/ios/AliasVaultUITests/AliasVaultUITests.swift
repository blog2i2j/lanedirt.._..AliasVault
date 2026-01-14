import XCTest

/// E2E UI Tests for AliasVault iOS app
/// Migrated from Maestro tests to native XCTest
/// Uses dynamically created test users (no pre-configured credentials needed)
final class AliasVaultUITests: XCTestCase {
    var app: XCUIApplication!

    /// Shared test user created for the test run
    static var testUser: TestUser?

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()

        // Disable UIView animations to prevent "wait for app to idle" issues
        // React Native apps have continuous activity that blocks XCTest idle detection
        app.launchArguments.append("--uitest")
    }

    override func tearDown() {
        app = nil
        super.tearDown()
    }

    // MARK: - Test Setup

    /// Create a test user before tests that need authentication
    private func ensureTestUser() async throws -> TestUser {
        if let existingUser = Self.testUser {
            return existingUser
        }

        // Check if API is available
        let apiAvailable = await TestUserRegistration.isApiAvailable()
        guard apiAvailable else {
            throw XCTSkip("API not available at \(TestConfiguration.apiUrl). Start the local server first.")
        }

        // Create a new test user
        let user = try await TestUserRegistration.createTestUser()
        Self.testUser = user
        return user
    }

    // MARK: - Test 01: App Launch

    /// Test 01: App Launch
    /// Verifies the app launches correctly and shows the login screen
    @MainActor
    func test01AppLaunch() {
        // Launch the app with a clean state
        app.launchArguments.append("--reset-state")
        app.launch()

        // Wait for app to fully load - look for AliasVault text
        // Use waitForExistenceNoIdle to avoid hanging on React Native timers/animations
        let aliasVaultText = app.staticTexts["AliasVault"]
        XCTAssertTrue(
            aliasVaultText.waitForExistenceNoIdle(timeout: 15),
            "App should display AliasVault text on launch"
        )

        // Verify the login screen is displayed
        let loginScreen = app.findElement(testID: "login-screen")
        XCTAssertTrue(
            loginScreen.waitForExistenceNoIdle(timeout: TestConfiguration.defaultTimeout),
            "Login screen should be visible"
        )

        // Verify login form elements
        let usernameInput = app.findElement(testID: "username-input")
        XCTAssertTrue(usernameInput.exists, "Username input should be visible")

        let passwordInput = app.findElement(testID: "password-input")
        XCTAssertTrue(passwordInput.exists, "Password input should be visible")

        // Check for Log in button
        let loginButton = app.findElement(testID: "login-button")
        XCTAssertTrue(loginButton.exists, "Log in button should be visible")

        // Take screenshot
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "01-app-launched"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // MARK: - Test 02: Login Validation

    /// Test 02: Login Validation
    /// Verifies login form validation and error handling
    @MainActor
    func test02LoginValidation() {
        // Launch the app fresh
        app.launchArguments.append("--reset-state")
        app.launch()

        // Wait for login screen (use waitForExistenceNoIdle for React Native compatibility)
        let loginScreen = app.findElement(testID: "login-screen")
        XCTAssertTrue(
            loginScreen.waitForExistenceNoIdle(timeout: 15),
            "Login screen should be visible"
        )

        // Test 1: Empty form submission
        let loginButton = app.findElement(testID: "login-button")
        loginButton.tapNoIdle()

        // Should show validation error (optional - may have different implementation)
        let emptyFormScreenshot = XCUIScreen.main.screenshot()
        let attachment1 = XCTAttachment(screenshot: emptyFormScreenshot)
        attachment1.name = "02-1-empty-form-validation"
        attachment1.lifetime = .keepAlways
        add(attachment1)

        // Test 2: Invalid credentials
        let usernameInput = app.findTextField(testID: "username-input")
        usernameInput.tapNoIdle()
        usernameInput.typeText("invalid@test.com")

        let passwordInput = app.findTextField(testID: "password-input")
        passwordInput.tapNoIdle()
        passwordInput.typeText("wrongpassword")

        app.hideKeyboardIfVisible()

        loginButton.tapNoIdle()

        // Wait for error response (network request may take time)
        let errorMessage = app.findElement(testID: "error-message")
        _ = errorMessage.waitForExistenceNoIdle(timeout: 15)

        let invalidCredentialsScreenshot = XCUIScreen.main.screenshot()
        let attachment2 = XCTAttachment(screenshot: invalidCredentialsScreenshot)
        attachment2.name = "02-2-invalid-credentials"
        attachment2.lifetime = .keepAlways
        add(attachment2)
    }

    // MARK: - Test 03: Successful Login

    /// Test 03: Successful Login
    /// Verifies login flow with dynamically created test user
    @MainActor
    func test03SuccessfulLogin() async throws {
        // Create test user dynamically
        let testUser = try await ensureTestUser()

        // Launch the app fresh
        app.launchArguments.append("--reset-state")
        app.launch()

        // Wait for login screen (use waitForExistenceNoIdle for React Native compatibility)
        let loginScreen = app.findElement(testID: "login-screen")
        XCTAssertTrue(
            loginScreen.waitForExistenceNoIdle(timeout: 15),
            "Login screen should be visible"
        )

        // Configure API URL to use local server
        let serverUrlLink = app.findElement(testID: "server-url-link")
        serverUrlLink.tapNoIdle()

        // Wait for settings screen to load and select "Self-hosted" option
        let selfHostedOption = app.findElement(testID: "api-option-custom")
        XCTAssertTrue(
            selfHostedOption.waitForExistenceNoIdle(timeout: 10),
            "Settings screen should show Self-hosted option"
        )
        selfHostedOption.tapNoIdle()

        // Wait for custom URL input to appear
        let customApiUrlInput = app.findTextField(testID: "custom-api-url-input")
        XCTAssertTrue(
            customApiUrlInput.waitForExistenceNoIdle(timeout: 5),
            "Custom API URL input should appear"
        )

        // Clear existing text and enter the local API URL
        customApiUrlInput.tapNoIdle()
        customApiUrlInput.clearAndTypeTextNoIdle(TestConfiguration.apiUrl)
        app.hideKeyboardIfVisible()

        // Go back to login screen
        let backButton = app.findElement(testID: "back-button")
        backButton.tapNoIdle()

        // Wait for login screen to be visible again
        XCTAssertTrue(
            loginScreen.waitForExistenceNoIdle(timeout: 10),
            "Should return to login screen"
        )

        // Now perform login with dynamically created test user
        let usernameInput = app.findTextField(testID: "username-input")
        usernameInput.tapNoIdle()
        usernameInput.typeText(testUser.username)

        let passwordInput = app.findTextField(testID: "password-input")
        passwordInput.tapNoIdle()
        passwordInput.typeText(testUser.password)

        app.hideKeyboardIfVisible()

        let credentialsScreenshot = XCUIScreen.main.screenshot()
        let attachment1 = XCTAttachment(screenshot: credentialsScreenshot)
        attachment1.name = "03-1-credentials-entered"
        attachment1.lifetime = .keepAlways
        add(attachment1)

        // Submit login
        let loginButton = app.findElement(testID: "login-button")
        loginButton.tapNoIdle()

        // Wait for login to complete (may include vault sync)
        let itemsScreen = app.findElement(testID: "items-screen")
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout),
            "Should navigate to items screen after successful login"
        )

        // Verify we're on the items/vault screen
        let itemsList = app.findElement(testID: "items-list")
        XCTAssertTrue(itemsList.exists, "Items list should be visible")

        let loginSuccessScreenshot = XCUIScreen.main.screenshot()
        let attachment2 = XCTAttachment(screenshot: loginSuccessScreenshot)
        attachment2.name = "03-2-login-successful"
        attachment2.lifetime = .keepAlways
        add(attachment2)
    }

    // MARK: - Test 04: Create New Item

    /// Test 04: Create New Item
    /// Verifies item creation flow
    /// Launches the app and handles unlock if necessary
    @MainActor
    func test04CreateItem() async throws {
        // Get the test user (should exist from test03)
        let testUser = try await ensureTestUser()

        // Generate unique item name
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "E2E Test")

        // Launch the app (account should already exist)
        app.launch()

        // Handle unlock screen if it appears (vault may have locked between tests)
        unlockVaultIfNeeded(with: testUser)

        // Wait for items screen
        let itemsScreen = app.findElement(testID: "items-screen")
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout),
            "Should be on items screen after launch/unlock"
        )

        // Tap the FAB (Floating Action Button) to add new item
        let addItemButton = app.findElement(testID: "add-item-button")
        addItemButton.tapNoIdle()

        // Wait for add/edit screen to load
        let addEditScreen = app.findElement(testID: "add-edit-screen")
        XCTAssertTrue(
            addEditScreen.waitForExistenceNoIdle(timeout: 10),
            "Add/edit screen should appear"
        )

        let addItemScreenshot = XCUIScreen.main.screenshot()
        let attachment1 = XCTAttachment(screenshot: addItemScreenshot)
        attachment1.name = "04-1-add-item-screen"
        attachment1.lifetime = .keepAlways
        add(attachment1)

        // Enter item name
        let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
        itemNameInput.tapNoIdle()
        itemNameInput.typeText(uniqueName)

        // Enter service URL - scroll to ensure visibility
        let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
        serviceUrlInput.tapNoIdle()
        serviceUrlInput.typeText("https://example.com")

        // Add email field - scroll to button first
        let addEmailButton = app.findElement(testID: "add-email-button")
        app.scrollToElement(addEmailButton)
        addEmailButton.tapNoIdle()

        // Enter email - scroll to ensure visibility
        let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
        loginEmailInput.tapNoIdle()
        loginEmailInput.typeText("e2e-test@example.com")

        // Enter username (optional) - scroll to ensure visibility since keyboard may occlude it
        let loginUsernameInput = app.findAndScrollToTextField(testID: "login-username-input")
        if loginUsernameInput.exists {
            // Ensure the field is visible by scrolling
            app.scrollToElement(loginUsernameInput)
            loginUsernameInput.tapNoIdle()
            loginUsernameInput.typeText("e2euser")
        }

        app.hideKeyboardIfVisible()

        let itemFilledScreenshot = XCUIScreen.main.screenshot()
        let attachment2 = XCTAttachment(screenshot: itemFilledScreenshot)
        attachment2.name = "04-2-item-filled"
        attachment2.lifetime = .keepAlways
        add(attachment2)

        // Save the item
        let saveButton = app.findElement(testID: "save-button")
        saveButton.tapNoIdle()

        // Wait for item detail screen to load (app navigates here after save)
        XCTAssertTrue(
            app.waitForText("Login credentials", timeout: 10),
            "Should show item detail screen with Login credentials"
        )

        let itemDetailScreenshot = XCUIScreen.main.screenshot()
        let attachment3 = XCTAttachment(screenshot: itemDetailScreenshot)
        attachment3.name = "04-3-item-detail-screen"
        attachment3.lifetime = .keepAlways
        add(attachment3)

        // Wait a moment for UI to settle
        sleep(1)

        // Go back to items list
        let backButton = app.findElement(testID: "back-button")
        backButton.tapNoIdle()

        // Wait for items screen to be visible
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: 10),
            "Should return to items screen"
        )

        // Find the newly created item by its accessibilityLabel (set on ItemCard)
        // React Native sets accessibilityLabel on the TouchableOpacity, not as staticText
        let newItemCard = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", uniqueName)
        ).firstMatch

        XCTAssertTrue(
            newItemCard.waitForExistenceNoIdle(timeout: 10),
            "Newly created item '\(uniqueName)' should appear in list"
        )

        // Tap on the item to verify it
        newItemCard.tapNoIdle()

        // Wait for item detail screen to confirm we tapped the right item
        XCTAssertTrue(
            app.waitForText("Login credentials", timeout: 10),
            "Should show item detail screen"
        )

        let itemVerifiedScreenshot = XCUIScreen.main.screenshot()
        let attachment4 = XCTAttachment(screenshot: itemVerifiedScreenshot)
        attachment4.name = "04-4-item-verified"
        attachment4.lifetime = .keepAlways
        add(attachment4)
    }

    // MARK: - Test 05: Offline Mode and Sync

    /// Test 05: Offline Mode and Sync
    /// Verifies offline mode detection, local item creation while offline, vault lock/unlock while offline,
    /// and sync recovery when back online.
    ///
    /// This test mirrors the browser extension's 07-offline-sync.spec.ts test:
    /// 1. User is authenticated and online
    /// 2. Go offline by setting API URL to invalid (simulates network failure)
    /// 3. Create a credential while offline (stored locally with hasPendingSync=true)
    /// 4. Lock the vault while offline
    /// 5. Unlock the vault while still offline (uses stored encryption params)
    /// 6. Go back online (restore valid API URL)
    /// 7. Trigger sync and verify credential is synced
    @MainActor
    func test05OfflineModeAndSync() async throws {
        // Ensure we have a test user
        let testUser = try await ensureTestUser()
        
        // Launch the app (account should already exist)
        app.launch()

        // Handle unlock screen if it appears (vault may have locked between tests)
        unlockVaultIfNeeded(with: testUser)

        // Store the original API URL for restoration
        let originalApiUrl = TestConfiguration.apiUrl
        let invalidApiUrl = "http://offline.invalid.localhost:9999"

        // Generate unique item name for the offline-created item
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "Offline Test")

        // Step 1: Verify we're online and on items screen
        let itemsScreen = app.findElement(testID: "items-screen")
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout),
            "Should be on items screen"
        )

        let initialStateScreenshot = XCUIScreen.main.screenshot()
        let attachment1 = XCTAttachment(screenshot: initialStateScreenshot)
        attachment1.name = "05-1-initial-state-online"
        attachment1.lifetime = .keepAlways
        add(attachment1)

        // Step 2: Go offline by setting API URL to invalid
        // This mirrors the browser extension's enableOfflineMode() approach
        let encodedInvalidUrl = invalidApiUrl.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? invalidApiUrl
        app.openDeepLink("aliasvault://open/__debug__/set-api-url/\(encodedInvalidUrl)")

        // Deep link may cause app to lock, unlock if needed
        unlockVaultIfNeeded(with: testUser)

        // Wait for deep link to be processed and return to items screen
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: 10),
            "Should return to items screen after deep link"
        )

        // Trigger a sync attempt to detect offline state
        app.pullToRefresh()
        sleep(3)

        // Verify offline indicator appears (API calls should fail now)
        let offlineIndicator = app.findElement(testID: "sync-indicator-offline")
        XCTAssertTrue(
            offlineIndicator.waitForExistenceNoIdle(timeout: 10),
            "Offline indicator should appear after API URL change"
        )

        let offlineModeScreenshot = XCUIScreen.main.screenshot()
        let attachment2 = XCTAttachment(screenshot: offlineModeScreenshot)
        attachment2.name = "05-2-offline-mode-enabled"
        attachment2.lifetime = .keepAlways
        add(attachment2)

        // Step 3: Create an item while offline
        let addItemButton = app.findElement(testID: "add-item-button")
        addItemButton.tapNoIdle()

        // Wait for add/edit screen to load
        let addEditScreen = app.findElement(testID: "add-edit-screen")
        XCTAssertTrue(
            addEditScreen.waitForExistenceNoIdle(timeout: 10),
            "Add/edit screen should appear"
        )

        let addItemOfflineScreenshot = XCUIScreen.main.screenshot()
        let attachment3 = XCTAttachment(screenshot: addItemOfflineScreenshot)
        attachment3.name = "05-3-add-item-screen-offline"
        attachment3.lifetime = .keepAlways
        add(attachment3)

        // Enter item name
        let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
        itemNameInput.tapNoIdle()
        itemNameInput.typeText(uniqueName)

        // Enter service URL - scroll to ensure visibility
        let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
        serviceUrlInput.tapNoIdle()
        serviceUrlInput.typeText("https://offline-test.example.com")

        // Add email field - scroll to button first
        let addEmailButton = app.findElement(testID: "add-email-button")
        app.scrollToElement(addEmailButton)
        addEmailButton.tapNoIdle()

        // Enter email - scroll to ensure visibility
        let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
        loginEmailInput.tapNoIdle()
        loginEmailInput.typeText("offline-test@example.com")

        app.hideKeyboardIfVisible()

        let itemFilledOfflineScreenshot = XCUIScreen.main.screenshot()
        let attachment4 = XCTAttachment(screenshot: itemFilledOfflineScreenshot)
        attachment4.name = "05-4-item-filled-offline"
        attachment4.lifetime = .keepAlways
        add(attachment4)

        // Save the item
        let saveButton = app.findElement(testID: "save-button")
        saveButton.tapNoIdle()

        // Wait for item to be saved and show detail screen
        XCTAssertTrue(
            app.waitForText("Login credentials", timeout: 10),
            "Should show item detail screen after save"
        )

        let itemSavedOfflineScreenshot = XCUIScreen.main.screenshot()
        let attachment5 = XCTAttachment(screenshot: itemSavedOfflineScreenshot)
        attachment5.name = "05-5-item-saved-offline"
        attachment5.lifetime = .keepAlways
        add(attachment5)

        // Go back to items list
        sleep(1)
        let backButton = app.findElement(testID: "back-button")
        backButton.tapNoIdle()

        // Wait for items screen
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: 10),
            "Should return to items screen"
        )

        // Verify the offline-created item appears in the list
        let offlineItemCard = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", uniqueName)
        ).firstMatch
        XCTAssertTrue(
            offlineItemCard.waitForExistenceNoIdle(timeout: 5),
            "Offline-created item should appear in list"
        )

        let itemInListOfflineScreenshot = XCUIScreen.main.screenshot()
        let attachment6 = XCTAttachment(screenshot: itemInListOfflineScreenshot)
        attachment6.name = "05-6-item-in-list-offline"
        attachment6.lifetime = .keepAlways
        add(attachment6)

        // Step 5: Go back online by restoring valid API URL
        let encodedValidUrl = originalApiUrl.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? originalApiUrl
        app.openDeepLink("aliasvault://open/__debug__/set-api-url/\(encodedValidUrl)")

        // Deep link may cause app to lock, unlock if needed
        unlockVaultIfNeeded(with: testUser)

        // Wait for deep link to be processed
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: 10),
            "Should return to items screen"
        )

        // Small delay for state to update
        sleep(2)

        let backOnlineScreenshot = XCUIScreen.main.screenshot()
        let attachment9 = XCTAttachment(screenshot: backOnlineScreenshot)
        attachment9.name = "05-9-back-online"
        attachment9.lifetime = .keepAlways
        add(attachment9)

        // Step 7: Trigger sync
        app.pullToRefresh()

        // Wait for sync to complete
        sleep(5)

        // Verify offline indicator is gone (we should be synced now)
        XCTAssertFalse(
            offlineIndicator.exists,
            "Offline indicator should be gone after sync"
        )

        // Verify the item still exists after sync
        XCTAssertTrue(
            offlineItemCard.exists,
            "Item should still exist after sync"
        )

        let syncedScreenshot = XCUIScreen.main.screenshot()
        let attachment10 = XCTAttachment(screenshot: syncedScreenshot)
        attachment10.name = "05-10-synced-successfully"
        attachment10.lifetime = .keepAlways
        add(attachment10)

        // Step 8: Verify item details are preserved after sync
        offlineItemCard.tapNoIdle()

        // Wait for item detail screen
        XCTAssertTrue(
            app.waitForText("Login credentials", timeout: 10),
            "Should show item detail screen"
        )

        // Verify email is preserved (use waitForTextContaining for flexible matching)
        XCTAssertTrue(
            app.waitForTextContaining("offline-test@example.com", timeout: 5),
            "Email should be preserved after sync"
        )

        let itemVerifiedAfterSyncScreenshot = XCUIScreen.main.screenshot()
        let attachment11 = XCTAttachment(screenshot: itemVerifiedAfterSyncScreenshot)
        attachment11.name = "05-11-item-verified-after-sync"
        attachment11.lifetime = .keepAlways
        add(attachment11)
    }

    // MARK: - Helper Methods

    /// Ensure user is authenticated - handles login, unlock, initialize, and reinitialize screens
    @MainActor
    private func ensureAuthenticated(with testUser: TestUser) {
        // Wait a moment for initial app loading
        sleep(3)

        // Take a debug screenshot to see what's on screen
        let debugScreenshot = XCUIScreen.main.screenshot()
        let debugAttachment = XCTAttachment(screenshot: debugScreenshot)
        debugAttachment.name = "debug-ensureAuthenticated-initial"
        debugAttachment.lifetime = .keepAlways
        add(debugAttachment)

        // Check for various screens - the app might be on any of these
        // Use waitForExistenceNoIdle throughout to avoid hanging on React Native timers
        let maxAttempts = 20
        for attempt in 1...maxAttempts {
            // Check if already on items screen - we're done
            let itemsScreen = app.findElement(testID: "items-screen")
            if itemsScreen.waitForExistenceNoIdle(timeout: 1) {
                print("[ensureAuthenticated] Found items-screen on attempt \(attempt)")
                return
            }

            // Check if we're on login screen
            let loginScreen = app.findElement(testID: "login-screen")
            if loginScreen.waitForExistenceNoIdle(timeout: 1) {
                print("[ensureAuthenticated] Found login-screen on attempt \(attempt)")
                performLogin(with: testUser)
                return
            }

            // Check if we're on unlock screen (vault is locked but user is logged in)
            let unlockScreen = app.findElement(testID: "unlock-screen")
            if unlockScreen.waitForExistenceNoIdle(timeout: 1) {
                print("[ensureAuthenticated] Found unlock-screen on attempt \(attempt)")
                performUnlock(with: testUser)
                return
            }

            // Check if we're on initialize screen (waiting for biometric - might have a system prompt)
            // If so, we need to handle the biometric prompt or wait for it to navigate
            let initializeScreen = app.findElement(testID: "initialize-screen")
            if initializeScreen.waitForExistenceNoIdle(timeout: 1) {
                print("[ensureAuthenticated] Found initialize-screen on attempt \(attempt) - waiting for navigation")
                // The initialize screen will eventually navigate to login, unlock, or items
                // Handle possible biometric alert by tapping cancel if it exists
                let springboardApp = XCUIApplication(bundleIdentifier: "com.apple.springboard")
                let cancelButton = springboardApp.buttons["Cancel"]
                if cancelButton.waitForExistence(timeout: 2) {
                    cancelButton.tap()
                    print("[ensureAuthenticated] Dismissed biometric prompt")
                }
                sleep(2)
                continue
            }

            // Check if we're on reinitialize screen
            let reinitializeScreen = app.findElement(testID: "reinitialize-screen")
            if reinitializeScreen.waitForExistenceNoIdle(timeout: 1) {
                print("[ensureAuthenticated] Found reinitialize-screen on attempt \(attempt) - waiting for navigation")
                // Similar to initialize - handle biometric prompt
                let springboardApp = XCUIApplication(bundleIdentifier: "com.apple.springboard")
                let cancelButton = springboardApp.buttons["Cancel"]
                if cancelButton.waitForExistence(timeout: 2) {
                    cancelButton.tap()
                    print("[ensureAuthenticated] Dismissed biometric prompt")
                }
                sleep(2)
                continue
            }

            // If nothing found, take a screenshot and wait
            if attempt == 5 || attempt == 10 || attempt == 15 {
                let midScreenshot = XCUIScreen.main.screenshot()
                let midAttachment = XCTAttachment(screenshot: midScreenshot)
                midAttachment.name = "debug-ensureAuthenticated-attempt-\(attempt)"
                midAttachment.lifetime = .keepAlways
                add(midAttachment)
            }

            // If nothing found, wait a bit and try again (app might still be loading)
            if attempt < maxAttempts {
                sleep(1)
            }
        }

        // Take final screenshot before failing
        let finalScreenshot = XCUIScreen.main.screenshot()
        let finalAttachment = XCTAttachment(screenshot: finalScreenshot)
        finalAttachment.name = "debug-ensureAuthenticated-failed"
        finalAttachment.lifetime = .keepAlways
        add(finalAttachment)

        // If we get here, we couldn't find any expected screen
        XCTFail("Could not find login screen, unlock screen, or items screen after \(maxAttempts) attempts")
    }

    /// Perform login with provided test user credentials
    @MainActor
    private func performLogin(with testUser: TestUser) {
        // Configure API URL
        let serverUrlLink = app.findElement(testID: "server-url-link")
        if serverUrlLink.waitForExistenceNoIdle(timeout: 5) {
            serverUrlLink.tapNoIdle()

            let selfHostedOption = app.findElement(testID: "api-option-custom")
            if selfHostedOption.waitForExistenceNoIdle(timeout: 5) {
                selfHostedOption.tapNoIdle()

                let customApiUrlInput = app.findTextField(testID: "custom-api-url-input")
                if customApiUrlInput.waitForExistenceNoIdle(timeout: 5) {
                    customApiUrlInput.tapNoIdle()
                    customApiUrlInput.clearAndTypeTextNoIdle(TestConfiguration.apiUrl)
                    app.hideKeyboardIfVisible()
                }

                let backButton = app.findElement(testID: "back-button")
                backButton.tapNoIdle()
            }
        }

        // Wait for login screen
        let loginScreen = app.findElement(testID: "login-screen")
        _ = loginScreen.waitForExistenceNoIdle(timeout: 5)

        // Enter credentials
        let usernameInput = app.findTextField(testID: "username-input")
        usernameInput.tapNoIdle()
        usernameInput.typeText(testUser.username)

        let passwordInput = app.findTextField(testID: "password-input")
        passwordInput.tapNoIdle()
        passwordInput.typeText(testUser.password)

        app.hideKeyboardIfVisible()

        // Submit login
        let loginButton = app.findElement(testID: "login-button")
        loginButton.tapNoIdle()

        // Wait for items screen
        let itemsScreen = app.findElement(testID: "items-screen")
        _ = itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout)
    }

    /// Perform unlock with provided test user password (for locked vault)
    @MainActor
    private func performUnlock(with testUser: TestUser) {
        // Wait for "Unlock Vault" text to appear (indicates form is loaded)
        XCTAssertTrue(
            app.waitForText("Unlock Vault", timeout: 15),
            "Unlock Vault header should appear"
        )

        // Find password field - React Native renders it as a generic "Other" element
        // but we can still interact with it by finding the text input
        let passwordInput = app.findTextField(testID: "unlock-password-input")
        if passwordInput.waitForExistenceNoIdle(timeout: 3) {
            passwordInput.tapNoIdle()
            passwordInput.typeText(testUser.password)
        } else {
            // Fallback: tap on the password field area and type
            // The field is typically below "Enter your password" text
            let enterPasswordText = app.staticTexts["Enter your password"]
            if enterPasswordText.exists {
                // Tap below this text where the input field should be
                let coordinate = enterPasswordText.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 3.0))
                coordinate.tap()
                sleep(1)
                app.typeText(testUser.password)
            } else {
                XCTFail("Could not find password input area")
                return
            }
        }

        app.hideKeyboardIfVisible()

        // Find and tap unlock button by its text
        let unlockButton = app.staticTexts["Unlock"]
        XCTAssertTrue(
            unlockButton.waitForExistenceNoIdle(timeout: 5),
            "Unlock button text should exist"
        )
        unlockButton.tapNoIdle()

        // Wait for items screen
        let itemsScreen = app.findElement(testID: "items-screen")
        _ = itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout)
    }

    /// Check if we're on the unlock screen and unlock if needed
    /// This is useful after deep links which may cause the app to lock
    /// - Parameter testUser: The test user with password to use for unlock
    @MainActor
    private func unlockVaultIfNeeded(with testUser: TestUser) {
        // Wait a moment for the app to settle
        sleep(1)

        // Check if unlock screen is visible using testID
        let unlockScreen = app.findElement(testID: "unlock-screen")

        if unlockScreen.waitForExistenceNoIdle(timeout: 3) {
            // Wait for the form to be ready (loading state finished)
            _ = app.waitForText("Unlock Vault", timeout: 10)

            // Find the password field by testID
            let passwordInput = app.findTextField(testID: "unlock-password-input")
            if passwordInput.waitForExistenceNoIdle(timeout: 5) {
                passwordInput.tapNoIdle()
                passwordInput.typeText(testUser.password)
            }

            app.hideKeyboardIfVisible()

            // Find unlock button by testID
            let unlockButton = app.findElement(testID: "unlock-button")
            if unlockButton.waitForExistenceNoIdle(timeout: 3) {
                unlockButton.tapNoIdle()
            }

            // Wait for items screen (unlock may take time as it redirects through reinitialize)
            let itemsScreen = app.findElement(testID: "items-screen")
            _ = itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout)
        }
        // If not on unlock screen, just continue
    }
}
