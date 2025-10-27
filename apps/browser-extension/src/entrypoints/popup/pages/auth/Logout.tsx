import React, { useEffect } from 'react';

import { useApp } from '@/entrypoints/popup/context/AppContext';

/**
 * Logout page.
 */
const Logout: React.FC = () => {
  const app = useApp();
  /**
   * Logout and navigate to home page.
   */
  useEffect(() => {
    app.logout();
  }, [app]);

  // Return null since this is just a functional component that handles logout.
  return null;
};

export default Logout;
