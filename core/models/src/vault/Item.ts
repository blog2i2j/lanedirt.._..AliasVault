/**
 * Item types supported by the vault
 * - Login: Username/password credentials with optional notes
 * - Alias: Login with pre-filled alias identity fields (email, name, etc.)
 * - CreditCard: Payment card information
 * - Note: Secure notes
 */
export type ItemType =
    | 'Login'
    | 'Alias'
    | 'CreditCard'
    | 'Note';

/**
 * Item type representing vault entries in the new field-based data model.
 * Replaces the old Credential type.
 */
export type Item = {
    Id: string;
    Name: string | null;
    ItemType: ItemType;
    Logo?: Uint8Array | number[];
    FolderId?: string | null;
    FolderPath?: string | null;
    Tags?: ItemTagRef[];
    Fields: ItemField[];
    HasPasskey?: boolean;
    HasAttachment?: boolean;
    HasTotp?: boolean;
    CreatedAt: string;
    UpdatedAt: string;
}

/**
 * Field value within an item
 */
export type ItemField = {
    FieldKey: string;
    Label: string;
    FieldType: FieldType;
    Value: string | string[];
    IsHidden: boolean;
    DisplayOrder: number;
}

/**
 * Field types for rendering and validation.
 * Single source of truth - the type is derived from this constant.
 */
export const FieldTypes = {
  Text: 'Text',
  Password: 'Password',
  Hidden: 'Hidden',
  Email: 'Email',
  URL: 'URL',
  Date: 'Date',
  Number: 'Number',
  Phone: 'Phone',
  TextArea: 'TextArea',
} as const;

/**
 * Field type union derived from FieldTypes constant
 */
export type FieldType = typeof FieldTypes[keyof typeof FieldTypes];

/**
 * Tag reference for display within an item
 */
export type ItemTagRef = {
    Id: string;
    Name: string;
    Color?: string;
}
