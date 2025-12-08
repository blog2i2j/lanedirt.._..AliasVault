import type { Page } from '@playwright/test';

import { test, expect, openPopup } from '../fixtures';

/**
 * Category 1: Extension Loading (No API required)
 *
 * These tests verify the extension loads and renders correctly.
 * They don't require an API server to be running.
 * Tests run sequentially and share the same popup page.
 */
test.describe.serial('1. Extension Loading', () => {
  let popup: Page;

  test.afterAll(async () => {
    // Close popup to start fresh for next test group
    await popup?.close();
  });

  test('1.1 should load the popup and show login form', async ({ context, extensionId }) => {
    // Open popup (first test opens it, subsequent tests reuse it)
    popup = await openPopup(context, extensionId);

    // Check that React rendered (the app container should exist)
    const appContent = popup.locator('#root');
    await expect(appContent).toBeVisible();

    // Should show login form elements
    await expect(popup.locator('input[type="text"]')).toBeVisible();
    await expect(popup.locator('input[type="password"]')).toBeVisible();

    // Take a screenshot for debugging
    await popup.screenshot({ path: 'tests/screenshots/1.1-popup-loaded.png' });
  });

  test('1.2 should have a running service worker', async ({ context, extensionId }) => {
    // Service worker should be running
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    // The service worker URL should match our extension
    const swUrl = serviceWorkers[0].url();
    expect(swUrl).toContain(extensionId);
    expect(swUrl).toContain('background');
  });
});
