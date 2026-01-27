import { PubspecInfo, PackageHealthIssue, GitHubHealthMetrics } from '../types';
import { DependencyGraph } from './DependencyResolver';
import { PubPackageInfo } from '../api/PubDevClient';
import { GitHubMetrics } from '../api/GitHubClient';
import { CompatibilityCheckResult } from './CompatibilityAnalyzer';

/**
 * Version conflict information
 */
export interface VersionConflict {
  dependencyName: string;
  packages: Array<{
    packageName: string;
    constraint: string;
    isDev: boolean;
  }>;
  severity: 'high' | 'medium' | 'low';
  suggestedResolution?: string;
}

/**
 * SDK constraint mismatch
 */
export interface SdkMismatch {
  packages: Array<{
    packageName: string;
    constraint: string;
  }>;
  lowestConstraint: string;
  highestConstraint: string;
  severity: 'high' | 'medium' | 'low';
}

/**
 * Outdated package information
 */
export interface OutdatedPackage {
  name: string;
  current: string;
  latest?: string;
  latestCompatible?: string;
  usedIn: string[];
}

/**
 * Workspace analysis result
 */
export interface WorkspaceAnalysis {
  conflicts: VersionConflict[];
  sdkMismatches: SdkMismatch[];
  outdatedPackages: OutdatedPackage[];
  healthIssues: PackageHealthIssue[];
  /** SDK compatibility issues for package updates (optional, requires network) */
  compatibilityIssues?: CompatibilityCheckResult[];
  healthScore: number;
  summary: {
    totalPackages: number;
    totalDependencies: number;
    totalConflicts: number;
    totalOutdated: number;
    totalHealthIssues: number;
    /** Number of packages with SDK-incompatible updates */
    totalIncompatibleUpdates?: number;
  };
}

/**
 * Analyzer for detecting version conflicts and issues
 */
export class VersionAnalyzer {
  /**
   * Analyze the workspace for conflicts and issues
   */
  analyze(pubspecs: PubspecInfo[], graph: DependencyGraph): WorkspaceAnalysis {
    const conflicts = this.detectConflicts(pubspecs, graph);
    const sdkMismatches = this.detectSdkMismatches(pubspecs);

    // Count unique dependencies
    const allDeps = new Set<string>();
    for (const pubspec of pubspecs) {
      for (const dep of pubspec.dependencies.keys()) {
        allDeps.add(dep);
      }
      for (const dep of pubspec.devDependencies.keys()) {
        allDeps.add(dep);
      }
    }

    const healthScore = this.calculateHealthScore(
      pubspecs.length,
      conflicts.length,
      sdkMismatches.length
    );

    return {
      conflicts,
      sdkMismatches,
      outdatedPackages: [], // Populated by pub.dev API later
      healthIssues: [], // Populated by analyzePackageHealth() method
      healthScore,
      summary: {
        totalPackages: pubspecs.length,
        totalDependencies: allDeps.size,
        totalConflicts: conflicts.length,
        totalOutdated: 0,
        totalHealthIssues: 0,
      },
    };
  }

  /**
   * Detect version conflicts across packages
   */
  private detectConflicts(
    pubspecs: PubspecInfo[],
    graph: DependencyGraph
  ): VersionConflict[] {
    const conflicts: VersionConflict[] = [];
    const dependencyVersions = new Map<
      string,
      Array<{ packageName: string; constraint: string; isDev: boolean }>
    >();

    // Collect all version constraints for each dependency
    for (const pubspec of pubspecs) {
      for (const [depName, depInfo] of pubspec.dependencies) {
        // Skip internal path dependencies
        if (depInfo.source === 'path' && graph.internalPackages.includes(depName)) {
          continue;
        }

        if (!dependencyVersions.has(depName)) {
          dependencyVersions.set(depName, []);
        }
        dependencyVersions.get(depName)!.push({
          packageName: pubspec.name,
          constraint: depInfo.constraint,
          isDev: false,
        });
      }

      for (const [depName, depInfo] of pubspec.devDependencies) {
        if (depInfo.source === 'path' && graph.internalPackages.includes(depName)) {
          continue;
        }

        if (!dependencyVersions.has(depName)) {
          dependencyVersions.set(depName, []);
        }
        dependencyVersions.get(depName)!.push({
          packageName: pubspec.name,
          constraint: depInfo.constraint,
          isDev: true,
        });
      }
    }

    // Find conflicts (same dependency with different constraints)
    for (const [depName, usages] of dependencyVersions) {
      if (usages.length < 2) {
        continue;
      }

      const uniqueConstraints = new Set(usages.map((u) => u.constraint));
      if (uniqueConstraints.size > 1) {
        const severity = this.determineConflictSeverity(
          Array.from(uniqueConstraints)
        );
        const suggestedResolution = this.suggestResolution(
          Array.from(uniqueConstraints)
        );

        conflicts.push({
          dependencyName: depName,
          packages: usages,
          severity,
          suggestedResolution,
        });
      }
    }

    // Sort by severity
    return conflicts.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Detect SDK constraint mismatches
   */
  private detectSdkMismatches(pubspecs: PubspecInfo[]): SdkMismatch[] {
    const mismatches: SdkMismatch[] = [];
    const sdkConstraints = new Map<string, string[]>();

    for (const pubspec of pubspecs) {
      if (pubspec.sdkConstraint) {
        const constraint = pubspec.sdkConstraint;
        if (!sdkConstraints.has(constraint)) {
          sdkConstraints.set(constraint, []);
        }
        sdkConstraints.get(constraint)!.push(pubspec.name);
      }
    }

    if (sdkConstraints.size > 1) {
      // Sort constraints using semantic version comparison, not string comparison
      const constraints = Array.from(sdkConstraints.keys()).sort((a, b) => {
        const versionA = this.extractVersionFromConstraint(a);
        const versionB = this.extractVersionFromConstraint(b);
        return this.compareVersions(versionA, versionB);
      });
      const packages: Array<{ packageName: string; constraint: string }> = [];

      for (const [constraint, pkgs] of sdkConstraints) {
        for (const pkg of pkgs) {
          packages.push({ packageName: pkg, constraint });
        }
      }

      mismatches.push({
        packages,
        lowestConstraint: constraints[0],
        highestConstraint: constraints[constraints.length - 1],
        severity: this.determineSdkMismatchSeverity(constraints),
      });
    }

    return mismatches;
  }

  /**
   * Extract version number from SDK constraint string
   * Handles formats like: ^3.7.0, >=3.7.0, >=3.7.0 <4.0.0, 3.7.0
   */
  private extractVersionFromConstraint(constraint: string): string {
    // Match version pattern: optional ^/>=/> followed by major.minor.patch
    const match = constraint.match(/[\^>=<]*(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : '0.0.0';
  }

  /**
   * Determine severity of a version conflict
   */
  private determineConflictSeverity(
    constraints: string[]
  ): 'high' | 'medium' | 'low' {
    // Extract major versions
    const majorVersions = new Set<number>();

    for (const constraint of constraints) {
      const match = constraint.match(/\^?(\d+)/);
      if (match) {
        majorVersions.add(parseInt(match[1], 10));
      }
    }

    if (majorVersions.size > 1) {
      return 'high'; // Different major versions
    }

    // Check for exact vs caret conflicts
    const hasExact = constraints.some((c) => !c.startsWith('^'));
    const hasCaret = constraints.some((c) => c.startsWith('^'));

    if (hasExact && hasCaret) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Determine severity of SDK mismatch
   */
  private determineSdkMismatchSeverity(
    constraints: string[]
  ): 'high' | 'medium' | 'low' {
    const majorVersions = new Set<string>();

    for (const constraint of constraints) {
      const match = constraint.match(/\^?(\d+\.\d+)/);
      if (match) {
        majorVersions.add(match[1]);
      }
    }

    if (majorVersions.size > 1) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Suggest a resolution for conflicting constraints
   */
  private suggestResolution(constraints: string[]): string {
    // Find the highest caret constraint
    const caretConstraints = constraints
      .filter((c) => c.startsWith('^'))
      .map((c) => c.substring(1))
      .sort(this.compareVersions.bind(this))
      .reverse();

    if (caretConstraints.length > 0) {
      return `^${caretConstraints[0]}`;
    }

    // Fall back to exact constraints
    const exactConstraints = constraints
      .filter((c) => !c.startsWith('^'))
      .sort(this.compareVersions.bind(this))
      .reverse();

    if (exactConstraints.length > 0) {
      return `^${exactConstraints[0]}`;
    }

    return constraints[0];
  }

  /**
   * Compare two version strings
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map((p) => parseInt(p, 10) || 0);
    const bParts = b.split('.').map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;

      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }

    return 0;
  }

  /**
   * Calculate workspace health score (0-100)
   */
  private calculateHealthScore(
    packageCount: number,
    conflictCount: number,
    sdkMismatchCount: number
  ): number {
    if (packageCount === 0) {
      return 100;
    }

    // Start with perfect score
    let score = 100;

    // Deduct for conflicts (10 points each, max 50)
    score -= Math.min(conflictCount * 10, 50);

    // Deduct for SDK mismatches (15 points each, max 30)
    score -= Math.min(sdkMismatchCount * 15, 30);

    return Math.max(0, score);
  }

  /**
   * Get all packages using a specific dependency
   */
  getPackagesUsingDependency(
    pubspecs: PubspecInfo[],
    dependencyName: string
  ): string[] {
    const packages: string[] = [];

    for (const pubspec of pubspecs) {
      if (
        pubspec.dependencies.has(dependencyName) ||
        pubspec.devDependencies.has(dependencyName)
      ) {
        packages.push(pubspec.name);
      }
    }

    return packages;
  }

  /**
   * Analyze package health based on pub.dev metadata
   * Detects unmaintained, discontinued, and low-quality packages
   *
   * @param pubspecs - Workspace packages to analyze
   * @param packageInfoMap - Map of dependency name to pub.dev package info
   * @param config - Configuration for health thresholds
   * @returns Array of health issues found
   */
  analyzePackageHealth(
    pubspecs: PubspecInfo[],
    packageInfoMap: Map<string, PubPackageInfo>,
    config: {
      unmaintainedThresholdDays: number;
      criticalThresholdDays: number;
      lowQualityScoreThreshold: number;
    } = {
      unmaintainedThresholdDays: 365, // 1 year
      criticalThresholdDays: 730, // 2 years
      lowQualityScoreThreshold: 50, // out of 160
    }
  ): PackageHealthIssue[] {
    const issues: PackageHealthIssue[] = [];
    const now = Date.now();

    // Collect all pub.dev dependencies and which packages use them
    const dependencyUsage = new Map<string, string[]>();

    for (const pubspec of pubspecs) {
      for (const [depName, depInfo] of pubspec.dependencies) {
        if (depInfo.source === 'pub.dev') {
          if (!dependencyUsage.has(depName)) {
            dependencyUsage.set(depName, []);
          }
          dependencyUsage.get(depName)!.push(pubspec.name);
        }
      }
      for (const [depName, depInfo] of pubspec.devDependencies) {
        if (depInfo.source === 'pub.dev') {
          if (!dependencyUsage.has(depName)) {
            dependencyUsage.set(depName, []);
          }
          const usages = dependencyUsage.get(depName)!;
          if (!usages.includes(pubspec.name)) {
            usages.push(pubspec.name);
          }
        }
      }
    }

    // Analyze each dependency
    for (const [depName, usedBy] of dependencyUsage) {
      const pkgInfo = packageInfoMap.get(depName);
      if (!pkgInfo) {
        continue; // Skip packages we couldn't fetch info for
      }

      // Check for discontinued packages (CRITICAL)
      if (pkgInfo.isDiscontinued) {
        issues.push({
          packageName: depName,
          issueType: 'discontinued',
          severity: 'critical',
          daysSinceUpdate: this.calculateDaysSinceUpdate(pkgInfo.latestPublished, now),
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" has been discontinued by its maintainer`,
          suggestion: 'Find an actively maintained alternative or fork the package',
        });
        continue; // Don't add other issues for discontinued packages
      }

      // Check for unmaintained packages based on last update
      if (pkgInfo.latestPublished) {
        const daysSinceUpdate = this.calculateDaysSinceUpdate(pkgInfo.latestPublished, now);

        if (daysSinceUpdate >= config.criticalThresholdDays) {
          // CRITICAL: No update in 2+ years
          issues.push({
            packageName: depName,
            issueType: 'unmaintained',
            severity: 'critical',
            daysSinceUpdate,
            lastUpdated: pkgInfo.latestPublished,
            score: pkgInfo.score,
            usedBy,
            message: `Package "${depName}" hasn't been updated in ${Math.floor(daysSinceUpdate / 365)} years - likely abandoned`,
            suggestion: 'Consider migrating to an actively maintained alternative',
          });
        } else if (daysSinceUpdate >= config.unmaintainedThresholdDays) {
          // WARNING: No update in 1+ year
          issues.push({
            packageName: depName,
            issueType: 'unmaintained',
            severity: 'warning',
            daysSinceUpdate,
            lastUpdated: pkgInfo.latestPublished,
            score: pkgInfo.score,
            usedBy,
            message: `Package "${depName}" hasn't been updated in over ${Math.floor(daysSinceUpdate / 30)} months`,
            suggestion: 'Monitor for security updates or consider alternatives',
          });
        }
      }

      // Check for low quality score (INFO level)
      if (
        pkgInfo.score !== undefined &&
        pkgInfo.score < config.lowQualityScoreThreshold
      ) {
        // Only add if we haven't already flagged this package
        const alreadyFlagged = issues.some((i) => i.packageName === depName);
        if (!alreadyFlagged) {
          issues.push({
            packageName: depName,
            issueType: 'low-quality',
            severity: 'info',
            daysSinceUpdate: this.calculateDaysSinceUpdate(pkgInfo.latestPublished, now),
            lastUpdated: pkgInfo.latestPublished,
            score: pkgInfo.score,
            usedBy,
            message: `Package "${depName}" has a low quality score (${pkgInfo.score}/160)`,
            suggestion: 'Review package documentation and consider alternatives if quality is important',
          });
        }
      }
    }

    // Sort by severity (critical first, then warning, then info)
    return issues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Calculate days since a package was last updated
   */
  private calculateDaysSinceUpdate(lastPublished: string | undefined, now: number): number {
    if (!lastPublished) {
      return 0;
    }
    const publishDate = new Date(lastPublished).getTime();
    return Math.floor((now - publishDate) / (1000 * 60 * 60 * 24));
  }

  /**
   * Enhanced health analysis including GitHub repository metrics
   * This provides a comprehensive package risk assessment
   *
   * @param pubspecs - Workspace packages to analyze
   * @param packageInfoMap - Map of dependency name to pub.dev package info
   * @param githubMetricsMap - Map of dependency name to GitHub metrics
   * @param config - Configuration for health thresholds
   * @returns Array of health issues found with risk scores
   */
  analyzePackageHealthWithGitHub(
    pubspecs: PubspecInfo[],
    packageInfoMap: Map<string, PubPackageInfo>,
    githubMetricsMap: Map<string, GitHubMetrics>,
    config: {
      unmaintainedThresholdDays: number;
      criticalThresholdDays: number;
      lowQualityScoreThreshold: number;
      highIssueCountThreshold: number;
      staleRepoThresholdDays: number;
    } = {
      unmaintainedThresholdDays: 365, // 1 year
      criticalThresholdDays: 730, // 2 years
      lowQualityScoreThreshold: 50, // out of 160
      highIssueCountThreshold: 100, // open issues
      staleRepoThresholdDays: 180, // 6 months no commits
    }
  ): PackageHealthIssue[] {
    const issues: PackageHealthIssue[] = [];
    const now = Date.now();

    // Collect all pub.dev dependencies and which packages use them
    const dependencyUsage = new Map<string, string[]>();

    for (const pubspec of pubspecs) {
      for (const [depName, depInfo] of pubspec.dependencies) {
        if (depInfo.source === 'pub.dev') {
          if (!dependencyUsage.has(depName)) {
            dependencyUsage.set(depName, []);
          }
          dependencyUsage.get(depName)!.push(pubspec.name);
        }
      }
      for (const [depName, depInfo] of pubspec.devDependencies) {
        if (depInfo.source === 'pub.dev') {
          if (!dependencyUsage.has(depName)) {
            dependencyUsage.set(depName, []);
          }
          const usages = dependencyUsage.get(depName)!;
          if (!usages.includes(pubspec.name)) {
            usages.push(pubspec.name);
          }
        }
      }
    }

    // Analyze each dependency
    for (const [depName, usedBy] of dependencyUsage) {
      const pkgInfo = packageInfoMap.get(depName);
      const githubMetrics = githubMetricsMap.get(depName);

      if (!pkgInfo) {
        continue; // Skip packages we couldn't fetch info for
      }

      const daysSinceUpdate = this.calculateDaysSinceUpdate(pkgInfo.latestPublished, now);

      // Build GitHub health metrics object
      const githubHealth: GitHubHealthMetrics | undefined = githubMetrics
        ? {
            repoFullName: githubMetrics.repoFullName,
            openIssues: githubMetrics.openIssues,
            openPRs: githubMetrics.openPRs,
            daysSinceLastCommit: githubMetrics.daysSinceLastCommit,
            stars: githubMetrics.stars,
            isArchived: githubMetrics.isArchived,
            securityAdvisoryCount: githubMetrics.securityAdvisoryCount,
            license: githubMetrics.license,
          }
        : undefined;

      // Calculate risk score (0-100, higher = more risky)
      const riskScore = this.calculateRiskScore(pkgInfo, githubMetrics, daysSinceUpdate);

      // Check for SECURITY ADVISORIES (CRITICAL - highest priority)
      if (githubMetrics?.hasSecurityAdvisories && githubMetrics.securityAdvisoryCount > 0) {
        issues.push({
          packageName: depName,
          issueType: 'security-advisory',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" has ${githubMetrics.securityAdvisoryCount} security advisor${githubMetrics.securityAdvisoryCount > 1 ? 'ies' : 'y'}!`,
          suggestion: 'Update immediately or find a secure alternative. Check GitHub for vulnerability details.',
          github: githubHealth,
          riskScore,
        });
        continue; // Don't add other issues for packages with security advisories
      }

      // Check for ARCHIVED REPOSITORY (CRITICAL)
      if (githubMetrics?.isArchived) {
        issues.push({
          packageName: depName,
          issueType: 'archived',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" repository is archived - no further updates possible`,
          suggestion: 'Fork the repository or migrate to an actively maintained alternative',
          github: githubHealth,
          riskScore,
        });
        continue;
      }

      // Check for DISCONTINUED on pub.dev (CRITICAL)
      if (pkgInfo.isDiscontinued) {
        issues.push({
          packageName: depName,
          issueType: 'discontinued',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" has been discontinued by its maintainer`,
          suggestion: 'Find an actively maintained alternative or fork the package',
          github: githubHealth,
          riskScore,
        });
        continue;
      }

      // Check for UNMAINTAINED packages based on last pub.dev update
      if (daysSinceUpdate >= config.criticalThresholdDays) {
        issues.push({
          packageName: depName,
          issueType: 'unmaintained',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" hasn't been updated in ${Math.floor(daysSinceUpdate / 365)} years - likely abandoned`,
          suggestion: 'Consider migrating to an actively maintained alternative',
          github: githubHealth,
          riskScore,
        });
        continue;
      }

      if (daysSinceUpdate >= config.unmaintainedThresholdDays) {
        issues.push({
          packageName: depName,
          issueType: 'unmaintained',
          severity: 'warning',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" hasn't been updated in over ${Math.floor(daysSinceUpdate / 30)} months`,
          suggestion: 'Monitor for security updates or consider alternatives',
          github: githubHealth,
          riskScore,
        });
        continue;
      }

      // Check for STALE REPOSITORY (GitHub commits but no pub.dev release)
      if (
        githubMetrics &&
        githubMetrics.daysSinceLastCommit >= config.staleRepoThresholdDays
      ) {
        issues.push({
          packageName: depName,
          issueType: 'stale-repo',
          severity: 'warning',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" repository has no commits in ${Math.floor(githubMetrics.daysSinceLastCommit / 30)} months`,
          suggestion: 'The maintainer may be inactive. Monitor for updates or consider alternatives.',
          github: githubHealth,
          riskScore,
        });
        continue;
      }

      // Check for HIGH ISSUE COUNT (WARNING - maintenance burden indicator)
      if (
        githubMetrics &&
        githubMetrics.openIssues >= config.highIssueCountThreshold
      ) {
        // Calculate issues/stars ratio to assess if it's proportional
        const issuesPerHundredStars = githubMetrics.stars > 0
          ? (githubMetrics.openIssues / githubMetrics.stars) * 100
          : githubMetrics.openIssues;

        // Only flag if issues are disproportionate to popularity
        if (issuesPerHundredStars > 5) { // More than 5 issues per 100 stars
          issues.push({
            packageName: depName,
            issueType: 'high-issue-count',
            severity: 'warning',
            daysSinceUpdate,
            lastUpdated: pkgInfo.latestPublished,
            score: pkgInfo.score,
            usedBy,
            message: `Package "${depName}" has ${githubMetrics.openIssues} open issues and ${githubMetrics.openPRs} open PRs`,
            suggestion: 'High issue count may indicate maintenance problems. Check issue age and response times.',
            github: githubHealth,
            riskScore,
          });
          continue;
        }
      }

      // Check for LOW QUALITY SCORE (INFO level)
      if (
        pkgInfo.score !== undefined &&
        pkgInfo.score < config.lowQualityScoreThreshold
      ) {
        issues.push({
          packageName: depName,
          issueType: 'low-quality',
          severity: 'info',
          daysSinceUpdate,
          lastUpdated: pkgInfo.latestPublished,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" has a low quality score (${pkgInfo.score}/160)`,
          suggestion: 'Review package documentation and consider alternatives if quality is important',
          github: githubHealth,
          riskScore,
        });
      }
    }

    // Sort by risk score (highest first), then by severity
    return issues.sort((a, b) => {
      // First sort by risk score (descending)
      const riskDiff = (b.riskScore ?? 0) - (a.riskScore ?? 0);
      if (riskDiff !== 0) {
        return riskDiff;
      }
      // Then by severity
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Calculate a comprehensive risk score (0-100) for a package
   * Higher score = more risky
   *
   * Factors:
   * - pub.dev score (30% weight) - inverted, lower score = higher risk
   * - Days since update (25% weight)
   * - GitHub issue/star ratio (15% weight)
   * - PR response (15% weight) - high open PRs = slow response
   * - Security & status flags (15% weight) - archived, discontinued, advisories
   */
  private calculateRiskScore(
    pkgInfo: PubPackageInfo,
    githubMetrics: GitHubMetrics | undefined,
    daysSinceUpdate: number
  ): number {
    let score = 0;

    // pub.dev score component (30%) - inverted: low pub.dev score = high risk
    // pub.dev score is 0-160, we invert it to 0-30 risk points
    if (pkgInfo.score !== undefined) {
      const normalizedPubScore = pkgInfo.score / 160; // 0-1
      score += (1 - normalizedPubScore) * 30;
    } else {
      score += 15; // Unknown = medium risk
    }

    // Days since update component (25%)
    // 0 days = 0 risk, 365 days = 12.5, 730+ days = 25
    const updateRisk = Math.min(daysSinceUpdate / 730, 1) * 25;
    score += updateRisk;

    // GitHub metrics components (45% total)
    if (githubMetrics) {
      // Issue/star ratio (15%)
      // More than 10 issues per 100 stars = max risk
      const issuesPerHundredStars = githubMetrics.stars > 0
        ? (githubMetrics.openIssues / githubMetrics.stars) * 100
        : githubMetrics.openIssues;
      const issueRisk = Math.min(issuesPerHundredStars / 10, 1) * 15;
      score += issueRisk;

      // PR responsiveness (15%)
      // Many open PRs relative to stars = slow response = high risk
      const prsPerHundredStars = githubMetrics.stars > 0
        ? (githubMetrics.openPRs / githubMetrics.stars) * 100
        : githubMetrics.openPRs;
      const prRisk = Math.min(prsPerHundredStars / 5, 1) * 15;
      score += prRisk;

      // Status flags (15%)
      if (githubMetrics.hasSecurityAdvisories) {
        score += 15; // Max risk for security issues
      } else if (githubMetrics.isArchived) {
        score += 15; // Max risk for archived
      } else if (githubMetrics.daysSinceLastCommit > 365) {
        score += 10; // High risk for stale repo
      } else if (githubMetrics.daysSinceLastCommit > 180) {
        score += 5; // Medium risk for somewhat stale
      }
    } else {
      // No GitHub data available - add moderate uncertainty risk
      score += 10;
    }

    // Add bonus risk for discontinued packages
    if (pkgInfo.isDiscontinued) {
      score = Math.min(score + 25, 100);
    }

    return Math.round(Math.min(score, 100));
  }
}
