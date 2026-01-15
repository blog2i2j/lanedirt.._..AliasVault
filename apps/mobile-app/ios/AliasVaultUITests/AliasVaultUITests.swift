import XCTest

/// E2E UI Tests for AliasVault iOS app.
///
/// These tests use dynamically created test users via the API, so no pre-configured
/// credentials are needed. Tests run sequentially and share state (e.g., the test user
/// created in test03 is reused in subsequent tests).
///
/// Prerequisites:
/// - Local API server running at the URL specified in TestConfiguration.apiUrl
/// - iOS Simulator with the app installed
///
/// Note: All UI interactions use `NoIdle` variants (e.g., `waitForExistenceNoIdle`,
/// `tapNoIdle`) to avoid XCTest hanging on React Native's continuous timers/animations.
final class AliasVaultUITests: XCTestCase {
    var app: XCUIApplication!

    /// Shared test user created for the test run (persists across tests)
    static var testUser: TestUser?

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
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

    // MARK: - Error Reporting Helpers

    /// Captures a failure screenshot with descriptive name and attaches it to the test.
    /// Call this in assertion failure handlers or catch blocks.
    @MainActor
    private func captureFailureState(context: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "FAILURE-\(context)"
        attachment.lifetime = .keepAlways
        add(attachment)

        // Also log the current app hierarchy for debugging
        let hierarchyAttachment = XCTAttachment(string: app.debugDescription)
        hierarchyAttachment.name = "FAILURE-hierarchy-\(context)"
        hierarchyAttachment.lifetime = .keepAlways
        add(hierarchyAttachment)
    }

    /// Asserts an element exists with enhanced error reporting.
    /// On failure, captures screenshot and app hierarchy for CI debugging.
    @MainActor
    private func assertElementExists(
        _ element: XCUIElement,
        timeout: TimeInterval = TestConfiguration.defaultTimeout,
        message: String,
        context: String
    ) {
        let exists = element.waitForExistenceNoIdle(timeout: timeout)
        if !exists {
            captureFailureState(context: context)
            XCTFail("\(message). Element identifier: '\(element.identifier)', exists: \(element.exists), isHittable: \(element.isHittable)")
        }
    }

    /// Asserts text appears on screen with enhanced error reporting.
    @MainActor
    private func assertTextAppears(
        _ text: String,
        timeout: TimeInterval = TestConfiguration.defaultTimeout,
        message: String,
        context: String
    ) {
        let appeared = app.waitForText(text, timeout: timeout)
        if !appeared {
            captureFailureState(context: context)
            XCTFail("\(message). Expected text: '\(text)'")
        }
    }

    /// Asserts text containing substring appears with enhanced error reporting.
    @MainActor
    private func assertTextContaining(
        _ substring: String,
        timeout: TimeInterval = TestConfiguration.defaultTimeout,
        message: String,
        context: String
    ) {
        let appeared = app.waitForTextContaining(substring, timeout: timeout)
        if !appeared {
            captureFailureState(context: context)
            XCTFail("\(message). Expected text containing: '\(substring)'")
        }
    }

    // MARK: - Test 01: App Launch

    /// Verifies the app launches correctly and shows the login screen with all expected elements.
    @MainActor
    func test01AppLaunch() {
        app.launchArguments.append("--reset-state")
        app.launch()

        XCTContext.runActivity(named: "Wait for app to load") { _ in
            let aliasVaultText = app.staticTexts["AliasVault"]
            assertElementExists(
                aliasVaultText,
                timeout: 15,
                message: "App should display AliasVault text on launch",
                context: "01-app-load"
            )
        }

        XCTContext.runActivity(named: "Verify login screen is displayed") { _ in
            let loginScreen = app.findElement(testID: "login-screen")
            assertElementExists(
                loginScreen,
                timeout: TestConfiguration.defaultTimeout,
                message: "Login screen should be visible",
                context: "01-login-screen"
            )
        }

        XCTContext.runActivity(named: "Verify login form elements") { _ in
            let usernameInput = app.findElement(testID: "username-input")
            if !usernameInput.exists {
                captureFailureState(context: "01-username-input-missing")
                XCTFail("Username input should be visible")
            }

            let passwordInput = app.findElement(testID: "password-input")
            if !passwordInput.exists {
                captureFailureState(context: "01-password-input-missing")
                XCTFail("Password input should be visible")
            }

            let loginButton = app.findElement(testID: "login-button")
            if !loginButton.exists {
                captureFailureState(context: "01-login-button-missing")
                XCTFail("Log in button should be visible")
            }
        }

        // Take success screenshot
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "01-app-launched"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // MARK: - Test 02: Login Validation

    /// Verifies login form validation and error handling for empty and invalid credentials.
    @MainActor
    func test02LoginValidation() {
        app.launchArguments.append("--reset-state")
        app.launch()

        XCTContext.runActivity(named: "Wait for login screen") { _ in
            let loginScreen = app.findElement(testID: "login-screen")
            assertElementExists(
                loginScreen,
                timeout: 15,
                message: "Login screen should be visible",
                context: "02-login-screen"
            )
        }

        XCTContext.runActivity(named: "Test empty form submission") { _ in
            let loginButton = app.findElement(testID: "login-button")
            loginButton.tapNoIdle()

            // Capture state after empty form submission
            let emptyFormScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: emptyFormScreenshot)
            attachment1.name = "02-1-empty-form-validation"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        XCTContext.runActivity(named: "Test invalid credentials") { _ in
            let usernameInput = app.findTextField(testID: "username-input")
            usernameInput.tapNoIdle()
            usernameInput.typeText("invalid@test.com")

            let passwordInput = app.findTextField(testID: "password-input")
            passwordInput.tapNoIdle()
            passwordInput.typeText("wrongpassword")

            app.hideKeyboardIfVisible()

            let loginButton = app.findElement(testID: "login-button")
            loginButton.tapNoIdle()

            // Wait for error response (network request may take time)
            let errorMessage = app.findElement(testID: "error-message")
            let errorAppeared = errorMessage.waitForExistenceNoIdle(timeout: 15)

            let invalidCredentialsScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: invalidCredentialsScreenshot)
            attachment2.name = "02-2-invalid-credentials"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            // Log whether error message appeared (informational, not a failure)
            print("[Test02] Error message appeared: \(errorAppeared)")
        }
    }

    // MARK: - Test 03: Successful Login

    /// Verifies successful login flow with a dynamically created test user.
    /// Creates a test user via the API, configures the app to use the local server,
    /// and logs in. The test user is stored for reuse in subsequent tests.
    @MainActor
    func test03SuccessfulLogin() async throws {
        let testUser = try await ensureTestUser()
        print("[Test03] Using test user: \(testUser.username)")

        app.launchArguments.append("--reset-state")
        app.launch()

        XCTContext.runActivity(named: "Wait for login screen") { _ in
            let loginScreen = app.findElement(testID: "login-screen")
            assertElementExists(
                loginScreen,
                timeout: 15,
                message: "Login screen should be visible",
                context: "03-login-screen"
            )
        }

        XCTContext.runActivity(named: "Configure API URL to local server") { _ in
            let serverUrlLink = app.findElement(testID: "server-url-link")
            serverUrlLink.tapNoIdle()

            let selfHostedOption = app.findElement(testID: "api-option-custom")
            assertElementExists(
                selfHostedOption,
                timeout: 10,
                message: "Settings screen should show Self-hosted option",
                context: "03-self-hosted-option"
            )
            selfHostedOption.tapNoIdle()

            let customApiUrlInput = app.findTextField(testID: "custom-api-url-input")
            assertElementExists(
                customApiUrlInput,
                timeout: 5,
                message: "Custom API URL input should appear",
                context: "03-custom-url-input"
            )

            customApiUrlInput.tapNoIdle()
            customApiUrlInput.clearAndTypeTextNoIdle(TestConfiguration.apiUrl)
            print("[Test03] Configured API URL: \(TestConfiguration.apiUrl)")
            app.hideKeyboardIfVisible()

            let backButton = app.findElement(testID: "back-button")
            backButton.tapNoIdle()
        }

        XCTContext.runActivity(named: "Enter credentials and login") { _ in
            let loginScreen = app.findElement(testID: "login-screen")
            assertElementExists(
                loginScreen,
                timeout: 10,
                message: "Should return to login screen after configuring API",
                context: "03-return-to-login"
            )

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

            let loginButton = app.findElement(testID: "login-button")
            loginButton.tapNoIdle()
        }

        XCTContext.runActivity(named: "Verify login success and items screen") { _ in
            let itemsScreen = app.findElement(testID: "items-screen")
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should navigate to items screen after successful login",
                context: "03-items-screen"
            )

            let itemsList = app.findElement(testID: "items-list")
            if !itemsList.exists {
                captureFailureState(context: "03-items-list-missing")
                XCTFail("Items list should be visible after login")
            }

            let loginSuccessScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: loginSuccessScreenshot)
            attachment2.name = "03-2-login-successful"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            print("[Test03] Login successful, items screen displayed")
        }
    }

    // MARK: - Test 04: Create New Item

    /// Verifies item creation flow: opens add form, fills in details, saves, and verifies
    /// the item appears in the list. Handles vault unlock if needed between tests.
    @MainActor
    func test04CreateItem() async throws {
        let testUser = try await ensureTestUser()
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "E2E Test")
        print("[Test04] Creating item with name: \(uniqueName)")

        app.launch()
        unlockVaultIfNeeded(with: testUser)

        XCTContext.runActivity(named: "Verify items screen is displayed") { _ in
            let itemsScreen = app.findElement(testID: "items-screen")
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should be on items screen after launch/unlock",
                context: "04-items-screen"
            )
        }

        XCTContext.runActivity(named: "Open add item screen") { _ in
            let addItemButton = app.findElement(testID: "add-item-button")
            addItemButton.tapNoIdle()

            let addEditScreen = app.findElement(testID: "add-edit-screen")
            assertElementExists(
                addEditScreen,
                timeout: 10,
                message: "Add/edit screen should appear",
                context: "04-add-edit-screen"
            )

            let addItemScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: addItemScreenshot)
            attachment1.name = "04-1-add-item-screen"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        XCTContext.runActivity(named: "Fill item details") { _ in
            let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
            itemNameInput.tapNoIdle()
            itemNameInput.typeText(uniqueName)

            let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
            serviceUrlInput.tapNoIdle()
            serviceUrlInput.typeText("https://example.com")

            let addEmailButton = app.findElement(testID: "add-email-button")
            app.scrollToElement(addEmailButton)
            addEmailButton.tapNoIdle()

            let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
            loginEmailInput.tapNoIdle()
            loginEmailInput.typeText("e2e-test@example.com")

            let loginUsernameInput = app.findAndScrollToTextField(testID: "login-username-input")
            if loginUsernameInput.exists {
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
        }

        XCTContext.runActivity(named: "Save item and verify detail screen") { _ in
            let saveButton = app.findElement(testID: "save-button")
            saveButton.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen with Login credentials after save",
                context: "04-item-detail-after-save"
            )

            let itemDetailScreenshot = XCUIScreen.main.screenshot()
            let attachment3 = XCTAttachment(screenshot: itemDetailScreenshot)
            attachment3.name = "04-3-item-detail-screen"
            attachment3.lifetime = .keepAlways
            add(attachment3)
        }

        XCTContext.runActivity(named: "Return to items list and verify item appears") { _ in
            sleep(1)
            let backButton = app.findElement(testID: "back-button")
            backButton.tapNoIdle()

            let itemsScreen = app.findElement(testID: "items-screen")
            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen",
                context: "04-return-to-items"
            )

            let newItemCard = app.descendants(matching: .any).matching(
                NSPredicate(format: "label == %@", uniqueName)
            ).firstMatch

            let itemFound = newItemCard.waitForExistenceNoIdle(timeout: 10)
            if !itemFound {
                captureFailureState(context: "04-item-not-in-list")
                XCTFail("Newly created item '\(uniqueName)' should appear in list")
            }

            print("[Test04] Item '\(uniqueName)' found in list, tapping to verify")
            newItemCard.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen when tapping created item",
                context: "04-item-detail-verify"
            )

            let itemVerifiedScreenshot = XCUIScreen.main.screenshot()
            let attachment4 = XCTAttachment(screenshot: itemVerifiedScreenshot)
            attachment4.name = "04-4-item-verified"
            attachment4.lifetime = .keepAlways
            add(attachment4)

            print("[Test04] Item creation and verification successful")
        }
    }

    // MARK: - Test 05: Offline Mode and Sync

    /// Verifies offline mode and sync recovery:
    /// 1. Goes offline by setting API URL to invalid (simulates network failure)
    /// 2. Creates a credential while offline (stored locally)
    /// 3. Goes back online and triggers sync
    /// 4. Verifies the credential persists after sync
    ///
    /// Uses debug deep links (`__debug__/set-api-url`) to toggle offline mode.
    /// These only work in development builds.
    @MainActor
    func test05OfflineModeAndSync() async throws {
        let testUser = try await ensureTestUser()

        app.launch()
        unlockVaultIfNeeded(with: testUser)

        let originalApiUrl = TestConfiguration.apiUrl
        let invalidApiUrl = "http://offline.invalid.localhost:9999"
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "Offline Test")
        print("[Test05] Creating offline item with name: \(uniqueName)")

        let itemsScreen = app.findElement(testID: "items-screen")
        let offlineIndicator = app.findElement(testID: "sync-indicator-offline")

        XCTContext.runActivity(named: "Step 1: Verify online state") { _ in
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should be on items screen",
                context: "05-items-screen"
            )

            let initialStateScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: initialStateScreenshot)
            attachment1.name = "05-1-initial-state-online"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        XCTContext.runActivity(named: "Step 2: Enable offline mode via deep link") { _ in
            let encodedInvalidUrl = invalidApiUrl.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? invalidApiUrl
            print("[Test05] Setting API URL to invalid: \(invalidApiUrl)")
            app.openDeepLink("aliasvault://open/__debug__/set-api-url/\(encodedInvalidUrl)")

            unlockVaultIfNeeded(with: testUser)

            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen after deep link",
                context: "05-after-offline-deeplink"
            )

            // Trigger a sync attempt to detect offline state
            app.pullToRefresh()
            sleep(3)

            assertElementExists(
                offlineIndicator,
                timeout: 10,
                message: "Offline indicator should appear after API URL change",
                context: "05-offline-indicator"
            )

            let offlineModeScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: offlineModeScreenshot)
            attachment2.name = "05-2-offline-mode-enabled"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            print("[Test05] Offline mode enabled successfully")
        }

        XCTContext.runActivity(named: "Step 3: Create item while offline") { _ in
            let addItemButton = app.findElement(testID: "add-item-button")
            addItemButton.tapNoIdle()

            let addEditScreen = app.findElement(testID: "add-edit-screen")
            assertElementExists(
                addEditScreen,
                timeout: 10,
                message: "Add/edit screen should appear",
                context: "05-add-edit-screen"
            )

            let addItemOfflineScreenshot = XCUIScreen.main.screenshot()
            let attachment3 = XCTAttachment(screenshot: addItemOfflineScreenshot)
            attachment3.name = "05-3-add-item-screen-offline"
            attachment3.lifetime = .keepAlways
            add(attachment3)

            let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
            itemNameInput.tapNoIdle()
            itemNameInput.typeText(uniqueName)

            let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
            serviceUrlInput.tapNoIdle()
            serviceUrlInput.typeText("https://offline-test.example.com")

            let addEmailButton = app.findElement(testID: "add-email-button")
            app.scrollToElement(addEmailButton)
            addEmailButton.tapNoIdle()

            let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
            loginEmailInput.tapNoIdle()
            loginEmailInput.typeText("offline-test@example.com")

            app.hideKeyboardIfVisible()

            let itemFilledOfflineScreenshot = XCUIScreen.main.screenshot()
            let attachment4 = XCTAttachment(screenshot: itemFilledOfflineScreenshot)
            attachment4.name = "05-4-item-filled-offline"
            attachment4.lifetime = .keepAlways
            add(attachment4)

            let saveButton = app.findElement(testID: "save-button")
            saveButton.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen after save",
                context: "05-item-saved-offline"
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

    // MARK: - Test 06: RPO Recovery

    /// Verifies RPO (Recovery Point Objective) recovery scenario:
    /// When the client detects that its local server revision is higher than the actual server revision
    /// (simulating server data loss/rollback), it should upload its vault to recover the server state.
    ///
    /// This test simulates the scenario where:
    /// - Client creates credentials → server has vault at revision N with the credential
    /// - Server data loss occurs → we delete the latest vault revision via API
    /// - Server now at revision N-1 (without the credential)
    /// - Client still has the credential locally and thinks server is at revision N
    /// - On next sync, client detects: "server says revision N-1, but I synced at N"
    /// - Client uploads its vault to "recover" the server (RPO behavior)
    /// - Credential should still exist after sync (proving upload happened, not download)
    ///
    /// Test flow:
    /// 1. Create a credential while online (syncs to server, revision = N)
    /// 2. Wait for sync to complete
    /// 3. Delete the latest vault revision on server via API (simulates server data loss)
    /// 4. Trigger sync - client detects server is "behind" and uploads
    /// 5. Verify credential still exists (client data was uploaded, not downloaded from server)
    /// 6. Verify server revision is restored via API
    @MainActor
    func test06RPORecovery() async throws {
        let testUser = try await ensureTestUser()
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "RPO Test")

        app.launch()
        unlockVaultIfNeeded(with: testUser)

        let itemsScreen = app.findElement(testID: "items-screen")
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout),
            "Should be on items screen after launch/unlock"
        )

        let initialStateScreenshot = XCUIScreen.main.screenshot()
        let attachment1 = XCTAttachment(screenshot: initialStateScreenshot)
        attachment1.name = "06-1-initial-state"
        attachment1.lifetime = .keepAlways
        add(attachment1)

        // Step 1: Get initial server revision before creating credential
        let initialRevisions = try await TestUserRegistration.getVaultRevisions(token: testUser.token)
        let initialRevision = initialRevisions.currentRevision
        print("[RPO Test] Initial server revision: \(initialRevision)")

        // Step 2: Create a credential while online (syncs to server normally)
        let addItemButton = app.findElement(testID: "add-item-button")
        addItemButton.tapNoIdle()

        let addEditScreen = app.findElement(testID: "add-edit-screen")
        XCTAssertTrue(
            addEditScreen.waitForExistenceNoIdle(timeout: 10),
            "Add/edit screen should appear"
        )

        // Enter item name
        let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
        itemNameInput.tapNoIdle()
        itemNameInput.typeText(uniqueName)

        // Enter service URL
        let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
        serviceUrlInput.tapNoIdle()
        serviceUrlInput.typeText("https://rpo-test.example.com")

        // Add email field
        let addEmailButton = app.findElement(testID: "add-email-button")
        app.scrollToElement(addEmailButton)
        addEmailButton.tapNoIdle()

        // Enter email
        let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
        loginEmailInput.tapNoIdle()
        loginEmailInput.typeText("rpo-test@example.com")

        app.hideKeyboardIfVisible()

        let credentialCreatedScreenshot = XCUIScreen.main.screenshot()
        let attachment2 = XCTAttachment(screenshot: credentialCreatedScreenshot)
        attachment2.name = "06-2-credential-created"
        attachment2.lifetime = .keepAlways
        add(attachment2)

        // Save the item (syncs to server since we're online)
        let saveButton = app.findElement(testID: "save-button")
        saveButton.tapNoIdle()

        // Wait for item to be saved
        XCTAssertTrue(
            app.waitForText("Login credentials", timeout: 10),
            "Should show item detail screen after save"
        )

        // Go back to items list
        sleep(1)
        let backButton = app.findElement(testID: "back-button")
        backButton.tapNoIdle()

        // Wait for items screen
        XCTAssertTrue(
            itemsScreen.waitForExistenceNoIdle(timeout: 10),
            "Should return to items screen"
        )

        // Step 3: Wait for sync to complete (credential is now on server)
        sleep(3)

        // Verify server revision increased after sync
        let afterCreateRevisions = try await TestUserRegistration.getVaultRevisions(token: testUser.token)
        let revisionAfterCreate = afterCreateRevisions.currentRevision
        print("[RPO Test] Server revision after create: \(revisionAfterCreate)")
        XCTAssertGreaterThan(
            revisionAfterCreate, initialRevision,
            "Server revision should increase after creating credential (was \(initialRevision), now \(revisionAfterCreate))"
        )

        let afterSyncScreenshot = XCUIScreen.main.screenshot()
        let attachment3 = XCTAttachment(screenshot: afterSyncScreenshot)
        attachment3.name = "06-3-after-initial-sync"
        attachment3.lifetime = .keepAlways
        add(attachment3)

        // Step 4: Simulate server data loss by deleting the latest vault revision
        // This makes the server roll back to an older state (without the credential we just created)
        // The client still has the credential locally and thinks it synced at the higher revision
        let deletedCount = try await TestUserRegistration.deleteVaultRevisions(
            count: 1,
            token: testUser.token
        )
        print("[RPO Test] Deleted \(deletedCount) vault revision(s) from server to simulate data loss")

        // Verify server revision decreased (simulating rollback)
        let afterDeleteRevisions = try await TestUserRegistration.getVaultRevisions(token: testUser.token)
        let revisionAfterDelete = afterDeleteRevisions.currentRevision
        print("[RPO Test] Server revision after delete: \(revisionAfterDelete)")
        XCTAssertLessThan(
            revisionAfterDelete, revisionAfterCreate,
            "Server revision should decrease after deleting vault revision (was \(revisionAfterCreate), now \(revisionAfterDelete))"
        )

        let afterServerRollbackScreenshot = XCUIScreen.main.screenshot()
        let attachment4 = XCTAttachment(screenshot: afterServerRollbackScreenshot)
        attachment4.name = "06-4-after-server-rollback"
        attachment4.lifetime = .keepAlways
        add(attachment4)

        // Step 5: Trigger sync - this should detect RPO scenario and upload vault
        // Client thinks: "I'm at revision N, server says revision N-1 (lower)"
        // → This triggers the RPO recovery path: upload client data to "recover" server
        app.pullToRefresh()

        // Wait for sync to complete
        sleep(5)

        let afterRpoSyncScreenshot = XCUIScreen.main.screenshot()
        let attachment5 = XCTAttachment(screenshot: afterRpoSyncScreenshot)
        attachment5.name = "06-5-after-rpo-sync"
        attachment5.lifetime = .keepAlways
        add(attachment5)

        // Step 6: Verify the credential still exists after RPO recovery
        // If the client correctly uploaded its data (RPO recovery path),
        // the credential should still be present
        // If client had downloaded from server instead, the credential would be GONE
        // (because we deleted the server revision that contained it)
        let rpoItemCard = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", uniqueName)
        ).firstMatch

        XCTAssertTrue(
            rpoItemCard.waitForExistenceNoIdle(timeout: 10),
            "Credential '\(uniqueName)' should still exist after RPO recovery - proves client uploaded to server"
        )

        // Tap to verify item details are preserved
        rpoItemCard.tapNoIdle()

        XCTAssertTrue(
            app.waitForText("Login credentials", timeout: 10),
            "Should show item detail screen"
        )

        // Verify email is preserved
        XCTAssertTrue(
            app.waitForTextContaining("rpo-test@example.com", timeout: 5),
            "Email should be preserved after RPO recovery"
        )

        let itemVerifiedScreenshot = XCUIScreen.main.screenshot()
        let attachment6 = XCTAttachment(screenshot: itemVerifiedScreenshot)
        attachment6.name = "06-6-item-verified-after-rpo"
        attachment6.lifetime = .keepAlways
        add(attachment6)

        // Step 7: Verify server revision is restored via API
        // After RPO recovery, client should have uploaded its vault, restoring the revision
        let finalRevisions = try await TestUserRegistration.getVaultRevisions(token: testUser.token)
        let finalRevision = finalRevisions.currentRevision
        print("[RPO Test] Final server revision: \(finalRevision)")

        // The final revision should be at least as high as after create
        // (client uploaded, creating a new revision)
        XCTAssertGreaterThanOrEqual(
            finalRevision, revisionAfterCreate,
            "Server revision should be restored after RPO recovery (expected >= \(revisionAfterCreate), got \(finalRevision))"
        )

        // Log success summary
        print("[RPO Test] SUCCESS - Revision flow: \(initialRevision) → \(revisionAfterCreate) (create) → \(revisionAfterDelete) (rollback) → \(finalRevision) (recovered)")
    }

    // MARK: - Helper Methods

    /// Checks if the unlock screen is displayed and unlocks the vault if needed.
    /// Called after app launch or deep links, which may trigger the vault to lock.
    /// - Parameter testUser: The test user whose password will be used for unlock
    @MainActor
    private func unlockVaultIfNeeded(with testUser: TestUser) {
        sleep(1) // Allow app to settle

        let unlockScreen = app.findElement(testID: "unlock-screen")
        guard unlockScreen.waitForExistenceNoIdle(timeout: 3) else {
            return // Not on unlock screen, nothing to do
        }

        // Wait for form to be ready (loading state finished)
        _ = app.waitForText("Unlock Vault", timeout: 5)

        // Enter password
        let passwordInput = app.findTextField(testID: "unlock-password-input")
        if passwordInput.waitForExistenceNoIdle(timeout: 5) {
            passwordInput.tapNoIdle()
            passwordInput.typeText(testUser.password)
        }

        app.hideKeyboardIfVisible()

        // Tap unlock button
        let unlockButton = app.findElement(testID: "unlock-button")
        if unlockButton.waitForExistenceNoIdle(timeout: 3) {
            unlockButton.tapNoIdle()
        }

        // Wait for items screen (unlock redirects through reinitialize)
        let itemsScreen = app.findElement(testID: "items-screen")
        _ = itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout)
    }
}
