# Moinsen Pubspec Master

**The ultimate Flutter/Dart monorepo management extension for VS Code by Moinsen**

Moinsen Pubspec Master provides a complete toolkit for managing multi-package Flutter and Dart workspaces. Visualize dependencies, detect conflicts, migrate to Pub Workspaces, and keep your monorepo healthy.

> **Looking for private package hosting?** Check out [Moinsen Pub](https://moinsen.pub) - self-hosted private package repository with automated maintenance.

## Features

### Dashboard

A comprehensive overview of your workspace:
- Package count and types (Flutter apps, plugins, Dart packages)
- Dependency count and health score
- Version conflict detection with one-click fixes
- SDK constraint mismatch detection
- Outdated package scanning

### Dependency Graph

Interactive visualization of package relationships:
- Force-directed graph layout
- Color-coded package types
- Toggle external dependencies
- Export to PNG or SVG
- Click to navigate to packages

### Migration Wizard

Guided migration to Pub Workspaces (Dart 3.6+):
- Analyze current workspace state
- Choose migration target (Pub Workspaces, Melos hybrid)
- Preview all changes before applying
- Automatic backup creation
- Step-by-step progress tracking

### Version Management

Keep dependencies in sync across packages:
- Detect version conflicts between packages
- Auto-suggest resolutions
- Batch fix all conflicts
- SDK constraint unification
- Rollback support with backups

### Outdated Package Detection

Stay up to date with the latest versions:
- Check all pub.dev dependencies
- See current vs latest versions
- Update individual packages
- Bulk update all outdated packages

### Package Health Warnings

Protect your project from unmaintained dependencies:
- **Critical warnings** for packages not updated in 2+ years
- **Warnings** for packages not updated in 1+ year
- **Detection** of discontinued packages on pub.dev
- **Quality scores** flagging low-quality packages
- **"Find Alternatives"** button opens pub.dev search
- **Configurable thresholds** via VS Code settings
- **Problems panel** integration for quick navigation

### GitHub Repository Analysis 🚀

Deep insights into package maintenance health:
- **Real-time GitHub metrics** - stars, issues, PRs, last commit
- **Security advisories** - critical alerts for vulnerable packages
- **Archived detection** - warns when repositories are abandoned
- **Stale repos** - identifies repos with no recent activity
- **Issue/PR responsiveness** - flags slow maintainer response
- **Risk Score (0-100)** - comprehensive health assessment combining:
  - pub.dev quality score (30%)
  - Days since update (25%)
  - GitHub issue/star ratio (15%)
  - PR responsiveness (15%)
  - Security & status flags (15%)

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Moinsen Pubspec Master"
4. Click Install

Or install via command line:
```bash
code --install-extension moinsen.pubspec-master
```

## Usage

### Quick Start

1. Open a Flutter/Dart project or monorepo
2. Click the Moinsen Pubspec Master icon in the Activity Bar
3. View your packages in the sidebar
4. Click "Dashboard" in the toolbar for the full view

### Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Show Dashboard | Ctrl+Shift+P D | Cmd+Shift+P D |
| Show Graph | Ctrl+Shift+P G | Cmd+Shift+P G |
| Refresh | Ctrl+Shift+P R | Cmd+Shift+P R |
| Pub Get All | Ctrl+Shift+P I | Cmd+Shift+P I |
| Pub Upgrade All | Ctrl+Shift+P U | Cmd+Shift+P U |
| Migration Wizard | Ctrl+Shift+P M | Cmd+Shift+P M |
| Sync All Versions | Ctrl+Shift+P S | Cmd+Shift+P S |

### Commands

Access via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- `Moinsen Pubspec Master: Show Dashboard` - Open the main dashboard
- `Moinsen Pubspec Master: Show Dependency Graph` - Open interactive graph
- `Moinsen Pubspec Master: Migration Wizard` - Start workspace migration
- `Moinsen Pubspec Master: Run Pub Get (All Packages)` - Run pub get everywhere
- `Moinsen Pubspec Master: Run Pub Upgrade (All Packages)` - Upgrade all packages
- `Moinsen Pubspec Master: Sync All Versions` - Fix all version conflicts
- `Moinsen Pubspec Master: Refresh` - Refresh package data
- `Moinsen Pubspec Master: Create Configuration File` - Create .pubspec-master.json
- `Moinsen Pubspec Master: Open Configuration File` - Edit workspace config

## Configuration

### VS Code Settings

Configure via Settings (Ctrl+, / Cmd+,) under "Moinsen Pubspec Master":

```json
{
  "pubspecMaster.scan.excludePatterns": [
    "**/build/**",
    "**/.dart_tool/**"
  ],
  "pubspecMaster.scan.maxDepth": 10,
  "pubspecMaster.dashboard.refreshOnSave": true,
  "pubspecMaster.cache.ttlMinutes": 15,
  "pubspecMaster.sync.createBackup": true,
  "pubspecMaster.sync.backupLocation": ".pubspec-master-backup"
}
```

### Workspace Configuration

Create `.pubspec-master.json` in your workspace root for project-specific settings:

```json
{
  "scan": {
    "excludePatterns": ["**/build/**", "**/examples/**"],
    "maxDepth": 5
  },
  "sync": {
    "createBackup": true,
    "ignoredPackages": ["legacy_package"],
    "ignoredDependencies": ["path_provider"]
  },
  "packageGroups": {
    "apps": ["app_mobile", "app_web"],
    "core": ["core_utils", "core_models"]
  },
  "versionRules": {
    "flutter_bloc": {
      "preferredVersion": "^8.0.0"
    }
  }
}
```

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `scan.excludePatterns` | `["**/build/**", ...]` | Glob patterns to exclude |
| `scan.maxDepth` | `10` | Max directory depth for scanning |
| `dashboard.refreshOnSave` | `true` | Auto-refresh on pubspec.yaml save |
| `cache.ttlMinutes` | `15` | Cache duration for pub.dev data |
| `cache.offlineMaxHours` | `24` | Max age of cached data offline |
| `sync.createBackup` | `true` | Create backup before changes |
| `sync.backupLocation` | `.pubspec-master-backup` | Backup directory |
| `sync.ignoredPackages` | `[]` | Packages to skip in sync |
| `sync.ignoredDependencies` | `[]` | Dependencies to skip |
| `sync.analyzeAfterFix` | `false` | Run flutter analyze after fix |
| `output.showTerminal` | `true` | Show terminal for commands |
| `health.enabled` | `true` | Enable package health warnings |
| `health.unmaintainedThresholdDays` | `365` | Days to consider unmaintained (warning) |
| `health.criticalThresholdDays` | `730` | Days to consider critical |
| `health.checkDiscontinued` | `true` | Check for discontinued packages |
| `health.minScoreThreshold` | `50` | Minimum quality score (0-160) |
| `github.enabled` | `true` | Enable GitHub repository analysis |
| `github.token` | `""` | GitHub token for higher rate limits |
| `github.cacheTtlMinutes` | `60` | GitHub metrics cache duration |
| `github.highIssueCountThreshold` | `100` | Issues to trigger warning |
| `github.staleRepoThresholdDays` | `180` | Days without commits to flag |

## Requirements

- VS Code 1.85.0 or higher
- For Migration Wizard: Dart SDK 3.6+ (for Pub Workspaces support)

## Troubleshooting

### Packages not appearing

- Check if pubspec.yaml files are valid YAML
- Verify files aren't in excluded patterns
- Try "Moinsen Pubspec Master: Refresh"

### Offline mode

The extension caches pub.dev data for offline use. If you see "Offline mode":
- Check your internet connection
- Cached data will be used (up to 24 hours old)

### Migration issues

- Ensure all packages have Dart SDK >=3.6.0 constraint
- Check for path dependencies outside workspace
- Review warnings before applying migration

## Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/moinsen-dev/moinsen-pubspec-master) for:
- Bug reports
- Feature requests
- Pull requests

## License

MIT License - see [LICENSE](LICENSE) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Moinsen Ecosystem

This extension is part of the **Moinsen** ecosystem for Flutter/Dart developers:

- **Moinsen Pubspec Master** (this extension) - Free, open-source monorepo management
- **[Moinsen Pub](https://moinsen.pub)** - Self-hosted private package repository with:
  - Private Dart/Flutter package hosting
  - Automated package maintenance
  - Team collaboration features
  - CI/CD integration

---

Made with love for the Flutter community by [Moinsen](https://moinsen.pub)
