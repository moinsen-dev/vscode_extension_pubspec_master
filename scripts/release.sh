#!/bin/bash

# Moinsen Pubspec Master - Release Script
# Bumps minor version, builds VSIX package, and installs to VS Code

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Moinsen Pubspec Master - Release Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version:${NC} $CURRENT_VERSION"

# Step 2: Calculate new minor version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_MINOR=$((MINOR + 1))
NEW_VERSION="${MAJOR}.${NEW_MINOR}.0"
echo -e "${GREEN}New version:${NC} $NEW_VERSION"
echo ""

# Step 3: Update package.json version
echo -e "${BLUE}[1/6]${NC} Updating package.json version..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo -e "${GREEN}  ✓${NC} Updated to version $NEW_VERSION"

# Step 4: Run tests
echo -e "${BLUE}[2/6]${NC} Running unit tests..."
if npm run test:unit > /dev/null 2>&1; then
    TEST_COUNT=$(npm run test:unit 2>&1 | grep -oE '[0-9]+ passing' | head -1)
    echo -e "${GREEN}  ✓${NC} All tests passed ($TEST_COUNT)"
else
    echo -e "${RED}  ✗${NC} Tests failed! Aborting release."
    # Revert version change
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$CURRENT_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    exit 1
fi

# Step 5: Run lint
echo -e "${BLUE}[3/6]${NC} Running lint check..."
if npm run lint > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓${NC} Lint check passed"
else
    echo -e "${RED}  ✗${NC} Lint check failed! Aborting release."
    # Revert version change
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$CURRENT_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    exit 1
fi

# Step 6: Build the extension
echo -e "${BLUE}[4/6]${NC} Building extension..."
if npm run compile > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓${NC} Build successful"
else
    echo -e "${RED}  ✗${NC} Build failed! Aborting release."
    # Revert version change
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$CURRENT_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    exit 1
fi

# Step 7: Package the extension
echo -e "${BLUE}[5/6]${NC} Creating VSIX package..."
VSIX_FILE="pubspec-master-${NEW_VERSION}.vsix"

# Remove old vsix files
rm -f *.vsix

if npx vsce package > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓${NC} Created $VSIX_FILE"
else
    echo -e "${RED}  ✗${NC} Package creation failed! Aborting release."
    # Revert version change
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$CURRENT_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    exit 1
fi

# Step 8: Install to VS Code
echo -e "${BLUE}[6/6]${NC} Installing to VS Code..."
if code --install-extension "$VSIX_FILE" --force > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓${NC} Installed to VS Code"
else
    echo -e "${YELLOW}  ⚠${NC} Could not install automatically. Install manually with:"
    echo -e "     code --install-extension $VSIX_FILE"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Release v${NEW_VERSION} complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  1. Reload VS Code window (Cmd+Shift+P → 'Reload Window')"
echo -e "  2. Test the extension"
echo -e "  3. Commit changes: git add -A && git commit -m 'chore: release v${NEW_VERSION}'"
echo ""
