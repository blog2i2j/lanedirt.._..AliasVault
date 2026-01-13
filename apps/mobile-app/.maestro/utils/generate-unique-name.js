/* global PREFIX, output */
// Generate a unique name using timestamp
// Usage: Set PREFIX env var to customize the prefix (default: "Test")
// Output: UNIQUE_NAME variable containing the generated name

const prefix = PREFIX || 'Test';
const timestamp = Date.now();
// Use last 6 digits to keep it readable but unique
const shortId = String(timestamp).slice(-6);

output.UNIQUE_NAME = `${prefix} ${shortId}`;
