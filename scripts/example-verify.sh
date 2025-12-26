#!/bin/bash
# ==============================================================================
# example-verify.sh - Verifies that extension fixes resolved the issues
# ==============================================================================
# This script checks if the intentional issues in example/ have been fixed:
# - Version conflicts (http package)
# - SDK constraint mismatches
# - Outdated dependencies
#
# Usage: ./scripts/example-verify.sh
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXAMPLE_DIR="$PROJECT_ROOT/example"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🔍 Verifying extension fixes..."
echo ""

# Check example exists
if [ ! -d "$EXAMPLE_DIR" ]; then
  echo -e "${RED}❌ Example directory not found: $EXAMPLE_DIR${NC}"
  echo "   Run ./scripts/example-setup.sh first to create it."
  exit 1
fi

PASSED=0
FAILED=0
WARNINGS=0

# Function to check a test
check() {
  local name="$1"
  local result="$2"  # 0 = pass, 1 = fail, 2 = warning
  local message="$3"

  if [ "$result" -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $name"
    PASSED=$((PASSED + 1))
  elif [ "$result" -eq 2 ]; then
    echo -e "${YELLOW}⚠ WARN${NC}: $name"
    echo -e "         $message"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $name"
    echo -e "         $message"
    FAILED=$((FAILED + 1))
  fi
}

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} VERSION CONFLICT CHECKS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check 1: http version consistency
HTTP_VERSIONS=$(grep -h "http:" "$EXAMPLE_DIR"/apps/*/pubspec.yaml "$EXAMPLE_DIR"/packages/*/pubspec.yaml 2>/dev/null | grep -oE '\^[0-9]+\.[0-9]+\.[0-9]+' | sort -u)
HTTP_COUNT=$(echo "$HTTP_VERSIONS" | grep -c . || echo 0)

if [ "$HTTP_COUNT" -eq 1 ]; then
  check "http version consistency" 0 ""
  echo -e "         All packages use: $HTTP_VERSIONS"
elif [ "$HTTP_COUNT" -eq 0 ]; then
  check "http version consistency" 2 "No http dependency found (may have been removed)"
else
  check "http version consistency" 1 "Multiple versions found: $(echo $HTTP_VERSIONS | tr '\n' ' ')"
fi
echo ""

# Check 2: No major version conflicts (^0.x vs ^1.x)
HTTP_MAJOR_0=$(grep -h "http:" "$EXAMPLE_DIR"/apps/*/pubspec.yaml "$EXAMPLE_DIR"/packages/*/pubspec.yaml 2>/dev/null | grep -c '\^0\.' || echo 0)
HTTP_MAJOR_1=$(grep -h "http:" "$EXAMPLE_DIR"/apps/*/pubspec.yaml "$EXAMPLE_DIR"/packages/*/pubspec.yaml 2>/dev/null | grep -c '\^1\.' || echo 0)

if [ "$HTTP_MAJOR_0" -gt 0 ] && [ "$HTTP_MAJOR_1" -gt 0 ]; then
  check "No major http version conflict" 1 "Both ^0.x and ^1.x versions present"
else
  check "No major http version conflict" 0 ""
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} SDK CONSTRAINT CHECKS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check 3: SDK constraints consistency
SDK_CONSTRAINTS=$(grep -h "sdk:" "$EXAMPLE_DIR"/pubspec.yaml "$EXAMPLE_DIR"/apps/*/pubspec.yaml "$EXAMPLE_DIR"/packages/*/pubspec.yaml 2>/dev/null | grep -oE ">=3\.[0-9]+" | sort -u)
SDK_COUNT=$(echo "$SDK_CONSTRAINTS" | grep -c . || echo 0)

if [ "$SDK_COUNT" -eq 1 ]; then
  check "SDK constraint consistency" 0 ""
  echo -e "         All packages use: $SDK_CONSTRAINTS"
elif [ "$SDK_COUNT" -eq 0 ]; then
  check "SDK constraint consistency" 2 "Could not parse SDK constraints"
else
  check "SDK constraint consistency" 1 "Multiple SDK versions: $(echo $SDK_CONSTRAINTS | tr '\n' ' ')"
fi
echo ""

# Check 4: Core package SDK >= 3.6.0
CORE_SDK=$(grep -A1 "environment:" "$EXAMPLE_DIR/packages/core/pubspec.yaml" 2>/dev/null | grep "sdk:" | grep -oE ">=3\.[0-9]+" || echo "")
if [[ "$CORE_SDK" == ">=3.6" ]] || [[ "$CORE_SDK" == ">=3.7" ]] || [[ "$CORE_SDK" == ">=3.8" ]]; then
  check "Core package SDK >= 3.6.0" 0 ""
else
  check "Core package SDK >= 3.6.0" 1 "Core SDK is $CORE_SDK (should be >=3.6.0)"
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} DEPENDENCY FRESHNESS CHECKS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check 5: json_annotation version
JSON_VERSION=$(grep "json_annotation:" "$EXAMPLE_DIR/packages/shared_models/pubspec.yaml" 2>/dev/null | grep -oE '\^[0-9]+\.[0-9]+\.[0-9]+' || echo "")
if [[ "$JSON_VERSION" == "^4.9"* ]] || [[ "$JSON_VERSION" == "^4.8"* ]]; then
  check "json_annotation is recent" 0 ""
  echo -e "         Version: $JSON_VERSION"
elif [ -z "$JSON_VERSION" ]; then
  check "json_annotation is recent" 2 "Dependency not found or removed"
else
  check "json_annotation is recent" 1 "Outdated version: $JSON_VERSION (should be ^4.8.0+)"
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} PUB RESOLUTION CHECK${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check 6: Can run pub get without errors
cd "$EXAMPLE_DIR"
if flutter pub get --dry-run > /dev/null 2>&1; then
  check "flutter pub get (dry run)" 0 ""
else
  check "flutter pub get (dry run)" 1 "Dependency resolution would fail"
fi
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} VERIFICATION SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

TOTAL=$((PASSED + FAILED + WARNINGS))
echo "Results: $PASSED passed, $FAILED failed, $WARNINGS warnings (of $TOTAL checks)"
echo ""

if [ "$FAILED" -eq 0 ]; then
  if [ "$WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}🎉 All issues fixed! The extension worked correctly.${NC}"
    exit 0
  else
    echo -e "${YELLOW}⚠️  Issues mostly fixed, but there are warnings to review.${NC}"
    exit 0
  fi
else
  echo -e "${RED}❌ $FAILED issue(s) remaining. The extension needs more work.${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Check the extension output for errors"
  echo "  2. Try using 'Sync All Versions' or 'Fix Conflict' commands"
  echo "  3. Run ./scripts/example-compare.sh to see what changed"
  exit 1
fi
