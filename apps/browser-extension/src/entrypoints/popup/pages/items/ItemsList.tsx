import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import ItemCard from '@/entrypoints/popup/components/Items/ItemCard';
import FolderCard from '@/entrypoints/popup/components/Items/FolderCard';
import FolderModal from '@/entrypoints/popup/components/Folders/FolderModal';
import HeaderButton from '@/entrypoints/popup/components/HeaderButton';
import { HeaderIconType } from '@/entrypoints/popup/components/Icons/HeaderIcons';
import LoadingSpinner from '@/entrypoints/popup/components/LoadingSpinner';
import ReloadButton from '@/entrypoints/popup/components/ReloadButton';
import { useApp } from '@/entrypoints/popup/context/AppContext';
import { useDb } from '@/entrypoints/popup/context/DbContext';
import { useHeaderButtons } from '@/entrypoints/popup/context/HeaderButtonsContext';
import { useLoading } from '@/entrypoints/popup/context/LoadingContext';
import { useVaultSync } from '@/entrypoints/popup/hooks/useVaultSync';
import { useVaultMutate } from '@/entrypoints/popup/hooks/useVaultMutate';
import { PopoutUtility } from '@/entrypoints/popup/utils/PopoutUtility';

import type { Item } from '@/utils/dist/shared/models/vault';

import { useMinDurationLoading } from '@/hooks/useMinDurationLoading';

type FilterType = 'all' | 'passkeys' | 'attachments';

const FILTER_STORAGE_KEY = 'items-filter';
const FILTER_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get stored filter from localStorage if not expired
 */
const getStoredFilter = (): FilterType => {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!stored) {
      return 'all';
    }

    const { filter, timestamp } = JSON.parse(stored);
    const now = Date.now();

    // Check if expired (5 minutes)
    if (now - timestamp > FILTER_EXPIRY_MS) {
      localStorage.removeItem(FILTER_STORAGE_KEY);
      return 'all';
    }

    return filter as FilterType;
  } catch {
    return 'all';
  }
};

/**
 * Store filter in localStorage with timestamp
 */
const storeFilter = (filter: FilterType): void => {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      filter,
      timestamp: Date.now()
    }));
  } catch {
    // Ignore storage errors
  }
};

/**
 * Represents a folder with item count
 */
type FolderWithCount = {
  id: string;
  name: string;
  itemCount: number;
};

/**
 * Items list page with folder support.
 */
const ItemsList: React.FC = () => {
  const { t } = useTranslation();
  const dbContext = useDb();
  const app = useApp();
  const navigate = useNavigate();
  const { syncVault } = useVaultSync();
  const { executeVaultMutation, isLoading: isSaving } = useVaultMutate();
  const { setHeaderButtons } = useHeaderButtons();
  const [items, setItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>(getStoredFilter());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string>('');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [recentlyDeletedCount, setRecentlyDeletedCount] = useState(0);
  const { setIsInitialLoading } = useLoading();

  /**
   * Loading state with minimum duration for more fluid UX.
   */
  const [isLoading, setIsLoading] = useMinDurationLoading(true, 100);

  /**
   * Handle add new item.
   * Navigate to item type selector for new item-based flow.
   */
  const handleAddItem = useCallback(() : void => {
    navigate('/items/select-type');
  }, [navigate]);

  /**
   * Handle add new folder.
   */
  const handleAddFolder = useCallback(() : void => {
    setShowFolderModal(true);
  }, []);

  /**
   * Handle save folder.
   */
  const handleSaveFolder = useCallback(async (folderName: string) : Promise<void> => {
    if (!dbContext?.sqliteClient) {
      console.error('[FOLDER DEBUG] No sqliteClient available');
      return;
    }

    console.log('[FOLDER DEBUG] Creating folder:', folderName, 'in parent:', currentFolderId);

    await executeVaultMutation(
      async () => {
        const folderId = await dbContext.sqliteClient!.createFolder(folderName, currentFolderId);
        console.log('[FOLDER DEBUG] Folder created with ID:', folderId);
      },
      {
        onSuccess: () => {
          console.log('[FOLDER DEBUG] Vault mutation successful, refreshing items...');
          // Refresh items to show the new folder
          const results = dbContext.sqliteClient!.getAllItems();
          console.log('[FOLDER DEBUG] getAllItems returned:', results.length, 'items');
          console.log('[FOLDER DEBUG] Items with FolderId:', results.filter(i => i.FolderId).map(i => ({ id: i.Id, name: i.Name, folderId: i.FolderId, folderPath: i.FolderPath })));
          setItems(results);

          // Also try to get folders directly
          const folders = dbContext.sqliteClient!.getAllFolders();
          console.log('[FOLDER DEBUG] getAllFolders returned:', folders);
        },
        onError: (error) => {
          console.error('[FOLDER DEBUG] Error creating folder:', error);
          throw error;
        }
      }
    );
  }, [dbContext, currentFolderId, executeVaultMutation]);

  /**
   * Retrieve latest vault and refresh the items list.
   */
  const onRefresh = useCallback(async () : Promise<void> => {
    if (!dbContext?.sqliteClient) {
      return;
    }

    try {
      // Sync vault and load items
      await syncVault({
        /**
         * On success.
         */
        onSuccess: async (_hasNewVault) => {
          // Items list is refreshed automatically when the (new) sqlite client is available via useEffect hook below.
        },
        /**
         * On offline.
         */
        onOffline: () => {
          // Continue with local vault in offline mode.
        },
        /**
         * On error.
         */
        onError: async (error) => {
          console.error('Error syncing vault:', error);
        },
      });
    } catch (err) {
      console.error('Error refreshing items:', err);
      await app.logout('Error while syncing vault, please re-authenticate.');
    }
  }, [dbContext, app, syncVault]);

  /**
   * Get latest vault from server and refresh the items list.
   */
  const syncVaultAndRefresh = useCallback(async () : Promise<void> => {
    setIsLoading(true);
    await onRefresh();
    setIsLoading(false);
  }, [onRefresh, setIsLoading]);

  // Set header buttons on mount and clear on unmount
  useEffect((): (() => void) => {
    const headerButtonsJSX = (
      <div className="flex items-center gap-2">
        {!PopoutUtility.isPopup() && (
          <HeaderButton
            onClick={() => PopoutUtility.openInNewPopup()}
            title="Open in new window"
            iconType={HeaderIconType.EXPAND}
          />
        )}
        <HeaderButton
          onClick={handleAddItem}
          title="Add new item"
          iconType={HeaderIconType.PLUS}
        />
      </div>
    );

    setHeaderButtons(headerButtonsJSX);
    return () => setHeaderButtons(null);
  }, [setHeaderButtons, handleAddItem]);

  /**
   * Load items list on mount and on sqlite client change.
   */
  useEffect(() => {
    /**
     * Refresh items list when a (new) sqlite client is available.
     */
    const refreshItems = async () : Promise<void> => {
      if (dbContext?.sqliteClient) {
        setIsLoading(true);
        const results = dbContext.sqliteClient?.getAllItems() ?? [];
        setItems(results);
        // Also get recently deleted count
        const deletedCount = dbContext.sqliteClient?.getRecentlyDeletedCount() ?? 0;
        setRecentlyDeletedCount(deletedCount);
        setIsLoading(false);
        setIsInitialLoading(false);
      }
    };

    refreshItems();
  }, [dbContext?.sqliteClient, setIsLoading, setIsInitialLoading]);

  /**
   * Get the title based on the active filter and current folder
   */
  const getFilterTitle = () : string => {
    if (currentFolderId && folderPath) {
      return folderPath;
    }

    switch (filterType) {
      case 'passkeys':
        return t('items.filters.passkeys');
      case 'attachments':
        return t('items.filters.attachments');
      default:
        return t('items.title');
    }
  };

  /**
   * Navigate into a folder
   */
  const handleFolderClick = useCallback((folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath(folderName);
    setSearchTerm(''); // Clear search when entering folder
  }, []);

  /**
   * Navigate back to root or parent folder
   */
  const handleBackToRoot = useCallback(() => {
    setCurrentFolderId(null);
    setFolderPath('');
  }, []);

  /**
   * Get folders with item counts (only for root level when not searching)
   */
  const getFoldersWithCounts = (): FolderWithCount[] => {
    console.log('[FOLDER DEBUG] getFoldersWithCounts called. currentFolderId:', currentFolderId, 'searchTerm:', searchTerm);

    if (currentFolderId || searchTerm) {
      console.log('[FOLDER DEBUG] Returning empty folders (in folder view or searching)');
      return [];
    }

    if (!dbContext?.sqliteClient) {
      return [];
    }

    // Get all folders directly from the database
    const allFolders = dbContext.sqliteClient.getAllFolders();
    console.log('[FOLDER DEBUG] Got', allFolders.length, 'folders from database:', allFolders);

    // Count items per folder
    const folderCounts = new Map<string, number>();
    items.forEach(item => {
      if (item.FolderId) {
        folderCounts.set(item.FolderId, (folderCounts.get(item.FolderId) || 0) + 1);
      }
    });

    // Build result with counts
    const result = allFolders.map(folder => ({
      id: folder.Id,
      name: folder.Name,
      itemCount: folderCounts.get(folder.Id) || 0
    })).sort((a, b) => a.name.localeCompare(b.name));

    console.log('[FOLDER DEBUG] Returning', result.length, 'folders with counts:', result);
    return result;
  };

  /**
   * Filter items based on current view (folder, search, filter type)
   */
  const filteredItems = items.filter((item: Item) => {
    // Filter by current folder (if in folder view)
    if (currentFolderId !== null) {
      if (item.FolderId !== currentFolderId) {
        return false;
      }
    } else if (!searchTerm) {
      // In root view without search, exclude items that are in folders
      if (item.FolderId) {
        return false;
      }
    }

    // Apply type filter
    let passesTypeFilter = true;
    if (filterType === 'passkeys') {
      passesTypeFilter = item.HasPasskey === true;
    } else if (filterType === 'attachments') {
      passesTypeFilter = item.HasAttachment === true;
    }

    if (!passesTypeFilter) {
      return false;
    }

    // Apply search filter
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) {
      return true;
    }

    // Search in item name and fields
    const itemName = item.Name?.toLowerCase() || '';
    if (itemName.includes(searchLower)) {
      return true;
    }

    // Search in field values
    const fieldMatches = item.Fields?.some(field => {
      const value = Array.isArray(field.Value)
        ? field.Value.join(' ').toLowerCase()
        : (field.Value || '').toLowerCase();
      return value.includes(searchLower) || field.Label.toLowerCase().includes(searchLower);
    });

    if (fieldMatches) {
      return true;
    }

    return false;
  });

  const folders = getFoldersWithCounts();

  console.log('[FOLDER DEBUG] Render: folders:', folders.length, 'filteredItems:', filteredItems.length, 'isLoading:', isLoading);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="relative flex-1">
          {currentFolderId ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleBackToRoot}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                title={t('common.back')}
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="flex items-baseline gap-1.5 text-gray-900 dark:text-white text-xl">
                {getFilterTitle()}
                <span className="text-sm text-gray-500 dark:text-gray-400">({filteredItems.length})</span>
              </h2>
            </div>
          ) : (
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-1 text-gray-900 dark:text-white text-xl hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none"
            >
              <h2 className="flex items-baseline gap-1.5">
                {getFilterTitle()}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({folders.length > 0 ? `${folders.length} ${t('items.folders')}, ` : ''}{filteredItems.length} {t('items.items')})
                </span>
              </h2>
              <svg
                className="w-4 h-4 mt-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}

          {showFilterMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowFilterMenu(false)}
              />
              <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                <div className="py-1">
                  <button
                    onClick={() => {
                      const newFilter = 'all';
                      setFilterType(newFilter);
                      storeFilter(newFilter);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      filterType === 'all' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {t('items.filters.all')}
                  </button>
                  <button
                    onClick={() => {
                      const newFilter = 'passkeys';
                      setFilterType(newFilter);
                      storeFilter(newFilter);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      filterType === 'passkeys' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {t('items.filters.passkeys')}
                  </button>
                  <button
                    onClick={() => {
                      const newFilter = 'attachments';
                      setFilterType(newFilter);
                      storeFilter(newFilter);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      filterType === 'attachments' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {t('items.filters.attachments')}
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button
                    onClick={() => {
                      setShowFilterMenu(false);
                      navigate('/items/deleted');
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {t('recentlyDeleted.title')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <ReloadButton onClick={syncVaultAndRefresh} />
      </div>

      {items.length > 0 ? (
        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`${t('content.searchVault')}`}
            autoFocus
            className="w-full p-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      ) : (
        <></>
      )}

      {items.length === 0 ? (
        <>
          <div className="text-gray-500 dark:text-gray-400 space-y-2 mb-10">
            <p>
              {t('items.welcomeTitle')}
            </p>
            <p>
              {t('items.welcomeDescription')}
            </p>
          </div>
          {/* Show Recently Deleted even when vault is empty */}
          {recentlyDeletedCount > 0 && (
            <button
              onClick={() => navigate('/items/deleted')}
              className="w-full p-3 flex items-center justify-between text-left bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">{t('recentlyDeleted.title')}</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {recentlyDeletedCount}
              </span>
            </button>
          )}
        </>
      ) : filteredItems.length === 0 && folders.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400 space-y-2 mb-10">
          <p>
            {filterType === 'passkeys'
              ? t('items.noPasskeysFound')
              : filterType === 'attachments'
                ? t('items.noAttachmentsFound')
                : t('items.noMatchingItems')
            }
          </p>
        </div>
      ) : (
        <>
          {/* Folders section (only show at root level when not searching) */}
          {!currentFolderId && !searchTerm && (
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('items.folders')}
                </h3>
                <button
                  onClick={handleAddFolder}
                  className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 focus:outline-none"
                >
                  + {t('items.newFolder')}
                </button>
              </div>
              {folders.length > 0 && (
                <ul className="space-y-2">
                  {folders.map(folder => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onClick={() => handleFolderClick(folder.id, folder.name)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Items */}
          {filteredItems.length > 0 && (
            <div className="space-y-2">
              {folders.length > 0 && (
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('items.items')}
                </h3>
              )}
              <ul className="space-y-2">
                {filteredItems.map(item => (
                  <ItemCard
                    key={item.Id}
                    item={item}
                    showFolderPath={!!searchTerm && !!item.FolderPath}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Recently Deleted link (only show at root level when not searching) */}
          {!currentFolderId && !searchTerm && (
            <button
              onClick={() => navigate('/items/deleted')}
              className="w-full mt-4 p-3 flex items-center justify-between text-left bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">{t('recentlyDeleted.title')}</span>
              </div>
              {recentlyDeletedCount > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {recentlyDeletedCount}
                </span>
              )}
            </button>
          )}
        </>
      )}

      {/* Folder Modal */}
      <FolderModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onSave={handleSaveFolder}
        mode="create"
      />
    </div>
  );
};

export default ItemsList;
