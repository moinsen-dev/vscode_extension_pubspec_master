# Changelog

All notable changes to Pubspec Master will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
