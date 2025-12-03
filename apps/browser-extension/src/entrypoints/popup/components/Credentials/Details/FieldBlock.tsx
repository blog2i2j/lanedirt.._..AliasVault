import React from 'react';

import { FormInputCopyToClipboard } from '@/entrypoints/popup/components/Forms/FormInputCopyToClipboard';

import type { ItemField } from '@/utils/dist/shared/models/vault';

interface FieldBlockProps {
  field: ItemField;
}

/**
 * Convert URLs in text to clickable links (same as NotesBlock).
 */
const convertUrlsToLinks = (text: string): string => {
  const urlPattern = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/g;

  return text.replace(urlPattern, (url) => {
    const href = url.startsWith('http') ? url : `http://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">${url}</a>`;
  });
};

/**
 * Dynamic field block component that renders based on field type.
 * Uses the same FormInputCopyToClipboard component as existing credential blocks.
 */
const FieldBlock: React.FC<FieldBlockProps> = ({ field }) => {
  // Skip rendering if no value
  if (!field.Value || (typeof field.Value === 'string' && field.Value.trim() === '')) {
    return null;
  }

  const values = Array.isArray(field.Value) ? field.Value : [field.Value];

  // Handle multi-value fields (like multiple URLs)
  if (values.length > 1) {
    return (
      <div className="space-y-2">
        {values.map((value, idx) => (
          <FormInputCopyToClipboard
            key={`${field.FieldKey}-${idx}`}
            id={`${field.FieldKey}-${idx}`}
            label={idx === 0 ? field.Label : `${field.Label} ${idx + 1}`}
            value={value}
            type={field.FieldType === 'Password' ? 'password' : 'text'}
          />
        ))}
      </div>
    );
  }

  const value = values[0];

  // Render based on field type
  switch (field.FieldType) {
    case 'Password':
    case 'Hidden':
      return (
        <FormInputCopyToClipboard
          id={field.FieldKey}
          label={field.Label}
          value={value}
          type="password"
        />
      );

    case 'TextArea':
      // Use NotesBlock-style rendering for multi-line text
      const formattedText = convertUrlsToLinks(value);
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {field.Label}
          </label>
          <div className="p-4 bg-gray-50 rounded-lg dark:bg-gray-700">
            <p
              className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: formattedText }}
            />
          </div>
        </div>
      );

    case 'Email':
    case 'URL':
    case 'Phone':
    case 'Date':
    case 'Number':
    case 'Text':
    default:
      return (
        <FormInputCopyToClipboard
          id={field.FieldKey}
          label={field.Label}
          value={value}
          type="text"
        />
      );
  }
};

export default FieldBlock;
