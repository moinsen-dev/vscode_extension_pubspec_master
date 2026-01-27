import { IPackageInfo, RegistryPackageInfo } from '../interfaces';

/**
 * Health issue types
 */
export type HealthIssueType =
  | 'discontinued'
  | 'unmaintained'
  | 'low-quality'
  | 'security-advisory'
  | 'archived'
  | 'stale-repo'
  | 'high-issue-count';

/**
 * Health issue severity
 */
export type HealthIssueSeverity = 'critical' | 'warning' | 'info';

/**
 * Repository health metrics (optional, if available)
 */
export interface RepoHealthMetrics {
  repoFullName?: string;
  openIssues?: number;
  openPRs?: number;
  daysSinceLastCommit?: number;
  stars?: number;
  isArchived?: boolean;
  securityAdvisoryCount?: number;
  license?: string;
}

/**
 * Package health issue (ecosystem-agnostic)
 */
export interface PackageHealthIssue {
  /** Package name */
  packageName: string;
  /** Type of health issue */
  issueType: HealthIssueType;
  /** Severity of the issue */
  severity: HealthIssueSeverity;
  /** Days since last update */
  daysSinceUpdate: number;
  /** ISO date of last update */
  lastUpdated?: string;
  /** Quality/health score (ecosystem-specific scale) */
  score?: number;
  /** Packages that depend on this */
  usedBy: string[];
  /** Human-readable issue message */
  message: string;
  /** Suggested action */
  suggestion: string;
  /** Repository health metrics (if available) */
  repoMetrics?: RepoHealthMetrics;
  /** Calculated risk score (0-100) */
  riskScore?: number;
}

/**
 * Health analysis configuration
 */
export interface HealthAnalysisConfig {
  /** Days before considering a package unmaintained */
  unmaintainedThresholdDays: number;
  /** Days before considering a package critically abandoned */
  criticalThresholdDays: number;
  /** Quality score threshold for low-quality warning */
  lowQualityScoreThreshold: number;
  /** Maximum quality score for the ecosystem (for normalization) */
  maxQualityScore: number;
}

/**
 * Health analysis result
 */
export interface HealthAnalysisResult {
  /** All health issues found */
  issues: PackageHealthIssue[];
  /** Overall health score (0-100) */
  healthScore: number;
  /** Summary counts */
  summary: {
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    discontinuedCount: number;
    unmaintainedCount: number;
  };
}

/**
 * Default health analysis configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthAnalysisConfig = {
  unmaintainedThresholdDays: 365, // 1 year
  criticalThresholdDays: 730, // 2 years
  lowQualityScoreThreshold: 50,
  maxQualityScore: 100,
};

/**
 * Ecosystem-agnostic health analyzer
 */
export class HealthAnalyzer {
  private config: HealthAnalysisConfig;

  constructor(config: Partial<HealthAnalysisConfig> = {}) {
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
  }

  /**
   * Analyze package health
   */
  analyze(
    packages: IPackageInfo[],
    registryInfoMap: Map<string, RegistryPackageInfo>,
    repoMetricsMap?: Map<string, RepoHealthMetrics>
  ): HealthAnalysisResult {
    const issues: PackageHealthIssue[] = [];
    const now = Date.now();

    // Collect dependency usage
    const dependencyUsage = this.collectDependencyUsage(packages);

    // Analyze each dependency
    for (const [depName, usedBy] of dependencyUsage) {
      const pkgInfo = registryInfoMap.get(depName);
      if (!pkgInfo) {
        continue; // Skip packages we couldn't fetch info for
      }

      const repoMetrics = repoMetricsMap?.get(depName);
      const daysSinceUpdate = this.calculateDaysSinceUpdate(pkgInfo.publishedAt, now);
      const riskScore = this.calculateRiskScore(pkgInfo, repoMetrics, daysSinceUpdate);

      // Check for security advisories (critical)
      if (repoMetrics?.securityAdvisoryCount && repoMetrics.securityAdvisoryCount > 0) {
        issues.push({
          packageName: depName,
          issueType: 'security-advisory',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.publishedAt,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" has ${repoMetrics.securityAdvisoryCount} security advisory(ies)!`,
          suggestion: 'Update immediately or find a secure alternative.',
          repoMetrics,
          riskScore,
        });
        continue;
      }

      // Check for archived repository (critical)
      if (repoMetrics?.isArchived) {
        issues.push({
          packageName: depName,
          issueType: 'archived',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.publishedAt,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" repository is archived.`,
          suggestion: 'Fork the repository or migrate to an alternative.',
          repoMetrics,
          riskScore,
        });
        continue;
      }

      // Check for discontinued (critical)
      if (pkgInfo.isDiscontinued) {
        issues.push({
          packageName: depName,
          issueType: 'discontinued',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.publishedAt,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" has been discontinued.`,
          suggestion: 'Find an actively maintained alternative.',
          repoMetrics,
          riskScore,
        });
        continue;
      }

      // Check for unmaintained (critical if 2+ years, warning if 1+ year)
      if (daysSinceUpdate >= this.config.criticalThresholdDays) {
        issues.push({
          packageName: depName,
          issueType: 'unmaintained',
          severity: 'critical',
          daysSinceUpdate,
          lastUpdated: pkgInfo.publishedAt,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" hasn't been updated in ${Math.floor(daysSinceUpdate / 365)} years.`,
          suggestion: 'Consider migrating to an actively maintained alternative.',
          repoMetrics,
          riskScore,
        });
        continue;
      }

      if (daysSinceUpdate >= this.config.unmaintainedThresholdDays) {
        issues.push({
          packageName: depName,
          issueType: 'unmaintained',
          severity: 'warning',
          daysSinceUpdate,
          lastUpdated: pkgInfo.publishedAt,
          score: pkgInfo.score,
          usedBy,
          message: `Package "${depName}" hasn't been updated in ${Math.floor(daysSinceUpdate / 30)} months.`,
          suggestion: 'Monitor for security updates or consider alternatives.',
          repoMetrics,
          riskScore,
        });
        continue;
      }

      // Check for low quality score (info)
      if (pkgInfo.score !== undefined) {
        const normalizedScore = (pkgInfo.score / this.config.maxQualityScore) * 100;
        if (normalizedScore < this.config.lowQualityScoreThreshold) {
          issues.push({
            packageName: depName,
            issueType: 'low-quality',
            severity: 'info',
            daysSinceUpdate,
            lastUpdated: pkgInfo.publishedAt,
            score: pkgInfo.score,
            usedBy,
            message: `Package "${depName}" has a low quality score.`,
            suggestion: 'Review package documentation and consider alternatives.',
            repoMetrics,
            riskScore,
          });
        }
      }
    }

    // Sort by risk score then severity
    const sortedIssues = this.sortIssues(issues);

    // Calculate overall health score
    const healthScore = this.calculateHealthScore(packages.length, sortedIssues);

    return {
      issues: sortedIssues,
      healthScore,
      summary: {
        totalIssues: sortedIssues.length,
        criticalCount: sortedIssues.filter((i) => i.severity === 'critical').length,
        warningCount: sortedIssues.filter((i) => i.severity === 'warning').length,
        infoCount: sortedIssues.filter((i) => i.severity === 'info').length,
        discontinuedCount: sortedIssues.filter((i) => i.issueType === 'discontinued').length,
        unmaintainedCount: sortedIssues.filter((i) => i.issueType === 'unmaintained').length,
      },
    };
  }

  /**
   * Collect which packages use each dependency
   */
  private collectDependencyUsage(packages: IPackageInfo[]): Map<string, string[]> {
    const usage = new Map<string, string[]>();

    for (const pkg of packages) {
      for (const [depName, depInfo] of pkg.dependencies) {
        if (depInfo.source === 'registry') {
          if (!usage.has(depName)) {
            usage.set(depName, []);
          }
          usage.get(depName)!.push(pkg.name);
        }
      }
      for (const [depName, depInfo] of pkg.devDependencies) {
        if (depInfo.source === 'registry') {
          if (!usage.has(depName)) {
            usage.set(depName, []);
          }
          const usedBy = usage.get(depName)!;
          if (!usedBy.includes(pkg.name)) {
            usedBy.push(pkg.name);
          }
        }
      }
    }

    return usage;
  }

  /**
   * Calculate days since last update
   */
  private calculateDaysSinceUpdate(publishedAt: string | undefined, now: number): number {
    if (!publishedAt) {
      return 0;
    }
    const publishDate = new Date(publishedAt).getTime();
    return Math.floor((now - publishDate) / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate risk score (0-100)
   */
  private calculateRiskScore(
    pkgInfo: RegistryPackageInfo,
    repoMetrics: RepoHealthMetrics | undefined,
    daysSinceUpdate: number
  ): number {
    let score = 0;

    // Quality score component (30%)
    if (pkgInfo.score !== undefined) {
      const normalized = pkgInfo.score / this.config.maxQualityScore;
      score += (1 - normalized) * 30;
    } else {
      score += 15; // Unknown = medium risk
    }

    // Days since update component (30%)
    const updateRisk = Math.min(daysSinceUpdate / this.config.criticalThresholdDays, 1) * 30;
    score += updateRisk;

    // Repository metrics (40%)
    if (repoMetrics) {
      if (repoMetrics.securityAdvisoryCount && repoMetrics.securityAdvisoryCount > 0) {
        score += 40; // Max risk for security issues
      } else if (repoMetrics.isArchived) {
        score += 40;
      } else {
        // Issue/star ratio
        if (repoMetrics.openIssues !== undefined && repoMetrics.stars !== undefined) {
          const ratio = repoMetrics.stars > 0
            ? (repoMetrics.openIssues / repoMetrics.stars) * 100
            : repoMetrics.openIssues;
          score += Math.min(ratio / 10, 1) * 20;
        }

        // Stale repo
        if (repoMetrics.daysSinceLastCommit !== undefined) {
          if (repoMetrics.daysSinceLastCommit > 365) {
            score += 20;
          } else if (repoMetrics.daysSinceLastCommit > 180) {
            score += 10;
          }
        }
      }
    } else {
      score += 10; // Unknown = some risk
    }

    // Bonus for discontinued
    if (pkgInfo.isDiscontinued) {
      score = Math.min(score + 20, 100);
    }

    return Math.round(Math.min(score, 100));
  }

  /**
   * Sort issues by risk score then severity
   */
  private sortIssues(issues: PackageHealthIssue[]): PackageHealthIssue[] {
    return issues.sort((a, b) => {
      // First by risk score (descending)
      const riskDiff = (b.riskScore ?? 0) - (a.riskScore ?? 0);
      if (riskDiff !== 0) {
        return riskDiff;
      }
      // Then by severity
      const severityOrder: Record<HealthIssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(packageCount: number, issues: PackageHealthIssue[]): number {
    if (packageCount === 0) {
      return 100;
    }

    let score = 100;

    // Deduct for issues
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    score -= Math.min(criticalCount * 15, 50);
    score -= Math.min(warningCount * 5, 30);

    return Math.max(0, score);
  }
}
