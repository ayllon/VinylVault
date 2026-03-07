#!/bin/bash
# Update version numbers in Tauri app for CI builds
# Usage: ./update-version.sh [BUILD_ID]
# BUILD_ID format: YY * 1000 + day_of_year (e.g., 26066 for day 66 of 2026)
# Example: ./update-version.sh 26066 -> results in version like 0.1.26066

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_CONF="$PROJECT_ROOT/app/src-tauri/tauri.conf.json"
CARGO_TOML="$PROJECT_ROOT/app/src-tauri/Cargo.toml"
PACKAGE_JSON="$PROJECT_ROOT/app/package.json"

# Get the base version from tauri.conf.json
BASE_VERSION=$(grep '"version"' "$TAURI_CONF" | head -1 | cut -d'"' -f4)

if [ $# -eq 0 ]; then
    # No suffix provided, just display current version
    echo "Current version: $BASE_VERSION"
    exit 0
fi

BUILD_SUFFIX="$1"

# Extract MAJOR.MINOR from base version and use BUILD_SUFFIX as patch
if [[ $BASE_VERSION =~ ^([0-9]+)\.([0-9]+)\. ]]; then
    MAJOR="${BASH_REMATCH[1]}"
    MINOR="${BASH_REMATCH[2]}"
    NEW_VERSION="${MAJOR}.${MINOR}.${BUILD_SUFFIX}"
else
    echo "Error: Could not parse base version $BASE_VERSION"
    exit 1
fi

echo "Updating version from $BASE_VERSION to $NEW_VERSION"

# Update tauri.conf.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed requires empty string after -i
    sed -i '' "s/\"version\": \"$BASE_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$TAURI_CONF"
else
    sed -i "s/\"version\": \"$BASE_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$TAURI_CONF"
fi

# Update Cargo.toml
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^version = \"$BASE_VERSION\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"
else
    sed -i "s/^version = \"$BASE_VERSION\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"
fi

# Update package.json (though it's less critical)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
fi

echo "✓ Version updated to $NEW_VERSION in:"
echo "  - $TAURI_CONF"
echo "  - $CARGO_TOML"
echo "  - $PACKAGE_JSON"
