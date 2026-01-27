import { SdkVersionService } from '../SdkVersionService';
import { PubPackageInfo } from '../../api/PubDevClient';

/**
 * Individual score components for a package version
 */
export interface VersionScoreComponents {
  /** SDK compatibility score (0-100): higher = more compatible */
  compatibility: number;
  /** Risk score (0-100): higher = lower risk (inverted from raw risk) */
  risk: number;
  /** Freshness score (0-100): higher = more recently updated */
  freshness: number;
  /** Community score (0-100): higher = more popular/liked */
  community: number;
}

/**
 * Complete score for a package version
 */
export interface VersionScore extends VersionScoreComponents {
  /** Weighted overall score (0-100) */
  overall: number;
  /** Breakdown of how each component contributed */
  breakdown: {
    compatibility: { raw: number; weight: number; contribution: number };
    risk: { raw: number; weight: number; contribution: number };
    freshness: { raw: number; weight: number; contribution: number };
    community: { raw: number; weight: number; contribution: number };
  };
}

/**
 * Configuration for score weights
 */
export interface ScoringWeights {
  compatibility: number;
  risk: number;
  freshness: number;
  community: number;
}

/**
 * Default weights for scoring (must sum to 1.0)
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  compatibility: 0.35,  // Most important - must work with user's SDK
  risk: 0.25,           // Package health matters
  freshness: 0.25,      // Recent updates are good
  community: 0.15,      // Nice to have but not critical
};

/**
 * Scores package versions based on multiple factors
 */
export class VersionScorer {
  private readonly weights: ScoringWeights;

  constructor(weights: ScoringWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Calculate compatibility score based on SDK constraints
   *
   * @param sdkConstraint - Package's SDK constraint (e.g., ">=3.4.0 <4.0.0")
   * @param installedSdk - User's installed SDK version (e.g., "3.4.0")
   * @returns Score 0-100 (100 = fully compatible, 0 = incompatible)
   */
  scoreCompatibility(
    sdkConstraint: string | undefined,
    installedSdk: string | null
  ): number {
    // No constraint = assume compatible
    if (!sdkConstraint) {
      return 100;
    }

    // Handle 'any' constraint (rare but possible)
    if (sdkConstraint.trim().toLowerCase() === 'any') {
      return 100;
    }

    // No installed SDK info = can't check, assume compatible
    if (!installedSdk) {
      return 80;
    }

    // Check if constraint is satisfied
    if (SdkVersionService.isConstraintSatisfied(sdkConstraint, installedSdk)) {
      // Fully compatible - give bonus for exact match
      const minRequired = SdkVersionService.extractMinVersion(sdkConstraint);
      if (minRequired === installedSdk) {
        return 100; // Exact match
      }
      return 95; // Compatible but not exact
    }

    // Incompatible - calculate how far off
    const minRequired = SdkVersionService.extractMinVersion(sdkConstraint);
    if (minRequired && installedSdk) {
      const reqParts = minRequired.split('.').map(n => parseInt(n, 10) || 0);
      const instParts = installedSdk.split('.').map(n => parseInt(n, 10) || 0);

      const reqMajor = reqParts[0] || 0;
      const reqMinor = reqParts[1] || 0;
      const instMajor = instParts[0] || 0;
      const instMinor = instParts[1] || 0;

      // Major version difference = very incompatible
      if (reqMajor > instMajor) {
        return 10;
      }

      // Minor version difference
      const minorDiff = reqMinor - instMinor;
      if (minorDiff > 0) {
        // Each minor version difference reduces score
        return Math.max(20, 80 - minorDiff * 15);
      }
    }

    return 30; // Default incompatible score
  }

  /**
   * Check if a version string is a pre-release version
   * Pre-release versions include: dev, alpha, beta, rc, preview
   */
  isPreReleaseVersion(version: string): boolean {
    const preReleasePatterns = [
      /[-+]dev/i,
      /[-+]alpha/i,
      /[-+]beta/i,
      /[-+]rc/i,
      /[-+]preview/i,
      /[-+]snapshot/i,
      /[-+]pre/i,
      /\d+\.\d+\.\d+-\d+/,  // e.g., 1.0.0-1
    ];
    return preReleasePatterns.some(pattern => pattern.test(version));
  }

  /**
   * Calculate a risk adjustment for pre-release versions
   * @returns A penalty (negative value) to apply to risk score
   */
  preReleaseRiskPenalty(version: string): number {
    if (!this.isPreReleaseVersion(version)) {
      return 0;
    }

    // Alpha versions are most risky
    if (/[-+]alpha/i.test(version)) {
      return 30;
    }

    // Beta and preview are medium risk
    if (/[-+]beta/i.test(version) || /[-+]preview/i.test(version)) {
      return 20;
    }

    // Release candidates are lowest risk pre-release
    if (/[-+]rc/i.test(version)) {
      return 10;
    }

    // Dev and other pre-release
    return 25;
  }

  /**
   * Calculate risk score based on package health metrics
   *
   * @param packageInfo - Package info from pub.dev
   * @param version - Optional version string to check for pre-release
   * @returns Score 0-100 (100 = very safe, 0 = very risky)
   */
  scoreRisk(packageInfo: PubPackageInfo | null, version?: string): number {
    if (!packageInfo) {
      return 50; // Unknown = neutral
    }

    let score = 100;

    // Discontinued packages are risky
    if (packageInfo.isDiscontinued) {
      score -= 50;
    }

    // Low pub.dev score is risky (score is 0-160 on pub.dev)
    if (packageInfo.score !== undefined) {
      const normalizedScore = (packageInfo.score / 160) * 100;
      if (normalizedScore < 50) {
        score -= (50 - normalizedScore) * 0.5;
      }
    }

    // Check days since last update
    if (packageInfo.latestPublished) {
      const daysSince = this.daysSinceDate(packageInfo.latestPublished);

      // Packages not updated in years are risky
      if (daysSince > 730) {
        // > 2 years
        score -= 30;
      } else if (daysSince > 365) {
        // > 1 year
        score -= 15;
      } else if (daysSince > 180) {
        // > 6 months
        score -= 5;
      }
    }

    // Apply pre-release penalty if version provided
    const versionToCheck = version ?? packageInfo.latest?.version;
    if (versionToCheck) {
      score -= this.preReleaseRiskPenalty(versionToCheck);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score a git dependency (no pub.dev info available)
   * Git dependencies are inherently riskier due to less visibility
   *
   * @param gitRef - The git reference (branch, tag, commit)
   * @returns Score 0-100 (100 = stable tag, lower for branches/commits)
   */
  scoreGitDependency(gitRef?: string): number {
    if (!gitRef) {
      return 40; // No ref specified = risky
    }

    // Semantic version tags are safest
    if (/^v?\d+\.\d+\.\d+/.test(gitRef)) {
      return 70;
    }

    // Named tags (like 'stable', 'release')
    if (/^(stable|release|main|master)$/i.test(gitRef)) {
      return 55;
    }

    // Commit hash (40 chars hex) - pinned but no version info
    if (/^[a-f0-9]{40}$/i.test(gitRef)) {
      return 50;
    }

    // Short commit hash
    if (/^[a-f0-9]{7,}$/i.test(gitRef)) {
      return 50;
    }

    // Development branches
    if (/^(dev|develop|development|feature)/i.test(gitRef)) {
      return 30;
    }

    // Other branches
    return 40;
  }

  /**
   * Score a path dependency (local development)
   * Path dependencies are typically internal packages
   *
   * @returns Score indicating local development status
   */
  scorePathDependency(): number {
    // Path dependencies are for local development - neutral score
    // They don't have pub.dev metrics but are controlled by the user
    return 75;
  }

  /**
   * Calculate freshness score based on last update date
   *
   * @param lastPublished - ISO date string of last publication
   * @returns Score 0-100 (100 = very recent, 0 = very old)
   */
  scoreFreshness(lastPublished: string | undefined): number {
    if (!lastPublished) {
      return 50; // Unknown = neutral
    }

    const daysSince = this.daysSinceDate(lastPublished);

    // Updated in last week = perfect
    if (daysSince <= 7) {
      return 100;
    }

    // Updated in last month = excellent
    if (daysSince <= 30) {
      return 95;
    }

    // Updated in last 3 months = good
    if (daysSince <= 90) {
      return 85;
    }

    // Updated in last 6 months = okay
    if (daysSince <= 180) {
      return 70;
    }

    // Updated in last year = getting stale
    if (daysSince <= 365) {
      return 50;
    }

    // Updated in last 2 years = stale
    if (daysSince <= 730) {
      return 30;
    }

    // Very old
    return Math.max(10, 30 - Math.floor((daysSince - 730) / 365) * 5);
  }

  /**
   * Calculate community score based on popularity metrics
   *
   * @param packageInfo - Package info from pub.dev
   * @returns Score 0-100 (100 = very popular, 0 = unknown)
   */
  scoreCommunity(packageInfo: PubPackageInfo | null): number {
    if (!packageInfo) {
      return 50; // Unknown = neutral
    }

    let score = 50; // Start at neutral

    // Popularity is already 0-100 on pub.dev
    if (packageInfo.popularity !== undefined) {
      score = packageInfo.popularity;
    }

    // Bonus for many likes
    if (packageInfo.likes !== undefined) {
      if (packageInfo.likes >= 1000) {
        score = Math.min(100, score + 20);
      } else if (packageInfo.likes >= 100) {
        score = Math.min(100, score + 10);
      } else if (packageInfo.likes >= 10) {
        score = Math.min(100, score + 5);
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate complete score for a package version
   */
  calculateScore(
    sdkConstraint: string | undefined,
    installedSdk: string | null,
    packageInfo: PubPackageInfo | null
  ): VersionScore {
    const compatibility = this.scoreCompatibility(sdkConstraint, installedSdk);
    const risk = this.scoreRisk(packageInfo);
    const freshness = this.scoreFreshness(packageInfo?.latestPublished);
    const community = this.scoreCommunity(packageInfo);

    // Calculate weighted overall
    const overall =
      compatibility * this.weights.compatibility +
      risk * this.weights.risk +
      freshness * this.weights.freshness +
      community * this.weights.community;

    return {
      compatibility,
      risk,
      freshness,
      community,
      overall: Math.round(overall),
      breakdown: {
        compatibility: {
          raw: compatibility,
          weight: this.weights.compatibility,
          contribution: Math.round(compatibility * this.weights.compatibility),
        },
        risk: {
          raw: risk,
          weight: this.weights.risk,
          contribution: Math.round(risk * this.weights.risk),
        },
        freshness: {
          raw: freshness,
          weight: this.weights.freshness,
          contribution: Math.round(freshness * this.weights.freshness),
        },
        community: {
          raw: community,
          weight: this.weights.community,
          contribution: Math.round(community * this.weights.community),
        },
      },
    };
  }

  /**
   * Calculate days since a given ISO date
   * Returns -1 for future dates, null for invalid dates
   */
  private daysSinceDate(isoDate: string): number {
    try {
      const date = new Date(isoDate);

      // Check for invalid date
      if (isNaN(date.getTime())) {
        return 365; // Unknown = assume moderately stale
      }

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();

      // Handle future dates (shouldn't happen but be defensive)
      if (diffMs < 0) {
        return 0; // Treat future dates as fresh
      }

      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return 365; // Default to 1 year if can't parse
    }
  }

  /**
   * Parse a version string into its components
   * Handles formats: 1.0.0, 1.0.0-dev.1, ^1.0.0, >=1.0.0
   */
  parseVersion(version: string): { major: number; minor: number; patch: number; preRelease?: string } | null {
    // Remove common prefixes
    const cleaned = version.replace(/^[\^>=<~]+/, '').trim();

    // Parse version with optional pre-release
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/);
    if (!match) {
      return null;
    }

    const result: { major: number; minor: number; patch: number; preRelease?: string } = {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };

    if (match[4]) {
      result.preRelease = match[4];
    }

    return result;
  }

  /**
   * Compare two versions
   * @returns negative if a < b, 0 if equal, positive if a > b
   */
  compareVersions(a: string, b: string): number {
    const parsedA = this.parseVersion(a);
    const parsedB = this.parseVersion(b);

    if (!parsedA || !parsedB) {
      return 0; // Can't compare, treat as equal
    }

    // Compare major.minor.patch
    if (parsedA.major !== parsedB.major) {
      return parsedA.major - parsedB.major;
    }
    if (parsedA.minor !== parsedB.minor) {
      return parsedA.minor - parsedB.minor;
    }
    if (parsedA.patch !== parsedB.patch) {
      return parsedA.patch - parsedB.patch;
    }

    // Pre-release versions are less than release versions
    if (parsedA.preRelease && !parsedB.preRelease) {
      return -1;
    }
    if (!parsedA.preRelease && parsedB.preRelease) {
      return 1;
    }

    return 0;
  }
}
