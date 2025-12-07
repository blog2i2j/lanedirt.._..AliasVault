export type StoreVaultRequest = {
  vaultBlob: string;
  publicEmailDomainList?: string[];
  privateEmailDomainList?: string[];
  hiddenPrivateEmailDomainList?: string[];
  vaultRevisionNumber?: number;
  /**
   * Whether this vault has local changes not yet synced to server.
   * Required to ensure callers explicitly track sync state.
   */
  hasPendingSync: boolean;
}
