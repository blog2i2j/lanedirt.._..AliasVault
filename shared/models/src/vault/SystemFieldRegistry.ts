import type { FieldType, ItemType } from './Item';

/**
 * Per-item-type configuration for a system field.
 * Allows specifying different behavior for each item type the field applies to.
 */
export type ItemTypeFieldConfig = {
  /** Whether this field is shown by default in create mode (vs. hidden behind an "add" button) */
  ShowByDefault: boolean;
};

/**
 * System field definition with metadata.
 * System fields are predefined fields with immutable keys like 'login.username'.
 * Their metadata (label, type, etc.) is defined here in code, not in the database.
 */
export type SystemFieldDefinition = {
  /** Unique system field key (e.g., 'login.username') */
  FieldKey: string;
  /** Display label for the field */
  Label: string;
  /** Field type for rendering/validation */
  FieldType: FieldType;
  /** Whether field is hidden/masked by default */
  IsHidden: boolean;
  /** Whether field supports multiple values */
  IsMultiValue: boolean;
  /**
   * Item types this field applies to, with per-type configuration.
   * Key is ItemType, value is the configuration for that type.
   */
  ApplicableToTypes: Partial<Record<ItemType, ItemTypeFieldConfig>>;
  /** Whether to track field value history */
  EnableHistory: boolean;
  /** Category for grouping in UI */
  Category: 'Login' | 'Alias' | 'Card' | 'Identity' | 'API' | 'Metadata';
  /** Default display order within category (lower = first) */
  DefaultDisplayOrder: number;
};

/**
 * Registry of all system-defined fields.
 * These fields are immutable and their metadata is defined in code.
 * DO NOT modify these definitions without careful consideration of backwards compatibility.
 */
export const SystemFieldRegistry: Record<string, SystemFieldDefinition> = {
  // Login Fields
  'login.username': {
    FieldKey: 'login.username',
    Label: 'Username',
    FieldType: 'Text',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: true }
    },
    EnableHistory: true,
    Category: 'Login',
    DefaultDisplayOrder: 10
  },
  'login.password': {
    FieldKey: 'login.password',
    Label: 'Password',
    FieldType: 'Password',
    IsHidden: true,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: true }
    },
    EnableHistory: true,
    Category: 'Login',
    DefaultDisplayOrder: 20
  },
  'login.url': {
    FieldKey: 'login.url',
    Label: 'URL',
    FieldType: 'URL',
    IsHidden: false,
    IsMultiValue: true,
    ApplicableToTypes: {
      Login: { ShowByDefault: true }
    },
    EnableHistory: false,
    Category: 'Login',
    DefaultDisplayOrder: 30
  },

  // Metadata Fields
  'login.notes': {
    FieldKey: 'login.notes',
    Label: 'Notes',
    FieldType: 'TextArea',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false },
      CreditCard: { ShowByDefault: false },
      Identity: { ShowByDefault: false },
      Note: { ShowByDefault: true }
    },
    EnableHistory: false,
    Category: 'Metadata',
    DefaultDisplayOrder: 100
  },

  // Alias Fields
  'alias.email': {
    FieldKey: 'alias.email',
    Label: 'Email',
    FieldType: 'Email',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false }
    },
    EnableHistory: true,
    Category: 'Alias',
    DefaultDisplayOrder: 10
  },
  'alias.first_name': {
    FieldKey: 'alias.first_name',
    Label: 'First Name',
    FieldType: 'Text',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false },
      Identity: { ShowByDefault: true }
    },
    EnableHistory: false,
    Category: 'Alias',
    DefaultDisplayOrder: 20
  },
  'alias.last_name': {
    FieldKey: 'alias.last_name',
    Label: 'Last Name',
    FieldType: 'Text',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false },
      Identity: { ShowByDefault: true }
    },
    EnableHistory: false,
    Category: 'Alias',
    DefaultDisplayOrder: 30
  },
  'alias.nickname': {
    FieldKey: 'alias.nickname',
    Label: 'Nickname',
    FieldType: 'Text',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false }
    },
    EnableHistory: false,
    Category: 'Alias',
    DefaultDisplayOrder: 40
  },
  'alias.gender': {
    FieldKey: 'alias.gender',
    Label: 'Gender',
    FieldType: 'Text',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false },
      Identity: { ShowByDefault: true }
    },
    EnableHistory: false,
    Category: 'Alias',
    DefaultDisplayOrder: 50
  },
  'alias.birthdate': {
    FieldKey: 'alias.birthdate',
    Label: 'Birth Date',
    FieldType: 'Date',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: {
      Login: { ShowByDefault: false },
      Identity: { ShowByDefault: true }
    },
    EnableHistory: false,
    Category: 'Alias',
    DefaultDisplayOrder: 60
  },

  /*
   * Note: Card, Identity, and API fields can be added here when those item types are implemented
   * Example:
   * 'card.number': { ... },
   * 'card.cardholder_name': { ... },
   * 'identity.phone_number': { ... },
   */
};

/**
 * Get system field definition by key.
 * Returns undefined if the field key is not a system field.
 */
export function getSystemField(fieldKey: string): SystemFieldDefinition | undefined {
  return SystemFieldRegistry[fieldKey];
}

/**
 * Check if a field key represents a system field.
 */
export function isSystemField(fieldKey: string): boolean {
  return fieldKey in SystemFieldRegistry;
}

/**
 * Check if a field applies to a specific item type.
 */
export function fieldAppliesToType(field: SystemFieldDefinition, itemType: ItemType): boolean {
  return itemType in field.ApplicableToTypes;
}

/**
 * Get the per-type configuration for a field and item type.
 * Returns undefined if the field doesn't apply to that item type.
 */
export function getFieldConfigForType(field: SystemFieldDefinition, itemType: ItemType): ItemTypeFieldConfig | undefined {
  return field.ApplicableToTypes[itemType];
}

/**
 * Check if a field should be shown by default for a specific item type.
 * Returns false if the field doesn't apply to that item type.
 */
export function isFieldShownByDefault(field: SystemFieldDefinition, itemType: ItemType): boolean {
  const config = field.ApplicableToTypes[itemType];
  return config?.ShowByDefault ?? false;
}

/**
 * Get all system fields applicable to a specific item type.
 * Results are sorted by DefaultDisplayOrder.
 */
export function getSystemFieldsForItemType(itemType: ItemType): SystemFieldDefinition[] {
  return Object.values(SystemFieldRegistry)
    .filter(field => fieldAppliesToType(field, itemType))
    .sort((a, b) => a.DefaultDisplayOrder - b.DefaultDisplayOrder);
}

/**
 * Get system fields that should be shown by default for a specific item type.
 * Results are sorted by DefaultDisplayOrder.
 */
export function getDefaultFieldsForItemType(itemType: ItemType): SystemFieldDefinition[] {
  return Object.values(SystemFieldRegistry)
    .filter(field => isFieldShownByDefault(field, itemType))
    .sort((a, b) => a.DefaultDisplayOrder - b.DefaultDisplayOrder);
}

/**
 * Get system fields that are NOT shown by default for a specific item type.
 * These are the fields that can be added via an "add field" button.
 * Results are sorted by DefaultDisplayOrder.
 */
export function getOptionalFieldsForItemType(itemType: ItemType): SystemFieldDefinition[] {
  return Object.values(SystemFieldRegistry)
    .filter(field => fieldAppliesToType(field, itemType) && !isFieldShownByDefault(field, itemType))
    .sort((a, b) => a.DefaultDisplayOrder - b.DefaultDisplayOrder);
}

/**
 * Get all system field keys.
 */
export function getAllSystemFieldKeys(): string[] {
  return Object.keys(SystemFieldRegistry);
}

/**
 * Check if a field key matches a known system field prefix.
 * This is useful for validation even before a specific field is registered.
 */
export function isSystemFieldPrefix(fieldKey: string): boolean {
  return fieldKey.startsWith('login.') ||
         fieldKey.startsWith('alias.') ||
         fieldKey.startsWith('card.') ||
         fieldKey.startsWith('identity.') ||
         fieldKey.startsWith('api.') ||
         fieldKey.startsWith('note.') ||
         fieldKey.startsWith('metadata.');
}
