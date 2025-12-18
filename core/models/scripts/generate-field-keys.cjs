#!/usr/bin/env node
/**
 * Generates FieldKey constants and SystemFieldRegistry for C#, Swift, and Kotlin from TypeScript source.
 * All type definitions are dynamically extracted from the TypeScript source files.
 */

const fs = require('fs');
const path = require('path');

// Paths
const REPO_ROOT = path.join(__dirname, '../../..');
const TS_SOURCE = path.join(REPO_ROOT, 'core/models/src/vault/FieldKey.ts');
const TS_REGISTRY_SOURCE = path.join(REPO_ROOT, 'core/models/src/vault/SystemFieldRegistry.ts');
const CS_OUTPUT = path.join(REPO_ROOT, 'apps/server/Databases/AliasClientDb/Models/FieldKey.cs');
const CS_REGISTRY_OUTPUT = path.join(REPO_ROOT, 'apps/server/Databases/AliasClientDb/Models/SystemFieldRegistry.cs');
const SWIFT_OUTPUT = path.join(REPO_ROOT, 'apps/mobile-app/ios/VaultModels/FieldKey.swift');
const KOTLIN_OUTPUT = path.join(REPO_ROOT, 'apps/mobile-app/android/app/src/main/java/net/aliasvault/app/vaultstore/models/FieldKey.kt');

/**
 * Parse the TypeScript FieldKey.ts file and extract constants
 */
function parseTypeScriptFieldKeys(tsContent) {
  const fieldKeys = {};

  // Extract field comments
  const lines = tsContent.split('\n');
  let currentComment = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Capture JSDoc comments
    if (line.startsWith('/**') || line.startsWith('*')) {
      const commentMatch = line.match(/\*\s*(.+)/);
      if (commentMatch && !commentMatch[1].startsWith('/')) {
        currentComment = commentMatch[1].trim();
      }
    }

    // Match field definition
    const fieldMatch = line.match(/^(\w+):\s*'([^']+)',?$/);
    if (fieldMatch) {
      const [, name, value] = fieldMatch;
      fieldKeys[name] = {
        value,
        comment: currentComment
      };
      currentComment = '';
    }
  }

  return fieldKeys;
}

/**
 * Parse FieldCategories from TypeScript source
 * Returns an array of category names in order
 */
function parseFieldCategories(tsContent) {
  const categories = [];

  // Find the FieldCategories constant
  const match = tsContent.match(/export const FieldCategories\s*=\s*\{([^}]+)\}/s);
  if (!match) {
    console.warn('Warning: Could not find FieldCategories in source');
    return categories;
  }

  const body = match[1];
  // Match each category: Primary: 'Primary',
  const categoryRegex = /(\w+):\s*'(\w+)'/g;
  let categoryMatch;

  while ((categoryMatch = categoryRegex.exec(body)) !== null) {
    categories.push(categoryMatch[1]);
  }

  return categories;
}

/**
 * Parse ItemTypeFieldConfig type from TypeScript source
 * Returns an array of property definitions
 */
function parseItemTypeFieldConfig(tsContent) {
  const properties = [];

  // Find the ItemTypeFieldConfig type
  const match = tsContent.match(/export type ItemTypeFieldConfig\s*=\s*\{([^}]+)\}/s);
  if (!match) {
    console.warn('Warning: Could not find ItemTypeFieldConfig in source');
    return properties;
  }

  const body = match[1];
  // Match properties with comments
  const lines = body.split('\n');
  let currentComment = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Capture comments
    const commentMatch = trimmed.match(/\/\*\*\s*(.+)\s*\*\//);
    if (commentMatch) {
      currentComment = commentMatch[1].trim();
    }

    // Match property: PropertyName: type;
    const propMatch = trimmed.match(/^(\w+):\s*(\w+);?$/);
    if (propMatch) {
      properties.push({
        name: propMatch[1],
        type: propMatch[2],
        comment: currentComment
      });
      currentComment = '';
    }
  }

  return properties;
}

/**
 * Parse SystemFieldDefinition type from TypeScript source
 * Returns an array of property definitions
 */
function parseSystemFieldDefinition(tsContent) {
  const properties = [];

  // Find the SystemFieldDefinition type
  const match = tsContent.match(/export type SystemFieldDefinition\s*=\s*\{([\s\S]*?)\n\};/);
  if (!match) {
    console.warn('Warning: Could not find SystemFieldDefinition in source');
    return properties;
  }

  const body = match[1];
  const lines = body.split('\n');
  let currentComment = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Capture single-line comments
    const singleCommentMatch = trimmed.match(/\/\*\*\s*(.+)\s*\*\//);
    if (singleCommentMatch) {
      currentComment = singleCommentMatch[1].trim();
      continue;
    }

    // Match property definition
    const propMatch = trimmed.match(/^(\w+):\s*(.+);?$/);
    if (propMatch && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
      let propType = propMatch[2].replace(/;$/, '').trim();

      // Simplify complex types for C# mapping
      let csharpType = mapTypeToCSharp(propType);

      properties.push({
        name: propMatch[1],
        tsType: propType,
        csharpType: csharpType,
        comment: currentComment
      });
      currentComment = '';
    }
  }

  return properties;
}

/**
 * Map TypeScript type to C# type
 */
function mapTypeToCSharp(tsType) {
  if (tsType === 'string') return 'string';
  if (tsType === 'boolean') return 'bool';
  if (tsType === 'number') return 'int';
  if (tsType === 'FieldType') return 'string'; // FieldType is a string union
  if (tsType === 'FieldCategory') return 'FieldCategory';
  if (tsType.includes('Partial<Record<ItemType, ItemTypeFieldConfig>>')) {
    return 'IReadOnlyDictionary<string, ItemTypeFieldConfig>';
  }
  return 'string'; // Default fallback
}

/**
 * Generate C# static class for FieldKey
 */
function generateCSharp(fieldKeys) {
  const header = `// <auto-generated />
// This file is auto-generated from core/models/src/vault/FieldKey.ts
// Do not edit this file directly. Run 'npm run generate:models' to regenerate.

namespace AliasClientDb.Models;

/// <summary>
/// System field keys for the field-based data model.
/// These keys map to FieldDefinition.FieldKey values.
/// </summary>
public static class FieldKey
{`;

  const fields = Object.entries(fieldKeys)
    .map(([name, { value, comment }]) => {
      return `    /// <summary>
    /// ${comment}
    /// </summary>
    public const string ${name} = "${value}";`;
    })
    .join('\n\n');

  const footer = `
}
`;

  return header + '\n' + fields + footer;
}

/**
 * Generate Swift enum
 */
function generateSwift(fieldKeys) {
  const header = `// <auto-generated />
// This file is auto-generated from core/models/src/vault/FieldKey.ts
// Do not edit this file directly. Run 'npm run generate:models' to regenerate.

import Foundation

/// System field keys for the field-based data model.
/// These keys map to FieldDefinition.FieldKey values.
public struct FieldKey {`;

  const fields = Object.entries(fieldKeys)
    .map(([name, { value, comment }]) => {
      // Convert PascalCase to camelCase for Swift
      const swiftName = name.charAt(0).toLowerCase() + name.slice(1);
      return `    /// ${comment}
    public static let ${swiftName} = "${value}"`;
    })
    .join('\n\n');

  const footer = `
}
`;

  return header + '\n' + fields + footer;
}

/**
 * Generate Kotlin object
 */
function generateKotlin(fieldKeys) {
  const header = `// <auto-generated />
// This file is auto-generated from core/models/src/vault/FieldKey.ts
// Do not edit this file directly. Run 'npm run generate:models' to regenerate.

package net.aliasvault.app.vaultstore.models

/**
 * System field keys for the field-based data model.
 * These keys map to FieldDefinition.FieldKey values.
 */
object FieldKey {`;

  const fields = Object.entries(fieldKeys)
    .map(([name, { value, comment }]) => {
      // Convert to SCREAMING_SNAKE_CASE for Kotlin constants
      const kotlinName = name.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '');
      // Ensure comment ends with a period for Kotlin detekt
      const kotlinComment = comment.endsWith('.') ? comment : `${comment}.`;
      return `    /**
     * ${kotlinComment}
     */
    const val ${kotlinName} = "${value}"`;
    })
    .join('\n\n');

  const footer = `
}
`;

  return header + '\n' + fields + footer;
}

/**
 * Parse the TypeScript SystemFieldRegistry.ts file and extract field definitions
 */
function parseSystemFieldRegistry(tsContent) {
  const fields = {};

  // Find the start of SystemFieldRegistry definition
  const registryStart = tsContent.indexOf('export const SystemFieldRegistry');
  if (registryStart === -1) {
    return fields;
  }

  // Extract just the registry content
  const registryContent = tsContent.slice(registryStart);

  // Match each field definition block using a state machine approach
  // Look for patterns like: 'login.username': {
  const fieldStartRegex = /'([a-z]+\.[a-z_]+)':\s*\{/g;
  let match;

  while ((match = fieldStartRegex.exec(registryContent)) !== null) {
    const fieldKey = match[1];
    const startIdx = match.index + match[0].length;

    // Find matching closing brace by counting braces
    let braceCount = 1;
    let endIdx = startIdx;
    while (braceCount > 0 && endIdx < registryContent.length) {
      if (registryContent[endIdx] === '{') braceCount++;
      if (registryContent[endIdx] === '}') braceCount--;
      endIdx++;
    }

    const fieldBody = registryContent.slice(startIdx, endIdx - 1);

    // Skip if this doesn't look like a SystemFieldDefinition (needs FieldKey property)
    if (!fieldBody.includes('FieldKey:')) {
      continue;
    }

    const field = {
      FieldKey: fieldKey,
      FieldType: extractStringValue(fieldBody, 'FieldType'),
      IsHidden: extractBoolValue(fieldBody, 'IsHidden'),
      IsMultiValue: extractBoolValue(fieldBody, 'IsMultiValue'),
      EnableHistory: extractBoolValue(fieldBody, 'EnableHistory'),
      Category: extractEnumValue(fieldBody, 'Category', 'FieldCategories'),
      DefaultDisplayOrder: extractNumberValue(fieldBody, 'DefaultDisplayOrder'),
      ApplicableToTypes: extractApplicableToTypes(fieldBody)
    };

    fields[fieldKey] = field;
  }

  return fields;
}

/**
 * Extract a string value from a field body
 */
function extractStringValue(body, propName) {
  const match = body.match(new RegExp(`${propName}:\\s*'([^']+)'`));
  return match ? match[1] : '';
}

/**
 * Extract a boolean value from a field body
 */
function extractBoolValue(body, propName) {
  const match = body.match(new RegExp(`${propName}:\\s*(true|false)`));
  return match ? match[1] === 'true' : false;
}

/**
 * Extract a number value from a field body
 */
function extractNumberValue(body, propName) {
  const match = body.match(new RegExp(`${propName}:\\s*(\\d+)`));
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract an enum value from a field body (e.g., FieldCategories.Login -> Login)
 */
function extractEnumValue(body, propName, enumName) {
  const match = body.match(new RegExp(`${propName}:\\s*${enumName}\\.(\\w+)`));
  return match ? match[1] : '';
}

/**
 * Extract ApplicableToTypes object from field body
 */
function extractApplicableToTypes(body) {
  const applicableToTypes = {};

  // Find the start of ApplicableToTypes
  const startMatch = body.match(/ApplicableToTypes:\s*\{/);
  if (!startMatch) {
    return applicableToTypes;
  }

  const startIdx = startMatch.index + startMatch[0].length;

  // Find matching closing brace by counting braces
  let braceCount = 1;
  let endIdx = startIdx;
  while (braceCount > 0 && endIdx < body.length) {
    if (body[endIdx] === '{') braceCount++;
    if (body[endIdx] === '}') braceCount--;
    endIdx++;
  }

  const typesBody = body.slice(startIdx, endIdx - 1);

  // Match each item type configuration: ItemType: { ShowByDefault: bool }
  const itemTypeRegex = /(\w+):\s*\{\s*ShowByDefault:\s*(true|false)\s*\}/g;
  let typeMatch;

  while ((typeMatch = itemTypeRegex.exec(typesBody)) !== null) {
    const itemType = typeMatch[1];
    const showByDefault = typeMatch[2] === 'true';
    applicableToTypes[itemType] = { ShowByDefault: showByDefault };
  }

  return applicableToTypes;
}

/**
 * Generate C# SystemFieldRegistry with full metadata
 * All types are dynamically generated from the parsed TypeScript
 */
function generateCSharpSystemFieldRegistry(fields, categories, itemTypeFieldConfigProps, systemFieldDefProps) {
  // Generate FieldCategory enum dynamically
  const categoryEnum = categories.map((cat, index) => {
    return `    /// <summary>${cat} fields.</summary>
    ${cat}${index < categories.length - 1 ? ',' : ''}`;
  }).join('\n');

  // Generate ItemTypeFieldConfig record dynamically
  const itemTypeFieldConfigParams = itemTypeFieldConfigProps
    .map(p => `${mapTypeToCSharp(p.type)} ${p.name}`)
    .join(', ');

  // Generate SystemFieldDefinition record dynamically
  const systemFieldDefParams = systemFieldDefProps
    .map(p => `${p.csharpType} ${p.name}`)
    .join(',\n    ');

  const systemFieldDefXmlParams = systemFieldDefProps
    .map(p => `/// <param name="${p.name}">${p.comment || p.name}</param>`)
    .join('\n');

  const header = `// <auto-generated />
// This file is auto-generated from core/models/src/vault/SystemFieldRegistry.ts
// Do not edit this file directly. Run 'npm run generate:models' to regenerate.

#nullable enable

namespace AliasClientDb.Models;

/// <summary>
/// Field categories for grouping in UI.
/// </summary>
public enum FieldCategory
{
${categoryEnum}
}

/// <summary>
/// Per-item-type configuration for a system field.
/// </summary>
${itemTypeFieldConfigProps.map(p => `/// <param name="${p.name}">${p.comment || p.name}</param>`).join('\n')}
public record ItemTypeFieldConfig(${itemTypeFieldConfigParams});

/// <summary>
/// System field definition with metadata.
/// </summary>
${systemFieldDefXmlParams}
public record SystemFieldDefinition(
    ${systemFieldDefParams});

/// <summary>
/// Registry of all system-defined fields.
/// These fields are immutable and their metadata is defined in code.
/// </summary>
public static class SystemFieldRegistry
{
    /// <summary>
    /// All system field definitions indexed by field key.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, SystemFieldDefinition> Fields =
        new Dictionary<string, SystemFieldDefinition>
        {
`;

  const fieldEntries = Object.entries(fields)
    .map(([key, field]) => {
      const applicableTypes = Object.entries(field.ApplicableToTypes)
        .map(([type, config]) => `["${type}"] = new ItemTypeFieldConfig(${config.ShowByDefault})`)
        .join(', ');

      return `            [FieldKey.${fieldKeyToPropertyName(key)}] = new SystemFieldDefinition(
                FieldKey: "${field.FieldKey}",
                FieldType: "${field.FieldType}",
                IsHidden: ${field.IsHidden.toString().toLowerCase()},
                IsMultiValue: ${field.IsMultiValue.toString().toLowerCase()},
                ApplicableToTypes: new Dictionary<string, ItemTypeFieldConfig> { ${applicableTypes} },
                EnableHistory: ${field.EnableHistory.toString().toLowerCase()},
                Category: FieldCategory.${field.Category},
                DefaultDisplayOrder: ${field.DefaultDisplayOrder})`;
    })
    .join(',\n');

  // Extract unique prefixes from field keys for IsSystemFieldPrefix
  const prefixes = [...new Set(Object.keys(fields).map(k => k.split('.')[0]))];
  const prefixChecks = prefixes.map(p => `fieldKey.StartsWith("${p}.")`).join(' ||\n               ');

  const methods = `
        };

    /// <summary>
    /// Get system field definition by key.
    /// </summary>
    /// <param name="fieldKey">The field key to look up.</param>
    /// <returns>The field definition, or null if not found.</returns>
    public static SystemFieldDefinition? GetSystemField(string fieldKey)
    {
        return Fields.TryGetValue(fieldKey, out var field) ? field : null;
    }

    /// <summary>
    /// Check if a field key represents a system field.
    /// </summary>
    /// <param name="fieldKey">The field key to check.</param>
    /// <returns>True if the field key is a system field.</returns>
    public static bool IsSystemField(string fieldKey)
    {
        return Fields.ContainsKey(fieldKey);
    }

    /// <summary>
    /// Check if a field applies to a specific item type.
    /// </summary>
    /// <param name="field">The field definition.</param>
    /// <param name="itemType">The item type to check.</param>
    /// <returns>True if the field applies to the item type.</returns>
    public static bool FieldAppliesToType(SystemFieldDefinition field, string itemType)
    {
        return field.ApplicableToTypes.ContainsKey(itemType);
    }

    /// <summary>
    /// Get all system fields applicable to a specific item type.
    /// Results are sorted by DefaultDisplayOrder.
    /// </summary>
    /// <param name="itemType">The item type.</param>
    /// <returns>Fields applicable to the item type.</returns>
    public static IEnumerable<SystemFieldDefinition> GetFieldsForItemType(string itemType)
    {
        return Fields.Values
            .Where(f => f.ApplicableToTypes.ContainsKey(itemType))
            .OrderBy(f => f.DefaultDisplayOrder);
    }

    /// <summary>
    /// Get system fields that should be shown by default for a specific item type.
    /// Results are sorted by DefaultDisplayOrder.
    /// </summary>
    /// <param name="itemType">The item type.</param>
    /// <returns>Fields shown by default for the item type.</returns>
    public static IEnumerable<SystemFieldDefinition> GetDefaultFieldsForItemType(string itemType)
    {
        return Fields.Values
            .Where(f => f.ApplicableToTypes.TryGetValue(itemType, out var config) && config.ShowByDefault)
            .OrderBy(f => f.DefaultDisplayOrder);
    }

    /// <summary>
    /// Get system fields that are NOT shown by default for a specific item type.
    /// These are the fields that can be added via an "add field" button.
    /// Results are sorted by DefaultDisplayOrder.
    /// </summary>
    /// <param name="itemType">The item type.</param>
    /// <returns>Optional fields for the item type.</returns>
    public static IEnumerable<SystemFieldDefinition> GetOptionalFieldsForItemType(string itemType)
    {
        return Fields.Values
            .Where(f => f.ApplicableToTypes.TryGetValue(itemType, out var config) && !config.ShowByDefault)
            .OrderBy(f => f.DefaultDisplayOrder);
    }

    /// <summary>
    /// Check if a field key matches a known system field prefix.
    /// </summary>
    /// <param name="fieldKey">The field key to check.</param>
    /// <returns>True if the field key has a system field prefix.</returns>
    public static bool IsSystemFieldPrefix(string fieldKey)
    {
        return ${prefixChecks};
    }
}
`;

  return header + fieldEntries + methods;
}

/**
 * Convert field key to C# property name (e.g., 'login.username' -> 'LoginUsername')
 */
function fieldKeyToPropertyName(fieldKey) {
  return fieldKey
    .split('.')
    .map(part => part.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(''))
    .join('');
}

/**
 * Ensure directory exists
 */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Main execution
 */
function main() {
  // Read TypeScript FieldKey source
  if (!fs.existsSync(TS_SOURCE)) {
    throw new Error(`Source file not found: ${TS_SOURCE}`);
  }

  const tsContent = fs.readFileSync(TS_SOURCE, 'utf8');
  const fieldKeys = parseTypeScriptFieldKeys(tsContent);

  if (Object.keys(fieldKeys).length === 0) {
    throw new Error('No field keys found in source file');
  }

  // Read TypeScript SystemFieldRegistry source
  if (!fs.existsSync(TS_REGISTRY_SOURCE)) {
    throw new Error(`Source file not found: ${TS_REGISTRY_SOURCE}`);
  }

  const tsRegistryContent = fs.readFileSync(TS_REGISTRY_SOURCE, 'utf8');

  // Parse types dynamically from TypeScript
  const categories = parseFieldCategories(tsRegistryContent);
  const itemTypeFieldConfigProps = parseItemTypeFieldConfig(tsRegistryContent);
  const systemFieldDefProps = parseSystemFieldDefinition(tsRegistryContent);
  const systemFields = parseSystemFieldRegistry(tsRegistryContent);

  if (Object.keys(systemFields).length === 0) {
    throw new Error('No system fields found in registry source file');
  }

  console.log(`Parsed ${Object.keys(fieldKeys).length} field keys`);
  console.log(`Parsed ${categories.length} field categories: ${categories.join(', ')}`);
  console.log(`Parsed ${itemTypeFieldConfigProps.length} ItemTypeFieldConfig properties`);
  console.log(`Parsed ${systemFieldDefProps.length} SystemFieldDefinition properties`);
  console.log(`Parsed ${Object.keys(systemFields).length} system field definitions`);

  // Generate C# FieldKey
  ensureDir(CS_OUTPUT);
  const csContent = generateCSharp(fieldKeys);
  fs.writeFileSync(CS_OUTPUT, csContent, 'utf8');
  console.log(`Generated: ${CS_OUTPUT}`);

  // Generate C# SystemFieldRegistry
  ensureDir(CS_REGISTRY_OUTPUT);
  const csRegistryContent = generateCSharpSystemFieldRegistry(
    systemFields,
    categories,
    itemTypeFieldConfigProps,
    systemFieldDefProps
  );
  fs.writeFileSync(CS_REGISTRY_OUTPUT, csRegistryContent, 'utf8');
  console.log(`Generated: ${CS_REGISTRY_OUTPUT}`);

  // Generate Swift
  ensureDir(SWIFT_OUTPUT);
  const swiftContent = generateSwift(fieldKeys);
  fs.writeFileSync(SWIFT_OUTPUT, swiftContent, 'utf8');
  console.log(`Generated: ${SWIFT_OUTPUT}`);

  // Generate Kotlin
  ensureDir(KOTLIN_OUTPUT);
  const kotlinContent = generateKotlin(fieldKeys);
  fs.writeFileSync(KOTLIN_OUTPUT, kotlinContent, 'utf8');
  console.log(`Generated: ${KOTLIN_OUTPUT}`);

  console.log('\nCode generation complete!');
}

main();
