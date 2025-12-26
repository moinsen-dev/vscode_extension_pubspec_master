#!/bin/bash
# ==============================================================================
# example-setup.sh - Creates the example/ workspace from baseline
# ==============================================================================
# This script:
# 1. Creates real Flutter apps and packages using `flutter create`
# 2. Overlays the baseline pubspec.yaml files with intentional issues
# 3. Runs `flutter pub get` to resolve dependencies (which will show conflicts)
#
# Usage: ./scripts/example-setup.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BASELINE_DIR="$PROJECT_ROOT/example-baseline"
EXAMPLE_DIR="$PROJECT_ROOT/example"

echo "🚀 Setting up example workspace..."
echo "   Project root: $PROJECT_ROOT"
echo "   Baseline: $BASELINE_DIR"
echo "   Example: $EXAMPLE_DIR"
echo ""

# Check if baseline exists
if [ ! -d "$BASELINE_DIR" ]; then
  echo "❌ Baseline directory not found: $BASELINE_DIR"
  echo "   Please ensure example-baseline/ exists with pubspec.yaml files."
  exit 1
fi

# Check if example already exists
if [ -d "$EXAMPLE_DIR" ]; then
  echo "⚠️  Example directory already exists."
  read -p "   Delete and recreate? (y/N): " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "   Aborting. Use example-reset.sh to reset existing workspace."
    exit 0
  fi
  echo "   Removing existing example/..."
  rm -rf "$EXAMPLE_DIR"
fi

# Create example directory structure
echo "📁 Creating directory structure..."
mkdir -p "$EXAMPLE_DIR/apps"
mkdir -p "$EXAMPLE_DIR/packages"

# Create Flutter apps
echo ""
echo "📱 Creating Flutter apps..."

cd "$EXAMPLE_DIR/apps"

echo "   Creating shop_app..."
flutter create shop_app \
  --org com.moinsen.example \
  --platforms=ios,android \
  --template=app \
  --description="Shop application for e-commerce" \
  --quiet

echo "   Creating admin_app..."
flutter create admin_app \
  --org com.moinsen.example \
  --platforms=ios,android \
  --template=app \
  --description="Admin application for back-office" \
  --quiet

# Create Dart packages
echo ""
echo "📦 Creating Dart packages..."

cd "$EXAMPLE_DIR/packages"

echo "   Creating core..."
flutter create core \
  --template=package \
  --description="Core business logic and utilities" \
  --quiet

echo "   Creating ui_kit..."
flutter create ui_kit \
  --template=package \
  --org com.moinsen.example \
  --description="Shared UI components and design system" \
  --quiet

echo "   Creating api_client..."
flutter create api_client \
  --template=package \
  --description="HTTP client for API communication" \
  --quiet

echo "   Creating shared_models..."
flutter create shared_models \
  --template=package \
  --description="Shared data models and DTOs" \
  --quiet

# Overlay baseline pubspec files
echo ""
echo "📋 Overlaying baseline pubspec files (with intentional issues)..."

cd "$PROJECT_ROOT"

# Copy root config files
cp "$BASELINE_DIR/pubspec.yaml" "$EXAMPLE_DIR/"
cp "$BASELINE_DIR/.pubspec-master.json" "$EXAMPLE_DIR/"

# Copy app pubspecs
cp "$BASELINE_DIR/apps/shop_app/pubspec.yaml" "$EXAMPLE_DIR/apps/shop_app/"
cp "$BASELINE_DIR/apps/admin_app/pubspec.yaml" "$EXAMPLE_DIR/apps/admin_app/"

# Copy package pubspecs
for pkg in core ui_kit api_client shared_models; do
  cp "$BASELINE_DIR/packages/$pkg/pubspec.yaml" "$EXAMPLE_DIR/packages/$pkg/"
done

echo ""
echo "✅ Example workspace created with intentional issues!"
echo ""
echo "📊 Intentional issues seeded:"
echo "   • shop_app: http ^1.0.0"
echo "   • admin_app: http ^1.2.0 (version conflict)"
echo "   • api_client: http ^0.13.0 (MAJOR version conflict!)"
echo "   • core: SDK >=3.4.0 (mismatch with root >=3.6.0)"
echo "   • shared_models: outdated json_annotation ^4.7.0"
echo ""
echo "🔧 Next steps:"
echo "   1. Open example/ folder in VS Code"
echo "   2. The Pubspec Master extension should detect issues"
echo "   3. Use extension to fix conflicts"
echo "   4. Run: ./scripts/example-compare.sh to see changes"
echo "   5. Run: ./scripts/example-verify.sh to check if fixes worked"
echo "   6. Run: ./scripts/example-reset.sh to start over"
echo ""
