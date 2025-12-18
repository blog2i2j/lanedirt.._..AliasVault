// Rust Core WASM Interop for Blazor
// This module provides JavaScript functions that Blazor can call via JSInterop
// to access the Rust WASM merge and credential matching functionality.

let wasmModule = null;
let isInitialized = false;
let initPromise = null;

/**
 * Initialize the Rust WASM module.
 * @returns {Promise<boolean>} True if initialization succeeded.
 */
async function initRustCore() {
    if (isInitialized) {
        return true;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            // Fetch the WASM binary first
            const wasmResponse = await fetch('/wasm/aliasvault_core_bg.wasm');
            if (!wasmResponse.ok) {
                throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
            }
            const wasmBytes = await wasmResponse.arrayBuffer();

            // Dynamically import the ES module
            const module = await import('/wasm/aliasvault_core.js');

            // Initialize the WASM module with the binary bytes
            await module.default(wasmBytes);

            // Call init to set up panic hook
            if (typeof module.init === 'function') {
                module.init();
            }

            wasmModule = module;
            isInitialized = true;
            console.log('[RustCore] WASM module initialized successfully');
            return true;
        } catch (error) {
            console.error('[RustCore] Failed to initialize WASM module:', error);
            isInitialized = false;
            initPromise = null; // Allow retry on failure
            return false;
        }
    })();

    return initPromise;
}

/**
 * Check if the Rust WASM module is available.
 * @returns {Promise<boolean>} True if available.
 */
window.rustCoreIsAvailable = async function() {
    return await initRustCore();
};

/**
 * Merge two vaults using LWW strategy.
 * @param {string} inputJson - JSON string containing MergeInput.
 * @returns {Promise<string>} JSON string containing MergeOutput.
 */
window.rustCoreMergeVaults = async function(inputJson) {
    if (!await initRustCore()) {
        return JSON.stringify({
            success: false,
            error: 'Rust WASM module not available',
            statements: [],
            stats: {}
        });
    }

    try {
        const result = wasmModule.mergeVaultsJson(inputJson);
        return result;
    } catch (error) {
        console.error('[RustCore] Merge failed:', error);
        return JSON.stringify({
            success: false,
            error: error.toString(),
            statements: [],
            stats: {}
        });
    }
};

/**
 * Filter credentials for autofill.
 * @param {string} inputJson - JSON string containing CredentialMatcherInput.
 * @returns {Promise<string>} JSON string containing CredentialMatcherOutput.
 */
window.rustCoreFilterCredentials = async function(inputJson) {
    if (!await initRustCore()) {
        return JSON.stringify({
            matches: [],
            error: 'Rust WASM module not available'
        });
    }

    try {
        const result = wasmModule.filterCredentialsJson(inputJson);
        return result;
    } catch (error) {
        console.error('[RustCore] Filter credentials failed:', error);
        return JSON.stringify({
            matches: [],
            error: error.toString()
        });
    }
};

/**
 * Get the list of syncable table names.
 * @returns {Promise<string[]>} Array of table names.
 */
window.rustCoreGetSyncableTableNames = async function() {
    if (!await initRustCore()) {
        // Return default list if WASM not available
        return [
            'Items', 'FieldValues', 'Folders', 'Tags', 'ItemTags',
            'Attachments', 'TotpCodes', 'Passkeys', 'FieldDefinitions',
            'FieldHistories', 'Logos'
        ];
    }

    try {
        return wasmModule.getSyncableTableNames();
    } catch (error) {
        console.error('[RustCore] Get syncable table names failed:', error);
        return [];
    }
};

/**
 * Extract domain from URL.
 * @param {string} url - The URL to extract domain from.
 * @returns {Promise<string>} The extracted domain.
 */
window.rustCoreExtractDomain = async function(url) {
    if (!await initRustCore()) {
        return '';
    }

    try {
        return wasmModule.extractDomain(url);
    } catch (error) {
        console.error('[RustCore] Extract domain failed:', error);
        return '';
    }
};

/**
 * Extract root domain from a domain string.
 * @param {string} domain - The domain to extract root from.
 * @returns {Promise<string>} The root domain.
 */
window.rustCoreExtractRootDomain = async function(domain) {
    if (!await initRustCore()) {
        return '';
    }

    try {
        return wasmModule.extractRootDomain(domain);
    } catch (error) {
        console.error('[RustCore] Extract root domain failed:', error);
        return '';
    }
};
