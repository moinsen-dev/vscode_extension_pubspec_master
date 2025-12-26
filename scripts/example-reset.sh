#!/bin/bash
# ==============================================================================
# example-reset.sh - Resets example/ pubspecs to baseline state
# ==============================================================================
# This script copies baseline pubspec.yaml files back to example/, restoring
# the intentional issues for re-testing the extension.
#
# Usage: ./scripts/example-reset.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BASELINE_DIR="$PROJECT_ROOT/example-baseline"
EXAMPLE_DIR="$PROJECT_ROOT/example"

echo "🔄 Resetting example/ to baseline state..."
echo ""

# Check directories exist
if [ ! -d "$BASELINE_DIR" ]; then
  echo "❌ Baseline directory not found: $BASELINE_DIR"
  exit 1
fi

if [ ! -d "$EXAMPLE_DIR" ]; then
  echo "❌ Example directory not found: $EXAMPLE_DIR"
  echo "   Run ./scripts/example-setup.sh first to create it."
  exit 1
fi

# Copy root config files
echo "📋 Restoring root config files..."
cp "$BASELINE_DIR/pubspec.yaml" "$EXAMPLE_DIR/"
cp "$BASELINE_DIR/.pubspec-master.json" "$EXAMPLE_DIR/"

# Copy app pubspecs
echo "📱 Restoring app pubspecs..."
cp "$BASELINE_DIR/apps/shop_app/pubspec.yaml" "$EXAMPLE_DIR/apps/shop_app/"
cp "$BASELINE_DIR/apps/admin_app/pubspec.yaml" "$EXAMPLE_DIR/apps/admin_app/"

# Copy package pubspecs
echo "📦 Restoring package pubspecs..."
for pkg in core ui_kit api_client shared_models; do
  cp "$BASELINE_DIR/packages/$pkg/pubspec.yaml" "$EXAMPLE_DIR/packages/$pkg/"
done

# Clean up lock files and .dart_tool
echo "🧹 Cleaning up generated files..."
find "$EXAMPLE_DIR" -name "pubspec.lock" -delete 2>/dev/null || true
find "$EXAMPLE_DIR" -name ".dart_tool" -type d -exec rm -rf {} + 2>/dev/null || true
find "$EXAMPLE_DIR" -name ".pubspec-master-backup" -type d -exec rm -rf {} + 2>/dev/null || true

echo ""
echo "✅ Reset complete! Example folder has intentional issues again."
echo ""
echo "📊 Restored issues:"
echo "   • shop_app: http ^1.0.0"
echo "   • admin_app: http ^1.2.0 (version conflict)"
echo "   • api_client: http ^0.13.0 (MAJOR version conflict!)"
echo "   • core: SDK >=3.4.0 (mismatch with root >=3.6.0)"
echo "   • shared_models: outdated json_annotation ^4.7.0"
echo ""
echo "🔧 Ready for another round of testing!"
echo ""
