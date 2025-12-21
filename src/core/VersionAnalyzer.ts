import { PubspecInfo } from '../types';
import { DependencyGraph } from './DependencyResolver';

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
  healthScore: number;
  summary: {
    totalPackages: number;
    totalDependencies: number;
    totalConflicts: number;
    totalOutdated: number;
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
      healthScore,
      summary: {
        totalPackages: pubspecs.length,
        totalDependencies: allDeps.size,
        totalConflicts: conflicts.length,
        totalOutdated: 0,
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
}
