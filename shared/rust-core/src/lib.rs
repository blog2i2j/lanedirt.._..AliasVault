//! AliasVault Core Library
//!
//! Cross-platform merge logic for AliasVault using Last-Write-Wins (LWW) strategy.
//!
//! This library accepts table data as JSON and returns merged results as JSON.
//! Each platform (browser, iOS, Android, .NET) handles its own SQLite I/O
//! and calls this library for the merge logic.
//!
//! # Example (conceptual)
//! ```ignore
//! // Platform reads tables from local and server SQLite databases
//! let local_tables = read_all_tables_as_json(local_db);
//! let server_tables = read_all_tables_as_json(server_db);
//!
//! // Rust performs the merge
//! let result = merge_vaults(local_tables, server_tables);
//!
//! // Platform applies changes to local database
//! apply_updates(local_db, result.updates);
//! apply_inserts(local_db, result.inserts);
//! ```

pub mod error;
pub mod merge;
pub mod types;

pub use error::VaultError;
pub use merge::{
    merge_vaults, MergeInput, MergeOutput, MergeStats, SqlStatement, TableData,
};
pub use types::SYNCABLE_TABLE_NAMES;

// WASM bindings
#[cfg(feature = "wasm")]
pub mod wasm;

#[cfg(feature = "wasm")]
pub use wasm::*;

// UniFFI scaffolding
#[cfg(feature = "uniffi")]
uniffi::setup_scaffolding!();
