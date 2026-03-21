import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useDb } from '@/entrypoints/popup/context/DbContext';

import { getFolderPath, getFolderIdPath } from '@/utils/folderUtils';

type Breadcrumb = {
  name: string;
  id: string;
};

type FolderBreadcrumbProps = {
  /**
   * The ID of the current folder to show breadcrumbs for.
   * If null/undefined, no breadcrumbs are shown.
   */
  folderId: string | null | undefined;
  /**
   * Optional refresh key to force re-computation of breadcrumbs
   * (e.g., when folder is renamed).
   */
  refreshKey?: number;
  /**
   * Optional root path to navigate to when clicking the root breadcrumb.
   * Defaults to '/items'.
   */
  rootPath?: string;
  /**
   * Optional root label for the first breadcrumb.
   * Defaults to 'items.title' translation key.
   */
  rootLabel?: string;
};

/**
 * Displays a breadcrumb navigation trail for folder hierarchy.
 * Shows "Root > Parent Folder > Current Folder" with clickable links.
 */
const FolderBreadcrumb: React.FC<FolderBreadcrumbProps> = ({
  folderId,
  refreshKey = 0,
  rootPath = '/items',
  rootLabel,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbContext = useDb();

  /**
   * Compute breadcrumb trail based on current folder.
   */
  const breadcrumbs = useMemo((): Breadcrumb[] => {
    if (!folderId || !dbContext?.sqliteClient) {
      return [];
    }
    const allFolders = dbContext.sqliteClient.folders.getAll();
    const folderNames = getFolderPath(folderId, allFolders);
    const folderIds = getFolderIdPath(folderId, allFolders);
    return folderNames.map((name, index) => ({
      name,
      id: folderIds[index]
    }));
  }, [folderId, dbContext?.sqliteClient]);

  // Don't render anything if no breadcrumbs
  if (breadcrumbs.length === 0) {
    return null;
  }

  const rootLabelText = rootLabel ?? t('items.title');

  return (
    <div className="mb-3 flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 overflow-x-auto">
      <button
        onClick={() => navigate(rootPath)}
        className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors flex-shrink-0"
      >
        {rootLabelText}
      </button>
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 6 15 12 9 18" />
          </svg>
          {index < breadcrumbs.length - 1 ? (
            <button
              onClick={() => navigate(`/items/folder/${crumb.id}`)}
              className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors truncate"
              title={crumb.name}
            >
              {crumb.name}
            </button>
          ) : (
            <span className="text-gray-900 dark:text-white font-medium truncate" title={crumb.name}>
              {crumb.name}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default FolderBreadcrumb;
