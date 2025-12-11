import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useDb } from '@/entrypoints/popup/context/DbContext';

import type { FieldHistory, FieldType } from '@/utils/dist/core/models/vault';

type FieldHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: FieldType;
  isHidden: boolean;
}

/**
 * Modal component for displaying field value history.
 * Shows historical values with dates.
 * For hidden/password fields, values are masked by default.
 * For other fields, values are visible by default.
 */
const FieldHistoryModal: React.FC<FieldHistoryModalProps> = ({
  isOpen,
  onClose,
  itemId,
  fieldKey,
  fieldLabel,
  fieldType,
  isHidden
}) => {
  const { t } = useTranslation();
  const dbContext = useDb();
  const [history, setHistory] = useState<FieldHistory[]>([]);
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // For non-hidden fields, show values by default
  const shouldMaskByDefault = isHidden || fieldType === 'Password' || fieldType === 'Hidden';

  useEffect(() => {
    if (!isOpen || !dbContext?.sqliteClient) {
      return;
    }

    try {
      setLoading(true);
      const historyRecords = dbContext.sqliteClient.getFieldHistory(itemId, fieldKey);
      setHistory(historyRecords);
    } catch (error) {
      console.error('Error loading field history:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, dbContext?.sqliteClient, itemId, fieldKey]);

  if (!isOpen) {
    return null;
  }

  /**
   * Toggle the visibility of a field value in the history modal.
   */
  const toggleValueVisibility = (historyId: string): void => {
    setVisibleValues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(historyId)) {
        newSet.delete(historyId);
      } else {
        newSet.add(historyId);
      }
      return newSet;
    });
  };

  /**
   * Copy a field value to the clipboard.
   */
  const copyToClipboard = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  /**
   * Format a date string to a human readable format.
   */
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  /**
   * Parse a value snapshot into an array of values.
   */
  const parseValueSnapshot = (snapshot: string): string[] => {
    try {
      return JSON.parse(snapshot);
    } catch {
      return [snapshot];
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-80 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all w-full max-w-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">
              {fieldLabel} {t('credentials.history')}
            </h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
              onClick={onClose}
            >
              <span className="sr-only">{t('common.close')}</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('credentials.noHistoryAvailable')}
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((record) => {
                  const values = parseValueSnapshot(record.ValueSnapshot);
                  /**
                   * For hidden fields, check if this record is explicitly set to visible
                   * For non-hidden fields, always show values (no toggle needed)
                   */
                  const isVisible = shouldMaskByDefault ? visibleValues.has(record.Id) : true;

                  return (
                    <div
                      key={record.Id}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(record.ChangedAt)}
                        </div>
                        {shouldMaskByDefault && (
                          <button
                            type="button"
                            onClick={() => toggleValueVisibility(record.Id)}
                            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 focus:outline-none"
                          >
                            {isVisible ? t('common.hide') : t('common.show')}
                          </button>
                        )}
                      </div>

                      {values.map((value, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 mt-2"
                        >
                          <div className="flex-1 font-mono text-sm bg-white dark:bg-gray-800 rounded px-3 py-2 border border-gray-200 dark:border-gray-600 break-all">
                            {shouldMaskByDefault && !isVisible ? '\u2022'.repeat(12) : value}
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(value)}
                            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 focus:outline-none"
                            title={t('common.copyToClipboard')}
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="inline-flex justify-center rounded-md bg-white dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none"
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldHistoryModal;
