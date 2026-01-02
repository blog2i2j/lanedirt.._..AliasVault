#!/bin/bash

# Build Rust Core for iOS and output static libraries
# This script is designed to be called from Xcode build phases
#
# Usage:
#   ./build-rust-core.sh [--force] [--release]
#
# Options:
#   --force    Force rebuild even if sources haven't changed
#   --release  Build release configuration (default for non-Debug builds)

set -e

# Ensure cargo is in PATH (for Xcode build phases)
export PATH="$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

# Colors for output (only if terminal supports it)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Script location and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_CORE_DIR="$(cd "$IOS_DIR/../../../core/rust" && pwd)"

# Output directories - separate device and simulator libraries
RUST_CORE_OUTPUT="$IOS_DIR/VaultStoreKit/RustCore"
DEVICE_LIB_OUTPUT="$RUST_CORE_OUTPUT/lib/device"
SIMULATOR_LIB_OUTPUT="$RUST_CORE_OUTPUT/lib/simulator"
HEADERS_OUTPUT="$RUST_CORE_OUTPUT/include"
SWIFT_BINDINGS_OUTPUT="$RUST_CORE_OUTPUT/Generated"

# Parse arguments
FORCE_BUILD=false
BUILD_RELEASE=true

# Check Xcode environment for configuration
if [ "${CONFIGURATION:-}" = "Debug" ]; then
    BUILD_RELEASE=false
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_BUILD=true
            shift
            ;;
        --release)
            BUILD_RELEASE=true
            shift
            ;;
        --debug)
            BUILD_RELEASE=false
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Building Rust Core for iOS${NC}"
echo -e "${BLUE}========================================${NC}"

# Check for Rust toolchain
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed${NC}"
    echo "Install Rust from https://rustup.rs"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Cargo is not installed${NC}"
    exit 1
fi

# Check if rebuild is needed
CHECKSUM_FILE="$RUST_CORE_OUTPUT/.rust-core-checksum"
CURRENT_CHECKSUM=""

if [ -d "$RUST_CORE_DIR/src" ]; then
    # Calculate checksum of Rust source files and Cargo.toml
    CURRENT_CHECKSUM=$(find "$RUST_CORE_DIR/src" -name "*.rs" -type f -exec md5 -q {} \; 2>/dev/null | md5 -q || echo "unknown")
fi

if [ "$FORCE_BUILD" = false ] && [ -f "$CHECKSUM_FILE" ] && [ -f "$DEVICE_LIB_OUTPUT/libaliasvault_core.a" ]; then
    STORED_CHECKSUM=$(cat "$CHECKSUM_FILE" 2>/dev/null || echo "")
    if [ "$CURRENT_CHECKSUM" = "$STORED_CHECKSUM" ]; then
        echo -e "${GREEN}Rust Core is up to date, skipping build${NC}"
        exit 0
    fi
fi

echo -e "${YELLOW}Rust source changed, rebuilding...${NC}"

# Determine build profile
if [ "$BUILD_RELEASE" = true ]; then
    CARGO_FLAGS="--release"
    CARGO_PROFILE="release"
    echo -e "  Build mode: ${GREEN}Release${NC}"
else
    CARGO_FLAGS=""
    CARGO_PROFILE="debug"
    echo -e "  Build mode: ${YELLOW}Debug${NC}"
fi

cd "$RUST_CORE_DIR"

# Ensure iOS targets are installed
echo -e "${YELLOW}Checking iOS build targets...${NC}"
for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
    if ! rustup target list --installed 2>/dev/null | grep -q "$target"; then
        echo -e "  Installing $target..."
        rustup target add "$target"
    fi
done

# Create output directories
mkdir -p "$DEVICE_LIB_OUTPUT" "$SIMULATOR_LIB_OUTPUT" "$HEADERS_OUTPUT" "$SWIFT_BINDINGS_OUTPUT"

# Create temp directory for intermediate files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Build for iOS device (arm64)
echo -e "${YELLOW}Building for iOS device (aarch64-apple-ios)...${NC}"
cargo build $CARGO_FLAGS --target aarch64-apple-ios --features uniffi

# Build for iOS simulator (arm64 - Apple Silicon)
echo -e "${YELLOW}Building for iOS simulator arm64...${NC}"
cargo build $CARGO_FLAGS --target aarch64-apple-ios-sim --features uniffi

# Build for iOS simulator (x86_64 - Intel Macs)
echo -e "${YELLOW}Building for iOS simulator x86_64...${NC}"
cargo build $CARGO_FLAGS --target x86_64-apple-ios --features uniffi

# Copy device library
cp "target/aarch64-apple-ios/$CARGO_PROFILE/libaliasvault_core.a" "$DEVICE_LIB_OUTPUT/"

# Create universal simulator library
echo -e "${YELLOW}Creating universal simulator library...${NC}"
lipo -create \
    "target/aarch64-apple-ios-sim/$CARGO_PROFILE/libaliasvault_core.a" \
    "target/x86_64-apple-ios/$CARGO_PROFILE/libaliasvault_core.a" \
    -output "$SIMULATOR_LIB_OUTPUT/libaliasvault_core.a"

# Strip debug symbols in release mode
if [ "$BUILD_RELEASE" = true ]; then
    echo -e "${YELLOW}Stripping debug symbols...${NC}"
    strip -S "$DEVICE_LIB_OUTPUT/libaliasvault_core.a" 2>/dev/null || true
    strip -S "$SIMULATOR_LIB_OUTPUT/libaliasvault_core.a" 2>/dev/null || true
fi

# Generate Swift bindings
echo -e "${YELLOW}Generating Swift bindings...${NC}"
cargo run $CARGO_FLAGS --features uniffi-cli --bin uniffi-bindgen -- generate \
    --library "target/aarch64-apple-ios/$CARGO_PROFILE/libaliasvault_core.a" \
    --language swift \
    --out-dir "$TEMP_DIR"

# Copy headers
cp "$TEMP_DIR/aliasvault_coreFFI.h" "$HEADERS_OUTPUT/"

# Create module.modulemap for the C header
# Note: Module name must match what UniFFI generates in Swift: aliasvault_coreFFI
cat > "$HEADERS_OUTPUT/module.modulemap" << 'EOF'
module aliasvault_coreFFI {
    header "aliasvault_coreFFI.h"
    export *
}
EOF

# Copy Swift bindings
cp "$TEMP_DIR/aliasvault_core.swift" "$SWIFT_BINDINGS_OUTPUT/"

echo -e "${GREEN}Swift bindings copied to: $SWIFT_BINDINGS_OUTPUT${NC}"

# Store checksum for incremental builds
echo "$CURRENT_CHECKSUM" > "$CHECKSUM_FILE"

# Show sizes
DEVICE_SIZE=$(ls -lh "$DEVICE_LIB_OUTPUT/libaliasvault_core.a" 2>/dev/null | awk '{print $5}' || echo "N/A")
SIM_SIZE=$(ls -lh "$SIMULATOR_LIB_OUTPUT/libaliasvault_core.a" 2>/dev/null | awk '{print $5}' || echo "N/A")

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  Device library: ${YELLOW}$DEVICE_SIZE${NC}"
echo -e "  Simulator library: ${YELLOW}$SIM_SIZE${NC}"
echo -e "  Output: ${YELLOW}$RUST_CORE_OUTPUT${NC}"
echo ""
