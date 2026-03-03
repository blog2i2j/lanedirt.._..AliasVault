/**
 * This module extracts field detection patterns from all available translation files.
 * It looks at common.email, common.username, and common.password translations
 * across all supported languages to help detect form fields in any language.
 *
 * This module dynamically imports all translation files, so adding a new language
 * automatically extends form detection support without any code changes.
 */

/**
 * Dynamically import all translation JSON files from the locales directory
 */
const translationModules = import.meta.glob('../../i18n/locales/*.json', { eager: true });

/**
 * Extract all translation objects from the imported modules
 */
const allTranslations = Object.values(translationModules).map((module: unknown) => {
  return (module as { default: unknown }).default;
});

/**
 * Extract unique, lowercase field patterns from all translations
 * for a given key path (e.g., 'common.email')
 */
function extractPatternsFromTranslations(keyPath: string): string[] {
  const patterns = new Set<string>();

  for (const translation of allTranslations) {
    const value = getNestedValue(translation, keyPath);
    if (value && typeof value === 'string') {
      // Normalize and split multi-word translations
      const normalized = value.toLowerCase().trim();

      // Add the full phrase
      patterns.add(normalized);
    }
  }

  return Array.from(patterns);
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Email patterns extracted from all translation files
 * These are combined with the existing email patterns for better detection
 */
export const TranslationEmailPatterns: string[] = extractPatternsFromTranslations('common.email');

/**
 * Username patterns extracted from all translation files
 * These are combined with the existing username patterns for better detection
 */
export const TranslationUsernamePatterns: string[] = extractPatternsFromTranslations('common.username');

/**
 * Password patterns extracted from all translation files
 * These are combined with the existing password patterns for better detection
 */
export const TranslationPasswordPatterns: string[] = extractPatternsFromTranslations('common.password');

/**
 * Combined patterns that include both translation-based and hardcoded patterns
 * This ensures we catch fields in all supported languages
 */
export const AllLanguagePatterns = {
  email: TranslationEmailPatterns,
  username: TranslationUsernamePatterns,
  password: TranslationPasswordPatterns
};
