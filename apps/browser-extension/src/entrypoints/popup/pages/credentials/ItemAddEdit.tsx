import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import Modal from '@/entrypoints/popup/components/Dialogs/Modal';
import EditableFieldLabel from '@/entrypoints/popup/components/Forms/EditableFieldLabel';
import { FormInput } from '@/entrypoints/popup/components/Forms/FormInput';
import HiddenField from '@/entrypoints/popup/components/Forms/HiddenField';
import PasswordField from '@/entrypoints/popup/components/Forms/PasswordField';
import HeaderButton from '@/entrypoints/popup/components/HeaderButton';
import { HeaderIconType } from '@/entrypoints/popup/components/Icons/HeaderIcons';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useHeaderButtons } from '@/entrypoints/popup/context/HeaderButtonsContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import { useVaultMutate } from '@/entrypoints/popup/hooks/useVaultMutate';

import { IdentityHelperUtils, CreateIdentityGenerator, convertAgeRangeToBirthdateOptions } from '@/utils/dist/shared/identity-generator';
import type { Item, ItemField, ItemType, FieldType } from '@/utils/dist/shared/models/vault';
import { getSystemFieldsForItemType } from '@/utils/dist/shared/models/vault';
import { CreatePasswordGenerator } from '@/utils/dist/shared/password-generator';

// Valid item types from the shared model
const VALID_ITEM_TYPES: ItemType[] = ['Login', 'CreditCard', 'Identity', 'Note'];

// Default item type for new items
const DEFAULT_ITEM_TYPE: ItemType = 'Login';

/**
 * Item type option configuration.
 */
type ItemTypeOption = {
  type: ItemType;
  titleKey: string;
  iconSvg: React.ReactNode;
};

/**
 * Available item type options with icons.
 */
const ITEM_TYPE_OPTIONS: ItemTypeOption[] = [
  {
    type: 'Login',
    titleKey: 'itemTypes.login.title',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    )
  },
  {
    type: 'CreditCard',
    titleKey: 'itemTypes.creditCard.title',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    )
  },
  {
    type: 'Identity',
    titleKey: 'itemTypes.identity.title',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },
  {
    type: 'Note',
    titleKey: 'itemTypes.note.title',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }
];

/**
 * Temporary custom field definition (before persisting to database)
 */
type CustomFieldDefinition = {
  tempId: string; // Temporary ID until we create the FieldDefinition
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

  const { executeVaultMutation, isLoading, syncStatus } = useVaultMutate();
  const { setHeaderButtons } = useHeaderButtons();
  const { setIsInitialLoading } = useLoading();
  const [localLoading, setLocalLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddCustomFieldModal, setShowAddCustomFieldModal] = useState(false);
  const [item, setItem] = useState<Item | null>(null);

  // Form state for dynamic fields
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[]>>({});

  // Custom field definitions (temporary until saved)
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);

  // New custom field form state
  const [newCustomFieldLabel, setNewCustomFieldLabel] = useState('');
  const [newCustomFieldType, setNewCustomFieldType] = useState<FieldType>('Text');

  // Folder selection state
  const [folders, setFolders] = useState<Array<{ Id: string; Name: string }>>([]);

  // Type selector dropdown state (for create mode)
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  // Alias fields visibility state (for Login type - hidden by default, shown when user adds it)
  const [showAliasFields, setShowAliasFields] = useState(false);

  // Notes field visibility state (hidden by default, shown when user adds it)
  const [showNotes, setShowNotes] = useState(false);

  // Add menu dropdown state (unified + button)
  const [showAddMenu, setShowAddMenu] = useState(false);

  /**
   * Get all applicable system fields for the current item type.
   * These are sorted by DefaultDisplayOrder.
   */
  const applicableSystemFields = useMemo(() => {
    if (!item) {
      return [];
    }
    return getSystemFieldsForItemType(item.ItemType);
  }, [item]);

  /**
   * Fields that should be shown inline with service name (like login.url).
   * These are Login category fields that start with "login." but aren't username/password.
   */
  const serviceInlineFields = useMemo(() => {
    return applicableSystemFields.filter(field =>
      field.FieldKey === 'login.url'
    );
  }, [applicableSystemFields]);

  /**
   * The notes field (login.notes) - handled separately for collapsible UI.
   */
  const notesField = useMemo(() => {
    return applicableSystemFields.find(field => field.FieldKey === 'login.notes');
  }, [applicableSystemFields]);

  /**
   * Group system fields by category for organized rendering.
   * Excludes service inline fields (login.url) and notes field.
   */
  const groupedSystemFields = useMemo(() => {
    const groups: Record<string, typeof applicableSystemFields> = {};

    applicableSystemFields.forEach(field => {
      // Skip fields handled separately
      if (field.FieldKey === 'login.url' || field.FieldKey === 'login.notes') {
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
      /*
       * Create mode - initialize with defaults
       * Use provided type parameter or default to 'Login'
       */
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

      /* Add system fields */
      applicableSystemFields.forEach(systemField => {
        const value = fieldValues[systemField.FieldKey];

        /* Only include fields with non-empty values */
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

      /* Add custom fields */
      customFields.forEach(customField => {
        const value = fieldValues[customField.tempId];

        /* Only include fields with non-empty values */
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

      /* Save to database and sync vault */
      if (!dbContext?.sqliteClient) {
        throw new Error('Database not initialized');
      }

      await executeVaultMutation(async () => {
        if (isEditMode) {
          await dbContext.sqliteClient!.updateItem(updatedItem);
        } else {
          await dbContext.sqliteClient!.createItem(updatedItem);
        }
      });

      /* Navigate back to details page */
      navigate(`/items/${updatedItem.Id}`);
    } catch (err) {
      console.error('Error saving item:', err);
    }
  }, [item, fieldValues, applicableSystemFields, customFields, dbContext, isEditMode, executeVaultMutation, navigate]);

  /**
   * Handle delete action.
   */
  const handleDelete = useCallback(async () => {
    if (!item || !isEditMode || !dbContext?.sqliteClient) {
      return;
    }

    try {
      /* Delete from database and sync vault */
      await executeVaultMutation(async () => {
        await dbContext.sqliteClient!.deleteItemById(item.Id);
      });

      /* Navigate back to items list */
      navigate('/items');
    } catch (err) {
      console.error('Error deleting item:', err);
    } finally {
      setShowDeleteModal(false);
    }
  }, [item, isEditMode, dbContext, executeVaultMutation, navigate]);

  /**
   * Handle cancel action.
   */
  const handleCancel = useCallback(() => {
    if (isEditMode) {
      navigate(`/items/${id}`);
    } else {
      navigate('/items');
    }
  }, [isEditMode, id, navigate]);

  /**
   * Add custom field handler.
   */
  const handleAddCustomField = useCallback(() => {
    if (!newCustomFieldLabel.trim()) {
      return;
    }

    const tempId = `custom_${crypto.randomUUID()}`;
    const newField: CustomFieldDefinition = {
      tempId,
      label: newCustomFieldLabel,
      fieldType: newCustomFieldType,
      isHidden: false,
      displayOrder: applicableSystemFields.length + customFields.length + 1
    };

    setCustomFields(prev => [...prev, newField]);
    setNewCustomFieldLabel('');
    setNewCustomFieldType('Text');
    setShowAddCustomFieldModal(false);
  }, [newCustomFieldLabel, newCustomFieldType, applicableSystemFields.length, customFields.length]);

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
    if (!item || isEditMode) {
      return;
    }

    // Clear field values when changing type (except name)
    setFieldValues({});
    setCustomFields([]);
    setShowAliasFields(false);
    setShowNotes(false);

    setItem({
      ...item,
      ItemType: newType,
      Fields: []
    });

    setShowTypeDropdown(false);
  }, [item, isEditMode]);

  /**
   * Initialize generators for random alias generation.
   */
  const initializeGenerators = useCallback(async () => {
    // Get effective identity language (smart default based on UI language if no explicit override)
    const identityLanguage = await dbContext.sqliteClient!.getEffectiveIdentityLanguage();

    // Initialize identity generator based on language
    const identityGenerator = CreateIdentityGenerator(identityLanguage);

    // Initialize password generator with settings from vault
    const passwordSettings = dbContext.sqliteClient!.getPasswordSettings();
    const passwordGenerator = CreatePasswordGenerator(passwordSettings);

    return { identityGenerator, passwordGenerator };
  }, [dbContext.sqliteClient]);

  /**
   * Generate random alias and populate alias fields.
   * This shows the alias fields and fills them with random values.
   */
  const handleGenerateAlias = useCallback(async () => {
    if (!dbContext?.sqliteClient) {
      return;
    }

    try {
      const { identityGenerator, passwordGenerator } = await initializeGenerators();

      // Get gender preference from database
      const genderPreference = dbContext.sqliteClient.getDefaultIdentityGender();

      // Get age range preference and convert to birthdate options
      const ageRange = dbContext.sqliteClient.getDefaultIdentityAgeRange();
      const birthdateOptions = convertAgeRangeToBirthdateOptions(ageRange);

      // Generate identity with gender preference and birthdate options
      const identity = identityGenerator.generateRandomIdentity(genderPreference, birthdateOptions);
      const password = passwordGenerator.generateRandomPassword();

      const defaultEmailDomain = await dbContext.sqliteClient.getDefaultEmailDomain();
      const email = defaultEmailDomain ? `${identity.emailPrefix}@${defaultEmailDomain}` : identity.emailPrefix;

      // Set field values for alias fields
      setFieldValues(prev => ({
        ...prev,
        'alias.email': email,
        'alias.first_name': identity.firstName,
        'alias.last_name': identity.lastName,
        'alias.nickname': identity.nickName,
        'alias.gender': identity.gender,
        'alias.birthdate': IdentityHelperUtils.normalizeBirthDateForDisplay(identity.birthDate.toISOString()),
        // Also set username and password if they're empty
        'login.username': prev['login.username'] || identity.nickName,
        'login.password': prev['login.password'] || password
      }));

      // Show alias fields section
      setShowAliasFields(true);
    } catch (error) {
      console.error('Error generating random alias:', error);
    }
  }, [dbContext.sqliteClient, initializeGenerators]);

  /**
   * Clear all alias field values but keep them visible.
   */
  const handleClearAliasFields = useCallback(() => {
    setFieldValues(prev => ({
      ...prev,
      'alias.email': '',
      'alias.first_name': '',
      'alias.last_name': '',
      'alias.nickname': '',
      'alias.gender': '',
      'alias.birthdate': ''
    }));
  }, []);

  /**
   * Remove alias section - clears values and hides the section.
   */
  const handleRemoveAliasSection = useCallback(() => {
    handleClearAliasFields();
    setShowAliasFields(false);
  }, [handleClearAliasFields]);

  /**
   * Remove notes section - clears value and hides the section.
   */
  const handleRemoveNotesSection = useCallback(() => {
    setFieldValues(prev => ({
      ...prev,
      'login.notes': ''
    }));
    setShowNotes(false);
  }, []);

  /**
   * Get the selected item type option for display.
   */
  const selectedTypeOption = useMemo(() => {
    return ITEM_TYPE_OPTIONS.find(opt => opt.type === item?.ItemType);
  }, [item?.ItemType]);

  /**
   * Handle adding notes section from menu.
   */
  const handleAddNotesFromMenu = useCallback((): void => {
    setShowNotes(true);
    setShowAddMenu(false);
  }, []);

  /**
   * Handle adding custom field from menu.
   */
  const handleAddCustomFieldFromMenu = useCallback((): void => {
    setShowAddCustomFieldModal(true);
    setShowAddMenu(false);
  }, []);

  /**
   * Add menu options - shows available optional sections (Notes and Custom Fields only).
   * Alias has its own dedicated button since it's a core feature.
   */
  const addMenuOptions = useMemo(() => {
    const options: Array<{
      key: string;
      label: string;
      icon: React.ReactNode;
      action: () => void;
    }> = [];

    // Notes option (when not shown and no value)
    if (notesField && !showNotes && !fieldValues['login.notes'] && !isEditMode) {
      options.push({
        key: 'notes',
        label: t('credentials.notes'),
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        action: handleAddNotesFromMenu
      });
    }

    // Custom field option (always available)
    options.push({
      key: 'custom',
      label: t('itemTypes.addCustomField'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      ),
      action: handleAddCustomFieldFromMenu
    });

    return options;
  }, [showNotes, notesField, fieldValues, isEditMode, t, handleAddNotesFromMenu, handleAddCustomFieldFromMenu]);

  /**
   * Whether to show the dedicated "Add alias" button (for Login type in create mode when alias not shown).
   */
  const showAddAliasButton = useMemo(() => {
    return item?.ItemType === 'Login' && !showAliasFields && !isEditMode;
  }, [item?.ItemType, showAliasFields, isEditMode]);

  // Set header buttons
  useEffect(() => {
    const headerButtonsJSX = isEditMode ? (
      <HeaderButton
        onClick={() => setShowDeleteModal(true)}
        title={t('credentials.deleteCredential')}
        iconType={HeaderIconType.DELETE}
      />
    ) : null;

    setHeaderButtons(headerButtonsJSX);

    return (): void => setHeaderButtons(null);
  }, [setHeaderButtons, isEditMode, t]);

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
            <div key={`${fieldKey}-${idx}`} className="flex gap-2">
              <FormInput
                id={`${fieldKey}-${idx}`}
                label=""
                value={val}
                onChange={(value) => {
                  const newValues = [...values];
                  newValues[idx] = value;
                  handleFieldChange(fieldKey, newValues.filter(v => v.trim() !== ''));
                }}
                type="text"
                placeholder={`${label} ${idx + 1}`}
              />
              {idx === values.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleFieldChange(fieldKey, [...values, ''])}
                  className="px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  +
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
      case 'Password':
        return (
          <PasswordField
            id={fieldKey}
            label={label}
            value={stringValue}
            onChange={(val) => handleFieldChange(fieldKey, val)}
          />
        );

      case 'Hidden':
        return (
          <HiddenField
            id={fieldKey}
            label={label}
            value={stringValue}
            onChange={(val) => handleFieldChange(fieldKey, val)}
          />
        );

      case 'TextArea':
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

      case 'Email':
      case 'URL':
      case 'Phone':
      case 'Number':
      case 'Date':
      case 'Text':
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
  }, [fieldValues, handleFieldChange]);

  if (localLoading || !item) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      {/* Item Type Selector (create mode only) */}
      {!isEditMode && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            className="w-full px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg text-left flex items-center justify-between hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-primary-600 dark:text-primary-400">
                {selectedTypeOption?.iconSvg}
              </span>
              <span className="text-primary-700 dark:text-primary-300 font-medium text-sm">
                {t('itemTypes.creating')} {selectedTypeOption ? t(selectedTypeOption.titleKey) : ''}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-primary-500 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Type Dropdown Menu */}
          {showTypeDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowTypeDropdown(false)}
              />
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
                {ITEM_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => handleTypeChange(option.type)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                      item.ItemType === option.type
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <span className={item.ItemType === option.type ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                      {option.iconSvg}
                    </span>
                    <span className="font-medium">
                      {t(option.titleKey)}
                    </span>
                    {item.ItemType === option.type && (
                      <svg className="w-5 h-5 ml-auto text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Service Section - Name and URL */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{t('credentials.service')}</h2>
        <div className="space-y-4">
          <FormInput
            id="itemName"
            label={t('credentials.serviceName')}
            value={item.Name || ''}
            onChange={(value) => setItem({ ...item, Name: value })}
            type="text"
            placeholder={t('credentials.serviceName')}
            required
          />
          {/* Service inline fields (login.url) - shown without header */}
          {serviceInlineFields.map(field => (
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
        </div>
      </div>

      {/* Render fields grouped by category */}
      {Object.keys(groupedSystemFields).map(category => {
        // Special handling for Alias category in Login type (create mode only)
        const isAliasInLoginCreate = category === 'Alias' && item.ItemType === 'Login' && !isEditMode;

        // If alias in login create mode and not shown, skip rendering (will be available via + menu)
        if (isAliasInLoginCreate && !showAliasFields) {
          return null;
        }

        return (
          <div key={category} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center justify-between">
              <span>
                {category === 'Login' && t('credentials.loginCredentials')}
                {category === 'Alias' && t('credentials.alias')}
                {category === 'Card' && t('credentials.cardInformation')}
                {category === 'Identity' && t('credentials.identityInformation')}
                {category !== 'Login' && category !== 'Alias' && category !== 'Card' && category !== 'Identity' && category}
              </span>

              {/* Show action buttons for Alias section in Login create mode */}
              {isAliasInLoginCreate && showAliasFields && (
                <div className="flex items-center gap-2">
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
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={handleRemoveAliasSection}
                    className="p-1.5 text-gray-400 hover:text-red-500 focus:outline-none"
                    title={t('common.delete')}
                  >
                    <svg className='w-4 h-4' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
            </h2>
            <div className="space-y-4">
              {groupedSystemFields[category].map(field => (
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
            </div>
          </div>
        );
      })}

      {/* Custom Fields Section */}
      {customFields.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {t('common.customFields')}
          </h2>
          <div className="space-y-4">
            {customFields.map(field => (
              <div key={field.tempId}>
                <EditableFieldLabel
                  htmlFor={field.tempId}
                  label={field.label}
                  onLabelChange={(newLabel) => handleUpdateCustomFieldLabel(field.tempId, newLabel)}
                  onDelete={() => handleDeleteCustomField(field.tempId)}
                />

                {/* Field input */}
                {renderFieldInput(
                  field.tempId,
                  '',
                  field.fieldType,
                  field.isHidden,
                  false
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes Section - Hidden by default in create mode, with remove button */}
      {notesField && (showNotes || isEditMode || fieldValues['login.notes']) && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center justify-between">
            <span>{t('credentials.notes')}</span>
            {/* Remove button for notes in create mode */}
            {!isEditMode && (
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
            )}
          </h2>
          <div className="space-y-4">
            {renderFieldInput(
              notesField.FieldKey,
              notesField.Label,
              notesField.FieldType,
              notesField.IsHidden,
              notesField.IsMultiValue
            )}
          </div>
        </div>
      )}

      {/* Dedicated "Add Alias" button - highlighted as core feature */}
      {showAddAliasButton && (
        <button
          type="button"
          onClick={handleGenerateAlias}
          className="w-full px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:border-primary-400 dark:hover:border-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors flex items-center justify-center gap-2 font-medium"
        >
          <svg className='w-5 h-5' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8" cy="8" r="1"/>
            <circle cx="16" cy="8" r="1"/>
            <circle cx="12" cy="12" r="1"/>
            <circle cx="8" cy="16" r="1"/>
            <circle cx="16" cy="16" r="1"/>
          </svg>
          {t('itemTypes.addAlias')}
        </button>
      )}

      {/* Generic + button with dropdown menu for Notes and Custom Fields */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-md hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>

        {/* Add Menu Dropdown */}
        {showAddMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowAddMenu(false)}
            />
            <div className="absolute bottom-full left-0 right-0 mb-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg overflow-hidden">
              {addMenuOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={option.action}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-gray-700 dark:text-gray-300"
                >
                  <span className="text-gray-500 dark:text-gray-400">
                    {option.icon}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Folder Selection - Compact at bottom */}
      {folders.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <select
            id="folderSelect"
            value={item.FolderId || ''}
            onChange={(e) => setItem({ ...item, FolderId: e.target.value || null })}
            className="flex-1 py-1 px-2 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">{t('items.noFolder')}</option>
            {folders.map(folder => (
              <option key={folder.Id} value={folder.Id}>
                {folder.Name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isLoading}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('common.cancel')}
        </button>
      </div>

      {/* Add Custom Field Dialog */}
      {showAddCustomFieldModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Add Custom Field
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Field Label
                </label>
                <input
                  type="text"
                  value={newCustomFieldLabel}
                  onChange={(e) => setNewCustomFieldLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter field name"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Field Type
                </label>
                <select
                  value={newCustomFieldType}
                  onChange={(e) => setNewCustomFieldType(e.target.value as FieldType)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="Text">Text</option>
                  <option value="Hidden">Hidden (masked text)</option>
                  <option value="Email">Email</option>
                  <option value="URL">URL</option>
                  <option value="Phone">Phone</option>
                  <option value="Number">Number</option>
                  <option value="Date">Date</option>
                  <option value="TextArea">Text Area</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleAddCustomField}
                disabled={!newCustomFieldLabel.trim()}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCustomFieldModal(false);
                  setNewCustomFieldLabel('');
                  setNewCustomFieldType('Text');
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default ItemAddEdit;
