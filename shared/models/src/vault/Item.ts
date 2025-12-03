/**
 * Item types supported by the vault
 */
export type ItemType =
    | 'Login'
    | 'CreditCard'
    | 'Identity'
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
 * Field types for rendering and validation
 */
export type FieldType =
    | 'Text'
    | 'Password'
    | 'Email'
    | 'URL'
    | 'Date'
    | 'Number'
    | 'Phone'
    | 'TextArea';

/**
 * Tag reference for display within an item
 */
export type ItemTagRef = {
    Id: string;
    Name: string;
    Color?: string;
}
