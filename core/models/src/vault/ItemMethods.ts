import type { Item, ItemField } from './Item';
import type { Credential } from './Credential';
import { FieldKey } from './FieldKey';
import { FieldCategories } from './SystemFieldRegistry';

/**
 * Helper functions for working with Item model
 */

/**
 * Get a single field value by FieldKey
 */
export function getFieldValue(item: Item, fieldKey: string): string | undefined {
  const field = item.Fields.find(f => f.FieldKey === fieldKey);
  if (!field) {
    return undefined;
  }
  return Array.isArray(field.Value) ? field.Value[0] : field.Value;
}

/**
 * Get all values for a multi-value field
 */
export function getFieldValues(item: Item, fieldKey: string): string[] {
  const field = item.Fields.find(f => f.FieldKey === fieldKey);
  if (!field) {
    return [];
  }
  return Array.isArray(field.Value) ? field.Value : [field.Value];
}

/**
 * Check if a field exists and has a value
 */
export function hasField(item: Item, fieldKey: string): boolean {
  const value = getFieldValue(item, fieldKey);
  return value !== undefined && value !== '';
}

/**
 * Group fields by a categorization function
 */
export function groupFields(
  item: Item,
  grouper: (field: ItemField) => string
): Record<string, ItemField[]> {
  const groups: Record<string, ItemField[]> = {};

  item.Fields.forEach(field => {
    const group = grouper(field);
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(field);
  });

  return groups;
}

/**
 * Group fields by standard categories (Login, Alias, Card, Notes, Custom)
 */
export function groupFieldsByCategory(item: Item): Record<string, ItemField[]> {
  return groupFields(item, (field) => {
    if (field.FieldKey.startsWith('login.')) {
      return FieldCategories.Login;
    }
    if (field.FieldKey.startsWith('alias.')) {
      return FieldCategories.Alias;
    }
    if (field.FieldKey.startsWith('card.')) {
      return FieldCategories.Card;
    }
    if (field.FieldKey.startsWith('notes.')) {
      return FieldCategories.Notes;
    }
    if (field.FieldKey.startsWith('metadata.')) {
      return FieldCategories.Metadata;
    }
    return FieldCategories.Custom;
  });
}

/**
 * Convert new Item model to legacy Credential model for backward compatibility.
 * @deprecated Use Item model directly. This is a temporary compatibility layer.
 */
export function itemToCredential(item: Item): Credential {
  return {
    Id: item.Id,
    Username: getFieldValue(item, FieldKey.LoginUsername),
    Password: getFieldValue(item, FieldKey.LoginPassword) || '',
    ServiceName: item.Name || '',
    ServiceUrl: getFieldValue(item, FieldKey.LoginUrl),
    Logo: item.Logo,
    Notes: getFieldValue(item, FieldKey.NotesContent),
    Alias: {
      FirstName: getFieldValue(item, FieldKey.AliasFirstName),
      LastName: getFieldValue(item, FieldKey.AliasLastName),
      BirthDate: getFieldValue(item, FieldKey.AliasBirthdate) || '',
      Gender: getFieldValue(item, FieldKey.AliasGender),
      Email: getFieldValue(item, FieldKey.LoginEmail)
    },
    HasPasskey: item.HasPasskey,
    HasAttachment: item.HasAttachment
  };
}
