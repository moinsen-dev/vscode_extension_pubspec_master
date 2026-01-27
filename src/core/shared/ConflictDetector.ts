import { IPackageInfo } from '../interfaces';
import { DependencyGraphData } from './DependencyGraph';
import {
  compareVersions,
  extractVersionFromConstraint,
  isCaretConstraint,
  getMajorVersion,
} from './VersionComparator';

/**
 * Severity levels for conflicts
 */
export type ConflictSeverity = 'high' | 'medium' | 'low';

/**
 * Version conflict information (ecosystem-agnostic)
 */
export interface VersionConflict {
  /** Name of the conflicting dependency */
  dependencyName: string;
  /** Packages using this dependency with their constraints */
  packages: Array<{
    packageName: string;
    constraint: string;
    isDev: boolean;
  }>;
  /** Severity of the conflict */
  severity: ConflictSeverity;
  /** Suggested resolution constraint */
  suggestedResolution?: string;
}

/**
 * SDK/runtime constraint mismatch
 */
export interface SdkMismatch {
  /** Type of SDK (e.g., 'dart', 'node', 'python') */
  sdkType: string;
  /** Packages with their constraints */
  packages: Array<{
    packageName: string;
    constraint: string;
  }>;
  /** Lowest constraint found */
  lowestConstraint: string;
  /** Highest constraint found */
  highestConstraint: string;
  /** Severity of the mismatch */
  severity: ConflictSeverity;
}

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  /** Version conflicts found */
  conflicts: VersionConflict[];
  /** SDK mismatches found */
  sdkMismatches: SdkMismatch[];
  /** Whether any conflicts were found */
  hasConflicts: boolean;
  /** Summary counts */
  summary: {
    totalConflicts: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
  };
}

/**
 * Ecosystem-agnostic conflict detector
 */
export class ConflictDetector {
  /**
   * Detect all conflicts in a workspace
   */
  detectConflicts(packages: IPackageInfo[], graph: DependencyGraphData): ConflictDetectionResult {
    const conflicts = this.detectVersionConflicts(packages, graph);
    const sdkMismatches = this.detectSdkMismatches(packages);

    const highSeverity = conflicts.filter((c) => c.severity === 'high').length;
    const mediumSeverity = conflicts.filter((c) => c.severity === 'medium').length;
    const lowSeverity = conflicts.filter((c) => c.severity === 'low').length;

    return {
      conflicts,
      sdkMismatches,
      hasConflicts: conflicts.length > 0 || sdkMismatches.length > 0,
      summary: {
        totalConflicts: conflicts.length,
        highSeverity,
        mediumSeverity,
        lowSeverity,
      },
    };
  }

  /**
   * Detect version conflicts across packages
   */
  private detectVersionConflicts(
    packages: IPackageInfo[],
    graph: DependencyGraphData
  ): VersionConflict[] {
    const conflicts: VersionConflict[] = [];
    const dependencyVersions = new Map<
      string,
      Array<{ packageName: string; constraint: string; isDev: boolean }>
    >();

    // Collect all version constraints for each dependency
    for (const pkg of packages) {
      for (const [depName, depInfo] of pkg.dependencies) {
        // Skip internal path dependencies
        if (depInfo.source === 'path' && graph.internalPackages.includes(depName)) {
          continue;
        }

        if (!dependencyVersions.has(depName)) {
          dependencyVersions.set(depName, []);
        }
        dependencyVersions.get(depName)!.push({
          packageName: pkg.name,
          constraint: depInfo.constraint,
          isDev: false,
        });
      }

      for (const [depName, depInfo] of pkg.devDependencies) {
        if (depInfo.source === 'path' && graph.internalPackages.includes(depName)) {
          continue;
        }

        if (!dependencyVersions.has(depName)) {
          dependencyVersions.set(depName, []);
        }
        dependencyVersions.get(depName)!.push({
          packageName: pkg.name,
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
        const constraintArray = Array.from(uniqueConstraints);
        const severity = this.determineConflictSeverity(constraintArray);
        const suggestedResolution = this.suggestResolution(constraintArray);

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
      const severityOrder: Record<ConflictSeverity, number> = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Detect SDK constraint mismatches
   */
  private detectSdkMismatches(packages: IPackageInfo[]): SdkMismatch[] {
    const mismatches: SdkMismatch[] = [];

    // Group by SDK type
    const sdkConstraints = new Map<string, Map<string, string[]>>();

    for (const pkg of packages) {
      // Check main SDK constraint
      if (pkg.sdkConstraint) {
        const sdkType = pkg.ecosystem === 'dart' ? 'dart' : pkg.ecosystem;
        if (!sdkConstraints.has(sdkType)) {
          sdkConstraints.set(sdkType, new Map());
        }
        const constraints = sdkConstraints.get(sdkType)!;
        if (!constraints.has(pkg.sdkConstraint)) {
          constraints.set(pkg.sdkConstraint, []);
        }
        constraints.get(pkg.sdkConstraint)!.push(pkg.name);
      }

      // Check runtime constraints
      if (pkg.runtimeConstraints) {
        for (const [runtime, constraint] of Object.entries(pkg.runtimeConstraints)) {
          if (!sdkConstraints.has(runtime)) {
            sdkConstraints.set(runtime, new Map());
          }
          const constraints = sdkConstraints.get(runtime)!;
          if (!constraints.has(constraint)) {
            constraints.set(constraint, []);
          }
          constraints.get(constraint)!.push(pkg.name);
        }
      }
    }

    // Detect mismatches
    for (const [sdkType, constraints] of sdkConstraints) {
      if (constraints.size > 1) {
        const sortedConstraints = Array.from(constraints.keys()).sort((a, b) => {
          const versionA = extractVersionFromConstraint(a);
          const versionB = extractVersionFromConstraint(b);
          return compareVersions(versionA, versionB);
        });

        const pkgs: Array<{ packageName: string; constraint: string }> = [];
        for (const [constraint, packageNames] of constraints) {
          for (const pkgName of packageNames) {
            pkgs.push({ packageName: pkgName, constraint });
          }
        }

        mismatches.push({
          sdkType,
          packages: pkgs,
          lowestConstraint: sortedConstraints[0],
          highestConstraint: sortedConstraints[sortedConstraints.length - 1],
          severity: this.determineSdkMismatchSeverity(sortedConstraints),
        });
      }
    }

    return mismatches;
  }

  /**
   * Determine severity of a version conflict
   */
  private determineConflictSeverity(constraints: string[]): ConflictSeverity {
    // Extract major versions
    const majorVersions = new Set<number>();

    for (const constraint of constraints) {
      const version = extractVersionFromConstraint(constraint);
      majorVersions.add(getMajorVersion(version));
    }

    if (majorVersions.size > 1) {
      return 'high'; // Different major versions
    }

    // Check for exact vs caret conflicts
    const hasExact = constraints.some((c) => !isCaretConstraint(c));
    const hasCaret = constraints.some((c) => isCaretConstraint(c));

    if (hasExact && hasCaret) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Determine severity of SDK mismatch
   */
  private determineSdkMismatchSeverity(constraints: string[]): ConflictSeverity {
    const majorVersions = new Set<string>();

    for (const constraint of constraints) {
      const version = extractVersionFromConstraint(constraint);
      const parts = version.split('.');
      majorVersions.add(`${parts[0]}.${parts[1] || '0'}`);
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
      .filter((c) => isCaretConstraint(c))
      .map((c) => extractVersionFromConstraint(c))
      .sort(compareVersions)
      .reverse();

    if (caretConstraints.length > 0) {
      return `^${caretConstraints[0]}`;
    }

    // Fall back to exact constraints
    const versions = constraints
      .map((c) => extractVersionFromConstraint(c))
      .sort(compareVersions)
      .reverse();

    if (versions.length > 0) {
      return `^${versions[0]}`;
    }

    return constraints[0];
  }
}
