import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import AttachmentUploader from '@/entrypoints/popup/components/Credentials/Details/AttachmentUploader';
import TotpEditor from '@/entrypoints/popup/components/Credentials/Details/TotpEditor';
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
import type { Item, ItemField, ItemType, FieldType, Attachment, TotpCode } from '@/utils/dist/shared/models/vault';
import { getSystemFieldsForItemType, isFieldShownByDefault } from '@/utils/dist/shared/models/vault';
import { CreatePasswordGenerator } from '@/utils/dist/shared/password-generator';

// Valid item types from the shared model
const VALID_ITEM_TYPES: ItemType[] = ['Login', 'Alias', 'CreditCard', 'Note'];

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
    type: 'Alias',
    titleKey: 'itemTypes.alias.title',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

  const { executeVaultMutation, syncStatus } = useVaultMutate();
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

  // Folder selection modal state
  const [showFolderModal, setShowFolderModal] = useState(false);

  // Alias fields visibility state (for Login type - hidden by default, shown when user adds it)
  const [showAliasFields, setShowAliasFields] = useState(false);

  // Notes field visibility state (hidden by default, shown when user adds it)
  const [showNotes, setShowNotes] = useState(false);

  // Add menu dropdown state (unified + button)
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Track if alias was already auto-generated (to avoid re-generating on re-renders)
  const aliasGeneratedRef = useRef(false);

  // Ref for the item name input field (for auto-focus)
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Track last generated values to avoid overwriting manual user entries on regenerate
  const [lastGeneratedValues, setLastGeneratedValues] = useState<{
    username: string | null;
    password: string | null;
    email: string | null;
  }>({
    username: null,
    password: null,
    email: null
  });

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
  const [show2FA, setShow2FA] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [originalAttachmentIds, setOriginalAttachmentIds] = useState<string[]>([]);
  const [showAttachments, setShowAttachments] = useState(false);

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
   * Excludes metadata fields (notes) and header fields which are handled separately.
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

      // Check if notes should be shown by default for this type
      const typeFields = getSystemFieldsForItemType(effectiveType);
      const notesFieldDef = typeFields.find(f => f.FieldKey === 'metadata.notes');
      if (notesFieldDef && isFieldShownByDefault(notesFieldDef, effectiveType)) {
        setShowNotes(true);
      }

      // For Alias type, show alias fields by default
      if (effectiveType === 'Alias') {
        setShowAliasFields(true);
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
   * Auto-generate alias when Alias type is selected in create mode.
   */
  useEffect(() => {
    if (!isEditMode && item?.ItemType === 'Alias' && !localLoading && dbContext?.sqliteClient && !aliasGeneratedRef.current) {
      aliasGeneratedRef.current = true;
      void handleGenerateAlias();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, item?.ItemType, localLoading, dbContext?.sqliteClient]);

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

      /* Navigate back to details page */
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

    // For Alias type, show alias fields by default; otherwise hide
    if (newType === 'Alias') {
      setShowAliasFields(true);
      // Reset the ref so alias will be auto-generated
      aliasGeneratedRef.current = false;
    } else {
      setShowAliasFields(false);
    }

    // Check if notes should be shown by default for the new type
    const newTypeFields = getSystemFieldsForItemType(newType);
    const newNotesField = newTypeFields.find(f => f.FieldKey === 'metadata.notes');
    const notesShownByDefault = newNotesField ? isFieldShownByDefault(newNotesField, newType) : false;
    setShowNotes(notesShownByDefault);

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
   * Only overwrites username/password/email if they're empty or match the last generated value.
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
      setFieldValues(prev => {
        const currentUsername = (prev['login.username'] as string) || '';
        const currentPassword = (prev['login.password'] as string) || '';
        const currentEmail = (prev['alias.email'] as string) || '';

        const newValues: Record<string, string | string[]> = {
          ...prev,
          // Always update alias identity fields
          'alias.first_name': identity.firstName,
          'alias.last_name': identity.lastName,
          'alias.nickname': identity.nickName,
          'alias.gender': identity.gender,
          'alias.birthdate': IdentityHelperUtils.normalizeBirthDateForDisplay(identity.birthDate.toISOString())
        };

        // Only overwrite email if it's empty or matches the last generated value
        if (!currentEmail || currentEmail === lastGeneratedValues.email) {
          newValues['alias.email'] = email;
        }

        // Only overwrite username if it's empty or matches the last generated value
        if (!currentUsername || currentUsername === lastGeneratedValues.username) {
          newValues['login.username'] = identity.nickName;
        }

        // Only overwrite password if it's empty or matches the last generated value
        if (!currentPassword || currentPassword === lastGeneratedValues.password) {
          newValues['login.password'] = password;
        }

        return newValues;
      });

      // Update tracking with new generated values
      setLastGeneratedValues({
        username: identity.nickName,
        password: password,
        email: email
      });

      // Show the generated password (it's random so no need to hide)
      setShowPassword(true);

      // Show alias fields section
      setShowAliasFields(true);
    } catch (error) {
      console.error('Error generating random alias:', error);
    }
  }, [dbContext.sqliteClient, initializeGenerators, lastGeneratedValues]);

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
      'metadata.notes': ''
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
   * Handle adding 2FA section from menu.
   */
  const handleAdd2FAFromMenu = useCallback((): void => {
    setShow2FA(true);
    setShowAddMenu(false);
  }, []);

  /**
   * Handle adding attachments section from menu.
   */
  const handleAddAttachmentsFromMenu = useCallback((): void => {
    setShowAttachments(true);
    setShowAddMenu(false);
  }, []);

  /**
   * Add menu options - shows available optional sections (Notes, 2FA, Attachments, and Custom Fields).
   * Alias has its own dedicated button since it's a core feature.
   */
  const addMenuOptions = useMemo(() => {
    const options: Array<{
      key: string;
      label: string;
      icon: React.ReactNode;
      action: () => void;
    }> = [];

    // Notes option - show when notes field exists, is optional (not shown by default), not yet shown, and has no value
    const notesIsOptional = notesField && !shouldShowFieldByDefault(notesField);
    if (notesField && notesIsOptional && !showNotes && !fieldValues['metadata.notes'] && !isEditMode) {
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

    // 2FA TOTP option - only for Login and Alias types, and when not already shown
    const supports2FA = item?.ItemType === 'Login' || item?.ItemType === 'Alias';
    if (supports2FA && !show2FA) {
      options.push({
        key: '2fa',
        label: t('common.twoFactorAuthentication'),
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ),
        action: handleAdd2FAFromMenu
      });
    }

    // Attachments option - available for all types, when not already shown
    if (!showAttachments) {
      options.push({
        key: 'attachments',
        label: t('common.attachments'),
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        ),
        action: handleAddAttachmentsFromMenu
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
  }, [showNotes, notesField, fieldValues, isEditMode, t, handleAddNotesFromMenu, handleAddCustomFieldFromMenu, handleAdd2FAFromMenu, handleAddAttachmentsFromMenu, shouldShowFieldByDefault, item?.ItemType, show2FA, showAttachments]);

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
      case 'Password':
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
  }, [fieldValues, handleFieldChange, showPassword]);

  /**
   * Handle form submission via Enter key.
   */
  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    void handleSave();
  }, [handleSave]);

  if (localLoading || !item) {
    return <LoadingSpinner />;
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {/* Item Type Selector (create mode only) */}
      {!isEditMode && (
        <div className="relative">
          <div className="w-full px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="flex-1 flex items-center justify-between hover:opacity-80 transition-opacity"
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
            {/* Regenerate alias button - icon only for flexibility */}
            {item?.ItemType === 'Alias' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleGenerateAlias();
                }}
                className="flex-shrink-0 p-1.5 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors"
                title={t('itemTypes.regenerateAlias')}
              >
                <svg className='w-4 h-4' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
          </div>

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

      {/* Item Name and Header fields block */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
        <div>
          <label htmlFor="itemName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('credentials.itemName')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              ref={nameInputRef}
              id="itemName"
              type="text"
              value={item.Name || ''}
              onChange={(e) => setItem({ ...item, Name: e.target.value })}
              placeholder={t('credentials.itemName')}
              className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white ${folders.length > 0 ? 'pr-28' : ''}`}
              required
            />
            {/* Folder Button inside input */}
            {folders.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFolderModal(true)}
                className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
                  item.FolderId
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title={item.FolderId ? folders.find(f => f.Id === item.FolderId)?.Name || t('items.folder') : t('items.noFolder')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {item.FolderId && (
                  <span className="max-w-16 truncate">
                    {folders.find(f => f.Id === item.FolderId)?.Name}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
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
      </div>

      {/* Render fields grouped by category */}
      {Object.keys(groupedSystemFields).map(category => {
        // Check if this category has any fields that are optional (not shown by default)
        const categoryFields = groupedSystemFields[category];
        const allFieldsOptional = categoryFields.every(f => !shouldShowFieldByDefault(f));
        const isOptionalCategory = category === 'Alias' && allFieldsOptional && !isEditMode;

        // If this is an optional category and not shown, skip rendering (will be available via + button)
        if (isOptionalCategory && !showAliasFields) {
          return null;
        }

        return (
          <div key={category} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center justify-between">
              <span>
                {category === 'Login' && t('common.credentials')}
                {category === 'Alias' && t('credentials.alias')}
                {category === 'Card' && t('credentials.cardInformation')}
                {category === 'Identity' && t('credentials.identityInformation')}
                {category !== 'Login' && category !== 'Alias' && category !== 'Card' && category !== 'Identity' && category}
              </span>

              {/* Show action buttons for optional Alias section in create mode */}
              {isOptionalCategory && showAliasFields && (
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

      {/* Notes Section - Hidden by default in create mode, with remove button if optional */}
      {notesField && (showNotes || isEditMode || fieldValues['metadata.notes']) && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center justify-between">
            <span>{t('credentials.notes')}</span>
            {/* Remove button for notes in create mode - only if notes is optional (not shown by default) */}
            {!isEditMode && !shouldShowFieldByDefault(notesField) && (
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

      {/* 2FA TOTP Section - only for Login and Alias types */}
      {show2FA && (item?.ItemType === 'Login' || item?.ItemType === 'Alias') && (
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

      {/* Folder Selection Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-80 transition-opacity"
            onClick={() => setShowFolderModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all w-full max-w-sm">
              {/* Close button */}
              <button
                type="button"
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-500 focus:outline-none"
                onClick={() => setShowFolderModal(false)}
              >
                <span className="sr-only">{t('common.close')}</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Content */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">
                  {t('items.folder')}
                </h3>
              </div>

              {/* Folder Options */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {/* No Folder Option */}
                <button
                  type="button"
                  onClick={() => {
                    setItem({ ...item, FolderId: null });
                    setShowFolderModal(false);
                  }}
                  className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 transition-colors ${
                    !item.FolderId
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <svg className={`w-5 h-5 ${!item.FolderId ? 'text-primary-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <span className="font-medium">{t('items.noFolder')}</span>
                  {!item.FolderId && (
                    <svg className="w-5 h-5 ml-auto text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                {/* Folder Options */}
                {folders.map(folder => (
                  <button
                    key={folder.Id}
                    type="button"
                    onClick={() => {
                      setItem({ ...item, FolderId: folder.Id });
                      setShowFolderModal(false);
                    }}
                    className={`w-full px-3 py-2 text-left rounded-md flex items-center gap-3 transition-colors ${
                      item.FolderId === folder.Id
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <svg className={`w-5 h-5 ${item.FolderId === folder.Id ? 'text-primary-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="font-medium">{folder.Name}</span>
                    {item.FolderId === folder.Id && (
                      <svg className="w-5 h-5 ml-auto text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
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
