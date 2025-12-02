# Model Generation

This directory contains scripts for generating model files across multiple languages from a single source of truth.

## Overview

AliasVault is a multi-platform application with:
- **TypeScript** (Browser Extension & Mobile App)
- **C#/.NET** (WASM Client & Server)
- **Swift** (iOS native modules)
- **Kotlin** (Android native modules)

To maintain consistency and reduce duplication, we generate models from TypeScript sources.

## Current Implementation

### FieldKey Generation

The `scripts/generate-field-keys.cjs` script generates `FieldKey` constants from the TypeScript source.

**Source**: `src/vault/FieldKey.ts`

**Generated files**:
- **C#**: `apps/server/Databases/AliasClientDb/Models/FieldKey.cs`
- **Swift**: `apps/mobile-app/ios/AliasVault/VaultModels/FieldKey.swift`
- **Kotlin**: `apps/mobile-app/android/app/src/main/java/net/aliasvault/app/vaultstore/models/FieldKey.kt`

**Usage**:
```bash
# From repository root
npm run generate:models

# Or from shared/models directory
./build.sh  # Runs build + generation automatically

# Or run directly
node scripts/generate-field-keys.cjs
```

### Naming Conventions

The generator automatically applies platform-specific naming conventions:

| TypeScript       | C#               | Swift            | Kotlin              |
|------------------|------------------|------------------|---------------------|
| `LoginUsername`  | `LoginUsername`  | `loginUsername`  | `LOGIN_USERNAME`    |
| `CardNumber`     | `CardNumber`     | `cardNumber`     | `CARD_NUMBER`       |
| `AliasEmail`     | `AliasEmail`     | `aliasEmail`     | `ALIAS_EMAIL`       |

- **TypeScript/C#**: PascalCase
- **Swift**: camelCase
- **Kotlin**: SCREAMING_SNAKE_CASE

## Future: Complex Models with quicktype

For complex DTOs that require serialization/deserialization (e.g., API models, database entities), we have `quicktype` installed and ready to use.

**quicktype** can generate:
- Full classes/structs with properties
- JSON serialization/deserialization
- Type-safe parsing
- Support for nullable types, enums, unions, etc.

### Example quicktype usage:

```bash
# From JSON Schema
npx quicktype schema.json -o Model.cs --lang csharp
npx quicktype schema.json -o Model.swift --lang swift
npx quicktype schema.json -o Model.kt --lang kotlin

# From TypeScript
npx quicktype source.ts -o Model.cs --lang csharp --src-lang typescript

# From JSON sample
npx quicktype sample.json -o Model.cs --lang csharp
```

## Adding New Generators

When adding new model generators:

1. Create a new script in `shared/models/scripts/generate-{model-name}.cjs`
2. Follow the pattern from `generate-field-keys.cjs`
3. Add the generator call to `shared/models/build.sh`:
   ```bash
   node scripts/generate-{model-name}.cjs
   ```
4. The script will automatically run when:
   - Running `./build-and-distribute.sh` from the shared directory
   - Running `./build.sh` from `shared/models`
   - Running `npm run generate:models` from repository root
5. Document it here

## Guidelines

### When to use custom scripts (like `generate-field-keys.js`):
- Simple constants or enums
- String literals that map 1:1 across languages
- Cases where quicktype generates unnecessary complexity

### When to use quicktype:
- Complex DTOs with nested objects
- Models that need JSON serialization/deserialization
- API request/response models
- Database entities shared across platforms

## CI/CD Integration

Consider adding model generation to your CI pipeline to ensure generated files are always up-to-date:

```yaml
# Example GitHub Actions workflow
- name: Generate models
  run: npm run generate:models

- name: Check for changes
  run: git diff --exit-code || (echo "Generated models are out of sync!" && exit 1)
```

This ensures developers can't forget to regenerate models after changing source files.
