#!/usr/bin/env bash

# Get the absolute path to the script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# ------------------------------------------
# Build core libraries if needed
# ------------------------------------------

CORE_DIR="$SCRIPT_DIR/../../../core"
MOBILE_CORE_DIST="$SCRIPT_DIR/../utils/dist/core"

if [ ! -d "$MOBILE_CORE_DIST/models" ] || [ ! -d "$MOBILE_CORE_DIST/vault" ]; then
  echo "Building core libraries..."
  pushd "$CORE_DIR" > /dev/null
  chmod +x build-and-distribute.sh
  ./build-and-distribute.sh
  popd > /dev/null
  echo "Core libraries built successfully"
fi

# ------------------------------------------
# Build Android app in release mode
# ------------------------------------------

echo "Build type:"
echo "  1) AAB - Android App Bundle (default, for Play Store upload)"
echo "  2) APK - Android Package (for direct installation)"
read -r -p "Enter choice [1/2, default=1]: " BUILD_CHOICE

case "$BUILD_CHOICE" in
  2)
    BUILD_TASK="assembleRelease"
    OUTPUT_DIR="$SCRIPT_DIR/app/build/outputs/apk/release"
    ;;
  *)
    BUILD_TASK="bundleRelease"
    OUTPUT_DIR="$SCRIPT_DIR/app/build/outputs/bundle/release"
    ;;
esac

VERSION=$(grep 'versionName' "$SCRIPT_DIR/app/build.gradle" | sed 's/.*versionName[[:space:]]*"\(.*\)".*/\1/')

pushd "$SCRIPT_DIR" > /dev/null
./gradlew "$BUILD_TASK"
popd > /dev/null

# Rename output file to include version number
if [ "$BUILD_TASK" = "assembleRelease" ]; then
  ORIGINAL="$OUTPUT_DIR/app-release.apk"
  RENAMED="$OUTPUT_DIR/aliasvault-${VERSION}-android.apk"
  if [ -f "$ORIGINAL" ]; then
    mv "$ORIGINAL" "$RENAMED"
  fi
fi

# Open directory that should contain the build output if build was successful
open "$OUTPUT_DIR"
