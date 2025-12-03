import type { FieldType, ItemType } from './Item';

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
  /** Item types this field applies to */
  ApplicableToTypes: ItemType[];
  /** Whether to track field value history */
  EnableHistory: boolean;
  /** Category for grouping in UI */
  Category: 'Login' | 'Alias' | 'Card' | 'Identity' | 'API' | 'Note';
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
    ApplicableToTypes: ['Login'],
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
    ApplicableToTypes: ['Login'],
    EnableHistory: true,
    Category: 'Login',
    DefaultDisplayOrder: 20
  },
  'login.url': {
    FieldKey: 'login.url',
    Label: 'Website',
    FieldType: 'URL',
    IsHidden: false,
    IsMultiValue: true,
    ApplicableToTypes: ['Login'],
    EnableHistory: false,
    Category: 'Login',
    DefaultDisplayOrder: 30
  },
  'login.notes': {
    FieldKey: 'login.notes',
    Label: 'Notes',
    FieldType: 'TextArea',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: ['Login', 'CreditCard', 'Identity', 'Note'],
    EnableHistory: false,
    Category: 'Login',
    DefaultDisplayOrder: 100
  },

  // Alias Fields
  'alias.email': {
    FieldKey: 'alias.email',
    Label: 'Email',
    FieldType: 'Email',
    IsHidden: false,
    IsMultiValue: false,
    ApplicableToTypes: ['Login'],
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
    ApplicableToTypes: ['Login', 'Identity'],
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
    ApplicableToTypes: ['Login', 'Identity'],
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
    ApplicableToTypes: ['Login'],
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
    ApplicableToTypes: ['Login', 'Identity'],
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
    ApplicableToTypes: ['Login', 'Identity'],
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
 * Get all system fields applicable to a specific item type.
 * Results are sorted by DefaultDisplayOrder.
 */
export function getSystemFieldsForItemType(itemType: ItemType): SystemFieldDefinition[] {
  return Object.values(SystemFieldRegistry)
    .filter(field => field.ApplicableToTypes.includes(itemType))
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
         fieldKey.startsWith('note.');
}
