import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { sendMessage } from 'webext-bridge/popup';

import Modal from '@/entrypoints/popup/components/Dialogs/Modal';
import EditableFieldLabel from '@/entrypoints/popup/components/Forms/EditableFieldLabel';
import { FormInput } from '@/entrypoints/popup/components/Forms/FormInput';
import PasswordField from '@/entrypoints/popup/components/Forms/PasswordField';
import HeaderButton from '@/entrypoints/popup/components/HeaderButton';
import { HeaderIconType } from '@/entrypoints/popup/components/Icons/HeaderIcons';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useHeaderButtons } from '@/entrypoints/popup/context/HeaderButtonsContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import { useVaultMutate } from '@/entrypoints/popup/hooks/useVaultMutate';

import type { Item, ItemField, ItemType, FieldType } from '@/utils/dist/shared/models/vault';
import { getSystemFieldsForItemType } from '@/utils/dist/shared/models/vault';

/**
 * Form data structure matching the Item model
 */
type ItemFormData = {
  Id: string;
  Name: string;
  ItemType: ItemType;
  Fields: Record<string, string | string[]>; // FieldKey -> Value mapping
};

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
  const navigate = useNavigate();
  const dbContext = useDb();
  const isEditMode = id !== undefined && id.length > 0;

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

  /**
   * Get all applicable system fields for the current item type.
   * These are sorted by DefaultDisplayOrder.
   */
  const applicableSystemFields = useMemo(() => {
    if (!item) return [];
    return getSystemFieldsForItemType(item.ItemType);
  }, [item?.ItemType]);

  /**
   * Group system fields by category for organized rendering.
   */
  const groupedSystemFields = useMemo(() => {
    const groups: Record<string, typeof applicableSystemFields> = {};

    applicableSystemFields.forEach(field => {
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
      setItem({
        Id: crypto.randomUUID().toUpperCase(),
        Name: '',
        ItemType: 'Login',
        Fields: [],
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      });
      setLocalLoading(false);
      setIsInitialLoading(false);
      return;
    }

    try {
      const result = dbContext.sqliteClient.getItemById(id);
      if (result) {
        setItem(result);

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
  }, [dbContext?.sqliteClient, id, isEditMode, navigate, setIsInitialLoading]);

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
    if (!item) return;

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
          await dbContext.sqliteClient!.updateItem(updatedItem);
          console.log('Item updated:', updatedItem);
        } else {
          await dbContext.sqliteClient!.createItem(updatedItem);
          console.log('Item created:', updatedItem);
        }
      });

      // Navigate back to details page
      navigate(`/items/${updatedItem.Id}`);
    } catch (err) {
      console.error('Error saving item:', err);
    }
  }, [item, fieldValues, applicableSystemFields, dbContext, isEditMode, executeVaultMutation, navigate]);

  /**
   * Handle delete action.
   */
  const handleDelete = useCallback(async () => {
    if (!item || !isEditMode || !dbContext?.sqliteClient) return;

    try {
      // Delete from database and sync vault
      await executeVaultMutation(async () => {
        await dbContext.sqliteClient!.deleteItemById(item.Id);
        console.log('Item deleted:', item.Id);
      });

      // Navigate back to credentials list
      navigate('/credentials');
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
      navigate('/credentials');
    }
  }, [isEditMode, id, navigate]);

  /**
   * Add custom field handler.
   */
  const handleAddCustomField = useCallback(() => {
    if (!newCustomFieldLabel.trim()) return;

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

    return () => setHeaderButtons(null);
  }, [setHeaderButtons, isEditMode, t]);

  /**
   * Render a field input based on field type.
   */
  const renderFieldInput = useCallback((fieldKey: string, label: string, fieldType: FieldType, isHidden: boolean, isMultiValue: boolean) => {
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
    <div className="space-y-6">
      {/* Item Name */}
      <div>
        <FormInput
          id="itemName"
          label={t('credentials.serviceName')}
          value={item.Name || ''}
          onChange={(value) => setItem({ ...item, Name: value })}
          type="text"
          placeholder={t('credentials.serviceName')}
          required
        />
      </div>

      {/* Render fields grouped by category */}
      {Object.keys(groupedSystemFields).map(category => (
        <div key={category} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            {category === 'Login' && t('credentials.loginCredentials')}
            {category === 'Alias' && t('credentials.aliasInformation')}
            {category === 'Card' && t('credentials.cardInformation')}
            {category === 'Identity' && t('credentials.identityInformation')}
            {category !== 'Login' && category !== 'Alias' && category !== 'Card' && category !== 'Identity' && category}
          </h2>

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
      ))}

      {/* Custom Fields Section */}
      {customFields.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            {t('credentials.customFields')}
          </h2>

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
      )}

      {/* Add Custom Field Button */}
      <button
        type="button"
        onClick={() => setShowAddCustomFieldModal(true)}
        className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-md hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
      >
        + Add Custom Field
      </button>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
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
                  <option value="Password">Hidden (masked text)</option>
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
