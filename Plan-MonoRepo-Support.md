# Multi-Ecosystem Monorepo Support Plan

> **Status:** Paused - Foundation complete, implementation pending
> **Last Updated:** 2026-01-27
> **Priority:** Future enhancement after Flutter features are complete

---

## Overview

This document captures the remaining work to transform Pubspec Master into a universal monorepo dependency manager supporting Flutter/Dart, Node.js, and Python ecosystems.

**Completed Foundation (Phase 3):**
- ✅ Core interfaces (`src/core/interfaces/`)
- ✅ Ecosystem Registry (`src/core/EcosystemRegistry.ts`)
- ✅ Dart ecosystem adapter (`src/ecosystems/dart/`)
- ✅ Shared utilities (`src/core/shared/`)
- ✅ Multi-ecosystem scanner (`src/core/MultiEcosystemScanner.ts`)

---

## Phase 4: Node.js Support

### 4.1 Create Node.js Ecosystem Adapter

**Directory:** `src/ecosystems/nodejs/`

| File | Interface | Description |
|------|-----------|-------------|
| `PackageJsonParser.ts` | `IPackageParser` | Parse package.json files |
| `NpmRegistryClient.ts` | `IRegistryClient` | npm registry API client |
| `NodePackageManager.ts` | `IPackageManager` | npm/yarn/pnpm CLI wrapper |
| `PackageJsonWriter.ts` | `IManifestWriter` | Modify package.json |
| `index.ts` | - | Register with EcosystemRegistry |

### 4.2 PackageJsonParser Implementation

```typescript
// Key features to implement:
- Parse package.json dependencies and devDependencies
- Handle workspaces field (npm/yarn workspaces)
- Detect package type (app vs library)
- Support peerDependencies and optionalDependencies
- Handle resolutions/overrides fields
```

**Manifest patterns:**
- `**/package.json`
- Exclude: `**/node_modules/**`

### 4.3 NpmRegistryClient Implementation

```typescript
// API endpoint: https://registry.npmjs.org/{package}
// Features:
- Fetch package info (versions, description, repository)
- Check for updates
- Security advisories via npm audit API
- Download statistics
- Caching with configurable TTL
```

### 4.4 NodePackageManager Implementation

```typescript
// Support multiple package managers:
- npm: npm install, npm update, npm audit
- yarn: yarn add, yarn upgrade, yarn audit
- pnpm: pnpm add, pnpm update, pnpm audit

// Auto-detect which to use based on:
- yarn.lock presence → yarn
- pnpm-lock.yaml presence → pnpm
- package-lock.json presence → npm
```

### 4.5 Workspace Detection

```typescript
// Detect Node.js monorepo tools:
- npm workspaces (package.json "workspaces" field)
- yarn workspaces
- pnpm workspaces (pnpm-workspace.yaml)
- Lerna (lerna.json)
- Nx (nx.json)
- Turborepo (turbo.json)
```

### 4.6 Update package.json

Add activation events:
```json
"activationEvents": [
  "workspaceContains:**/pubspec.yaml",
  "workspaceContains:**/package.json"
]
```

### 4.7 UI Updates for Node.js

- Add Node.js icon (npm logo) to tree view
- Ecosystem filter in dashboard
- Node.js coloring in dependency graph (different from Dart)
- Show npm audit results in health analysis

---

## Phase 5: Python Support

### 5.1 Create Python Ecosystem Adapter

**Directory:** `src/ecosystems/python/`

| File | Interface | Description |
|------|-----------|-------------|
| `PyProjectParser.ts` | `IPackageParser` | Parse pyproject.toml |
| `RequirementsParser.ts` | `IPackageParser` | Parse requirements.txt |
| `SetupPyParser.ts` | `IPackageParser` | Parse setup.py (legacy) |
| `PyPiClient.ts` | `IRegistryClient` | PyPI API client |
| `PythonPackageManager.ts` | `IPackageManager` | pip/uv CLI wrapper |
| `PythonManifestWriter.ts` | `IManifestWriter` | Modify Python manifests |
| `index.ts` | - | Register with EcosystemRegistry |

### 5.2 Python Manifest Parsers

```typescript
// PyProjectParser - Modern Python projects (PEP 517/518)
- Parse [project] section for dependencies
- Parse [project.optional-dependencies]
- Handle [tool.poetry.dependencies] for Poetry projects
- Handle [tool.uv] for uv workspaces

// RequirementsParser - Traditional requirements.txt
- Parse pinned versions (package==1.0.0)
- Parse constraints (package>=1.0.0,<2.0.0)
- Handle -r includes for nested requirements
- Handle -e for editable installs

// SetupPyParser - Legacy setup.py (read-only)
- Extract install_requires
- Extract extras_require
- Read-only (too complex to modify safely)
```

**Manifest patterns:**
- `**/pyproject.toml`
- `**/requirements.txt`
- `**/requirements-*.txt`
- `**/setup.py` (read-only)

### 5.3 PyPiClient Implementation

```typescript
// API endpoint: https://pypi.org/pypi/{package}/json
// Features:
- Fetch package info (versions, description, repository)
- Check for updates
- Security advisories via Safety DB or pip-audit
- Download statistics via pypistats.org
- Caching with configurable TTL
```

### 5.4 PythonPackageManager Implementation

```typescript
// Support multiple package managers:
- pip: pip install, pip freeze, pip-audit
- uv: uv pip install, uv pip compile (fast!)
- poetry: poetry add, poetry update
- pipenv: pipenv install, pipenv update

// Auto-detect which to use based on:
- uv.lock presence → uv
- poetry.lock presence → poetry
- Pipfile presence → pipenv
- requirements.txt presence → pip
```

### 5.5 Workspace Detection

```typescript
// Detect Python monorepo tools:
- uv workspaces (uv.toml or pyproject.toml [tool.uv.workspace])
- Poetry workspaces
- Pants build system
- Bazel Python rules
```

### 5.6 Update package.json

Add activation events:
```json
"activationEvents": [
  "workspaceContains:**/pubspec.yaml",
  "workspaceContains:**/package.json",
  "workspaceContains:**/pyproject.toml",
  "workspaceContains:**/requirements.txt"
]
```

### 5.7 UI Updates for Python

- Add Python icon to tree view
- Ecosystem filter in dashboard
- Python coloring in dependency graph
- Show pip-audit results in health analysis

---

## Phase 6: Enhanced Features

### 6.1 Cross-Ecosystem Features

```typescript
// Unified dependency graph
- Show all ecosystems in single graph
- Different colors per ecosystem
- Cross-ecosystem dependency detection (rare but possible)

// Unified health dashboard
- Combined health score
- Filter by ecosystem
- Aggregate statistics

// Unified search
- Search across all packages
- Filter by ecosystem, health status, package type
```

### 6.2 Search and Filter

```typescript
// Dashboard enhancements:
- Search box with keyboard shortcut (Cmd+F)
- Filter chips: ecosystem, type, health status
- Sort options: name, health, update date
- Saved filter presets
```

### 6.3 Offline Mode Indicator

```typescript
// Clear offline status:
- Badge in status bar
- Banner in dashboard
- Last sync timestamp
- Manual refresh button
- Queue changes for when online
```

### 6.4 Accessibility Improvements

```typescript
// WCAG compliance:
- ARIA labels on all interactive elements
- Keyboard navigation in graph
- Screen reader support
- High contrast mode support
- Focus indicators
```

---

## Phase 7: Testing & Documentation

### 7.1 Test Coverage

| Area | Target | Current |
|------|--------|---------|
| Unit tests | 80% | ~70% |
| Integration tests | 60% | Broken (needs fix) |
| E2E tests | 40% | 0% |

**New test files needed:**
- `test/unit/ecosystems/nodejs/*.test.ts`
- `test/unit/ecosystems/python/*.test.ts`
- `test/unit/core/shared/*.test.ts`
- `test/integration/multi-ecosystem.test.ts`

### 7.2 Documentation Updates

| Document | Status | Action |
|----------|--------|--------|
| README.md | Outdated | Update for multi-ecosystem |
| CHANGELOG.md | Current | Add multi-ecosystem entries |
| CONTRIBUTING.md | Missing | Create |
| docs/ecosystems/ | Missing | Create per-ecosystem guides |

### 7.3 Migration Guide

Create `docs/migration-guide.md`:
- Upgrading from Dart-only version
- Configuring for Node.js projects
- Configuring for Python projects
- Mixed-ecosystem workspace setup

---

## Implementation Notes

### File Structure After Completion

```
src/
├── core/
│   ├── interfaces/           # ✅ Complete
│   ├── shared/               # ✅ Complete
│   ├── EcosystemRegistry.ts  # ✅ Complete
│   ├── MultiEcosystemScanner.ts # ✅ Complete
│   ├── PubspecParser.ts      # Keep for backward compat
│   ├── DependencyResolver.ts # Keep for backward compat
│   └── VersionAnalyzer.ts    # Keep for backward compat
├── ecosystems/
│   ├── dart/                 # ✅ Complete
│   ├── nodejs/               # Phase 4
│   └── python/               # Phase 5
├── api/
│   ├── PubDevClient.ts       # Keep (used by dart adapter)
│   └── GitHubClient.ts       # Shared across ecosystems
└── ...
```

### Backward Compatibility

- Keep existing Dart-specific code working
- New multi-ecosystem features are opt-in
- Existing settings continue to work
- No breaking changes to command IDs or settings keys

### Configuration Schema

```json
{
  "pubspecMaster.ecosystems": {
    "type": "array",
    "default": ["dart"],
    "items": {
      "enum": ["dart", "nodejs", "python"]
    },
    "description": "Ecosystems to enable"
  },
  "pubspecMaster.nodejs.packageManager": {
    "type": "string",
    "enum": ["auto", "npm", "yarn", "pnpm"],
    "default": "auto"
  },
  "pubspecMaster.python.packageManager": {
    "type": "string",
    "enum": ["auto", "pip", "uv", "poetry", "pipenv"],
    "default": "auto"
  }
}
```

---

## Estimated Effort

| Phase | Description | Complexity |
|-------|-------------|------------|
| 4 | Node.js support | Medium (2-3 weeks) |
| 5 | Python support | Medium (2-3 weeks) |
| 6 | Enhanced features | Medium (1-2 weeks) |
| 7 | Testing & docs | Medium (1-2 weeks) |

**Total:** 6-10 weeks of focused development

---

## Success Criteria

1. **Node.js Support**
   - Parse package.json correctly
   - Detect npm/yarn/pnpm workspaces
   - Check for updates via npm registry
   - Run npm audit for security

2. **Python Support**
   - Parse pyproject.toml and requirements.txt
   - Detect uv/poetry workspaces
   - Check for updates via PyPI
   - Run pip-audit for security

3. **Mixed Ecosystem**
   - Handle monorepos with Dart + Node.js + Python
   - Unified dependency graph
   - Combined health dashboard

4. **Quality**
   - 80%+ test coverage
   - All tests passing
   - Documentation complete

---

## References

- [npm Registry API](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [PyPI JSON API](https://warehouse.pypa.io/api-reference/json.html)
- [pub.dev API](https://pub.dev/help/api)
- [Semantic Versioning](https://semver.org/)
- [PEP 508 - Dependency specification](https://peps.python.org/pep-0508/)
