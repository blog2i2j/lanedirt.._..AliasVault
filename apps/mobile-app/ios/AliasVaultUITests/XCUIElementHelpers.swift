import XCTest

// MARK: - XCUIElement Extensions

extension XCUIElement {
    /// Wait for element to exist without waiting for app idle.
    /// Essential for React Native apps that have continuous timers/animations.
    @MainActor
    func waitForExistenceNoIdle(timeout: TimeInterval = 10) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true"),
            object: self
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    /// Tap element without waiting for app idle.
    /// Uses `press(forDuration:)` which bypasses the idle wait unlike `tap()`.
    @MainActor
    func tapNoIdle() {
        self.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.01)
    }

    /// Clear text field and enter new text without waiting for idle.
    @MainActor
    func clearAndTypeTextNoIdle(_ text: String) {
        guard let currentValue = self.value as? String, !currentValue.isEmpty else {
            self.tapNoIdle()
            self.typeText(text)
            return
        }

        self.tapNoIdle()
        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentValue.count)
        self.typeText(deleteString)
        self.typeText(text)
    }
}

// MARK: - XCUIApplication Extensions

extension XCUIApplication {
    /// Find any element by testID (accessibilityIdentifier).
    @MainActor
    func findElement(testID: String) -> XCUIElement {
        return self.descendants(matching: .any).matching(identifier: testID).firstMatch
    }

    /// Find a text field by testID. Checks textFields, secureTextFields, and falls back to any element.
    @MainActor
    func findTextField(testID: String) -> XCUIElement {
        // Check textFields first
        let textField = self.textFields.matching(identifier: testID).firstMatch
        if textField.exists { return textField }

        // Check secureTextFields
        let secureField = self.secureTextFields.matching(identifier: testID).firstMatch
        if secureField.exists { return secureField }

        // Fall back to any element with that identifier
        return self.descendants(matching: .any).matching(identifier: testID).firstMatch
    }

    /// Find a text field and scroll to it if not visible.
    @MainActor
    func findAndScrollToTextField(testID: String) -> XCUIElement {
        let element = findTextField(testID: testID)
        if element.exists && !element.isHittable {
            scrollToElement(element)
        }
        return element
    }

    /// Wait for static text to appear.
    @MainActor
    func waitForText(_ text: String, timeout: TimeInterval = 10) -> Bool {
        return self.staticTexts[text].waitForExistenceNoIdle(timeout: timeout)
    }

    /// Wait for any element containing the specified text (searches labels and values).
    @MainActor
    func waitForTextContaining(_ text: String, timeout: TimeInterval = 10) -> Bool {
        let predicate = NSPredicate(format: "label CONTAINS[c] %@ OR value CONTAINS[c] %@", text, text)
        let element = self.descendants(matching: .any).matching(predicate).firstMatch
        return element.waitForExistenceNoIdle(timeout: timeout)
    }

    /// Hide keyboard if visible by tapping outside.
    @MainActor
    func hideKeyboardIfVisible() {
        if self.keyboards.count > 0 {
            let coordinate = self.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            coordinate.press(forDuration: 0.01)
        }
    }

    /// Perform pull-to-refresh gesture.
    @MainActor
    func pullToRefresh(on element: XCUIElement? = nil) {
        let scrollView = element ?? self.scrollViews.firstMatch
        let startPoint = scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
        let endPoint = scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
        startPoint.press(forDuration: 0.1, thenDragTo: endPoint)
    }

    /// Scroll to make an element visible within a scroll view.
    @MainActor
    func scrollToElement(_ element: XCUIElement, in scrollView: XCUIElement? = nil) {
        guard !element.isHittable else { return }

        let targetScrollView = scrollView ?? self.scrollViews.firstMatch
        var attempts = 0

        while !element.isHittable && attempts < 5 {
            let startPoint = targetScrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
            let endPoint = targetScrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            startPoint.press(forDuration: 0.1, thenDragTo: endPoint)
            Thread.sleep(forTimeInterval: 0.3)
            attempts += 1
        }
    }

    /// Open a deep link URL.
    @MainActor
    func openDeepLink(_ urlString: String) {
        guard let url = URL(string: urlString) else {
            print("[openDeepLink] Invalid URL: \(urlString)")
            return
        }
        self.open(url)
        sleep(2) // Wait for deep link to be processed
    }
}
