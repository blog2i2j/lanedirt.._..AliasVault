import React from 'react';

type FolderWithCount = {
  id: string;
  name: string;
  itemCount: number;
};

type FolderCardProps = {
  folder: FolderWithCount;
  onClick: () => void;
};

/**
 * FolderCard component
 *
 * This component displays a folder card with a folder icon, name, and item count.
 * It allows the user to navigate into the folder when clicked.
 */
const FolderCard: React.FC<FolderCardProps> = ({ folder, onClick }) => {
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full p-2 border dark:border-gray-600 rounded flex items-center bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {/* Folder Icon */}
        <div className="w-8 h-8 mr-2 flex-shrink-0 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-orange-500 dark:text-orange-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <div className="text-left flex-1">
          <p className="font-medium text-gray-900 dark:text-white">{folder.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {folder.itemCount} {folder.itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>

        {/* Chevron Right Icon */}
        <svg
          className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </li>
  );
};

export default FolderCard;
