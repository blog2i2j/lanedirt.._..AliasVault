import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import AttachmentUploader from '@/entrypoints/popup/components/Credentials/Details/AttachmentUploader';
import TotpEditor from '@/entrypoints/popup/components/Credentials/Details/TotpEditor';
import Modal from '@/entrypoints/popup/components/Dialogs/Modal';
import AddFieldMenu from '@/entrypoints/popup/components/Forms/AddFieldMenu';
import EditableFieldLabel from '@/entrypoints/popup/components/Forms/EditableFieldLabel';
import { FormInput } from '@/entrypoints/popup/components/Forms/FormInput';
import FormSection from '@/entrypoints/popup/components/Forms/FormSection';
import HiddenField from '@/entrypoints/popup/components/Forms/HiddenField';
import PasswordField from '@/entrypoints/popup/components/Forms/PasswordField';
import HeaderButton from '@/entrypoints/popup/components/HeaderButton';
import { HeaderIconType } from '@/entrypoints/popup/components/Icons/HeaderIcons';
import ItemNameInput from '@/entrypoints/popup/components/Items/ItemNameInput';
import ItemTypeSelector from '@/entrypoints/popup/components/Items/ItemTypeSelector';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useHeaderButtons } from '@/entrypoints/popup/context/HeaderButtonsContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import useAliasGenerator from '@/entrypoints/popup/hooks/useAliasGenerator';
import { useVaultMutate } from '@/entrypoints/popup/hooks/useVaultMutate';

import type { Item, ItemField, ItemType, FieldType, Attachment, TotpCode } from '@/utils/dist/core/models/vault';
import { FieldCategories, FieldTypes, getSystemFieldsForItemType, isFieldShownByDefault } from '@/utils/dist/core/models/vault';

// Valid item types from the shared model
const VALID_ITEM_TYPES: ItemType[] = ['Login', 'Alias', 'CreditCard', 'Note'];

// Default item type for new items
const DEFAULT_ITEM_TYPE: ItemType = 'Login';

/**
 * Temporary custom field definition (before persisting to database)
 */
type CustomFieldDefinition = {
  tempId: string;
  label: string;
  fieldType: FieldType;
  isHidden: boolean;
  displayOrder: number;
};

/**
 * Add or edit item page with dynamic field support.
 * Shows all applicable system fields for the item type, not just fields with values.
 */
const ItemAddEdit: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dbContext = useDb();
  const isEditMode = id !== undefined && id.length > 0;

  // Get item type and name from URL parameters (for create mode)
  const itemTypeParam = searchParams.get('type') as ItemType | null;
  const itemNameParam = searchParams.get('name');

  const { executeVaultMutation, syncStatus } = useVaultMutate();
  const { setHeaderButtons } = useHeaderButtons();
  const { setIsInitialLoading } = useLoading();
  const { generateAlias, lastGeneratedValues } = useAliasGenerator();

  // Component state
  const [localLoading, setLocalLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [item, setItem] = useState<Item | null>(null);

  // Form state for dynamic fields
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[]>>({});

  // Custom field definitions (temporary until saved)
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);

  // Folder selection state
  const [folders, setFolders] = useState<Array<{ Id: string; Name: string }>>([]);

  // UI visibility state
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);

  // Track if alias was already auto-generated (to avoid re-generating on re-renders)
  const aliasGeneratedRef = useRef(false);

  // Ref for the item name input field (for auto-focus)
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Track password field visibility (for showing generated passwords)
  const [showPassword, setShowPassword] = useState(false);

  // TOTP codes state
  const [totpCodes, setTotpCodes] = useState<TotpCode[]>([]);
  const [originalTotpCodeIds, setOriginalTotpCodeIds] = useState<string[]>([]);
  const [totpEditorState, setTotpEditorState] = useState<{
    isAddFormVisible: boolean;
    formData: { name: string; secretKey: string };
  }>({
    isAddFormVisible: false,
    formData: { name: '', secretKey: '' }
  });

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [originalAttachmentIds, setOriginalAttachmentIds] = useState<string[]>([]);

  /**
   * Get all applicable system fields for the current item type.
   */
  const applicableSystemFields = useMemo(() => {
    if (!item) {
      return [];
    }
    return getSystemFieldsForItemType(item.ItemType);
  }, [item]);

  /**
   * The notes field (metadata.notes) - handled separately for collapsible UI.
   */
  const notesField = useMemo(() => {
    return applicableSystemFields.find(field => field.FieldKey === 'metadata.notes');
  }, [applicableSystemFields]);

  /**
   * Check if a field should be shown by default for the current item type.
   */
  const shouldShowFieldByDefault = useCallback((field: { FieldKey: string }) => {
    if (!item) {
      return false;
    }
    const systemField = applicableSystemFields.find(f => f.FieldKey === field.FieldKey);
    if (!systemField) {
      return true; // Custom fields are always shown
    }
    return isFieldShownByDefault(systemField, item.ItemType);
  }, [item, applicableSystemFields]);

  /**
   * Primary fields (like URL) that should be shown in the name block.
   */
  const primaryFields = useMemo(() => {
    return applicableSystemFields.filter(field => field.Category === 'Primary');
  }, [applicableSystemFields]);

  /**
   * Group system fields by category for organized rendering.
   */
  const groupedSystemFields = useMemo(() => {
    const groups: Record<string, typeof applicableSystemFields> = {};

    applicableSystemFields.forEach(field => {
      // Skip metadata fields (notes) - handled separately
      if (field.Category === 'Metadata') {
        return;
      }
      // Skip primary fields - rendered in name block
      if (field.Category === 'Primary') {
        return;
      }

      const category = field.Category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(field);
    });

    return groups;
  }, [applicableSystemFields]);

  /**
   * Load item data if in edit mode.
   */
  useEffect(() => {
    if (!dbContext?.sqliteClient || !id || !isEditMode) {
      // Create mode - initialize with defaults
      const effectiveType: ItemType = (itemTypeParam && VALID_ITEM_TYPES.includes(itemTypeParam))
        ? itemTypeParam
        : DEFAULT_ITEM_TYPE;

      setItem({
        Id: crypto.randomUUID().toUpperCase(),
        Name: itemNameParam || '',
        ItemType: effectiveType,
        FolderId: null,
        Fields: [],
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      });

      // Check if notes should be shown by default for this type
      const typeFields = getSystemFieldsForItemType(effectiveType);
      const notesFieldDef = typeFields.find(f => f.FieldKey === 'metadata.notes');
      if (notesFieldDef && isFieldShownByDefault(notesFieldDef, effectiveType)) {
        setShowNotes(true);
      }

      // Load folders
      if (dbContext?.sqliteClient) {
        const allFolders = dbContext.sqliteClient.getAllFolders();
        setFolders(allFolders);
      }

      setLocalLoading(false);
      setIsInitialLoading(false);
      return;
    }

    try {
      const result = dbContext.sqliteClient.getItemById(id);
      if (result) {
        setItem(result);

        // Load folders
        const allFolders = dbContext.sqliteClient.getAllFolders();
        setFolders(allFolders);

        // Initialize field values from existing fields
        const initialValues: Record<string, string | string[]> = {};
        const existingCustomFields: CustomFieldDefinition[] = [];

        result.Fields.forEach(field => {
          initialValues[field.FieldKey] = field.Value;

          // If field key starts with "custom_", it's a custom field
          if (field.FieldKey.startsWith('custom_')) {
            existingCustomFields.push({
              tempId: field.FieldKey,
              label: field.Label,
              fieldType: field.FieldType,
              isHidden: field.IsHidden,
              displayOrder: field.DisplayOrder
            });
          }
        });

        setFieldValues(initialValues);
        setCustomFields(existingCustomFields);

        // Load TOTP codes for this item
        const itemTotpCodes = dbContext.sqliteClient.getTotpCodesForItem(id);
        setTotpCodes(itemTotpCodes);
        setOriginalTotpCodeIds(itemTotpCodes.map(tc => tc.Id));
        if (itemTotpCodes.length > 0) {
          setShow2FA(true);
        }

        // Load attachments for this item
        const itemAttachments = dbContext.sqliteClient.getAttachmentsForItem(id);
        setAttachments(itemAttachments);
        setOriginalAttachmentIds(itemAttachments.map(a => a.Id));
        if (itemAttachments.length > 0) {
          setShowAttachments(true);
        }

        setLocalLoading(false);
        setIsInitialLoading(false);
      } else {
        console.error('Item not found');
        navigate('/credentials');
      }
    } catch (err) {
      console.error('Error loading item:', err);
      setLocalLoading(false);
      setIsInitialLoading(false);
    }
  }, [dbContext?.sqliteClient, id, isEditMode, itemTypeParam, itemNameParam, navigate, setIsInitialLoading]);

  /**
   * Handle generating alias and populating fields.
   */
  const handleGenerateAlias = useCallback(async () => {
    const generatedData = await generateAlias();
    if (!generatedData) {
      return;
    }

    setFieldValues(prev => {
      const currentUsername = (prev['login.username'] as string) || '';
      const currentPassword = (prev['login.password'] as string) || '';
      const currentEmail = (prev['alias.email'] as string) || '';

      const newValues: Record<string, string | string[]> = {
        ...prev,
        // Always update alias identity fields
        'alias.first_name': generatedData.firstName,
        'alias.last_name': generatedData.lastName,
        'alias.nickname': generatedData.nickname,
        'alias.gender': generatedData.gender,
        'alias.birthdate': generatedData.birthdate
      };

      // Only overwrite email if it's empty or matches the last generated value
      if (!currentEmail || currentEmail === lastGeneratedValues.email) {
        newValues['alias.email'] = generatedData.email;
      }

      // Only overwrite username if it's empty or matches the last generated value
      if (!currentUsername || currentUsername === lastGeneratedValues.username) {
        newValues['login.username'] = generatedData.username;
      }

      // Only overwrite password if it's empty or matches the last generated value
      if (!currentPassword || currentPassword === lastGeneratedValues.password) {
        newValues['login.password'] = generatedData.password;
      }

      return newValues;
    });

    // Show the generated password
    setShowPassword(true);
  }, [generateAlias, lastGeneratedValues]);

  /**
   * Check if alias fields are shown by default for the current item type.
   */
  const aliasFieldsShownByDefault = useMemo(() => {
    if (!item) {
      return false;
    }
    const aliasField = applicableSystemFields.find(f => f.FieldKey === 'alias.email');
    return aliasField ? isFieldShownByDefault(aliasField, item.ItemType) : false;
  }, [item, applicableSystemFields]);

  /**
   * Check if login fields exist for the current item type (determines 2FA support).
   */
  const hasLoginFields = useMemo(() => {
    return applicableSystemFields.some(f => f.FieldKey === 'login.username' || f.FieldKey === 'login.password');
  }, [applicableSystemFields]);

  /**
   * Auto-generate alias when alias fields are shown by default in create mode.
   */
  useEffect(() => {
    if (!isEditMode && aliasFieldsShownByDefault && !localLoading && dbContext?.sqliteClient && !aliasGeneratedRef.current) {
      aliasGeneratedRef.current = true;
      void handleGenerateAlias();
    }
  }, [isEditMode, aliasFieldsShownByDefault, localLoading, dbContext?.sqliteClient, handleGenerateAlias]);

  /**
   * Auto-focus the name input field when in add mode.
   */
  useEffect(() => {
    if (!isEditMode && !localLoading && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditMode, localLoading]);

  /**
   * Handle field value change.
   */
  const handleFieldChange = useCallback((fieldKey: string, value: string | string[]) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  }, []);

  /**
   * Handle form submission.
   */
  const handleSave = useCallback(async () => {
    if (!item) {
      return;
    }

    try {
      // Build the fields array from fieldValues
      const fields: ItemField[] = [];

      // Add system fields
      applicableSystemFields.forEach(systemField => {
        const value = fieldValues[systemField.FieldKey];

        // Only include fields with non-empty values
        if (value && (Array.isArray(value) ? value.length > 0 : value.trim() !== '')) {
          fields.push({
            FieldKey: systemField.FieldKey,
            Label: systemField.Label,
            FieldType: systemField.FieldType,
            Value: value,
            IsHidden: systemField.IsHidden,
            DisplayOrder: systemField.DefaultDisplayOrder
          });
        }
      });

      // Add custom fields
      customFields.forEach(customField => {
        const value = fieldValues[customField.tempId];

        // Only include fields with non-empty values
        if (value && (Array.isArray(value) ? value.length > 0 : value.trim() !== '')) {
          fields.push({
            FieldKey: customField.tempId,
            Label: customField.label,
            FieldType: customField.fieldType,
            Value: value,
            IsHidden: customField.isHidden,
            DisplayOrder: customField.displayOrder
          });
        }
      });

      const updatedItem: Item = {
        ...item,
        Fields: fields,
        UpdatedAt: new Date().toISOString()
      };

      // Save to database and sync vault
      if (!dbContext?.sqliteClient) {
        throw new Error('Database not initialized');
      }

      await executeVaultMutation(async () => {
        if (isEditMode) {
          await dbContext.sqliteClient!.updateItem(
            updatedItem,
            originalAttachmentIds,
            attachments,
            originalTotpCodeIds,
            totpCodes
          );
        } else {
          await dbContext.sqliteClient!.createItem(updatedItem, attachments, totpCodes);
        }
      });

      // Navigate back to details page
      navigate(`/items/${updatedItem.Id}`);
    } catch (err) {
      console.error('Error saving item:', err);
    }
  }, [item, fieldValues, applicableSystemFields, customFields, dbContext, isEditMode, executeVaultMutation, navigate, originalAttachmentIds, attachments, originalTotpCodeIds, totpCodes]);

  /**
   * Handle delete action.
   */
  const handleDelete = useCallback(async () => {
    if (!item || !isEditMode || !dbContext?.sqliteClient) {
      return;
    }

    try {
      await executeVaultMutation(async () => {
        await dbContext.sqliteClient!.deleteItemById(item.Id);
      });

      navigate('/items');
    } catch (err) {
      console.error('Error deleting item:', err);
    } finally {
      setShowDeleteModal(false);
    }
  }, [item, isEditMode, dbContext, executeVaultMutation, navigate]);

  /**
   * Add custom field handler.
   */
  const handleAddCustomField = useCallback((label: string, fieldType: FieldType) => {
    const tempId = `custom_${crypto.randomUUID()}`;
    const newField: CustomFieldDefinition = {
      tempId,
      label,
      fieldType,
      isHidden: false,
      displayOrder: applicableSystemFields.length + customFields.length + 1
    };

    setCustomFields(prev => [...prev, newField]);
  }, [applicableSystemFields.length, customFields.length]);

  /**
   * Delete custom field handler.
   */
  const handleDeleteCustomField = useCallback((tempId: string) => {
    setCustomFields(prev => prev.filter(f => f.tempId !== tempId));
    setFieldValues(prev => {
      const newValues = { ...prev };
      delete newValues[tempId];
      return newValues;
    });
  }, []);

  /**
   * Update custom field label handler.
   */
  const handleUpdateCustomFieldLabel = useCallback((tempId: string, newLabel: string) => {
    setCustomFields(prev => prev.map(f =>
      f.tempId === tempId ? { ...f, label: newLabel } : f
    ));
  }, []);

  /**
   * Handle item type change from dropdown.
   */
  const handleTypeChange = useCallback((newType: ItemType) => {
    if (!item) {
      return;
    }

    // In create mode, clear all field values when changing type
    if (!isEditMode) {
      setFieldValues({});
      setCustomFields([]);
    }

    // Check field visibility based on model config for the new type
    const newTypeFields = getSystemFieldsForItemType(newType);

    // Check if alias fields should be shown by default for the new type (for auto-generation)
    const newAliasField = newTypeFields.find(f => f.FieldKey === 'alias.email');
    const aliasShownByDefault = newAliasField ? isFieldShownByDefault(newAliasField, newType) : false;
    if (aliasShownByDefault && !isEditMode) {
      aliasGeneratedRef.current = false;
    }

    // Check if notes should be shown by default for the new type
    const newNotesField = newTypeFields.find(f => f.FieldKey === 'metadata.notes');
    const notesShownByDefault = newNotesField ? isFieldShownByDefault(newNotesField, newType) : false;
    setShowNotes(notesShownByDefault || (isEditMode && !!fieldValues['metadata.notes']));

    // Update 2FA visibility - supported for types with login fields
    const newTypeHasLoginFields = newTypeFields.some(f => f.FieldKey === 'login.username' || f.FieldKey === 'login.password');
    if (!newTypeHasLoginFields && show2FA) {
      setShow2FA(false);
    }

    setItem({
      ...item,
      ItemType: newType,
      Fields: isEditMode ? item.Fields : []
    });

    setShowTypeDropdown(false);
  }, [item, isEditMode, fieldValues, show2FA]);

  /**
   * Remove notes section - clears value and hides the section.
   */
  const handleRemoveNotesSection = useCallback(() => {
    setFieldValues(prev => ({
      ...prev,
      'metadata.notes': ''
    }));
    setShowNotes(false);
  }, []);

  /**
   * Handle adding notes section.
   */
  const handleAddNotes = useCallback((): void => {
    setShowNotes(true);
  }, []);

  /**
   * Handle adding 2FA section.
   */
  const handleAdd2FA = useCallback((): void => {
    setShow2FA(true);
  }, []);

  /**
   * Handle adding attachments section.
   */
  const handleAddAttachments = useCallback((): void => {
    setShowAttachments(true);
  }, []);

  // Set header buttons
  useEffect(() => {
    const headerButtonsJSX = (
      <div className="flex items-center gap-2">
        {isEditMode && (
          <HeaderButton
            onClick={() => setShowDeleteModal(true)}
            title={t('credentials.deleteCredential')}
            iconType={HeaderIconType.DELETE}
            variant="danger"
          />
        )}
        <HeaderButton
          id="save-credential"
          onClick={handleSave}
          title={t('credentials.saveCredential')}
          iconType={HeaderIconType.SAVE}
        />
      </div>
    );

    setHeaderButtons(headerButtonsJSX);

    return (): void => setHeaderButtons(null);
  }, [setHeaderButtons, isEditMode, t, handleSave]);

  /**
   * Render a field input based on field type.
   */
  const renderFieldInput = useCallback((fieldKey: string, label: string, fieldType: FieldType, isHidden: boolean, isMultiValue: boolean): React.ReactNode => {
    const value = fieldValues[fieldKey] || '';

    // Handle multi-value fields
    if (isMultiValue) {
      const values = Array.isArray(value) ? value : value ? [value] : [''];

      return (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
          {values.map((val, idx) => (
            <div key={`${fieldKey}-${idx}`} className="relative">
              <input
                id={`${fieldKey}-${idx}`}
                type="text"
                value={val}
                onChange={(e) => {
                  const newValues = [...values];
                  newValues[idx] = e.target.value;
                  handleFieldChange(fieldKey, newValues.filter(v => v.trim() !== ''));
                }}
                placeholder={`${label} ${idx + 1}`}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
              />
              {idx === values.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleFieldChange(fieldKey, [...values, ''])}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Single-value fields
    const stringValue = Array.isArray(value) ? value[0] || '' : value;

    switch (fieldType) {
      case FieldTypes.Password:
        return (
          <PasswordField
            id={fieldKey}
            label={label}
            value={stringValue}
            onChange={(val) => handleFieldChange(fieldKey, val)}
            showPassword={showPassword}
            onShowPasswordChange={setShowPassword}
          />
        );

      case FieldTypes.Hidden:
        return (
          <HiddenField
            id={fieldKey}
            label={label}
            value={stringValue}
            onChange={(val) => handleFieldChange(fieldKey, val)}
          />
        );

      case FieldTypes.TextArea:
        return (
          <div>
            <label htmlFor={fieldKey} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {label}
            </label>
            <textarea
              id={fieldKey}
              value={stringValue}
              onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
              placeholder={label}
            />
          </div>
        );

      case FieldTypes.Email:
      case FieldTypes.URL:
      case FieldTypes.Phone:
      case FieldTypes.Number:
      case FieldTypes.Date:
      case FieldTypes.Text:
      default:
        return (
          <FormInput
            id={fieldKey}
            label={label}
            value={stringValue}
            onChange={(value) => handleFieldChange(fieldKey, value)}
            type="text"
            placeholder={label}
          />
        );
    }

  }, [fieldValues, handleFieldChange, showPassword]);

  /**
   * Handle form submission via Enter key.
   */
  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    void handleSave();
  }, [handleSave]);

  /**
   * Get category title for display.
   */
  const getCategoryTitle = useCallback((category: string): string => {
    switch (category) {
      case FieldCategories.Login:
        return t('common.credentials');
      case FieldCategories.Alias:
        return t('credentials.alias');
      case FieldCategories.Card:
        return t('credentials.cardInformation');
      default:
        return category;
    }
  }, [t]);

  /**
   * Render section action buttons for alias category.
   */
  const renderSectionActions = useCallback((category: string) => {
    // Only show actions for Alias category when alias fields are shown by default
    if (category === FieldCategories.Alias && aliasFieldsShownByDefault) {
      return (
        <>
          {/* Regenerate button */}
          <button
            type="button"
            onClick={handleGenerateAlias}
            className="p-1.5 text-gray-400 hover:text-primary-500 focus:outline-none"
            title={t('credentials.generateRandomAlias')}
          >
            <svg className='w-4 h-4' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </>
      );
    }
    return null;
  }, [aliasFieldsShownByDefault, handleGenerateAlias, t]);

  if (localLoading || !item) {
    return <LoadingSpinner />;
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {/* Item Type Selector */}
      <ItemTypeSelector
        selectedType={item.ItemType}
        isEditMode={isEditMode}
        showDropdown={showTypeDropdown}
        onDropdownToggle={setShowTypeDropdown}
        onTypeChange={handleTypeChange}
        onRegenerateAlias={aliasFieldsShownByDefault && !isEditMode ? handleGenerateAlias : undefined}
      />

      {/* Item Name and Primary fields block */}
      <FormSection>
        <ItemNameInput
          inputRef={nameInputRef}
          value={item.Name || ''}
          onChange={(name) => setItem({ ...item, Name: name })}
          folders={folders}
          selectedFolderId={item.FolderId}
          onFolderChange={(folderId) => setItem({ ...item, FolderId: folderId })}
        />
        {/* Primary fields (like URL) shown below name */}
        {primaryFields.map(field => (
          <div key={field.FieldKey}>
            {renderFieldInput(
              field.FieldKey,
              field.Label,
              field.FieldType,
              field.IsHidden,
              field.IsMultiValue
            )}
          </div>
        ))}
      </FormSection>

      {/* Render fields grouped by category */}
      {Object.keys(groupedSystemFields).map(category => {
        const categoryFields = groupedSystemFields[category];

        return (
          <FormSection
            key={category}
            title={getCategoryTitle(category)}
            actions={renderSectionActions(category)}
          >
            {categoryFields.map(field => (
              <div key={field.FieldKey}>
                {renderFieldInput(
                  field.FieldKey,
                  field.Label,
                  field.FieldType,
                  field.IsHidden,
                  field.IsMultiValue
                )}
              </div>
            ))}
          </FormSection>
        );
      })}

      {/* Custom Fields Section */}
      {customFields.length > 0 && (
        <FormSection title={t('common.customFields')}>
          {customFields.map(field => (
            <div key={field.tempId}>
              <EditableFieldLabel
                htmlFor={field.tempId}
                label={field.label}
                onLabelChange={(newLabel) => handleUpdateCustomFieldLabel(field.tempId, newLabel)}
                onDelete={() => handleDeleteCustomField(field.tempId)}
              />
              {renderFieldInput(
                field.tempId,
                '',
                field.fieldType,
                field.isHidden,
                false
              )}
            </div>
          ))}
        </FormSection>
      )}

      {/* Notes Section */}
      {notesField && (showNotes || isEditMode || fieldValues['metadata.notes']) && (
        <FormSection
          title={t('credentials.notes')}
          actions={
            !isEditMode && !shouldShowFieldByDefault(notesField) ? (
              <button
                type="button"
                onClick={handleRemoveNotesSection}
                className="p-1.5 text-gray-400 hover:text-red-500 focus:outline-none"
                title={t('common.delete')}
              >
                <svg className='w-4 h-4' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            ) : undefined
          }
        >
          {renderFieldInput(
            notesField.FieldKey,
            notesField.Label,
            notesField.FieldType,
            notesField.IsHidden,
            notesField.IsMultiValue
          )}
        </FormSection>
      )}

      {/* 2FA TOTP Section - only for types with login fields */}
      {show2FA && hasLoginFields && (
        <TotpEditor
          totpCodes={totpCodes}
          onTotpCodesChange={setTotpCodes}
          originalTotpCodeIds={originalTotpCodeIds}
          isAddFormVisible={totpEditorState.isAddFormVisible}
          formData={totpEditorState.formData}
          onStateChange={setTotpEditorState}
        />
      )}

      {/* Attachments Section */}
      {showAttachments && (
        <AttachmentUploader
          attachments={attachments}
          onAttachmentsChange={setAttachments}
        />
      )}

      {/* Add Field Menu */}
      <AddFieldMenu
        isEditMode={isEditMode}
        supports2FA={hasLoginFields}
        visibility={{
          showNotes,
          show2FA,
          showAttachments
        }}
        callbacks={{
          onAddNotes: handleAddNotes,
          onAdd2FA: handleAdd2FA,
          onAddAttachments: handleAddAttachments,
          onAddCustomField: handleAddCustomField
        }}
      />

      {/* Delete Confirmation Modal */}
      {isEditMode && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title={t('credentials.deleteCredentialTitle')}
          message={t('credentials.deleteCredentialConfirmation')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          onConfirm={handleDelete}
          variant="danger"
        />
      )}

      {/* Sync Status */}
      {syncStatus && (
        <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300">{syncStatus}</p>
        </div>
      )}
    </form>
  );
};

export default ItemAddEdit;
