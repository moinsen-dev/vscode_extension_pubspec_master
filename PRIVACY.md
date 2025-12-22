# Privacy Policy

**Moinsen Pubspec Master** is committed to user privacy. This document explains what data the extension accesses and how it is handled.

## Data Collection

**We do not collect, store, or transmit any personal data.**

## Network Requests

The extension makes network requests only to fetch public package information:

### pub.dev API
- **Purpose**: Check for package updates, fetch version information, and retrieve package health metrics
- **Data sent**: Package names from your pubspec.yaml files
- **Data received**: Public package metadata (versions, scores, publication dates)
- **No authentication required**

### GitHub API (Optional)
- **Purpose**: Fetch repository health metrics (open issues, last commit, security advisories)
- **Data sent**: Repository URLs extracted from package metadata
- **Data received**: Public repository statistics
- **Authentication**: Optional GitHub token for higher rate limits (5000 vs 60 requests/hour)

## Local Storage

All data is stored locally on your machine:

- **Cache**: Package information is cached in VS Code's global storage to reduce API calls
- **Backups**: When applying version changes, backups are stored in your workspace (`.pubspec-master-backup/`)
- **Settings**: Extension configuration is stored in VS Code's standard settings

## What We DON'T Do

- **No analytics or telemetry** - We don't track how you use the extension
- **No user identification** - We don't know who you are
- **No usage tracking** - We don't monitor your activity
- **No data transmission to Moinsen servers** - Unless you opt-in to Moinsen Pub integration
- **No code scanning** - We only read pubspec.yaml files, not your source code

## GitHub Token

If you provide a GitHub personal access token for enhanced repository analysis:

- The token is stored securely in VS Code's settings
- It is only sent to GitHub's API (api.github.com)
- It is never transmitted to any other server
- You can revoke it at any time via GitHub settings

## Moinsen Pub Integration (Optional)

If you enable Moinsen Pub integration for private package hosting:

- This is an opt-in feature, disabled by default
- Your server URL is stored in VS Code settings
- Communication occurs only with your specified Moinsen Pub server
- See [moinsen.pub](https://moinsen.pub) for their privacy policy

## Third-Party Services

This extension interacts with:

| Service | Purpose | Privacy Policy |
|---------|---------|----------------|
| pub.dev | Dart/Flutter package registry | [pub.dev/policy](https://pub.dev/policy) |
| GitHub API | Repository health metrics | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement) |

## Open Source

This extension is open source. You can review exactly what data is accessed by examining the source code:

- Repository: [github.com/moinsen-dev/moinsen-pubspec-master](https://github.com/moinsen-dev/moinsen-pubspec-master)
- API clients: `src/api/PubDevClient.ts` and `src/api/GitHubClient.ts`

## Changes to This Policy

Any changes to this privacy policy will be documented in the CHANGELOG and reflected in a new version release.

## Contact

For privacy-related questions, please open an issue on our [GitHub repository](https://github.com/moinsen-dev/moinsen-pubspec-master/issues).

---

*Last updated: December 2025*
