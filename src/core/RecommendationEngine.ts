import * as vscode from 'vscode';
import { PubspecInfo } from '../types';
import { SdkVersionService, InstalledSdkVersions } from './SdkVersionService';
import { PubDevClient } from '../api/PubDevClient';
import { VersionScorer, VersionScore } from './scoring';
import { ResolutionSimulator, ResolutionConflict } from './ResolutionSimulator';

/**
 * Upgrade action type
 */
export type UpgradeAction = 'upgrade' | 'keep' | 'downgrade' | 'incompatible';

/**
 * Recommendation for a single dependency
 */
export interface DependencyRecommendation {
  /** Dependency name */
  name: string;
  /** Current version constraint in pubspec */
  currentVersion: string;
  /** Latest version on pub.dev */
  latestVersion: string | null;
  /** Recommended version (may differ from latest if incompatible) */
  recommendedVersion: string | null;
  /** Recommended action */
  action: UpgradeAction;
  /** Score for the recommended version */
  score: VersionScore | null;
  /** Reason for the recommendation */
  reason: string;
  /** Packages that use this dependency */
  usedBy: string[];
  /** Whether this dependency has conflicts */
  hasConflict: boolean;
  /** Conflict details if applicable */
  conflict?: ResolutionConflict;
}

/**
 * Priority level for recommendations
 */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Prioritized recommendation with explanation
 */
export interface PrioritizedRecommendation {
  recommendation: DependencyRecommendation;
  priority: RecommendationPriority;
  explanation: string;
}

/**
 * Complete workspace recommendation report
 */
export interface RecommendationReport {
  /** User's installed SDK */
  installedSdk: InstalledSdkVersions;
  /** Total dependencies analyzed */
  totalDependencies: number;
  /** Recommendations by priority */
  recommendations: PrioritizedRecommendation[];
  /** Summary counts */
  summary: {
    upgradeAvailable: number;
    incompatibleUpgrades: number;
    conflicts: number;
    upToDate: number;
  };
  /** Human-readable report */
  reportText: string;
}

/**
 * Intelligent recommendation engine for package upgrades
 *
 * Analyzes workspace dependencies and generates prioritized recommendations
 * based on SDK compatibility, package health, conflicts, and other factors.
 */
export class RecommendationEngine {
  private readonly sdkService: SdkVersionService;
  private readonly pubDevClient: PubDevClient;
  private readonly scorer: VersionScorer;

  constructor(context: vscode.ExtensionContext) {
    this.sdkService = SdkVersionService.getInstance();
    this.pubDevClient = new PubDevClient(context);
    this.scorer = new VersionScorer();
  }

  /**
   * Generate recommendations for all dependencies in the workspace
   */
  async generateRecommendations(pubspecs: PubspecInfo[]): Promise<RecommendationReport> {
    const installedSdk = await this.sdkService.getInstalledVersions();

    // Run resolution simulation to detect conflicts
    const resolutionReport = ResolutionSimulator.simulate(pubspecs);
    const conflictMap = new Map<string, ResolutionConflict>();
    for (const conflict of resolutionReport.conflicts) {
      conflictMap.set(conflict.dependencyName, conflict);
    }

    // Collect all unique dependencies
    const dependencyMap = this.collectDependencies(pubspecs);

    // Generate recommendations for each dependency
    const recommendations: DependencyRecommendation[] = [];

    for (const [depName, info] of dependencyMap) {
      const recommendation = await this.analyzeDeependency(
        depName,
        info,
        installedSdk,
        conflictMap.get(depName)
      );
      recommendations.push(recommendation);
    }

    // Prioritize recommendations
    const prioritized = this.prioritizeRecommendations(recommendations);

    // Generate summary
    const summary = {
      upgradeAvailable: recommendations.filter(r => r.action === 'upgrade').length,
      incompatibleUpgrades: recommendations.filter(r => r.action === 'incompatible').length,
      conflicts: recommendations.filter(r => r.hasConflict).length,
      upToDate: recommendations.filter(r => r.action === 'keep').length,
    };

    // Generate report text
    const reportText = this.generateReportText(installedSdk, prioritized, summary);

    return {
      installedSdk,
      totalDependencies: dependencyMap.size,
      recommendations: prioritized,
      summary,
      reportText,
    };
  }

  /**
   * Collect all unique dependencies from workspace
   */
  private collectDependencies(
    pubspecs: PubspecInfo[]
  ): Map<string, { constraint: string; usedBy: string[]; isDev: boolean }> {
    const deps = new Map<string, { constraint: string; usedBy: string[]; isDev: boolean }>();

    for (const pubspec of pubspecs) {
      // Regular dependencies
      for (const [name, info] of pubspec.dependencies) {
        if (info.source !== 'pub.dev') {continue;}

        if (!deps.has(name)) {
          deps.set(name, { constraint: info.constraint, usedBy: [], isDev: false });
        }
        deps.get(name)!.usedBy.push(pubspec.name);
      }

      // Dev dependencies
      for (const [name, info] of pubspec.devDependencies) {
        if (info.source !== 'pub.dev') {continue;}

        if (!deps.has(name)) {
          deps.set(name, { constraint: info.constraint, usedBy: [], isDev: true });
        }
        deps.get(name)!.usedBy.push(pubspec.name);
      }
    }

    return deps;
  }

  /**
   * Analyze a single dependency and generate recommendation
   */
  private async analyzeDeependency(
    name: string,
    info: { constraint: string; usedBy: string[]; isDev: boolean },
    installedSdk: InstalledSdkVersions,
    conflict?: ResolutionConflict
  ): Promise<DependencyRecommendation> {
    // Fetch package info from pub.dev
    const packageInfo = await this.pubDevClient.getPackageInfo(name);

    if (!packageInfo) {
      return {
        name,
        currentVersion: info.constraint,
        latestVersion: null,
        recommendedVersion: null,
        action: 'keep',
        score: null,
        reason: 'Unable to fetch package info from pub.dev',
        usedBy: info.usedBy,
        hasConflict: !!conflict,
        conflict,
      };
    }

    const latestVersion = packageInfo.latest.version;

    // Get SDK constraint for latest version
    const latestConstraints = await this.pubDevClient.getVersionSdkConstraints(name, latestVersion);

    // Calculate score for latest version
    const latestScore = this.scorer.calculateScore(
      latestConstraints?.sdkConstraint,
      installedSdk.dart,
      packageInfo
    );

    // Check if current version equals latest
    const currentClean = info.constraint.replace(/^\^/, '');
    if (currentClean === latestVersion) {
      return {
        name,
        currentVersion: info.constraint,
        latestVersion,
        recommendedVersion: latestVersion,
        action: 'keep',
        score: latestScore,
        reason: 'Already at latest version',
        usedBy: info.usedBy,
        hasConflict: !!conflict,
        conflict,
      };
    }

    // Check SDK compatibility
    const isLatestCompatible = latestConstraints?.sdkConstraint && installedSdk.dart
      ? SdkVersionService.isConstraintSatisfied(latestConstraints.sdkConstraint, installedSdk.dart)
      : true;

    if (!isLatestCompatible) {
      // Find highest compatible version
      const compatibleVersion = installedSdk.dart
        ? await this.pubDevClient.findHighestCompatibleVersion(name, installedSdk.dart)
        : null;

      if (compatibleVersion && compatibleVersion !== currentClean) {
        return {
          name,
          currentVersion: info.constraint,
          latestVersion,
          recommendedVersion: compatibleVersion,
          action: 'upgrade',
          score: latestScore,
          reason: `Latest ${latestVersion} requires newer SDK. Recommending ${compatibleVersion} (compatible with your SDK ${installedSdk.dart})`,
          usedBy: info.usedBy,
          hasConflict: !!conflict,
          conflict,
        };
      }

      return {
        name,
        currentVersion: info.constraint,
        latestVersion,
        recommendedVersion: null,
        action: 'incompatible',
        score: latestScore,
        reason: `Latest ${latestVersion} requires SDK ${latestConstraints?.sdkConstraint} (you have ${installedSdk.dart})`,
        usedBy: info.usedBy,
        hasConflict: !!conflict,
        conflict,
      };
    }

    // Latest is compatible - recommend upgrade
    return {
      name,
      currentVersion: info.constraint,
      latestVersion,
      recommendedVersion: latestVersion,
      action: 'upgrade',
      score: latestScore,
      reason: `Update available: ${info.constraint} → ^${latestVersion}`,
      usedBy: info.usedBy,
      hasConflict: !!conflict,
      conflict,
    };
  }

  /**
   * Prioritize recommendations based on importance
   */
  private prioritizeRecommendations(
    recommendations: DependencyRecommendation[]
  ): PrioritizedRecommendation[] {
    const prioritized: PrioritizedRecommendation[] = [];

    for (const rec of recommendations) {
      const { priority, explanation } = this.determinePriority(rec);
      prioritized.push({ recommendation: rec, priority, explanation });
    }

    // Sort by priority (critical first) then by score (highest first)
    const priorityOrder: Record<RecommendationPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    prioritized.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) {return priorityDiff;}

      // Within same priority, sort by score
      const scoreA = a.recommendation.score?.overall ?? 50;
      const scoreB = b.recommendation.score?.overall ?? 50;
      return scoreB - scoreA;
    });

    return prioritized;
  }

  /**
   * Determine priority and explanation for a recommendation
   */
  private determinePriority(
    rec: DependencyRecommendation
  ): { priority: RecommendationPriority; explanation: string } {
    // Conflicts are critical
    if (rec.hasConflict && rec.conflict?.severity === 'critical') {
      return {
        priority: 'critical',
        explanation: `Dependency conflict: ${rec.conflict.reason}`,
      };
    }

    if (rec.hasConflict) {
      return {
        priority: 'high',
        explanation: `Dependency conflict needs resolution`,
      };
    }

    // Incompatible upgrades are medium priority (informational)
    if (rec.action === 'incompatible') {
      return {
        priority: 'medium',
        explanation: 'Upgrade requires newer SDK',
      };
    }

    // Available upgrades
    if (rec.action === 'upgrade') {
      const score = rec.score?.overall ?? 50;

      // High-scoring upgrades are more important
      if (score >= 90) {
        return {
          priority: 'high',
          explanation: 'Recommended upgrade (high confidence)',
        };
      }

      if (score >= 70) {
        return {
          priority: 'medium',
          explanation: 'Update available',
        };
      }

      return {
        priority: 'low',
        explanation: 'Optional update available',
      };
    }

    // Up to date - just informational
    return {
      priority: 'info',
      explanation: 'No action needed',
    };
  }

  /**
   * Generate human-readable report
   */
  private generateReportText(
    installedSdk: InstalledSdkVersions,
    recommendations: PrioritizedRecommendation[],
    summary: {
      upgradeAvailable: number;
      incompatibleUpgrades: number;
      conflicts: number;
      upToDate: number;
    }
  ): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('DEPENDENCY UPGRADE RECOMMENDATIONS');
    lines.push('='.repeat(60));
    lines.push('');

    // SDK info
    lines.push('INSTALLED SDK');
    lines.push('-'.repeat(40));
    lines.push(`Dart: ${installedSdk.dart ?? 'Unknown'}`);
    lines.push(`Flutter: ${installedSdk.flutter ?? 'Unknown'}`);
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(`Upgrades available: ${summary.upgradeAvailable}`);
    lines.push(`Incompatible (need newer SDK): ${summary.incompatibleUpgrades}`);
    lines.push(`Conflicts to resolve: ${summary.conflicts}`);
    lines.push(`Already up to date: ${summary.upToDate}`);
    lines.push('');

    // Actionable recommendations (not info)
    const actionable = recommendations.filter(r => r.priority !== 'info');

    if (actionable.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('-'.repeat(40));

      for (const { recommendation: rec, priority } of actionable) {
        lines.push('');
        const scoreText = rec.score ? ` (score: ${rec.score.overall})` : '';
        lines.push(`[${priority.toUpperCase()}] ${rec.name}${scoreText}`);
        lines.push(`  Current: ${rec.currentVersion}`);

        if (rec.recommendedVersion) {
          lines.push(`  Recommended: ^${rec.recommendedVersion}`);
        } else if (rec.latestVersion) {
          lines.push(`  Latest: ${rec.latestVersion} (incompatible)`);
        }

        lines.push(`  Reason: ${rec.reason}`);
        lines.push(`  Used by: ${rec.usedBy.join(', ')}`);

        if (rec.conflict) {
          lines.push(`  Conflict: ${rec.conflict.suggestion}`);
        }
      }
    } else {
      lines.push('All dependencies are up to date and compatible!');
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}
