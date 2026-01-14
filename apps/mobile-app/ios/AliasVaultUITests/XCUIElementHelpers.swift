import XCTest

/// Extension to help find elements by their testID (React Native accessibilityIdentifier)
extension XCUIElementQuery {
    /// Find an element by its testID (maps to accessibilityIdentifier in React Native)
    @MainActor
    func element(testID: String) -> XCUIElement {
        return self.matching(identifier: testID).firstMatch
    }
}

extension XCUIElement {
    /// Wait for element to exist without waiting for app idle
    /// This is essential for React Native apps that have continuous timers/animations
    @MainActor
    func waitForExistenceNoIdle(timeout: TimeInterval = 10) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true"),
            object: self
        )
        let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
        return result == .completed
    }

    /// Wait for element to be hittable (visible and interactable)
    @MainActor
    func waitForHittable(timeout: TimeInterval = 10) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "isHittable == true"),
            object: self
        )
        let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
        return result == .completed
    }

    /// Tap element without waiting for app idle
    /// This is essential for React Native apps that have continuous timers/animations
    /// Uses press(forDuration:) which bypasses idle wait unlike tap()
    @MainActor
    func tapNoIdle() {
        self.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.01)
    }

    /// Clear text field and enter new text (no idle wait version)
    @MainActor
    func clearAndTypeTextNoIdle(_ text: String) {
        guard let currentValue = self.value as? String, !currentValue.isEmpty else {
            self.tapNoIdle()
            self.typeText(text)
            return
        }

        self.tapNoIdle()
        // Select all and delete
        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentValue.count)
        self.typeText(deleteString)
        self.typeText(text)
    }

    /// Clear text field and enter new text
    @MainActor
    func clearAndTypeText(_ text: String) {
        guard let currentValue = self.value as? String, !currentValue.isEmpty else {
            self.tap()
            self.typeText(text)
            return
        }

        self.tap()
        // Select all and delete
        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentValue.count)
        self.typeText(deleteString)
        self.typeText(text)
    }
}

extension XCUIApplication {
    /// Wait for an element with testID to exist (no idle wait - safe for React Native)
    @MainActor
    func waitForElement(testID: String, timeout: TimeInterval = 10) -> XCUIElement {
        let element = self.descendants(matching: .any).matching(identifier: testID).firstMatch
        _ = element.waitForExistenceNoIdle(timeout: timeout)
        return element
    }

    /// Find a button by testID or text label
    @MainActor
    func findButton(testID: String? = nil, label: String? = nil) -> XCUIElement {
        if let testID = testID {
            // Check buttons first
            let button = self.buttons.matching(identifier: testID).firstMatch
            if button.exists {
                return button
            }
            // Check other elements (React Native may render as other types)
            return self.descendants(matching: .any).matching(identifier: testID).firstMatch
        }
        if let label = label {
            return self.buttons[label]
        }
        fatalError("Must provide either testID or label")
    }

    /// Find a text field by testID
    @MainActor
    func findTextField(testID: String) -> XCUIElement {
        // Check textFields first by identifier
        let textField = self.textFields.matching(identifier: testID).firstMatch
        if textField.exists {
            return textField
        }
        // Check secureTextFields by identifier
        let secureField = self.secureTextFields.matching(identifier: testID).firstMatch
        if secureField.exists {
            return secureField
        }
        // Check any element with that identifier (React Native may render as different types)
        let anyElement = self.descendants(matching: .any).matching(identifier: testID).firstMatch
        if anyElement.exists {
            return anyElement
        }
        // Check textFields by label (fallback for some React Native versions)
        let textFieldByLabel = self.textFields[testID]
        if textFieldByLabel.exists {
            return textFieldByLabel
        }
        // Check secureTextFields by label
        let secureFieldByLabel = self.secureTextFields[testID]
        if secureFieldByLabel.exists {
            return secureFieldByLabel
        }
        return anyElement
    }

    /// Find any element by testID
    @MainActor
    func findElement(testID: String) -> XCUIElement {
        return self.descendants(matching: .any).matching(identifier: testID).firstMatch
    }

    /// Check if element with testID exists (no idle wait - safe for React Native)
    @MainActor
    func elementExists(testID: String, timeout: TimeInterval = 2) -> Bool {
        let element = self.descendants(matching: .any).matching(identifier: testID).firstMatch
        return element.waitForExistenceNoIdle(timeout: timeout)
    }

    /// Find text element by its content
    @MainActor
    func findText(_ text: String) -> XCUIElement {
        return self.staticTexts[text]
    }

    /// Wait for text to appear (no idle wait - safe for React Native)
    @MainActor
    func waitForText(_ text: String, timeout: TimeInterval = 10) -> Bool {
        return self.staticTexts[text].waitForExistenceNoIdle(timeout: timeout)
    }

    /// Hide keyboard if visible (uses press to avoid idle wait)
    @MainActor
    func hideKeyboardIfVisible() {
        // Try tapping outside to dismiss - uses press(forDuration:) to avoid idle wait
        if self.keyboards.count > 0 {
            // Tap outside the keyboard area to dismiss
            let coordinate = self.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            coordinate.press(forDuration: 0.01)
        }
    }

    /// Perform pull-to-refresh gesture on a scrollable element
    @MainActor
    func pullToRefresh(on element: XCUIElement? = nil) {
        let scrollView = element ?? self.scrollViews.firstMatch
        let startPoint = scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
        let endPoint = scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
        startPoint.press(forDuration: 0.1, thenDragTo: endPoint)
    }

    /// Open a deep link URL
    @MainActor
    func openDeepLink(_ urlString: String) {
        // Use Safari to trigger deep link
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.launch()

        // Wait for Safari to load
        sleep(1)

        // Tap address bar and enter URL
        let urlBar = safari.textFields["Address"]
        if urlBar.waitForExistence(timeout: 5) {
            urlBar.tap()
            urlBar.typeText(urlString + "\n")
        }

        // Handle potential "Open" dialog
        let openButton = safari.buttons["Open"]
        if openButton.waitForExistence(timeout: 3) {
            openButton.tap()
        }

        // Small delay for the deep link to process
        sleep(2)
    }
}
