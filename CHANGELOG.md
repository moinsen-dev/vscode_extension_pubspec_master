# Changelog

All notable changes to Moinsen Pubspec Master will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2025-12-21

### Added
- **GitHub Repository Integration** 🚀
  - Fetches real-time metrics from GitHub repositories
  - Shows open issues, open PRs, stars, and last commit date
  - Detects archived repositories (critical warning)
  - Detects security advisories (critical warning)
  - Identifies stale repositories (no commits in 6+ months)
  - Flags high issue counts relative to package popularity

- **Package Risk Score** (0-100)
  - Comprehensive risk calculation combining:
    - pub.dev quality score (30% weight)
    - Days since last update (25% weight)
    - GitHub issue/star ratio (15% weight)
    - PR responsiveness (15% weight)
    - Security & status flags (15% weight)
  - Visual risk badges in dashboard
  - Issues sorted by risk score (highest first)

- **New GitHub Settings**:
  - `pubspecMaster.github.enabled` - Enable/disable GitHub analysis
  - `pubspecMaster.github.token` - Optional token for higher rate limits
  - `pubspecMaster.github.cacheTtlMinutes` - Cache duration (default: 60)
  - `pubspecMaster.github.highIssueCountThreshold` - Issue count warning threshold
  - `pubspecMaster.github.staleRepoThresholdDays` - Stale repo threshold (default: 180)

- **Enhanced Dashboard UI**:
  - GitHub metrics displayed with icons and stats
  - Direct links to GitHub issues and repository
  - "View Issues" button for packages with open issues
  - New badge styles for security, archived, and stale issues

### Changed
- Health analysis now includes GitHub repository metrics
- Risk-based sorting prioritizes most concerning packages
- Improved icon set for different issue types

## [0.6.3] - 2025-12-21

### Added
- **Package Health Warnings**: Detect unmaintained and risky dependencies
  - Warns about packages not updated in 1+ years (warning level)
  - Critical warnings for packages not updated in 2+ years
  - Detects packages marked as discontinued on pub.dev
  - Flags packages with low quality scores (<50/160)
  - Shows "Find Alternatives" button for critical issues
  - Configurable thresholds via VS Code settings

- **New Settings for Package Health**:
  - `pubspecMaster.health.enabled` - Enable/disable health warnings
  - `pubspecMaster.health.unmaintainedThresholdDays` - Warning threshold (default: 365 days)
  - `pubspecMaster.health.criticalThresholdDays` - Critical threshold (default: 730 days)
  - `pubspecMaster.health.checkDiscontinued` - Check discontinued packages
  - `pubspecMaster.health.minScoreThreshold` - Minimum quality score (default: 50)

- **Dashboard Package Health Section**:
  - Visual display of health issues with severity badges
  - Details on last update date and affected packages
  - Contextual suggestions for each issue

- **Problems Panel Integration**:
  - Health issues now appear in VS Code Problems panel
  - Click to navigate directly to dependency in pubspec.yaml

### Changed
- "Check Updates" button now also checks package health
- Health analysis runs automatically with update checks
- Updated notification messages to include health issue counts

## [0.6.2] - 2025-12-21

### Added
- Moinsen Pub integration settings in VS Code configuration
  - `pubspecMaster.moinsenPub.enabled` - Enable private package hosting
  - `pubspecMaster.moinsenPub.serverUrl` - Configure your Moinsen Pub server
- Project CLAUDE.md with branding and development guidelines
- Updated PRD with Moinsen ecosystem section

## [0.6.1] - 2025-12-21

### Fixed
- Duplicate action items in sidebar toolbar dropdown menu
- Expand All button now positioned next to Collapse All button

## [0.6.0] - 2025-12-21

### Changed
- **Rebranded to Moinsen Pubspec Master**
  - Extension now part of the Moinsen ecosystem
  - Updated display name, descriptions, and UI text
  - All existing configurations and settings remain compatible

### Added
- Promotional links to Moinsen Pub for private package hosting
- Updated documentation with Moinsen ecosystem information

## [0.5.0] - 2025-12-21

### Added
- **Migration Wizard**: Step-by-step guide for migrating to Pub Workspaces (Dart 3.6+)
  - Analyze current workspace state
  - Detect blockers and warnings
  - Preview all changes before applying
  - Automatic backup creation
  - Support for Melos hybrid migration

- **Outdated Package Detection**: Check pub.dev for newer versions
  - Scan all dependencies in workspace
  - View current vs latest versions
  - Update individual packages
  - Bulk update all outdated packages
  - Batched API calls to avoid rate limiting

- **Graph Export**: Save dependency visualizations
  - Export to PNG (2x resolution)
  - Export to SVG with inline styles
  - Preserves VS Code theme colors

- **Keyboard Shortcuts**: Quick access to common actions
  - Ctrl/Cmd+Shift+P D: Show Dashboard
  - Ctrl/Cmd+Shift+P G: Show Graph
  - Ctrl/Cmd+Shift+P R: Refresh
  - Ctrl/Cmd+Shift+P I: Pub Get All
  - Ctrl/Cmd+Shift+P U: Pub Upgrade All
  - Ctrl/Cmd+Shift+P M: Migration Wizard
  - Ctrl/Cmd+Shift+P S: Sync All Versions

- **Workspace Configuration**: Per-project settings via .pubspec-master.json
  - Override VS Code settings per workspace
  - Package groups for organization
  - Version rules for specific dependencies
  - File watcher for auto-reload

### Changed
- Improved version conflict detection algorithm
- Better SDK constraint handling in migration planner
- Enhanced error messages for common issues

### Fixed
- Version comparison bug where version 10 was sorted before version 7
- Duplicate packages appearing in sidebar
- Missing expand button in tree view

## [0.4.0] - 2025-12-20

### Added
- Version conflict auto-fix with suggested resolutions
- SDK constraint mismatch detection and fixing
- Backup and rollback support for all changes
- Flutter analyze integration after fixes
- Terminal output for pub commands
- Offline mode with cached pub.dev data

### Changed
- Improved dashboard performance
- Better dependency graph layout

## [0.3.0] - 2025-12-19

### Added
- Interactive dependency graph visualization
- Force-directed layout with drag support
- Toggle external dependencies view
- Package tooltips with dependency info
- Click-to-navigate to packages

## [0.2.0] - 2025-12-18

### Added
- Dashboard webview with statistics
- Health score calculation
- Issues list with severity badges
- Package list with quick actions
- Pub get and pub upgrade buttons

## [0.1.0] - 2025-12-17

### Added
- Initial release
- Workspace scanning for pubspec.yaml files
- Package tree view in sidebar
- Package type detection (Flutter app, plugin, Dart package)
- Dependency listing per package
- Context menu actions for pub commands
