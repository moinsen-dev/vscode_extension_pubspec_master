# Pubspec Master - Release Plan for v1.0

**Goal:** Create an outstanding, flagship VS Code extension that serves as a marketing showcase for Moinsen Dev's commercial products.

**Quality Bar:** Every feature must be polished, intuitive, and delightful to use. No half-implementations.

---

## Current State Assessment

### What's COMPLETE (Production-Ready)

| Feature | Status | Quality |
|---------|--------|---------|
| Workspace Scanning | ✅ Complete | High - deduplication, symlink handling |
| Tree View Dashboard | ✅ Complete | High - expand/collapse, context menus |
| Webview Dashboard | ✅ Complete | High - statistics, issues, actions |
| Dependency Graph | ✅ Complete | High - interactive, physics-based |
| Version Conflict Detection | ✅ Complete | High - accurate, with suggestions |
| SDK Mismatch Detection | ✅ Complete | High - with fix capabilities |
| Problems Panel Integration | ✅ Complete | High - inline diagnostics |
| Version Sync Service | ✅ Complete | High - backup/restore, atomic writes |
| pub.dev API Integration | ✅ Complete | High - caching, offline mode |
| Terminal Output | ✅ Complete | High - real-time feedback |
| Flutter Analyze Integration | ✅ Complete | High - with issue reporting |

### What's MISSING (Must Complete for 1.0)

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| Migration Wizard | P0 | 3-4 days | **Critical** - Core differentiation |
| Outdated Package UI | P0 | 1 day | High - Expected feature |
| Graph Export (PNG/SVG) | P1 | 0.5 day | Medium - Documentation use |
| Keyboard Shortcuts | P1 | 0.5 day | Medium - Power users |
| .pubspec-master.json Config | P2 | 1 day | Medium - Team workflows |
| Status Bar Indicator | P2 | 0.5 day | Low - Quick visibility |

---

## Phase 1: Migration Wizard (3-4 days) - CRITICAL

The Migration Wizard is the **#1 differentiator** from competitors. It must be exceptional.

### 1.1 Architecture

```
src/webview/wizard/
├── MigrationWizard.ts       # Panel controller
├── wizardView.html          # Multi-step UI
├── wizard.css               # Styling
└── wizard.ts                # Client-side logic

src/migration/
├── MigrationService.ts      # Core migration logic
├── PubWorkspacesMigrator.ts # Pub Workspaces migration
├── MelosDetector.ts         # Detect existing Melos
└── MigrationValidator.ts    # Pre/post validation
```

### 1.2 Wizard Steps (5-step flow)

**Step 1: Analysis**
- Scan workspace structure
- Detect current state (standalone/workspace/melos)
- Show package count and dependency summary
- Estimate migration complexity

**Step 2: Target Selection**
- Option A: Pub Workspaces (Recommended for Dart 3.6+)
- Option B: Pub Workspaces + Melos (Advanced)
- Option C: Keep Current (with explanation)
- Show comparison table of features

**Step 3: Preview Changes**
- Interactive diff view for each file
- Root pubspec.yaml creation preview
- Package pubspec.yaml modifications
- Expandable/collapsible sections

**Step 4: Backup & Confirm**
- Create timestamped backup
- Show backup location
- Confirm action with summary
- Progress indicator during backup

**Step 5: Apply & Verify**
- Apply changes with progress
- Run `dart pub get` at root
- Validate lockfile creation
- Show success/failure summary
- Quick rollback button if needed

### 1.3 UI Requirements

- Stepper navigation (1 → 2 → 3 → 4 → 5)
- Back button on each step
- Cancel button with confirmation
- Progress indicators
- Error states with recovery options
- VS Code theme integration

### 1.4 Edge Cases

- [ ] Handle existing Melos configuration
- [ ] Handle partial previous migration
- [ ] Handle symlinked packages
- [ ] Handle packages outside workspace
- [ ] Handle very deep nesting (>10 levels)
- [ ] Handle SDK version incompatibility

---

## Phase 2: Outdated Package Detection (1 day)

### 2.1 Implementation

**File: `src/core/VersionAnalyzer.ts`**
```typescript
interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  latestCompatible: string;
  usedIn: string[];
  securityAdvisory?: boolean;
}
```

**Changes:**
1. Add `findOutdated()` method using existing PubDevClient
2. Integrate into `analyze()` result
3. Return array of outdated packages with details

### 2.2 Dashboard UI

**Add new section:**
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ OUTDATED PACKAGES (3)                                │
├─────────────────────────────────────────────────────────┤
│ provider                                                │
│ 6.0.5 → 6.1.7 (in: app, shared)         [Upgrade All] │
│                                                         │
│ http                                                    │
│ 0.13.6 → 1.2.0 (in: api_client)         [Upgrade]     │
│ ⚠️ Breaking changes                                     │
│                                                         │
│ intl                                                    │
│ 0.18.0 → 0.19.0 (in: core)              [Upgrade]     │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Features

- [ ] Show current vs latest version
- [ ] Indicate breaking changes (major version bump)
- [ ] Show which packages use each dependency
- [ ] One-click upgrade for individual deps
- [ ] Upgrade all compatible versions
- [ ] Link to changelog on pub.dev

---

## Phase 3: Graph Export (0.5 day)

### 3.1 Implementation

**Add to GraphPanel.ts:**
- Export to PNG (canvas to blob)
- Export to SVG (DOM serialization)
- Export with current view settings
- Include legend in export

### 3.2 UI

- Add "Export" button to graph toolbar
- Show format selection (PNG/SVG)
- Custom filename option
- Quality/resolution settings for PNG

---

## Phase 4: Keyboard Shortcuts (0.5 day)

### 4.1 Shortcuts to Add

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| Show Dashboard | `Ctrl+Shift+P` then type | `Cmd+Shift+P` then type |
| Refresh | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| Show Graph | - | - |
| Next Issue | `Ctrl+J` | `Cmd+J` |
| Previous Issue | `Ctrl+K` | `Cmd+K` |

### 4.2 Implementation

- Add keybindings to package.json
- Document in README
- Show in command palette

---

## Phase 5: Workspace Config File (1 day)

### 5.1 Schema

**File: `.pubspec-master.json`**
```json
{
  "$schema": "https://pubspec-master.dev/schema/v1.json",
  "version": 1,
  "ignore": {
    "packages": ["legacy_app"],
    "dependencies": ["dev_dependency_x"]
  },
  "sync": {
    "strategy": "latest-compatible",
    "pinVersions": false
  },
  "graph": {
    "groups": [
      { "name": "Core", "packages": ["core", "shared"] },
      { "name": "Features", "pattern": "feature_*" }
    ]
  }
}
```

### 5.2 Implementation

- Create ConfigParser service
- Validate against JSON schema
- Apply settings to all operations
- Generate sample file command

---

## Phase 6: Polish & Documentation (1 day)

### 6.1 README.md

**Structure:**
1. Hero banner with animated GIF
2. Quick start (30 seconds to value)
3. Features with screenshots
4. Installation
5. Usage guide
6. Configuration reference
7. Troubleshooting
8. Contributing
9. License

### 6.2 Demo GIF

Create animated GIF showing:
1. Extension activation
2. Dashboard overview
3. Conflict detection & fix
4. Dependency graph navigation
5. Migration wizard (if complete)

### 6.3 Marketplace Assets

- [ ] Icon (512x512 PNG)
- [ ] Banner (1280x640 PNG)
- [ ] Gallery images (5-7 screenshots)
- [ ] Tags and categories

### 6.4 CHANGELOG.md

Document all features for v1.0.

### 6.5 PRIVACY.md

As specified in PRD section 6.8.

---

## Phase 7: Testing & Quality (1 day)

### 7.1 Test Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| PubspecParser | 95% | ~90% |
| WorkspaceScanner | 90% | ~80% |
| DependencyResolver | 90% | ~80% |
| VersionAnalyzer | 95% | ~85% |
| MigrationService | 95% | 0% |

### 7.2 E2E Test Scenarios

- [ ] Fresh install on monorepo
- [ ] Conflict detection and fix
- [ ] Migration wizard flow
- [ ] Offline mode behavior
- [ ] Large monorepo (50+ packages)

### 7.3 Performance Benchmarks

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Initial scan (10 packages) | <500ms | Profile |
| Initial scan (50 packages) | <2s | Profile |
| Graph render (50 nodes) | <100ms | Frame timing |
| Dashboard refresh | <200ms | Profile |

---

## Timeline Summary

| Phase | Duration | Features |
|-------|----------|----------|
| Phase 1 | 3-4 days | Migration Wizard |
| Phase 2 | 1 day | Outdated Package Detection |
| Phase 3 | 0.5 day | Graph Export |
| Phase 4 | 0.5 day | Keyboard Shortcuts |
| Phase 5 | 1 day | Workspace Config |
| Phase 6 | 1 day | Polish & Documentation |
| Phase 7 | 1 day | Testing & Quality |
| **Total** | **8-9 days** | **Full MVP** |

---

## Release Checklist

### Pre-Release
- [ ] All P0 features complete
- [ ] All P1 features complete
- [ ] Unit test coverage >85%
- [ ] E2E tests passing
- [ ] Performance benchmarks met
- [ ] No console errors in production
- [ ] README.md complete with GIFs
- [ ] CHANGELOG.md complete
- [ ] PRIVACY.md complete

### Marketplace Submission
- [ ] Icon and banner uploaded
- [ ] Gallery screenshots uploaded
- [ ] Description optimized for search
- [ ] Keywords and categories set
- [ ] Publisher verified
- [ ] Version 1.0.0 tagged

### Post-Release
- [ ] Monitor GitHub issues
- [ ] Respond to reviews
- [ ] Track installation metrics
- [ ] Plan 1.1 features

---

## Success Criteria

**For Marketing Showcase:**

1. **Installs**: 1,000+ in first month
2. **Rating**: 4.5+ stars
3. **GitHub Stars**: 100+ in first month
4. **Reviews**: "Best monorepo tool for Flutter"
5. **Word of mouth**: Mentioned in Flutter communities

**Quality Indicators:**

- Zero critical bugs reported
- <5 minutes to first value for new users
- Positive feedback on Migration Wizard
- Users sharing screenshots of dependency graph

---

*Last Updated: December 21, 2025*
