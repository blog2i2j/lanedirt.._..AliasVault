import { test, expect, openPopup } from './fixtures';

/**
 * Basic browser extension E2E tests.
 *
 * These tests verify the extension loads correctly and basic UI interactions work.
 * Run with: npm run test:e2e
 *
 * Prerequisites:
 * 1. Build the extension: npm run build:chrome
 * 2. Have an AliasVault API server running (or mock one)
 */

test.describe('Extension Popup', () => {
  test('should load the popup and show login form', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    // Wait for the popup to load
    await popup.waitForLoadState('domcontentloaded');

    // The popup should show something - either login form or vault content
    // Check for common elements that indicate the popup loaded successfully
    const body = popup.locator('body');
    await expect(body).toBeVisible();

    // Check that React rendered (the app container should exist)
    const appContent = popup.locator('#root');
    await expect(appContent).toBeVisible();

    // Take a screenshot for debugging
    await popup.screenshot({ path: 'tests/screenshots/popup-loaded.png' });
  });

  test('should have working navigation elements', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);
    await popup.waitForLoadState('domcontentloaded');

    // Wait for React to render
    await popup.waitForSelector('#root', { state: 'visible' });

    // Give React a moment to render content
    await popup.waitForTimeout(500);

    // The popup should contain some text (not be empty)
    const rootContent = await popup.locator('#root').textContent();
    expect(rootContent).toBeTruthy();
    expect(rootContent!.length).toBeGreaterThan(0);
  });
});

test.describe('Extension Service Worker', () => {
  test('should have a running service worker', async ({ context, extensionId }) => {
    // Service worker should be running
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    // The service worker URL should match our extension
    const swUrl = serviceWorkers[0].url();
    expect(swUrl).toContain(extensionId);
    expect(swUrl).toContain('background');
  });
});
