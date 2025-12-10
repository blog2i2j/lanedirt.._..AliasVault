#!/bin/bash

set -e  # Stop on error
set -u  # Treat unset variables as errors

# Make all build scripts executable
chmod +x ./identity-generator/build.sh
chmod +x ./password-generator/build.sh
chmod +x ./models/build.sh
chmod +x ./vault-sql/build.sh
chmod +x ./rust-core/build.sh

# Run all build scripts
echo "🚀 Starting build process for all modules..."
cd ./identity-generator
./build.sh

cd ../password-generator
./build.sh

cd ../models
./build.sh

cd ../vault-sql
./build.sh

# Rust core build (optional - requires Rust toolchain)
# Note: Browser extensions use TypeScript VaultMergeService with sql.js
# Rust core is for native platforms only (iOS, Android, .NET)
cd ../rust-core
if command -v rustc &> /dev/null; then
    echo "📦 Building rust-core (Rust toolchain detected)..."
    echo "   Note: Browser extension uses TypeScript implementation"
    ./build.sh --csharp  # Build for .NET by default on dev machines
else
    echo "⚠️  Skipping rust-core build (Rust not installed)"
    echo "   Install Rust from https://rustup.rs to enable Rust core builds"
fi

echo "✅ All builds completed successfully."
