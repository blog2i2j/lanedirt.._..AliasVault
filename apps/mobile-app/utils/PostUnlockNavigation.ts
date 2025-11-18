import { Href } from 'expo-router';
import { Linking } from 'react-native';

/**
 * Normalize a deep link or path to ensure it has the correct /(tabs)/ prefix.
 * Exported for use in _layout.tsx and other navigation logic.
 *
 * Supports:
 * - Action-based URLs: aliasvault://open/mobile-unlock/[id]
 * - Direct routes: aliasvault://credentials/[id], aliasvault://settings/[page]
 */
export function normalizeDeepLinkPath(urlOrPath: string): string {
  // Remove all URL schemes first
  let path = urlOrPath
    .replace('net.aliasvault.app://', '')
    .replace('aliasvault://', '')
    .replace('exp+aliasvault://', '');

  // If it already has /(tabs)/ prefix, return as is
  if (path.startsWith('/(tabs)/')) {
    return path;
  }

  // Handle action-based paths: $/mobile-unlock/[requestId]
  if (path.startsWith('open/mobile-unlock/')) {
    return `/(tabs)/settings/mobile-unlock/${path.split('/')[2]}`;
  }

  // Handle credential paths
  if (path.startsWith('credentials/') || path.includes('/credentials/')) {
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return `/(tabs)${path}`;
  }

  // Handle settings paths
  if (path.startsWith('settings/') || path.startsWith('/settings')) {
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return `/(tabs)${path}`;
  }

  // If path starts with /, add /(tabs) prefix
  if (path.startsWith('/')) {
    return `/(tabs)${path}`;
  }

  return path;
}

/**
 * Post-unlock navigation options.
 */
export type PostUnlockNavigationOptions = {
  /**
   * Pending deep link URL to process after unlock (from QR code scan during boot).
   */
  pendingDeepLink?: string | null;

  /**
   * Return URL from app context (for reinitialize flow).
   */
  returnUrl?: { path: string; params?: Record<string, string> } | null;

  /**
   * Router instance for navigation.
   */
  router: {
    replace: (href: Href) => void;
    push: (href: Href) => void;
  };

  /**
   * Clear the return URL from app context.
   */
  clearReturnUrl?: () => void;
}

/**
 * Centralized post-unlock navigation logic.
 * Handles pending deep links, return URLs, and default navigation.
 * This ensures consistent navigation behavior across all unlock flows:
 * - initialize.tsx (cold boot with biometric unlock)
 * - unlock.tsx (manual password/PIN unlock)
 * - reinitialize.tsx (timeout recovery with biometric unlock)
 */
export class PostUnlockNavigation {
  /**
   * Navigate to the appropriate destination after successful vault unlock.
   * Priority order:
   * 1. Pending deep link (from QR code scan during cold boot)
   * 2. Return URL (from reinitialize flow)
   * 3. Default credentials tab
   */
  static navigate(options: PostUnlockNavigationOptions): void {
    const { pendingDeepLink, returnUrl, router, clearReturnUrl } = options;

    // Priority 1: Handle pending deep link (e.g. from QR code scan or native autofill interface)
    if (pendingDeepLink) {
      console.log('[_postunlocknavigation] navigate with pendingDeepLink:', pendingDeepLink);
      this.handlePendingDeepLink(pendingDeepLink, router);
      return;
    }

    // Priority 2: Handle return URL (from reinitialize flow)
    if (returnUrl?.path) {
      console.log('[_postunlocknavigation] navigate with returnUrl:', returnUrl);
      this.handleReturnUrl(returnUrl, router);
      if (clearReturnUrl) {
        clearReturnUrl();
      }
      return;
    }

    // Priority 3: Default navigation to credentials
    router.replace('/(tabs)/credentials');
  }

  /**
   * Handle pending deep link after successful unlock.
   */
  private static handlePendingDeepLink(
    deepLink: string,
    router: PostUnlockNavigationOptions['router']
  ): void {
    // Normalize the deep link to get the correct path with /(tabs)/ prefix
    const normalizedPath = normalizeDeepLinkPath(deepLink);

    // Check if this is a mobile-login QR scanner route (already formatted with query params)
    if (normalizedPath.includes('/qr-scanner?url=')) {
      // First navigate to settings tab
      router.replace('/(tabs)/settings');
      // Then navigate to qr-scanner
      setTimeout(() => {
        router.push(normalizedPath as Href);
      }, 0);
      return;
    }

    // Check if this is a detail route (credentials or settings sub-pages)
    const isCredentialRoute = normalizedPath.includes('/(tabs)/credentials/');
    const isSettingsRoute = normalizedPath.includes('/(tabs)/settings/');

    if (isCredentialRoute) {
      // Navigate to credentials tab first, then push detail page
      router.replace('/(tabs)/credentials');
      setTimeout(() => {
        router.push(normalizedPath as Href);
      }, 0);
    } else if (isSettingsRoute) {
      // Navigate to settings tab first, then push detail page
      router.replace('/(tabs)/settings');
      setTimeout(() => {
        router.push(normalizedPath as Href);
      }, 0);
    } else {
      // Direct navigation for root tab routes
      router.replace(normalizedPath as Href);
    }
  }

  /**
   * Handle return URL navigation (from reinitialize flow).
   */
  private static handleReturnUrl(
    returnUrl: { path: string; params?: Record<string, string> | undefined },
    router: PostUnlockNavigationOptions['router']
  ): void {
    // Normalize the path using centralized function
    const normalizedPath = normalizeDeepLinkPath(returnUrl.path);
    const params = returnUrl.params || {};

    // Check if this is a detail route (has a sub-page after the tab)
    const isCredentialRoute = normalizedPath.includes('/(tabs)/credentials/');
    const isSettingsRoute = normalizedPath.includes('/(tabs)/settings/') &&
                           !normalizedPath.endsWith('/(tabs)/settings');

    if (isCredentialRoute) {
      // Navigate to credentials tab first, then push detail page
      router.replace('/(tabs)/credentials');
      setTimeout(() => {
        const queryParams = new URLSearchParams(params as Record<string, string>).toString();
        const targetUrl = queryParams ? `${normalizedPath}?${queryParams}` : normalizedPath;
        router.push(targetUrl as Href);
      }, 0);
    } else if (isSettingsRoute) {
      // Navigate to settings tab first, then push detail page
      router.replace('/(tabs)/settings');
      setTimeout(() => {
        const queryParams = new URLSearchParams(params as Record<string, string>).toString();
        const targetUrl = queryParams ? `${normalizedPath}?${queryParams}` : normalizedPath;
        router.push(targetUrl as Href);
      }, 0);
    } else {
      // Direct navigation for root tab routes
      router.replace({
        pathname: normalizedPath as '/',
        params: params as Record<string, string>
      });
    }
  }

  /**
   * Get the initial pending deep link URL if available.
   * This should be called during app boot to check for QR code scans.
   */
  static async getInitialPendingDeepLink(): Promise<string | null> {
    try {
      const initialUrl = await Linking.getInitialURL();
      if (!initialUrl) {
        return null;
      }

      // Check if it's a supported deep link type
      const path = initialUrl
        .replace('net.aliasvault.app://', '')
        .replace('aliasvault://', '')
        .replace('exp+aliasvault://', '');

      if (path.startsWith('mobile-login/') || path.includes('credentials/')) {
        return initialUrl;
      }

      return null;
    } catch (error) {
      console.error('Error getting initial deep link:', error);
      return null;
    }
  }
}
