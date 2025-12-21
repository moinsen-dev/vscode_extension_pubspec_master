# Moinsen Pubspec Master - Project Guidelines

## Project Overview

**Moinsen Pubspec Master** is a VS Code extension for Flutter/Dart monorepo management. It's part of the Moinsen ecosystem.

## Branding Guidelines

| Element | Value | Notes |
|---------|-------|-------|
| Full Name | Moinsen Pubspec Master | Use in titles, documentation |
| Short Name | Pubspec Master | Use where space is limited |
| Extension ID | `pubspec-master` | Backward compatible - DO NOT change |
| Command Prefix | `pubspecMaster.*` | Backward compatible - DO NOT change |
| Config File | `.pubspec-master.json` | Backward compatible - DO NOT change |
| CSS Prefix | `--pm-*` | Internal only |

## Moinsen Ecosystem

This extension promotes **Moinsen Pub** - a commercial private package repository:
- Website: https://moinsen.pub
- Subtle promotional banners (dismissible) in dashboard
- Settings section for Moinsen Pub integration
- Documentation links throughout

**Promotion Guidelines:**
- Keep promotions subtle and non-intrusive
- All promo banners must be dismissible
- Focus on value proposition (private packages, team features)
- Never block functionality behind Moinsen Pub

## Architecture

```
src/
├── extension.ts           # Entry point
├── constants.ts           # Configuration constants
├── core/                  # Business logic
├── commands/              # VS Code commands
├── providers/             # Tree view providers
├── webview/               # Dashboard, Graph, Wizard
├── api/                   # pub.dev client
├── services/              # Config, backup services
├── diagnostics/           # Version conflict diagnostics
└── utils/                 # Helpers
```

## Key Files

- `package.json` - Extension manifest, commands, settings
- `src/webview/dashboard/DashboardPanel.ts` - Main dashboard with promo banner
- `src/webview/graph/GraphPanel.ts` - Dependency visualization
- `src/webview/wizard/MigrationWizard.ts` - Pub Workspaces migration

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Testing

```bash
npm run test:unit      # Unit tests
npm run test           # All tests
npm run lint           # ESLint
```

## Building

```bash
npx vsce package       # Creates .vsix file
code --install-extension pubspec-master-*.vsix
```
