# Moinsen Pubspec Master - Product Requirements Document

**Version:** 1.0
**Date:** December 21, 2025
**Author:** Moinsen Dev
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [User Personas](#user-personas)
4. [User Stories](#user-stories)
5. [Feature Specifications](#feature-specifications)
6. [Technical Architecture](#technical-architecture)
   - 6.1-6.5 Core Architecture
   - 6.6 [Error Handling Strategy](#66-error-handling-strategy)
   - 6.7 [Configuration & Settings](#67-configuration--settings)
   - 6.8 [Telemetry & Privacy](#68-telemetry--privacy)
   - 6.9 [Testing Strategy](#69-testing-strategy)
   - 6.10 [Keyboard Shortcuts](#610-keyboard-shortcuts)
   - 6.11 [Localization](#611-localization)
   - 6.12 [Security Considerations](#612-security-considerations)
7. [UI/UX Design](#uiux-design)
8. [API Integrations](#api-integrations)
9. [Success Metrics](#success-metrics)
10. [Release Plan](#release-plan)
11. [Risks and Mitigations](#risks-and-mitigations)
12. [Appendix](#appendix)
13. [Moinsen Ecosystem](#moinsen-ecosystem)

---

## 1. Executive Summary

### Vision

**Moinsen Pubspec Master** is an open-source VS Code extension that revolutionizes Flutter/Dart monorepo management. It provides a unified dashboard, interactive dependency visualization, guided migration tools, and intelligent version synchronization—bringing the sophistication of JavaScript's Nx/Lerna ecosystem to Flutter developers.

> **Part of the Moinsen Ecosystem:** This extension integrates with [Moinsen Pub](https://moinsen.pub) for teams that need private package hosting, automated maintenance, and enterprise-grade dependency management.

### Key Value Propositions

| For | Value |
|-----|-------|
| **Solo Developers** | Save hours of manual pubspec.yaml coordination |
| **Teams** | Eliminate version drift and dependency conflicts |
| **Enterprise** | Standardize monorepo practices across projects |
| **Community** | Free, open-source tool that fills a critical gap |

### Scope

**In Scope (MVP):**
- Dashboard panel with workspace overview
- Interactive dependency graph
- Migration wizard (standalone → Pub Workspaces → Melos)
- Version synchronization engine

**Out of Scope (Future):**
- Cloud sync / team features
- Custom policy enforcement
- Multi-repository management
- Publishing automation

---

## 2. Problem Statement

### The Current Pain

Flutter/Dart developers managing monorepos face significant friction:

```
Pain Point                          Impact
─────────────────────────────────────────────────────────────────
Multiple pubspec.yaml files         Manual coordination overhead
No unified view                     Easy to miss version conflicts
Version drift                       Runtime errors, CI failures
Migration complexity                Hours of manual configuration
No dependency visualization         Hard to understand impact of changes
```

### Market Gap Analysis

| Capability | Pubspec Assist | Pub Manager | Melos | Version Lens | Pub Workspaces | **Moinsen Pubspec Master** |
|------------|:--------------:|:-----------:|:-----:|:------------:|:--------------:|:---------------------------:|
| Single file editing | ✅ | ✅ | - | - | - | ✅ |
| Monorepo awareness | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Visual dashboard | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Dependency graph | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Version sync | ❌ | ❌ | Partial | ❌ | ❌ | ✅ |
| Migration wizard | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| GUI for all features | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Private pkg hosting | ❌ | ❌ | ❌ | ❌ | ❌ | via Moinsen Pub |

**Conclusion:** No existing tool provides a comprehensive GUI-based monorepo management experience.

---

## 3. User Personas

### Persona 1: Solo Flutter Developer - "Alex"

**Background:**
- 3 years Flutter experience
- Maintains 2-3 personal apps with shared packages
- Works alone, values efficiency

**Goals:**
- Keep dependencies up to date with minimal effort
- Understand package relationships at a glance
- Migrate to Pub Workspaces without learning CLI tools

**Pain Points:**
- "I forget which packages need updating"
- "I don't understand how Melos works"
- "Running pub upgrade in 5 folders is tedious"

### Persona 2: Team Lead - "Jordan"

**Background:**
- 7 years development experience
- Leads team of 5 Flutter developers
- Manages enterprise monorepo with 15+ packages

**Goals:**
- Prevent version conflicts before they reach CI
- Onboard new developers quickly
- Standardize package management practices

**Pain Points:**
- "Different devs use different versions of shared dependencies"
- "PR reviews don't catch pubspec conflicts"
- "New hires struggle to understand our package structure"

### Persona 3: Open Source Maintainer - "Sam"

**Background:**
- Maintains popular Flutter package ecosystem
- 10+ interconnected packages on pub.dev
- Active community contributor

**Goals:**
- Visualize package dependencies for documentation
- Ensure consistent versions across packages
- Streamline release process

**Pain Points:**
- "I need to manually check each package before releases"
- "Contributors don't understand the package graph"
- "Version bumps cascade unpredictably"

---

## 4. User Stories

### Epic 1: Workspace Discovery & Dashboard

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| US-1.1 | As a developer, I want to see all pubspec.yaml files in my workspace so I can understand my monorepo structure | P0 | Dashboard shows all packages with names, types, and SDK versions |
| US-1.2 | As a developer, I want to see which packages have outdated dependencies so I can prioritize updates | P0 | Outdated packages highlighted with available version info |
| US-1.3 | As a developer, I want to see version conflicts across packages so I can fix them before they cause issues | P0 | Conflicts listed with package names, current versions, and suggestions |
| US-1.4 | As a developer, I want quick actions to run `pub get` and `pub upgrade` across all packages | P1 | One-click buttons that execute commands and show progress |
| US-1.5 | As a developer, I want the dashboard to update automatically when pubspec.yaml files change | P1 | Real-time updates via file system watching |

### Epic 2: Dependency Graph Visualization

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| US-2.1 | As a developer, I want to see a visual graph of package dependencies so I can understand relationships | P0 | Interactive graph with nodes (packages) and edges (dependencies) |
| US-2.2 | As a developer, I want to click on a node to navigate to its pubspec.yaml | P1 | Single-click opens file, double-click focuses node |
| US-2.3 | As a developer, I want to filter the graph to show only affected packages since a commit | P2 | Git integration showing changed packages highlighted |
| US-2.4 | As a developer, I want to export the graph as an image for documentation | P2 | Export to PNG/SVG with customizable options |
| US-2.5 | As a developer, I want to see external dependencies in the graph (collapsible) | P2 | Toggle to show/hide pub.dev packages |

### Epic 3: Migration Wizard

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| US-3.1 | As a developer, I want a guided wizard to migrate to Pub Workspaces so I don't have to learn the CLI | P0 | Step-by-step wizard with preview and rollback |
| US-3.2 | As a developer, I want to preview all changes before applying migration | P0 | Diff view showing all file modifications |
| US-3.3 | As a developer, I want the wizard to detect existing Melos configurations | P1 | Detection and appropriate migration path |
| US-3.4 | As a developer, I want to add Melos on top of Pub Workspaces for advanced features | P2 | Optional Melos configuration step |
| US-3.5 | As a developer, I want to rollback a migration if something goes wrong | P1 | Automatic backup and restore functionality |

### Epic 4: Version Synchronization

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| US-4.1 | As a developer, I want to detect when the same dependency has different versions across packages | P0 | Conflict detection with clear reporting |
| US-4.2 | As a developer, I want suggestions for resolving version conflicts | P0 | Smart suggestions based on semver compatibility |
| US-4.3 | As a developer, I want to apply version sync with one click | P1 | Batch update with preview and confirmation |
| US-4.4 | As a developer, I want to sync SDK constraints across all packages | P1 | Environment constraint harmonization |
| US-4.5 | As a developer, I want to ignore specific packages from sync rules | P2 | Package-level exclusion configuration |

---

## 5. Feature Specifications

### 5.1 Dashboard Panel

#### 5.1.1 Overview Section

**Display Elements:**

```
┌─────────────────────────────────────────────────┐
│ 📦 MOINSEN PUBSPEC MASTER                  ⚙️ ⟳ │
├─────────────────────────────────────────────────┤
│ 📊 Workspace: my_flutter_monorepo              │
│                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │   5         │ │   3         │ │   12        │ │
│ │  Packages   │ │  Conflicts  │ │  Updates    │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────┤
│ Quick Actions:                                  │
│ [↻ Refresh] [📦 Pub Get All] [⬆️ Upgrade All]  │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Auto-refresh on file changes (debounced 500ms)
- Manual refresh button for immediate update
- Clicking metrics opens detailed view

#### 5.1.2 Packages List

**Display per package:**

| Field | Description | Source |
|-------|-------------|--------|
| Name | Package name from pubspec.yaml | `name:` field |
| Type | Flutter App / Dart Package / Flutter Plugin | Detection logic |
| SDK | Dart SDK constraint | `environment.sdk` |
| Deps | Count of dependencies | `dependencies` + `dev_dependencies` |
| Status | ✅ OK / ⚠️ Outdated / ❌ Conflict | Analysis engine |

**Interactions:**
- Click package → expand to show dependencies
- Right-click → context menu (pub get, upgrade, open pubspec)
- Drag to reorder (saved to settings)

#### 5.1.3 Issues Panel

**Issue Types:**

| Type | Icon | Description | Severity |
|------|------|-------------|----------|
| Version Conflict | ❌ | Same dependency, different versions | High |
| Outdated Package | ⚠️ | Newer version available on pub.dev | Medium |
| SDK Mismatch | 🔶 | Inconsistent SDK constraints | Medium |
| Missing Resolution | ⚙️ | Not configured for workspace | Low |

**Actions per issue:**
- "Fix" button → opens resolution wizard
- "Ignore" → adds to ignore list
- "Details" → shows full context

### 5.2 Dependency Graph

#### 5.2.1 Graph Layout

**Algorithm:** Force-directed layout (D3.js force simulation)

**Node Types:**

| Type | Shape | Color | Size |
|------|-------|-------|------|
| Flutter App | Square | Blue (#2196F3) | Large |
| Dart Package | Circle | Green (#4CAF50) | Medium |
| Flutter Plugin | Hexagon | Purple (#9C27B0) | Medium |
| External Dep | Circle | Gray (#9E9E9E) | Small |

**Edge Types:**

| Type | Style | Color |
|------|-------|-------|
| Direct dependency | Solid | Dark gray |
| Dev dependency | Dashed | Light gray |
| Transitive | Dotted | Very light |

#### 5.2.2 Interactions

| Action | Result |
|--------|--------|
| Click node | Select and highlight connections |
| Double-click | Open pubspec.yaml in editor |
| Hover | Show tooltip with version info |
| Scroll | Zoom in/out |
| Drag node | Reposition (physics-based) |
| Drag canvas | Pan view |

#### 5.2.3 Toolbar

```
[🔍 Search] [📊 Layout: Force ▼] [👁️ Show External ▼] [📸 Export]
```

**Filters:**
- Show/hide external dependencies
- Show only affected (git diff)
- Show only with conflicts
- Show only outdated

### 5.3 Migration Wizard

#### 5.3.1 Migration Paths

```
┌─────────────────────────────────────────────────────────────┐
│                    MIGRATION WIZARD                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Current State: Independent Packages                        │
│                                                              │
│  Choose Target:                                              │
│                                                              │
│  ◉ Pub Workspaces (Recommended)                             │
│    Native Dart 3.6+ support. Shared resolution,             │
│    single lockfile, faster pub get.                         │
│                                                              │
│  ○ Pub Workspaces + Melos                                   │
│    All above + versioning automation, publishing,           │
│    advanced scripts.                                        │
│                                                              │
│  ○ Keep Current                                              │
│    Continue with independent package management.            │
│                                                              │
│                               [Cancel] [Next →]              │
└─────────────────────────────────────────────────────────────┘
```

#### 5.3.2 Migration Steps (Pub Workspaces)

| Step | Action | Files Modified |
|------|--------|----------------|
| 1 | Create root pubspec.yaml | `/pubspec.yaml` (new) |
| 2 | Add workspace entries | `/pubspec.yaml` |
| 3 | Add `resolution: workspace` to each package | `*/pubspec.yaml` |
| 4 | Run `dart pub get` at root | - |
| 5 | Clean up stale lockfiles | `*/pubspec.lock` (delete) |

#### 5.3.3 Preview Panel

```yaml
# Root pubspec.yaml (NEW)
name: my_workspace
publish_to: none

environment:
  sdk: ^3.6.0

workspace:
  - app
  - packages/core
  - packages/shared
  - packages/utils
```

```yaml
# packages/core/pubspec.yaml (MODIFIED)
name: core
+ resolution: workspace

environment:
  sdk: ^3.6.0
```

### 5.4 Version Synchronization

#### 5.4.1 Conflict Detection Rules

| Rule | Trigger | Severity |
|------|---------|----------|
| Same dep, different versions | `provider: ^6.0.0` vs `provider: ^6.1.5` | High |
| Incompatible constraints | `sdk: ^3.0.0` vs `sdk: ^3.10.4` | High |
| Related packages mismatch | `lints` vs `flutter_lints` different majors | Medium |
| Outdated shared dep | All packages use old version | Low |

#### 5.4.2 Resolution Strategies

```
┌─────────────────────────────────────────────────────────────┐
│ CONFLICT: provider                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Package          Current      Available    Constraint        │
│ ─────────────────────────────────────────────────────        │
│ app              ^6.1.5       ^6.1.7       Caret             │
│ shared           ^6.0.0       ^6.1.7       Caret             │
│ utils            6.0.5        ^6.1.7       Exact             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Resolution Options:                                          │
│                                                              │
│ ◉ Upgrade all to ^6.1.7 (latest compatible)                 │
│   Impact: 3 packages updated, 0 breaking changes             │
│                                                              │
│ ○ Use minimum compatible: ^6.0.0                             │
│   Impact: 1 package downgraded (app)                         │
│                                                              │
│ ○ Keep current (not recommended)                             │
│   Risk: Potential runtime version conflicts                  │
│                                                              │
│                    [Preview Changes] [Apply]                 │
└─────────────────────────────────────────────────────────────┘
```

#### 5.4.3 Batch Operations

| Operation | Description |
|-----------|-------------|
| Sync All | Apply recommended resolution to all conflicts |
| Sync Selected | Apply to checked conflicts only |
| Upgrade All | Update all dependencies to latest compatible |
| Pin Versions | Convert ^ to exact versions |

---

## 6. Technical Architecture

### 6.1 Extension Structure

```
pubspec-master/
├── .vscode/
│   └── launch.json              # Debug configuration
├── src/
│   ├── extension.ts             # Entry point, activation
│   ├── constants.ts             # Configuration constants
│   │
│   ├── core/
│   │   ├── WorkspaceScanner.ts  # Find pubspec.yaml files
│   │   ├── PubspecParser.ts     # YAML parsing
│   │   ├── DependencyResolver.ts # Build dependency tree
│   │   └── VersionAnalyzer.ts   # Conflict detection
│   │
│   ├── providers/
│   │   ├── DashboardProvider.ts # TreeDataProvider for sidebar
│   │   ├── GraphDataProvider.ts # Data for visualization
│   │   └── DiagnosticsProvider.ts # VS Code diagnostics
│   │
│   ├── commands/
│   │   ├── pubGetAll.ts         # Run pub get across workspace
│   │   ├── pubUpgradeAll.ts     # Run pub upgrade
│   │   ├── syncVersions.ts      # Apply version sync
│   │   ├── openMigrationWizard.ts
│   │   └── exportGraph.ts
│   │
│   ├── webview/
│   │   ├── graph/
│   │   │   ├── GraphPanel.ts    # Webview panel for graph
│   │   │   ├── graphView.html   # Graph template
│   │   │   └── graph.js         # D3.js visualization
│   │   │
│   │   └── wizard/
│   │       ├── MigrationWizard.ts
│   │       ├── wizardView.html
│   │       └── wizard.js
│   │
│   ├── api/
│   │   ├── PubDevClient.ts      # pub.dev API integration
│   │   └── cache.ts             # Response caching
│   │
│   └── utils/
│       ├── fileUtils.ts
│       ├── yamlUtils.ts
│       └── gitUtils.ts
│
├── media/
│   ├── icons/                   # Extension icons
│   └── styles/                  # CSS for webviews
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/                # Sample monorepos for testing
│
├── package.json                 # Extension manifest
├── tsconfig.json
├── webpack.config.js            # Bundle configuration
└── README.md
```

### 6.2 Key Classes

#### WorkspaceScanner

```typescript
interface PubspecInfo {
  path: string;
  name: string;
  type: 'flutter_app' | 'dart_package' | 'flutter_plugin';
  sdkConstraint: string;
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
  isWorkspacePackage: boolean;
  resolutionMode: 'workspace' | 'standalone';
}

class WorkspaceScanner {
  async scan(workspacePath: string): Promise<PubspecInfo[]>;
  async watchForChanges(callback: (event: FileChangeEvent) => void): void;
  async findRootPubspec(): Promise<PubspecInfo | null>;
  isMonorepo(): boolean;
}
```

#### DependencyResolver

```typescript
interface DependencyNode {
  name: string;
  version: string;
  dependencies: DependencyNode[];
  dependents: DependencyNode[];
  source: 'pub.dev' | 'path' | 'git';
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Array<{from: string; to: string; type: 'direct' | 'dev' | 'transitive'}>;
}

class DependencyResolver {
  async buildGraph(pubspecs: PubspecInfo[]): Promise<DependencyGraph>;
  findConflicts(): VersionConflict[];
  findAffectedPackages(changedFiles: string[]): string[];
  getTransitiveDependencies(packageName: string): string[];
}
```

#### VersionAnalyzer

```typescript
interface VersionConflict {
  dependencyName: string;
  packages: Array<{
    packageName: string;
    constraint: string;
    resolvedVersion: string;
  }>;
  severity: 'high' | 'medium' | 'low';
  suggestedResolution: string;
}

interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  latestCompatible: string;
  usedIn: string[];
}

class VersionAnalyzer {
  async analyzeConflicts(graph: DependencyGraph): Promise<VersionConflict[]>;
  async findOutdated(pubspecs: PubspecInfo[]): Promise<OutdatedPackage[]>;
  suggestResolution(conflict: VersionConflict): ResolutionOption[];
  async checkSdkCompatibility(version: string): Promise<boolean>;
}
```

### 6.3 Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         VS Code Workspace                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐   │
│  │ pubspec.yaml│────▶│WorkspaceScanner│───▶│ PubspecInfo[]   │   │
│  │ (files)     │     │              │     │                 │   │
│  └─────────────┘     └──────────────┘     └────────┬────────┘   │
│                                                     │            │
│                      ┌──────────────────────────────┘            │
│                      ▼                                           │
│               ┌──────────────┐                                   │
│               │DependencyResolver│                               │
│               └──────┬───────┘                                   │
│                      │                                           │
│         ┌────────────┼────────────┐                              │
│         ▼            ▼            ▼                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                    │
│  │VersionAna- │ │ GraphData- │ │ Dashboard- │                    │
│  │ lyzer      │ │ Provider   │ │ Provider   │                    │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘                    │
│        │              │              │                           │
│        ▼              ▼              ▼                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                    │
│  │ Conflicts  │ │ Graph      │ │ TreeView   │                    │
│  │ Panel      │ │ Webview    │ │ Sidebar    │                    │
│  └────────────┘ └────────────┘ └────────────┘                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.4 Technology Stack

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| Language | TypeScript | 5.x | Type safety, VS Code standard |
| Build | webpack | 5.x | Bundling extension |
| Testing | Mocha + Chai | Latest | VS Code extension testing |
| YAML | yaml (npm) | 2.x | Robust YAML parsing |
| Graph | D3.js | 7.x | Best-in-class visualization |
| UI Components | Custom + VS Code Toolkit | - | Native look and feel |
| HTTP | Axios | 1.x | pub.dev API calls |
| Caching | LRU Cache | - | API response caching |

### 6.5 VS Code Integration Points

| Integration | API | Purpose |
|-------------|-----|---------|
| Sidebar Panel | TreeDataProvider | Package list display |
| Webview | WebviewPanel | Graph and wizard UI |
| Commands | registerCommand | Quick actions |
| Diagnostics | DiagnosticCollection | Inline warnings |
| File Watching | FileSystemWatcher | Real-time updates |
| Status Bar | StatusBarItem | Quick status indicator |
| Quick Pick | showQuickPick | Package selection |
| Progress | withProgress | Long-running operations |

---

## 6.6 Error Handling Strategy

### 6.6.1 Error Categories

| Category | Examples | Severity | User Impact |
|----------|----------|----------|-------------|
| **Network Errors** | pub.dev unreachable, timeout, rate limited | Medium | Degraded functionality |
| **File System Errors** | Permission denied, file locked, disk full | High | Cannot save changes |
| **Parse Errors** | Malformed YAML, invalid version constraints | Medium | Package excluded from analysis |
| **Runtime Errors** | Out of memory, extension crash | Critical | Extension unusable |
| **Validation Errors** | Invalid migration state, circular dependencies | Medium | Operation blocked |

### 6.6.2 Error Handling Patterns

```typescript
interface ExtensionError {
  code: string;           // e.g., "PM_NET_001"
  category: ErrorCategory;
  message: string;        // User-friendly message
  details?: string;       // Technical details (for logs)
  recoverable: boolean;
  suggestedAction?: string;
}

enum ErrorCategory {
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  PARSE = 'parse',
  RUNTIME = 'runtime',
  VALIDATION = 'validation'
}
```

### 6.6.3 Error Codes Reference

| Code | Description | User Message | Suggested Action |
|------|-------------|--------------|------------------|
| `PM_NET_001` | pub.dev unreachable | "Cannot reach pub.dev. Using cached data." | Check internet connection |
| `PM_NET_002` | Rate limited | "Too many requests. Retrying in {n}s..." | Wait or reduce operations |
| `PM_NET_003` | Request timeout | "Request timed out. Try again." | Retry operation |
| `PM_FS_001` | Permission denied | "Cannot write to {file}. Check permissions." | Fix file permissions |
| `PM_FS_002` | File locked | "{file} is locked by another process." | Close other editors |
| `PM_PARSE_001` | Invalid YAML | "Invalid YAML in {file}: {line}" | Fix syntax error |
| `PM_PARSE_002` | Invalid version | "Invalid version constraint: {constraint}" | Use valid semver |
| `PM_VAL_001` | Circular dependency | "Circular dependency detected: {path}" | Refactor dependencies |
| `PM_VAL_002` | Missing resolution | "Package {name} missing 'resolution: workspace'" | Run migration wizard |

### 6.6.4 Offline Mode Behavior

When pub.dev is unreachable:

| Feature | Behavior | Fallback |
|---------|----------|----------|
| Dashboard | Shows cached version info | Badge: "Offline - data may be stale" |
| Outdated detection | Uses last known versions | Timestamp shown |
| Migration wizard | Fully functional | No version suggestions |
| Dependency graph | Fully functional | External deps show "?" for versions |
| Version sync | Functional with local data | Cannot suggest latest versions |

**Cache Persistence:**
```typescript
interface OfflineCache {
  packages: Map<string, {
    versions: string[];
    latest: string;
    cachedAt: number;
  }>;
  maxAge: number;  // Default: 24 hours
  location: string; // globalStoragePath
}
```

### 6.6.5 Error Presentation

| Context | Presentation Method |
|---------|---------------------|
| Dashboard issues | Inline warning banner with "Details" link |
| Graph errors | Toast notification + node highlight |
| Command failures | VS Code error notification with action button |
| Parse errors | Diagnostics (squiggly underlines) in editor |
| Critical errors | Modal dialog with recovery steps |

---

## 6.7 Configuration & Settings

### 6.7.1 Settings Schema

```jsonc
// package.json contributes.configuration
{
  "pubspecMaster.scan.excludePatterns": {
    "type": "array",
    "default": ["**/build/**", "**/.dart_tool/**"],
    "description": "Glob patterns to exclude from workspace scanning"
  },
  "pubspecMaster.scan.maxDepth": {
    "type": "number",
    "default": 10,
    "description": "Maximum directory depth for pubspec.yaml discovery"
  },
  "pubspecMaster.cache.ttlMinutes": {
    "type": "number",
    "default": 15,
    "description": "Cache duration for pub.dev API responses"
  },
  "pubspecMaster.cache.offlineMaxHours": {
    "type": "number",
    "default": 24,
    "description": "Maximum age of cached data for offline mode"
  },
  "pubspecMaster.sync.ignoredPackages": {
    "type": "array",
    "default": [],
    "description": "Packages to exclude from version synchronization"
  },
  "pubspecMaster.sync.ignoredDependencies": {
    "type": "array",
    "default": [],
    "description": "Dependencies to exclude from conflict detection"
  },
  "pubspecMaster.graph.showExternalByDefault": {
    "type": "boolean",
    "default": false,
    "description": "Show external pub.dev dependencies in graph by default"
  },
  "pubspecMaster.graph.layoutAlgorithm": {
    "type": "string",
    "enum": ["force", "hierarchical", "circular"],
    "default": "force",
    "description": "Default graph layout algorithm"
  },
  "pubspecMaster.dashboard.refreshOnSave": {
    "type": "boolean",
    "default": true,
    "description": "Auto-refresh dashboard when pubspec.yaml files are saved"
  },
  "pubspecMaster.dashboard.showDevDependencies": {
    "type": "boolean",
    "default": true,
    "description": "Include dev_dependencies in package counts and analysis"
  },
  "pubspecMaster.telemetry.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable anonymous usage telemetry (opt-in)"
  },
  "pubspecMaster.migration.createBackup": {
    "type": "boolean",
    "default": true,
    "description": "Create backup before migration operations"
  },
  "pubspecMaster.migration.backupLocation": {
    "type": "string",
    "default": ".pubspec-master-backup",
    "description": "Directory for migration backups (relative to workspace root)"
  }
}
```

### 6.7.2 Settings Storage Locations

| Setting Type | Storage | Scope |
|--------------|---------|-------|
| User preferences | VS Code User Settings | Global |
| Workspace overrides | `.vscode/settings.json` | Workspace |
| Ignored packages list | `.pubspec-master.json` (workspace root) | Workspace |
| Cache data | `globalStoragePath` | Global |
| Backup files | Configurable (default: `.pubspec-master-backup/`) | Workspace |

### 6.7.3 Workspace Configuration File

```jsonc
// .pubspec-master.json (optional, workspace root)
{
  "$schema": "https://pubspec-master.dev/schema/config.json",
  "version": 1,
  "ignore": {
    "packages": ["legacy_app"],           // Exclude from all analysis
    "dependencies": ["dev_dependency_x"], // Exclude from sync
    "conflicts": [                        // Ignore specific conflicts
      { "dependency": "intl", "reason": "Intentional version split" }
    ]
  },
  "sync": {
    "strategy": "latest-compatible",      // or "minimum-compatible", "exact"
    "pinVersions": false
  },
  "graph": {
    "groups": [                           // Visual grouping in graph
      { "name": "Core", "packages": ["core", "shared"] },
      { "name": "Features", "pattern": "feature_*" }
    ]
  }
}
```

### 6.7.4 Settings UI

```
┌─────────────────────────────────────────────────────────────┐
│ ⚙️ MOINSEN PUBSPEC MASTER SETTINGS                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 📂 Scanning                                                  │
│ ├─ Exclude patterns: [**/build/**, **/.dart_tool/**] [Edit] │
│ └─ Max depth: [10 ▼]                                        │
│                                                              │
│ 🔄 Synchronization                                           │
│ ├─ Strategy: [Latest Compatible ▼]                          │
│ ├─ Ignored packages: [0 configured] [Manage...]             │
│ └─ Ignored dependencies: [0 configured] [Manage...]         │
│                                                              │
│ 💾 Cache                                                     │
│ ├─ API cache duration: [15] minutes                         │
│ ├─ Offline data max age: [24] hours                         │
│ └─ [Clear Cache]                                             │
│                                                              │
│ 📊 Graph                                                     │
│ ├─ Default layout: [Force-directed ▼]                       │
│ └─ ☐ Show external dependencies by default                  │
│                                                              │
│ 🔒 Privacy                                                   │
│ └─ ☐ Enable anonymous usage telemetry                       │
│     Learn what we collect →                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6.8 Telemetry & Privacy

### 6.8.1 Telemetry Policy

**Principle:** Telemetry is **opt-in only**. No data is collected unless the user explicitly enables it.

### 6.8.2 Data Collected (When Opted In)

| Data Point | Example | Purpose | NOT Collected |
|------------|---------|---------|---------------|
| Extension version | `1.0.0` | Compatibility tracking | - |
| VS Code version | `1.85.0` | Compatibility tracking | - |
| OS platform | `darwin` | Platform-specific bugs | Full OS version |
| Feature usage counts | `graph_opened: 5` | Feature prioritization | Timestamps |
| Error codes | `PM_NET_001` | Bug identification | Stack traces |
| Workspace size | `packages: 12` | Performance tuning | Package names |
| Migration completions | `pub_workspaces: true` | Feature adoption | File contents |

**Never Collected:**
- Package names or dependencies
- File paths or contents
- Personal identifiable information
- Network requests or responses
- Source code or YAML contents
- Git information

### 6.8.3 Implementation

```typescript
interface TelemetryEvent {
  event: string;
  properties: Record<string, string | number | boolean>;
  timestamp: number;  // Local only, not transmitted
}

class TelemetryService {
  private enabled: boolean;
  private queue: TelemetryEvent[] = [];

  async track(event: string, properties: object): Promise<void> {
    if (!this.enabled) return;
    // Sanitize and queue event
  }

  async flush(): Promise<void> {
    // Batch send to telemetry endpoint
    // Uses VS Code's built-in telemetry infrastructure
  }
}
```

### 6.8.4 User Controls

| Control | Location | Effect |
|---------|----------|--------|
| Enable/disable | Settings > Privacy | Immediately stops/starts collection |
| View policy | Settings > Privacy > "Learn more" | Opens privacy documentation |
| Request deletion | GitHub issue template | Manual process for data removal |

### 6.8.5 Privacy Documentation

A `PRIVACY.md` file will be included in the repository:

```markdown
# Privacy Policy - Moinsen Pubspec Master

## Summary
Moinsen Pubspec Master collects NO data by default. Anonymous usage telemetry
is available as an opt-in feature to help improve the extension.

## What We Collect (Opt-In Only)
[List from 6.8.2]

## What We Never Collect
[List from 6.8.2]

## How to Opt In/Out
Settings > Moinsen Pubspec Master > Enable anonymous usage telemetry

## Data Retention
Telemetry data is retained for 90 days, then automatically deleted.

## Contact
For privacy questions: [email or issue template]
```

---

## 6.9 Testing Strategy

### 6.9.1 Test Pyramid

```
                    ┌─────────┐
                    │   E2E   │  5%  - Full extension in VS Code
                   ─┴─────────┴─
                  ┌─────────────┐
                  │ Integration │  25% - Multi-component tests
                 ─┴─────────────┴─
                ┌─────────────────┐
                │      Unit       │  70% - Individual functions
               ─┴─────────────────┴─
```

### 6.9.2 Test Fixtures

**Directory Structure:**
```
test/
├── fixtures/
│   ├── empty-workspace/           # No pubspec.yaml files
│   │
│   ├── single-package/            # Basic Dart package
│   │   └── pubspec.yaml
│   │
│   ├── flutter-app/               # Single Flutter app
│   │   └── pubspec.yaml
│   │
│   ├── simple-monorepo/           # 3 packages, no conflicts
│   │   ├── pubspec.yaml           # Root workspace
│   │   ├── app/pubspec.yaml
│   │   ├── packages/core/pubspec.yaml
│   │   └── packages/utils/pubspec.yaml
│   │
│   ├── conflicting-versions/      # Version conflicts
│   │   ├── app/pubspec.yaml       # provider: ^6.1.0
│   │   └── shared/pubspec.yaml    # provider: ^6.0.0
│   │
│   ├── circular-deps/             # Circular dependency
│   │   ├── package_a/pubspec.yaml # depends on package_b
│   │   └── package_b/pubspec.yaml # depends on package_a
│   │
│   ├── large-monorepo/            # 50+ packages (generated)
│   │   └── generate.js            # Script to create fixture
│   │
│   ├── malformed-yaml/            # Invalid YAML files
│   │   ├── invalid-syntax/pubspec.yaml
│   │   ├── missing-name/pubspec.yaml
│   │   └── invalid-version/pubspec.yaml
│   │
│   ├── melos-workspace/           # Existing Melos setup
│   │   ├── melos.yaml
│   │   └── packages/...
│   │
│   ├── pub-workspaces/            # Already using Pub Workspaces
│   │   ├── pubspec.yaml           # workspace: [...]
│   │   └── packages/...
│   │
│   └── mixed-sdk-versions/        # Different SDK constraints
│       ├── old-package/pubspec.yaml    # sdk: ^3.0.0
│       └── new-package/pubspec.yaml    # sdk: ^3.6.0
```

### 6.9.3 Unit Test Coverage Requirements

| Component | Minimum Coverage | Critical Paths |
|-----------|------------------|----------------|
| WorkspaceScanner | 90% | File discovery, filtering |
| PubspecParser | 95% | YAML parsing, validation |
| DependencyResolver | 90% | Graph building, cycle detection |
| VersionAnalyzer | 95% | Conflict detection, suggestions |
| PubDevClient | 80% | API calls, error handling |
| Migration logic | 95% | All migration paths |

### 6.9.4 Edge Cases to Test

| Category | Test Case | Expected Behavior |
|----------|-----------|-------------------|
| **Empty/Missing** | No pubspec.yaml in workspace | Show "No packages found" message |
| **Empty/Missing** | Empty pubspec.yaml file | Skip with parse warning |
| **Empty/Missing** | pubspec.yaml with only comments | Skip with parse warning |
| **Permissions** | Read-only pubspec.yaml | Show warning, disable edit actions |
| **Permissions** | Locked file (open in another editor) | Retry with backoff, then error |
| **Scale** | 100+ packages | Complete scan in <5s |
| **Scale** | 500+ nodes in graph | Enable virtualization |
| **Scale** | 1000+ dependencies total | Pagination in UI |
| **Circular** | A → B → A | Detect and report cycle |
| **Circular** | A → B → C → A | Detect and report full path |
| **Network** | pub.dev timeout | Use cache, show warning |
| **Network** | pub.dev 429 (rate limit) | Exponential backoff |
| **Network** | Invalid JSON response | Graceful degradation |
| **YAML** | Tab characters | Parse correctly or clear error |
| **YAML** | Unicode package names | Handle correctly |
| **YAML** | Very long lines | Truncate in display |
| **Git** | Not a git repo | Disable git features gracefully |
| **Git** | Detached HEAD | Show branch as "detached" |
| **Migration** | Partial previous migration | Detect and offer to complete |
| **Migration** | Backup directory exists | Increment backup number |

### 6.9.5 Integration Test Scenarios

```typescript
describe('WorkspaceScanner + DependencyResolver Integration', () => {
  it('should build complete graph from simple-monorepo fixture');
  it('should detect conflicts in conflicting-versions fixture');
  it('should handle circular-deps fixture gracefully');
  it('should skip malformed files and continue scanning');
});

describe('Migration Wizard Integration', () => {
  it('should migrate single-package to pub-workspaces');
  it('should detect existing melos-workspace');
  it('should create valid backup before migration');
  it('should rollback on failure');
});

describe('pub.dev API Integration', () => {
  it('should fetch and cache package versions');
  it('should handle rate limiting gracefully');
  it('should work offline with cached data');
});
```

### 6.9.6 E2E Test Scenarios

| Scenario | Steps | Verification |
|----------|-------|--------------|
| Fresh install | Install extension, open monorepo | Dashboard shows all packages |
| Conflict detection | Open conflicting-versions fixture | Issues panel shows conflict |
| One-click fix | Click "Fix" on version conflict | All pubspec.yaml files updated |
| Graph navigation | Open graph, click package node | pubspec.yaml opens in editor |
| Migration flow | Run wizard on single-package | Pub Workspaces configured correctly |
| Offline mode | Disconnect network, refresh | Cached data shown with warning |

### 6.9.7 Performance Benchmarks

| Operation | Target | Measurement Method |
|-----------|--------|-------------------|
| Initial scan (10 packages) | <500ms | `performance.now()` |
| Initial scan (50 packages) | <2s | `performance.now()` |
| Graph render (50 nodes) | <100ms | Frame timing |
| Graph render (200 nodes) | <500ms | Frame timing |
| pub.dev API call | <1s | Network timing |
| Dashboard refresh | <200ms | `performance.now()` |
| Memory (idle) | <50MB | VS Code profiler |
| Memory (large graph) | <100MB | VS Code profiler |

---

## 6.10 Keyboard Shortcuts

### 6.10.1 Command Palette Commands

| Command | ID | Default Shortcut |
|---------|----|--------------------|
| Show Dashboard | `pubspecMaster.showDashboard` | - |
| Show Dependency Graph | `pubspecMaster.showGraph` | - |
| Refresh Workspace | `pubspecMaster.refresh` | `Ctrl+Shift+R` / `Cmd+Shift+R` |
| Run Pub Get (All) | `pubspecMaster.pubGetAll` | - |
| Run Pub Upgrade (All) | `pubspecMaster.pubUpgradeAll` | - |
| Sync Versions | `pubspecMaster.syncVersions` | - |
| Open Migration Wizard | `pubspecMaster.migrate` | - |
| Export Graph | `pubspecMaster.exportGraph` | - |
| Go to Package | `pubspecMaster.goToPackage` | `Ctrl+Shift+P` / `Cmd+Shift+P` then type |

### 6.10.2 Graph View Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Zoom in | `+` or `=` | Increase zoom level |
| Zoom out | `-` | Decrease zoom level |
| Reset zoom | `0` | Fit graph to view |
| Pan | Arrow keys | Move viewport |
| Search | `/` or `Ctrl+F` | Focus search input |
| Select next | `Tab` | Cycle through nodes |
| Select previous | `Shift+Tab` | Cycle backwards |
| Open selected | `Enter` | Open pubspec.yaml |
| Toggle external | `E` | Show/hide external deps |
| Refresh | `R` | Reload graph data |
| Export | `Ctrl+S` / `Cmd+S` | Export as image |

### 6.10.3 Dashboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Refresh | `R` | Reload all data |
| Expand all | `Ctrl+Shift+]` | Expand all packages |
| Collapse all | `Ctrl+Shift+[` | Collapse all packages |
| Focus search | `/` | Filter packages |
| Next issue | `J` | Navigate to next issue |
| Previous issue | `K` | Navigate to previous issue |
| Fix issue | `F` | Open fix dialog for selected |

---

## 6.11 Localization

### 6.11.1 Localization Strategy (v1.0)

**v1.0 Scope:** English only

**Future Scope (v1.x):**
- Community-contributed translations
- VS Code's built-in localization framework
- Priority languages: German, Chinese, Japanese, Portuguese, Spanish

### 6.11.2 Localization-Ready Architecture

All user-facing strings will be externalized from the start:

```typescript
// src/i18n/messages.ts
export const messages = {
  dashboard: {
    title: 'Moinsen Pubspec Master',
    packages: 'Packages',
    conflicts: 'Conflicts',
    updates: 'Updates Available',
    refresh: 'Refresh',
    pubGetAll: 'Run Pub Get All',
    pubUpgradeAll: 'Run Pub Upgrade All',
  },
  errors: {
    networkUnreachable: 'Cannot reach pub.dev. Using cached data.',
    rateLimited: 'Too many requests. Retrying in {seconds}s...',
    parseError: 'Invalid YAML in {file}: {message}',
  },
  // ... more categories
};

// Usage
import { messages } from './i18n/messages';
vscode.window.showWarningMessage(messages.errors.networkUnreachable);
```

### 6.11.3 Translation File Structure (Future)

```
src/
└── i18n/
    ├── messages.ts          # Default (English)
    ├── messages.de.ts       # German
    ├── messages.zh-cn.ts    # Simplified Chinese
    └── messages.ja.ts       # Japanese
```

---

## 6.12 Security Considerations

### 6.12.1 Threat Model

| Threat | Vector | Risk | Mitigation |
|--------|--------|------|------------|
| Malicious YAML | Crafted pubspec.yaml | Code execution | Use safe YAML parser, no `eval` |
| Path traversal | Malicious package paths | File access | Validate paths within workspace |
| Dependency confusion | Typosquatted packages | Wrong package installed | Display warnings for new deps |
| Credential exposure | Git URLs with tokens | Token leak | Sanitize URLs in logs/display |
| XSS in webview | Malicious package names | Script execution | Sanitize all rendered content |
| Command injection | Package names in shell | Arbitrary execution | Never interpolate in shell commands |

### 6.12.2 YAML Parsing Security

```typescript
import { parse } from 'yaml';

// SECURE: Use yaml library with safe defaults
function parsePubspec(content: string): object {
  return parse(content, {
    // No custom tags that could execute code
    customTags: [],
    // Strict mode for better error detection
    strict: true,
    // Limit nesting depth
    maxAliasCount: 100,
  });
}

// NEVER: Don't use eval, Function(), or vm.runInContext()
```

### 6.12.3 Path Validation

```typescript
function isPathWithinWorkspace(filePath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(workspaceRoot, filePath);
  return resolved.startsWith(workspaceRoot + path.sep);
}

// Always validate before file operations
if (!isPathWithinWorkspace(targetPath, workspaceRoot)) {
  throw new Error('Path traversal attempt detected');
}
```

### 6.12.4 Webview Security

```typescript
// Content Security Policy for webviews
const csp = [
  "default-src 'none'",
  "style-src ${webview.cspSource} 'unsafe-inline'",
  "script-src ${webview.cspSource}",
  "img-src ${webview.cspSource} data:",
  "font-src ${webview.cspSource}",
].join('; ');

// Sanitize all dynamic content
function sanitizeForHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### 6.12.5 Shell Command Security

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// SECURE: Use execFile with arguments array (no shell interpretation)
async function runPubGet(packagePath: string): Promise<{stdout: string; stderr: string}> {
  // Validate path first
  if (!isPathWithinWorkspace(packagePath, workspaceRoot)) {
    throw new Error('Invalid package path');
  }

  return execFileAsync('dart', ['pub', 'get'], {
    cwd: packagePath,
    // No shell: true - arguments are passed directly
  });
}

// NEVER: Don't use exec() with string interpolation
// BAD: exec(`dart pub get --directory=${packageName}`);
// This is vulnerable to command injection!
```

### 6.12.6 Dependency Security Warnings

Display warnings for potentially risky scenarios:

| Scenario | Warning |
|----------|---------|
| Git dependency from unknown host | "⚠️ Git dependency from non-GitHub source: {url}" |
| Path dependency outside workspace | "⚠️ Path dependency references parent directory" |
| Hosted dependency from non-pub.dev | "ℹ️ Using alternative package server: {host}" |
| Package name similar to popular package | "⚠️ Did you mean '{popular}'? This package is '{actual}'" |

---

## 7. UI/UX Design

### 7.1 Color Palette

**Light Theme:**
```css
--pm-primary: #1976D2;       /* Actions, links */
--pm-success: #4CAF50;       /* OK status */
--pm-warning: #FF9800;       /* Outdated */
--pm-error: #F44336;         /* Conflicts */
--pm-neutral: #9E9E9E;       /* External deps */
--pm-background: #FFFFFF;
--pm-surface: #F5F5F5;
--pm-text: #212121;
```

**Dark Theme:**
```css
--pm-primary: #64B5F6;
--pm-success: #81C784;
--pm-warning: #FFB74D;
--pm-error: #E57373;
--pm-neutral: #757575;
--pm-background: #1E1E1E;
--pm-surface: #252526;
--pm-text: #E0E0E0;
```

### 7.2 Icon System

| Concept | Icon | Unicode |
|---------|------|---------|
| Package | 📦 | U+1F4E6 |
| Flutter App | 💙 | U+1F499 |
| Dart Package | 🎯 | U+1F3AF |
| Conflict | ❌ | U+274C |
| Warning | ⚠️ | U+26A0 |
| Success | ✅ | U+2705 |
| Refresh | 🔄 | U+1F504 |
| Settings | ⚙️ | U+2699 |

### 7.3 Responsive Behavior

| Sidebar Width | Behavior |
|---------------|----------|
| < 200px | Collapse to icons only |
| 200-300px | Compact mode (single line per item) |
| > 300px | Full mode (details visible) |

### 7.4 Accessibility

- All interactive elements keyboard accessible
- ARIA labels for screen readers
- High contrast mode support
- Respects `reduceMotion` preference
- Focus indicators visible

---

## 8. API Integrations

### 8.1 pub.dev API

**Base URL:** `https://pub.dev/api/`

**Endpoints Used:**

| Endpoint | Purpose | Cache TTL |
|----------|---------|-----------|
| `GET /packages/{name}` | Package info | 15 min |
| `GET /packages/{name}/versions` | Version list | 15 min |
| `GET /packages/{name}/score` | Package quality | 1 hour |

**Rate Limiting:**
- Respect 429 responses
- Exponential backoff (1s, 2s, 4s, 8s)
- Max 10 requests/second

**Caching Strategy:**
```typescript
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class PubDevCache {
  private cache: Map<string, CacheEntry>;

  async get(key: string): Promise<any | null>;
  set(key: string, data: any, ttl: number): void;
  invalidate(key: string): void;
  clear(): void;
}
```

### 8.2 Git Integration

**Operations:**

| Operation | Command | Purpose |
|-----------|---------|---------|
| Changed files | `git diff --name-only HEAD~1` | Affected packages |
| Status | `git status --porcelain` | Uncommitted changes |
| Branch | `git branch --show-current` | Context info |

---

## 9. Success Metrics

### 9.1 Adoption Metrics

| Metric | Target (6 months) | Measurement |
|--------|-------------------|-------------|
| Installs | 5,000+ | VS Code Marketplace |
| Weekly Active Users | 1,000+ | Telemetry (opt-in) |
| GitHub Stars | 500+ | GitHub API |
| GitHub Issues (feedback) | 50+ | GitHub API |

### 9.2 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Crash Rate | < 0.1% | Error tracking |
| Load Time | < 2s | Performance timing |
| Memory Usage | < 100MB | VS Code profiler |
| Rating | 4.5+ stars | Marketplace |

### 9.3 Engagement Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Migration wizard completions | 30% of users | Event tracking |
| Graph views per session | 2+ | Event tracking |
| Version sync actions | 50% of conflicts | Event tracking |

---

## 10. Release Plan

### 10.1 Milestones

| Phase | Features | Target |
|-------|----------|--------|
| **Alpha** | Workspace scanning, basic dashboard | Internal testing |
| **Beta** | + Dependency graph, conflicts | Limited release |
| **RC** | + Migration wizard, version sync | Public preview |
| **1.0** | Polish, performance, docs | Marketplace |

### 10.2 Alpha Release Checklist

- [ ] Extension scaffolding (yo code)
- [ ] Workspace scanning implemented
- [ ] Basic TreeView dashboard
- [ ] Pub get/upgrade commands
- [ ] Unit tests (>80% coverage)
- [ ] README with screenshots

### 10.3 Beta Release Checklist

- [ ] Dependency graph visualization
- [ ] Conflict detection engine
- [ ] pub.dev API integration
- [ ] File watching
- [ ] Integration tests
- [ ] Performance benchmarks

### 10.4 RC Release Checklist

- [ ] Migration wizard (Pub Workspaces)
- [ ] Version synchronization
- [ ] Settings panel
- [ ] Light/dark theme support
- [ ] Accessibility audit
- [ ] Documentation site

### 10.5 1.0 Release Checklist

- [ ] Performance optimization
- [ ] Edge case handling
- [ ] Comprehensive error messages
- [ ] Marketplace assets (icon, banner)
- [ ] Demo video
- [ ] Changelog

---

## 11. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| pub.dev API changes | High | Low | Version-specific endpoints, graceful degradation |
| VS Code API breaking changes | High | Low | Test against Insiders, pin minimum version |
| Performance issues with large monorepos | Medium | Medium | Lazy loading, virtualization, pagination |
| YAML parsing edge cases | Medium | Medium | Use battle-tested parser, extensive test fixtures |
| User adoption resistance | Medium | Medium | Comprehensive docs, tutorial videos, community engagement |
| Melos compatibility issues | Low | Medium | Test against multiple Melos versions |

---

## 12. Appendix

### A. Competitive Analysis Details

See Section 2 (Problem Statement) for market gap analysis.

### B. User Research Notes

Based on analysis of:
- Flutter GitHub issues mentioning "monorepo"
- r/FlutterDev posts about package management
- Stack Overflow questions tagged `flutter+pubspec`

### C. Technical Spike Results

**Pub Workspaces Compatibility:**
- Minimum: Dart 3.6+ for basic Pub Workspaces support
- Recommended: Dart 3.11+ for glob patterns in workspace definitions
- Single lockfile at root
- `resolution: workspace` required per package

**D3.js Graph Performance:**
- Tested with 50 nodes: <100ms render
- Tested with 200 nodes: <500ms render
- Recommend virtualization for 500+ nodes

### D. Glossary

| Term | Definition |
|------|------------|
| Monorepo | Single repository containing multiple packages |
| Pub Workspaces | Native Dart feature for shared dependency resolution |
| Melos | Third-party tool for monorepo management |
| Constraint | Version specification (e.g., `^1.0.0`) |
| Resolution | Process of determining exact versions |
| Transitive dependency | Dependency of a dependency |

---

## 13. Moinsen Ecosystem

### 13.1 Product Family

**Moinsen Pubspec Master** is part of the Moinsen ecosystem for Flutter/Dart developers:

| Product | Type | Description |
|---------|------|-------------|
| **Moinsen Pubspec Master** | Free, Open Source | VS Code extension for monorepo management |
| **Moinsen Pub** | Commercial | Self-hosted private package repository |

### 13.2 Moinsen Pub Integration (Future)

For teams using [Moinsen Pub](https://moinsen.pub), the extension will support:

| Feature | Description |
|---------|-------------|
| Private package discovery | See private packages in dependency graph |
| Team version policies | Enforce version constraints across team |
| Automated maintenance | Integration with Moinsen Pub's update automation |
| CI/CD integration | Status indicators for publish pipelines |

### 13.3 Branding Guidelines

| Element | Value |
|---------|-------|
| Full name | Moinsen Pubspec Master |
| Short name | Pubspec Master (in UI where space is limited) |
| Extension ID | `pubspec-master` (backward compatible) |
| Config prefix | `pubspecMaster.*` (backward compatible) |
| Config file | `.pubspec-master.json` (backward compatible) |

---

**Document Status:** Draft
**Last Updated:** December 21, 2025
**Next Review:** After stakeholder feedback
