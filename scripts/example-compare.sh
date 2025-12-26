#!/bin/bash
# ==============================================================================
# example-compare.sh - Shows differences between example/ and baseline
# ==============================================================================
# This script compares pubspec.yaml files in example/ against the baseline
# to show what the extension (or manual edits) changed.
#
# Usage: ./scripts/example-compare.sh
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BASELINE_DIR="$PROJECT_ROOT/example-baseline"
EXAMPLE_DIR="$PROJECT_ROOT/example"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "📊 Comparing example/ vs baseline..."
echo ""

# Check directories exist
if [ ! -d "$BASELINE_DIR" ]; then
  echo -e "${RED}❌ Baseline directory not found: $BASELINE_DIR${NC}"
  exit 1
fi

if [ ! -d "$EXAMPLE_DIR" ]; then
  echo -e "${RED}❌ Example directory not found: $EXAMPLE_DIR${NC}"
  echo "   Run ./scripts/example-setup.sh first to create it."
  exit 1
fi

CHANGES=0
UNCHANGED=0

# Function to compare a pubspec file
compare_pubspec() {
  local name="$1"
  local baseline="$2"
  local example="$3"

  if [ ! -f "$example" ]; then
    echo -e "${RED}❌ Missing: $name${NC}"
    return
  fi

  if diff -q "$baseline" "$example" > /dev/null 2>&1; then
    echo -e "${YELLOW}○ Unchanged: $name${NC}"
    UNCHANGED=$((UNCHANGED + 1))
  else
    echo -e "${GREEN}● Changed: $name${NC}"
    CHANGES=$((CHANGES + 1))
    echo -e "${BLUE}   ─────────────────────────────────────${NC}"
    diff --color=always -u "$baseline" "$example" | tail -n +4 | head -30
    echo -e "${BLUE}   ─────────────────────────────────────${NC}"
    echo ""
  fi
}

# Compare root pubspec
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} ROOT CONFIGURATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
compare_pubspec "pubspec.yaml" "$BASELINE_DIR/pubspec.yaml" "$EXAMPLE_DIR/pubspec.yaml"
compare_pubspec ".pubspec-master.json" "$BASELINE_DIR/.pubspec-master.json" "$EXAMPLE_DIR/.pubspec-master.json"
echo ""

# Compare apps
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} APPS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
compare_pubspec "apps/shop_app" "$BASELINE_DIR/apps/shop_app/pubspec.yaml" "$EXAMPLE_DIR/apps/shop_app/pubspec.yaml"
compare_pubspec "apps/admin_app" "$BASELINE_DIR/apps/admin_app/pubspec.yaml" "$EXAMPLE_DIR/apps/admin_app/pubspec.yaml"
echo ""

# Compare packages
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} PACKAGES${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
for pkg in core ui_kit api_client shared_models; do
  compare_pubspec "packages/$pkg" "$BASELINE_DIR/packages/$pkg/pubspec.yaml" "$EXAMPLE_DIR/packages/$pkg/pubspec.yaml"
done
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
if [ $CHANGES -eq 0 ]; then
  echo -e "${YELLOW}No changes detected. Example matches baseline.${NC}"
  echo "The extension hasn't made any fixes yet."
else
  echo -e "${GREEN}$CHANGES file(s) changed${NC}, ${YELLOW}$UNCHANGED file(s) unchanged${NC}"
  echo ""
  echo "Run ./scripts/example-verify.sh to check if the changes fixed the issues."
fi
echo ""
