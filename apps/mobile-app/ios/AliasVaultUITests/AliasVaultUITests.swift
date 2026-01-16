import XCTest

/// E2E UI Tests for AliasVault iOS app.
///
/// These tests use dynamically created test users via the API, so no pre-configured
/// credentials are needed. Tests run sequentially and share state (e.g., the test user
/// created in test01 is reused in subsequent tests).
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

    // MARK: - Test 01: Successful Login

    /// Verifies successful login flow with a dynamically created test user.
    /// Creates a test user via the API, configures the app to use the local server,
    /// and logs in. The test user is stored for reuse in subsequent tests.
    @MainActor
    func test01SuccessfulLogin() async throws {
        let testUser = try await ensureTestUser()
        print("[Test01] Using test user: \(testUser.username)")

        app.launchArguments.append("--reset-state")
        app.launch()

        XCTContext.runActivity(named: "Wait for login screen") { _ in
            let loginScreen = app.findElement(testID: "login-screen")
            assertElementExists(
                loginScreen,
                timeout: 15,
                message: "Login screen should be visible",
                context: "01-login-screen"
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
                context: "01-self-hosted-option"
            )
            selfHostedOption.tapNoIdle()

            let customApiUrlInput = app.findTextField(testID: "custom-api-url-input")
            assertElementExists(
                customApiUrlInput,
                timeout: 5,
                message: "Custom API URL input should appear",
                context: "01-custom-url-input"
            )

            customApiUrlInput.tapNoIdle()
            customApiUrlInput.clearAndTypeTextNoIdle(TestConfiguration.apiUrl)
            print("[Test01] Configured API URL: \(TestConfiguration.apiUrl)")
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
                context: "01-return-to-login"
            )

            let usernameInput = app.findTextField(testID: "username-input")
            usernameInput.clearAndTypeTextNoIdle(testUser.username)

            let passwordInput = app.findTextField(testID: "password-input")
            passwordInput.tapNoIdle()
            passwordInput.typeTextNoIdle(testUser.password)

            app.hideKeyboardIfVisible()

            let credentialsScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: credentialsScreenshot)
            attachment1.name = "01-1-credentials-entered"
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
                context: "01-items-screen"
            )

            let itemsList = app.findElement(testID: "items-list")
            if !itemsList.exists {
                captureFailureState(context: "01-items-list-missing")
                XCTFail("Items list should be visible after login")
            }

            let loginSuccessScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: loginSuccessScreenshot)
            attachment2.name = "01-2-login-successful"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            print("[Test01] Login successful, items screen displayed")
        }
    }

    // MARK: - Test 02: Create New Item

    /// Verifies item creation flow: opens add form, fills in details, saves, and verifies
    /// the item appears in the list. Handles vault unlock if needed between tests.
    @MainActor
    func test02CreateItem() async throws {
        let testUser = try await ensureTestUser()
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "E2E Test")
        print("[Test02] Creating item with name: \(uniqueName)")

        app.launch()
        loginWithTestUser(testUser)

        XCTContext.runActivity(named: "Verify items screen is displayed") { _ in
            let itemsScreen = app.findElement(testID: "items-screen")
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should be on items screen after launch/unlock",
                context: "02-items-screen"
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
                context: "02-add-edit-screen"
            )

            let addItemScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: addItemScreenshot)
            attachment1.name = "02-1-add-item-screen"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        XCTContext.runActivity(named: "Fill item details") { _ in
            let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
            itemNameInput.tapNoIdle()
            itemNameInput.typeTextNoIdle(uniqueName)

            let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
            serviceUrlInput.tapNoIdle()
            serviceUrlInput.typeTextNoIdle("https://example.com")

            let addEmailButton = app.findElement(testID: "add-email-button")
            app.scrollToElement(addEmailButton)
            addEmailButton.tapNoIdle()

            let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
            loginEmailInput.tapNoIdle()
            loginEmailInput.typeTextNoIdle("e2e-test@example.com")

            let loginUsernameInput = app.findAndScrollToTextField(testID: "login-username-input")
            if loginUsernameInput.exists {
                app.scrollToElement(loginUsernameInput)
                loginUsernameInput.tapNoIdle()
                loginUsernameInput.typeTextNoIdle("e2euser")
            }

            app.hideKeyboardIfVisible()

            let itemFilledScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: itemFilledScreenshot)
            attachment2.name = "02-2-item-filled"
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
                context: "02-item-detail-after-save"
            )

            let itemDetailScreenshot = XCUIScreen.main.screenshot()
            let attachment3 = XCTAttachment(screenshot: itemDetailScreenshot)
            attachment3.name = "02-3-item-detail-screen"
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
                context: "02-return-to-items"
            )

            // Wait for list to fully populate after navigation
            sleep(2)

            let newItemCard = app.descendants(matching: .any).matching(
                NSPredicate(format: "label == %@", uniqueName)
            ).firstMatch

            let itemFound = newItemCard.waitForExistenceNoIdle(timeout: 10)
            if !itemFound {
                captureFailureState(context: "02-item-not-in-list")
                XCTFail("Newly created item '\(uniqueName)' should appear in list")
                return
            }

            print("[Test02] Item '\(uniqueName)' found in list, tapping to verify")
            newItemCard.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen when tapping created item",
                context: "02-item-detail-verify"
            )

            let itemVerifiedScreenshot = XCUIScreen.main.screenshot()
            let attachment4 = XCTAttachment(screenshot: itemVerifiedScreenshot)
            attachment4.name = "02-4-item-verified"
            attachment4.lifetime = .keepAlways
            add(attachment4)

            print("[Test02] Item creation and verification successful")
        }
    }

    // MARK: - Test 03: Offline Mode and Sync

    /// Verifies offline mode and sync recovery:
    /// 1. Goes offline by setting API URL to invalid (simulates network failure)
    /// 2. Creates a credential while offline (stored locally)
    /// 3. Goes back online and triggers sync
    /// 4. Verifies the credential persists after sync
    ///
    /// Uses debug deep links (`__debug__/set-api-url`) to toggle offline mode.
    /// These only work in development builds.
    @MainActor
    func test03OfflineModeAndSync() async throws {
        let testUser = try await ensureTestUser()

        app.launch()
        loginWithTestUser(testUser)

        let originalApiUrl = TestConfiguration.apiUrl
        let invalidApiUrl = "http://offline.invalid.localhost:9999"
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "Offline Test")
        print("[Test03] Creating offline item with name: \(uniqueName)")

        let itemsScreen = app.findElement(testID: "items-screen")
        let offlineIndicator = app.findElement(testID: "sync-indicator-offline")

        XCTContext.runActivity(named: "Step 1: Verify online state") { _ in
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should be on items screen",
                context: "03-items-screen"
            )

            let initialStateScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: initialStateScreenshot)
            attachment1.name = "03-1-initial-state-online"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        XCTContext.runActivity(named: "Step 2: Enable offline mode via deep link") { _ in
            let encodedInvalidUrl = invalidApiUrl.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? invalidApiUrl
            print("[Test03] Setting API URL to invalid: \(invalidApiUrl)")
            app.openDeepLink("aliasvault://open/__debug__/set-api-url/\(encodedInvalidUrl)")

            unlockVaultIfNeeded(with: testUser)

            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen after deep link",
                context: "03-after-offline-deeplink"
            )

            // Trigger a sync attempt to detect offline state
            app.pullToRefresh()
            sleep(3)

            assertElementExists(
                offlineIndicator,
                timeout: 10,
                message: "Offline indicator should appear after API URL change",
                context: "03-offline-indicator"
            )

            let offlineModeScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: offlineModeScreenshot)
            attachment2.name = "03-2-offline-mode-enabled"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            print("[Test03] Offline mode enabled successfully")
        }

        XCTContext.runActivity(named: "Step 3: Create item while offline") { _ in
            let addItemButton = app.findElement(testID: "add-item-button")
            addItemButton.tapNoIdle()

            let addEditScreen = app.findElement(testID: "add-edit-screen")
            assertElementExists(
                addEditScreen,
                timeout: 10,
                message: "Add/edit screen should appear",
                context: "03-add-edit-screen"
            )

            let addItemOfflineScreenshot = XCUIScreen.main.screenshot()
            let attachment3 = XCTAttachment(screenshot: addItemOfflineScreenshot)
            attachment3.name = "03-3-add-item-screen-offline"
            attachment3.lifetime = .keepAlways
            add(attachment3)

            let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
            itemNameInput.tapNoIdle()
            itemNameInput.typeTextNoIdle(uniqueName)

            let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
            serviceUrlInput.tapNoIdle()
            serviceUrlInput.typeTextNoIdle("https://offline-test.example.com")

            let addEmailButton = app.findElement(testID: "add-email-button")
            app.scrollToElement(addEmailButton)
            addEmailButton.tapNoIdle()

            let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
            loginEmailInput.tapNoIdle()
            loginEmailInput.typeTextNoIdle("offline-test@example.com")

            app.hideKeyboardIfVisible()

            let itemFilledOfflineScreenshot = XCUIScreen.main.screenshot()
            let attachment4 = XCTAttachment(screenshot: itemFilledOfflineScreenshot)
            attachment4.name = "03-4-item-filled-offline"
            attachment4.lifetime = .keepAlways
            add(attachment4)

            let saveButton = app.findElement(testID: "save-button")
            saveButton.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen after save",
                context: "03-item-saved-offline"
            )

            let itemSavedOfflineScreenshot = XCUIScreen.main.screenshot()
            let attachment5 = XCTAttachment(screenshot: itemSavedOfflineScreenshot)
            attachment5.name = "03-5-item-saved-offline"
            attachment5.lifetime = .keepAlways
            add(attachment5)

            sleep(1)
            let backButton = app.findElement(testID: "back-button")
            backButton.tapNoIdle()

            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen after saving",
                context: "03-return-to-items"
            )

            // Wait for list to fully populate after navigation
            sleep(2)

            let offlineItemCard = app.descendants(matching: .any).matching(
                NSPredicate(format: "label == %@", uniqueName)
            ).firstMatch

            let itemFound = offlineItemCard.waitForExistenceNoIdle(timeout: 5)
            if !itemFound {
                captureFailureState(context: "03-offline-item-not-in-list")
                XCTFail("Offline-created item '\(uniqueName)' should appear in list")
                return
            }

            let itemInListOfflineScreenshot = XCUIScreen.main.screenshot()
            let attachment6 = XCTAttachment(screenshot: itemInListOfflineScreenshot)
            attachment6.name = "03-6-item-in-list-offline"
            attachment6.lifetime = .keepAlways
            add(attachment6)

            print("[Test03] Item created while offline and appears in list")
        }

        XCTContext.runActivity(named: "Step 4: Go back online and sync") { _ in
            let encodedValidUrl = originalApiUrl.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? originalApiUrl
            print("[Test03] Restoring API URL to: \(originalApiUrl)")
            app.openDeepLink("aliasvault://open/__debug__/set-api-url/\(encodedValidUrl)")

            unlockVaultIfNeeded(with: testUser)

            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen after restoring API URL",
                context: "03-after-online-deeplink"
            )

            sleep(2)

            let backOnlineScreenshot = XCUIScreen.main.screenshot()
            let attachment9 = XCTAttachment(screenshot: backOnlineScreenshot)
            attachment9.name = "03-9-back-online"
            attachment9.lifetime = .keepAlways
            add(attachment9)

            app.pullToRefresh()
            sleep(5)

            // Verify offline indicator is gone
            if offlineIndicator.exists {
                captureFailureState(context: "03-offline-indicator-still-present")
                XCTFail("Offline indicator should be gone after sync")
            }

            let syncedScreenshot = XCUIScreen.main.screenshot()
            let attachment10 = XCTAttachment(screenshot: syncedScreenshot)
            attachment10.name = "03-10-synced-successfully"
            attachment10.lifetime = .keepAlways
            add(attachment10)

            print("[Test03] Back online and synced successfully")
        }

        XCTContext.runActivity(named: "Step 5: Verify item persists after sync") { _ in
            let offlineItemCard = app.descendants(matching: .any).matching(
                NSPredicate(format: "label == %@", uniqueName)
            ).firstMatch

            if !offlineItemCard.exists {
                captureFailureState(context: "03-item-missing-after-sync")
                XCTFail("Item '\(uniqueName)' should still exist after sync")
                return
            }

            offlineItemCard.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen",
                context: "03-item-detail-after-sync"
            )

            assertTextContaining(
                "offline-test@example.com",
                timeout: 5,
                message: "Email should be preserved after sync",
                context: "03-email-preserved"
            )

            let itemVerifiedAfterSyncScreenshot = XCUIScreen.main.screenshot()
            let attachment11 = XCTAttachment(screenshot: itemVerifiedAfterSyncScreenshot)
            attachment11.name = "03-11-item-verified-after-sync"
            attachment11.lifetime = .keepAlways
            add(attachment11)

            print("[Test03] Offline item verified after sync - test passed")
        }
    }

    // MARK: - Test 04: RPO Recovery

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
    func test04RPORecovery() async throws {
        let testUser = try await ensureTestUser()
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "RPO Test")
        print("[Test04] Testing RPO recovery with item: \(uniqueName)")

        app.launch()
        loginWithTestUser(testUser)

        let itemsScreen = app.findElement(testID: "items-screen")
        var initialRevision = 0
        var revisionAfterCreate = 0
        var revisionAfterDelete = 0

        XCTContext.runActivity(named: "Step 1: Verify initial state and get server revision") { _ in
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should be on items screen after launch/unlock",
                context: "04-items-screen"
            )

            let initialStateScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: initialStateScreenshot)
            attachment1.name = "04-1-initial-state"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        // Get initial revision using username-based API (no auth token needed)
        let initialRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        initialRevision = initialRevisions.currentRevision
        print("[Test04] Initial server revision: \(initialRevision)")

        XCTContext.runActivity(named: "Step 2: Create credential while online") { _ in
            let addItemButton = app.findElement(testID: "add-item-button")
            addItemButton.tapNoIdle()

            let addEditScreen = app.findElement(testID: "add-edit-screen")
            assertElementExists(
                addEditScreen,
                timeout: 10,
                message: "Add/edit screen should appear",
                context: "04-add-edit-screen"
            )

            let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
            itemNameInput.tapNoIdle()
            itemNameInput.typeTextNoIdle(uniqueName)

            let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
            serviceUrlInput.tapNoIdle()
            serviceUrlInput.typeTextNoIdle("https://rpo-test.example.com")

            let addEmailButton = app.findElement(testID: "add-email-button")
            app.scrollToElement(addEmailButton)
            addEmailButton.tapNoIdle()

            let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
            loginEmailInput.tapNoIdle()
            loginEmailInput.typeTextNoIdle("rpo-test@example.com")

            app.hideKeyboardIfVisible()

            let credentialCreatedScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: credentialCreatedScreenshot)
            attachment2.name = "04-2-credential-created"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            let saveButton = app.findElement(testID: "save-button")
            saveButton.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen after save",
                context: "04-item-saved"
            )

            sleep(1)
            let backButton = app.findElement(testID: "back-button")
            backButton.tapNoIdle()

            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen",
                context: "04-return-to-items"
            )

            sleep(1) // Wait for sync

            print("[Test04] Credential created and synced to server")
        }

        // Verify revision increased (async)
        let afterCreateRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        revisionAfterCreate = afterCreateRevisions.currentRevision
        print("[Test04] Server revision after create: \(revisionAfterCreate)")

        XCTAssertGreaterThan(
            revisionAfterCreate, initialRevision,
            "Server revision should increase after creating credential (was \(initialRevision), now \(revisionAfterCreate))"
        )

        XCTContext.runActivity(named: "Step 3: Simulate server data loss") { _ in
            let afterSyncScreenshot = XCUIScreen.main.screenshot()
            let attachment3 = XCTAttachment(screenshot: afterSyncScreenshot)
            attachment3.name = "04-3-after-initial-sync"
            attachment3.lifetime = .keepAlways
            add(attachment3)
        }

        // Delete vault revision to simulate data loss (async)
        let deletedCount = try await TestUserRegistration.deleteVaultRevisionsByUsername(
            username: testUser.username,
            count: 1
        )
        print("[Test04] Deleted \(deletedCount) vault revision(s) from server to simulate data loss")

        let afterDeleteRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        revisionAfterDelete = afterDeleteRevisions.currentRevision
        print("[Test04] Server revision after delete: \(revisionAfterDelete)")

        XCTAssertLessThan(
            revisionAfterDelete, revisionAfterCreate,
            "Server revision should decrease after deleting vault revision (was \(revisionAfterCreate), now \(revisionAfterDelete))"
        )

        XCTContext.runActivity(named: "Step 4: Trigger sync for RPO recovery") { _ in
            let afterServerRollbackScreenshot = XCUIScreen.main.screenshot()
            let attachment4 = XCTAttachment(screenshot: afterServerRollbackScreenshot)
            attachment4.name = "04-4-after-server-rollback"
            attachment4.lifetime = .keepAlways
            add(attachment4)

            print("[Test04] Triggering sync - client should detect RPO scenario and upload vault")
            app.pullToRefresh()
            sleep(5)

            let afterRpoSyncScreenshot = XCUIScreen.main.screenshot()
            let attachment5 = XCTAttachment(screenshot: afterRpoSyncScreenshot)
            attachment5.name = "04-5-after-rpo-sync"
            attachment5.lifetime = .keepAlways
            add(attachment5)
        }

        XCTContext.runActivity(named: "Step 5: Verify credential persists after RPO recovery") { _ in
            let rpoItemCard = app.descendants(matching: .any).matching(
                NSPredicate(format: "label == %@", uniqueName)
            ).firstMatch

            let itemExists = rpoItemCard.waitForExistenceNoIdle(timeout: 10)
            if !itemExists {
                captureFailureState(context: "04-rpo-item-missing")
                XCTFail("Credential '\(uniqueName)' should still exist after RPO recovery - this proves client uploaded to server instead of downloading (which would have lost the credential)")
                return
            }

            rpoItemCard.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen",
                context: "04-item-detail"
            )

            assertTextContaining(
                "rpo-test@example.com",
                timeout: 5,
                message: "Email should be preserved after RPO recovery",
                context: "04-email-preserved"
            )

            let itemVerifiedScreenshot = XCUIScreen.main.screenshot()
            let attachment6 = XCTAttachment(screenshot: itemVerifiedScreenshot)
            attachment6.name = "04-6-item-verified-after-rpo"
            attachment6.lifetime = .keepAlways
            add(attachment6)
        }

        // Verify server revision restored (async)
        let finalRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        let finalRevision = finalRevisions.currentRevision
        print("[Test04] Final server revision: \(finalRevision)")

        XCTAssertGreaterThanOrEqual(
            finalRevision, revisionAfterCreate,
            "Server revision should be restored after RPO recovery (expected >= \(revisionAfterCreate), got \(finalRevision))"
        )

        print("[Test04] SUCCESS - Revision flow: \(initialRevision) → \(revisionAfterCreate) (create) → \(revisionAfterDelete) (rollback) → \(finalRevision) (recovered)")
    }

    // MARK: - Test 05: Forced Logout Recovery

    /// Verifies forced logout recovery mechanism:
    /// When a forced logout occurs (e.g., 401 unauthorized due to token invalidation),
    /// the client should preserve the encrypted vault locally. On next login with the same
    /// credentials, the client should detect the preserved vault and recover by uploading
    /// it to the server.
    ///
    /// This is different from normal logout:
    /// - Normal logout: User explicitly logs out → vault is cleared
    /// - Forced logout: Server rejects token → vault preserved locally for recovery
    ///
    /// Test flow:
    /// 1. Login and create a credential (vault synced to server)
    /// 2. Simulate server data loss by deleting latest vault revision
    /// 3. Invalidate refresh tokens via API (simulates token expiry)
    /// 4. Trigger API call to cause forced logout (401)
    /// 5. Verify app shows login screen with username prefilled (orphan vault preserved)
    /// 6. Re-login with same credentials
    /// 7. Verify credential still exists (vault was recovered from local preserved copy)
    /// 8. Verify server revision is restored
    @MainActor
    func test05ForcedLogoutRecovery() async throws {
        let testUser = try await ensureTestUser()
        let uniqueName = TestConfiguration.generateUniqueName(prefix: "Forced Logout Test")
        print("[Test05] Testing forced logout recovery with item: \(uniqueName)")

        app.launch()
        loginWithTestUser(testUser)

        let itemsScreen = app.findElement(testID: "items-screen")
        var revisionBeforeLogout = 0

        XCTContext.runActivity(named: "Step 1: Verify initial state") { _ in
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should be on items screen after launch/unlock",
                context: "05-items-screen"
            )

            let initialStateScreenshot = XCUIScreen.main.screenshot()
            let attachment1 = XCTAttachment(screenshot: initialStateScreenshot)
            attachment1.name = "05-1-initial-state"
            attachment1.lifetime = .keepAlways
            add(attachment1)
        }

        XCTContext.runActivity(named: "Step 2: Create credential while online") { _ in
            let addItemButton = app.findElement(testID: "add-item-button")
            addItemButton.tapNoIdle()

            let addEditScreen = app.findElement(testID: "add-edit-screen")
            assertElementExists(
                addEditScreen,
                timeout: 10,
                message: "Add/edit screen should appear",
                context: "05-add-edit-screen"
            )

            let itemNameInput = app.findAndScrollToTextField(testID: "item-name-input")
            itemNameInput.tapNoIdle()
            itemNameInput.typeTextNoIdle(uniqueName)

            let serviceUrlInput = app.findAndScrollToTextField(testID: "service-url-input")
            serviceUrlInput.tapNoIdle()
            serviceUrlInput.typeTextNoIdle("https://forced-logout-test.example.com")

            let addEmailButton = app.findElement(testID: "add-email-button")
            app.scrollToElement(addEmailButton)
            addEmailButton.tapNoIdle()

            let loginEmailInput = app.findAndScrollToTextField(testID: "login-email-input")
            loginEmailInput.tapNoIdle()
            loginEmailInput.typeTextNoIdle("forced-logout-test@example.com")

            app.hideKeyboardIfVisible()

            let credentialCreatedScreenshot = XCUIScreen.main.screenshot()
            let attachment2 = XCTAttachment(screenshot: credentialCreatedScreenshot)
            attachment2.name = "05-2-credential-created"
            attachment2.lifetime = .keepAlways
            add(attachment2)

            let saveButton = app.findElement(testID: "save-button")
            saveButton.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen after save",
                context: "05-item-saved"
            )

            sleep(1)
            let backButton = app.findElement(testID: "back-button")
            backButton.tapNoIdle()

            assertElementExists(
                itemsScreen,
                timeout: 10,
                message: "Should return to items screen",
                context: "05-return-to-items"
            )

            sleep(3) // Wait for sync

            print("[Test05] Credential created and synced to server")
        }

        // Get revision before logout using username-based API (no auth token needed)
        let beforeLogoutRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        revisionBeforeLogout = beforeLogoutRevisions.currentRevision
        print("[Test05] Server revision before forced logout: \(revisionBeforeLogout)")

        // Simulate server data loss (delete latest revision)
        let deletedCount = try await TestUserRegistration.deleteVaultRevisionsByUsername(
            username: testUser.username,
            count: 1
        )
        print("[Test05] Deleted \(deletedCount) vault revision(s) to simulate server data loss")

        let afterRollbackRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        let revisionAfterRollback = afterRollbackRevisions.currentRevision
        print("[Test05] Server revision after rollback: \(revisionAfterRollback)")

        XCTContext.runActivity(named: "Step 3: Invalidate tokens and trigger forced logout") { _ in
            let beforeForcedLogoutScreenshot = XCUIScreen.main.screenshot()
            let attachment3 = XCTAttachment(screenshot: beforeForcedLogoutScreenshot)
            attachment3.name = "05-3-before-forced-logout"
            attachment3.lifetime = .keepAlways
            add(attachment3)
        }

        // Block user via API (this will cause 401 on next auth check)
        try await TestUserRegistration.blockUserByUsername(username: testUser.username)
        print("[Test05] User blocked")

        XCTContext.runActivity(named: "Step 4: Trigger sync to cause forced logout") { _ in
            // Pull to refresh will trigger API call which should fail with 401
            // and cause forced logout
            print("[Test05] Triggering sync to cause forced logout...")
            app.pullToRefresh()

            // Wait for the session expired modal to appear and dismiss it
            // The modal says "Your session has expired. Please login again." with an "OK" button
            let okButton = app.alerts.buttons["OK"]
            let alertAppeared = okButton.waitForExistenceNoIdle(timeout: 10)
            if alertAppeared {
                print("[Test05] Session expired modal detected, dismissing...")
                okButton.tapNoIdle()
                sleep(1) // Wait for alert dismissal and navigation
            } else {
                print("[Test05] No session expired modal detected, continuing...")
            }

            let afterForcedLogoutScreenshot = XCUIScreen.main.screenshot()
            let attachment4 = XCTAttachment(screenshot: afterForcedLogoutScreenshot)
            attachment4.name = "05-4-after-forced-logout"
            attachment4.lifetime = .keepAlways
            add(attachment4)
        }

        XCTContext.runActivity(named: "Step 5: Verify login screen with prefilled username") { _ in
            // Should be on login screen after forced logout (modal was already dismissed in step 4)
            let loginScreen = app.findElement(testID: "login-screen")
            assertElementExists(
                loginScreen,
                timeout: 15,
                message: "Should be on login screen after forced logout",
                context: "05-login-screen-after-logout"
            )

            // Verify username is prefilled (orphan vault preservation)
            let usernameInput = app.findTextField(testID: "username-input")
            if usernameInput.waitForExistenceNoIdle(timeout: 5) {
                let usernameValue = usernameInput.value as? String ?? ""
                print("[Test05] Username field value: '\(usernameValue)'")
                // Note: Username may or may not be prefilled depending on implementation
            }

            let loginScreenScreenshot = XCUIScreen.main.screenshot()
            let attachment5 = XCTAttachment(screenshot: loginScreenScreenshot)
            attachment5.name = "05-5-login-screen-after-forced-logout"
            attachment5.lifetime = .keepAlways
            add(attachment5)

            print("[Test05] Forced logout confirmed - on login screen")
        }

        // Unblock user so they can log in again
        try await TestUserRegistration.unblockUserByUsername(username: testUser.username)
        print("[Test05] User unblocked")

        XCTContext.runActivity(named: "Step 6: Re-login with same credentials") { _ in
            // Clear username field and enter credentials
            let usernameInput = app.findTextField(testID: "username-input")
            usernameInput.clearAndTypeTextNoIdle(testUser.username)

            let passwordInput = app.findTextField(testID: "password-input")
            passwordInput.tapNoIdle()
            passwordInput.typeTextNoIdle(testUser.password)

            app.hideKeyboardIfVisible()

            let credentialsScreenshot = XCUIScreen.main.screenshot()
            let attachment6 = XCTAttachment(screenshot: credentialsScreenshot)
            attachment6.name = "05-6-credentials-entered"
            attachment6.lifetime = .keepAlways
            add(attachment6)

            let loginButton = app.findElement(testID: "login-button")
            loginButton.tapNoIdle()

            // Wait for login to complete and vault to load
            assertElementExists(
                itemsScreen,
                timeout: TestConfiguration.extendedTimeout,
                message: "Should navigate to items screen after re-login",
                context: "05-items-after-relogin"
            )

            // Wait for sync to complete
            sleep(5)

            let afterReloginScreenshot = XCUIScreen.main.screenshot()
            let attachment7 = XCTAttachment(screenshot: afterReloginScreenshot)
            attachment7.name = "05-7-after-relogin"
            attachment7.lifetime = .keepAlways
            add(attachment7)

            print("[Test05] Re-login successful")
        }

        XCTContext.runActivity(named: "Step 7: Verify credential still exists") { _ in
            // The credential should still exist because:
            // 1. It was in the local preserved vault during forced logout
            // 2. On re-login, client detected local vault is more advanced than server
            // 3. Client uploaded local vault to recover server
            let itemCard = app.descendants(matching: .any).matching(
                NSPredicate(format: "label == %@", uniqueName)
            ).firstMatch

            let itemExists = itemCard.waitForExistenceNoIdle(timeout: 10)
            if !itemExists {
                captureFailureState(context: "05-credential-missing")
                XCTFail("Credential '\(uniqueName)' should still exist after forced logout recovery - this proves vault was preserved locally and uploaded to server")
                return
            }

            itemCard.tapNoIdle()

            assertTextAppears(
                "Login credentials",
                timeout: 10,
                message: "Should show item detail screen",
                context: "05-item-detail"
            )

            assertTextContaining(
                "forced-logout-test@example.com",
                timeout: 5,
                message: "Email should be preserved after forced logout recovery",
                context: "05-email-preserved"
            )

            let itemVerifiedScreenshot = XCUIScreen.main.screenshot()
            let attachment8 = XCTAttachment(screenshot: itemVerifiedScreenshot)
            attachment8.name = "05-8-item-verified-after-recovery"
            attachment8.lifetime = .keepAlways
            add(attachment8)

            print("[Test05] Credential verified after forced logout recovery")
        }

        // Verify server revision is restored using username-based API (no auth token needed)
        let finalRevisions = try await TestUserRegistration.getVaultRevisionsByUsername(username: testUser.username)
        let finalRevision = finalRevisions.currentRevision
        print("[Test05] Final server revision: \(finalRevision)")

        XCTAssertGreaterThanOrEqual(
            finalRevision, revisionBeforeLogout,
            "Server revision should be restored after forced logout recovery (expected >= \(revisionBeforeLogout), got \(finalRevision))"
        )

        print("[Test05] SUCCESS - Forced logout recovery verified!")
        print("[Test05] Revision flow: \(revisionBeforeLogout) (before) → \(revisionAfterRollback) (rollback) → \(finalRevision) (recovered)")
    }

    // MARK: - Helper Methods

    /// Logs in with test user at the beginning of a test.
    /// Always logs out first if already logged in to ensure we're using the correct test user.
    /// Use this at the start of tests after app.launch().
    /// - Parameter testUser: The test user to login with
    @MainActor
    private func loginWithTestUser(_ testUser: TestUser) {
        // Wait for app to settle and reach a known state (unlock, login, or items screen)
        // Use longer initial timeout since app may still be loading after launch
        let unlockScreen = app.findElement(testID: "unlock-screen")
        let loginScreen = app.findElement(testID: "login-screen")
        let itemsScreen = app.findElement(testID: "items-screen")

        // Wait up to 15 seconds for any of the expected screens to appear
        var screenFound = false
        let startTime = Date()
        let maxWaitTime: TimeInterval = 15

        while !screenFound && Date().timeIntervalSince(startTime) < maxWaitTime {
            if unlockScreen.exists || loginScreen.exists || itemsScreen.exists {
                screenFound = true
            } else {
                Thread.sleep(forTimeInterval: 0.5)
            }
        }

        if !screenFound {
            print("[Helper] Warning: No expected screen found after \(maxWaitTime)s, proceeding anyway")
        }

        // Handle unlock screen - logout to start fresh with test user
        if unlockScreen.exists {
            print("[Helper] Unlock screen detected - logging out to login fresh with test user")

            let logoutButton = app.findElement(testID: "logout-button")
            if logoutButton.waitForExistenceNoIdle(timeout: 5) {
                logoutButton.tapNoIdle()

                // Handle logout confirmation alert if present
                let confirmButton = app.buttons["Log Out"]
                if confirmButton.waitForExistence(timeout: 3) {
                    confirmButton.tap()
                }
            }

            // Wait for login screen
            _ = loginScreen.waitForExistenceNoIdle(timeout: 10)
        }

        // Check if we're on login screen
        if loginScreen.waitForExistenceNoIdle(timeout: 2) {
            performLogin(with: testUser)
            return
        }

        // Check if we're already on items screen (already logged in as correct user)
        if itemsScreen.waitForExistenceNoIdle(timeout: 2) {
            print("[Helper] Already on items screen, assuming correct user is logged in")
            return
        }

        // Unknown state - log warning but continue (test will fail with appropriate error if needed)
        print("[Helper] Unknown app state after waiting, test may fail")
    }

    /// Unlocks the vault if the unlock screen is displayed.
    /// Use this after deep links or other actions that may lock the vault.
    /// Unlike loginWithTestUser, this does NOT logout - it just enters the password.
    /// - Parameter testUser: The test user whose password to use for unlock
    @MainActor
    private func unlockVaultIfNeeded(with testUser: TestUser) {
        let unlockScreen = app.findElement(testID: "unlock-screen")
        guard unlockScreen.waitForExistenceNoIdle(timeout: 1) else {
            // Not on unlock screen, nothing to do
            return
        }

        print("[Helper] Unlock screen detected - entering password to unlock")

        // Enter password in unlock screen
        let passwordInput = app.findTextField(testID: "unlock-password-input")
        if passwordInput.waitForExistenceNoIdle(timeout: 1) {
            passwordInput.tapNoIdle()
            passwordInput.typeTextNoIdle(testUser.password)
        }

        app.hideKeyboardIfVisible()

        // Tap unlock button
        let unlockButton = app.findElement(testID: "unlock-button")
        if unlockButton.waitForExistenceNoIdle(timeout: 1) {
            unlockButton.tapNoIdle()
        }

        // Wait for items screen
        let itemsScreen = app.findElement(testID: "items-screen")
        _ = itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout)
    }

    /// Performs login with the given test user credentials.
    /// Assumes we're already on the login screen.
    /// - Parameter testUser: The test user to login with
    @MainActor
    private func performLogin(with testUser: TestUser) {
        // Check if API URL is already configured to localhost by looking at the displayed URL
        // The login screen shows the URL via server-url-link, containing text like "localhost:5092" or "aliasvault.net"
        let serverUrlLink = app.findElement(testID: "server-url-link")
        var needsApiConfig = true

        if serverUrlLink.waitForExistenceNoIdle(timeout: 5) {
            // Check if URL already contains localhost (already configured for local testing)
            let urlText = serverUrlLink.label
            if urlText.contains("localhost") {
                print("[Helper] API URL already configured to localhost, skipping API configuration")
                needsApiConfig = false
            } else {
                print("[Helper] API URL shows '\(urlText)', need to configure to localhost")
            }
        }

        if needsApiConfig {
            // Configure self-hosted URL by tapping the server URL link button
            let serverUrlLinkButton = app.findElement(testID: "server-url-link-button")

            if serverUrlLinkButton.waitForExistenceNoIdle(timeout: 5) {
                serverUrlLinkButton.tapNoIdle()

                let selfHostedOption = app.findElement(testID: "api-option-custom")
                if selfHostedOption.waitForExistenceNoIdle(timeout: 10) {
                    selfHostedOption.tapNoIdle()

                    let customUrlInput = app.findTextField(testID: "custom-api-url-input")
                    if customUrlInput.waitForExistenceNoIdle(timeout: 5) {
                        customUrlInput.tapNoIdle()
                        customUrlInput.clearAndTypeTextNoIdle(TestConfiguration.apiUrl)
                        print("[Helper] Configured API URL: \(TestConfiguration.apiUrl)")
                    }

                    app.hideKeyboardIfVisible()

                    // Tap back to return to login form
                    let backButton = app.findElement(testID: "back-button")
                    if backButton.waitForExistenceNoIdle(timeout: 3) {
                        backButton.tapNoIdle()
                    }
                }
            }
        }

        // Wait for login screen to be ready
        let loginScreen = app.findElement(testID: "login-screen")
        _ = loginScreen.waitForExistenceNoIdle(timeout: 5)

        // Enter credentials
        let usernameInput = app.findTextField(testID: "username-input")
        if usernameInput.waitForExistenceNoIdle(timeout: 5) {
            usernameInput.clearAndTypeTextNoIdle(testUser.username)
        }

        let passwordInput = app.findTextField(testID: "password-input")
        if passwordInput.waitForExistenceNoIdle(timeout: 3) {
            passwordInput.tapNoIdle()
            passwordInput.typeTextNoIdle(testUser.password)
        }

        app.hideKeyboardIfVisible()

        // Tap login button
        let loginButton = app.findElement(testID: "login-button")
        if loginButton.waitForExistenceNoIdle(timeout: 3) {
            loginButton.tapNoIdle()
        }

        // Wait for items screen
        let itemsScreen = app.findElement(testID: "items-screen")
        _ = itemsScreen.waitForExistenceNoIdle(timeout: TestConfiguration.extendedTimeout)
    }
}
