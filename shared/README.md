This folder contains shared modules that are used by multiple applications in the AliasVault monorepo.

## rust-core
Cross-platform core library written in Rust, providing shared business logic across ALL platforms:
- Browser extensions (Chrome, Firefox, Edge, Safari) via WebAssembly
- Mobile apps (iOS via Swift bindings, Android via Kotlin bindings)
- Server (.NET via P/Invoke)
- Desktop apps (future)

Currently implements:
- **VaultMergeService** - Merges two SQLite vault databases using Last-Write-Wins (LWW) strategy

See [rust-core/README.md](rust-core/README.md) for detailed documentation.

## identity-generator
TypeScript identity generator used by:
- Browser extension (React and custom Typescript)
- Mobile apps (React Native)

## password-generator
TypeScript password generator used by:
- Browser extension (React and custom Typescript)
- Mobile apps (React Native)

## models
TypeScript models that are auto-generated to platform-specific code:
- TypeScript (source of truth)
- C# (.NET)
- Swift (iOS)
- Kotlin (Android)

## vault-sql
TypeScript SQL utilities for vault database operations:
- Browser extension
- Mobile apps (React Native)