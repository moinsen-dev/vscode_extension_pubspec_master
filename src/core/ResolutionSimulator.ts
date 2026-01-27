import { PubspecInfo } from '../types';
import {
  ConstraintSolver,
  VersionRange,
} from './ConstraintSolver';

/**
 * A constraint from a specific package
 */
export interface PackageConstraint {
  packageName: string;
  constraint: string;
  isDev: boolean;
}

/**
 * Aggregated constraints for a dependency
 */
export interface AggregatedConstraints {
  dependencyName: string;
  constraints: PackageConstraint[];
  /** Number of packages using this dependency */
  usageCount: number;
}

/**
 * Conflict details with resolution suggestions
 */
export interface ResolutionConflict {
  dependencyName: string;
  constraints: PackageConstraint[];
  /** Why the constraints are incompatible */
  reason: string;
  /** Severity: major version conflict is worse than minor */
  severity: 'critical' | 'high' | 'medium';
  /** Suggested resolution action */
  suggestion: string;
  /** Packages that would need to change */
  packagesToUpdate: string[];
}

/**
 * Full resolution simulation report
 */
export interface ResolutionReport {
  /** Total external dependencies analyzed */
  totalDependencies: number;
  /** Dependencies with compatible constraints */
  compatibleCount: number;
  /** Dependencies with conflicting constraints */
  conflictCount: number;
  /** List of conflicts with details */
  conflicts: ResolutionConflict[];
  /** Summary statistics */
  summary: {
    criticalConflicts: number;
    highConflicts: number;
    mediumConflicts: number;
  };
  /** Aggregated constraints for all dependencies */
  allConstraints: Map<string, AggregatedConstraints>;
  /** Human-readable report text */
  reportText: string;
}

/**
 * Simulates dependency resolution for a workspace
 *
 * Analyzes all packages in a workspace to detect dependencies with
 * incompatible version constraints that would cause `pub get` to fail.
 */
export class ResolutionSimulator {
  /**
   * Aggregate all constraints from workspace packages
   */
  static aggregateConstraints(pubspecs: PubspecInfo[]): Map<string, AggregatedConstraints> {
    const aggregated = new Map<string, AggregatedConstraints>();

    for (const pubspec of pubspecs) {
      // Process regular dependencies
      for (const [depName, depInfo] of pubspec.dependencies) {
        // Skip path/git/sdk dependencies - they don't have version constraints
        if (depInfo.source !== 'pub.dev') {
          continue;
        }

        this.addConstraint(aggregated, depName, {
          packageName: pubspec.name,
          constraint: depInfo.constraint,
          isDev: false,
        });
      }

      // Process dev dependencies
      for (const [depName, depInfo] of pubspec.devDependencies) {
        if (depInfo.source !== 'pub.dev') {
          continue;
        }

        this.addConstraint(aggregated, depName, {
          packageName: pubspec.name,
          constraint: depInfo.constraint,
          isDev: true,
        });
      }
    }

    return aggregated;
  }

  /**
   * Add a constraint to the aggregation map
   */
  private static addConstraint(
    aggregated: Map<string, AggregatedConstraints>,
    depName: string,
    constraint: PackageConstraint
  ): void {
    if (!aggregated.has(depName)) {
      aggregated.set(depName, {
        dependencyName: depName,
        constraints: [],
        usageCount: 0,
      });
    }

    const entry = aggregated.get(depName)!;
    entry.constraints.push(constraint);
    entry.usageCount++;
  }

  /**
   * Simulate dependency resolution and generate a report
   */
  static simulate(pubspecs: PubspecInfo[]): ResolutionReport {
    const allConstraints = this.aggregateConstraints(pubspecs);
    const conflicts: ResolutionConflict[] = [];

    let compatibleCount = 0;

    // Analyze each dependency with multiple constraints
    for (const [depName, aggregated] of allConstraints) {
      // Skip dependencies with only one constraint (no potential conflict)
      if (aggregated.constraints.length <= 1) {
        compatibleCount++;
        continue;
      }

      // Check if constraints are compatible
      const analysis = ConstraintSolver.analyzeConstraints(
        depName,
        aggregated.constraints
      );

      if (analysis.resolvable) {
        compatibleCount++;
      } else {
        // Determine severity
        const constraintStrings = aggregated.constraints.map(c => c.constraint);
        const hasMajorConflict = ConstraintSolver.hasMajorVersionConflict(constraintStrings);

        const severity = hasMajorConflict ? 'critical' :
          (aggregated.constraints.length > 2 ? 'high' : 'medium');

        // Determine which packages need to update
        const packagesToUpdate = this.findPackagesToUpdate(aggregated.constraints);

        conflicts.push({
          dependencyName: depName,
          constraints: aggregated.constraints,
          reason: analysis.conflictReason || 'Incompatible version constraints',
          severity,
          suggestion: analysis.suggestion || 'Align version constraints across packages',
          packagesToUpdate,
        });
      }
    }

    // Generate summary
    const summary = {
      criticalConflicts: conflicts.filter(c => c.severity === 'critical').length,
      highConflicts: conflicts.filter(c => c.severity === 'high').length,
      mediumConflicts: conflicts.filter(c => c.severity === 'medium').length,
    };

    // Generate human-readable report
    const reportText = this.generateReportText(
      allConstraints.size,
      compatibleCount,
      conflicts,
      summary
    );

    return {
      totalDependencies: allConstraints.size,
      compatibleCount,
      conflictCount: conflicts.length,
      conflicts,
      summary,
      allConstraints,
      reportText,
    };
  }

  /**
   * Find which packages should be updated to resolve a conflict
   */
  private static findPackagesToUpdate(constraints: PackageConstraint[]): string[] {
    // Strategy: packages with older/narrower constraints should update
    const packagesToUpdate: string[] = [];

    // Parse all ranges
    const ranges: Array<{
      packageName: string;
      range: VersionRange;
      constraint: string;
    }> = [];

    for (const c of constraints) {
      const range = ConstraintSolver.parseConstraint(c.constraint);
      if (range) {
        ranges.push({
          packageName: c.packageName,
          range,
          constraint: c.constraint,
        });
      }
    }

    // Find the highest minimum requirement
    let highestMin: { major: number; minor: number; patch: number } | null = null;
    for (const r of ranges) {
      if (r.range.min) {
        if (!highestMin || ConstraintSolver.compareVersions(r.range.min, highestMin) > 0) {
          highestMin = r.range.min;
        }
      }
    }

    // Packages with max below the highest min need to update
    if (highestMin) {
      for (const r of ranges) {
        if (r.range.max) {
          if (ConstraintSolver.compareVersions(r.range.max, highestMin) <= 0) {
            packagesToUpdate.push(r.packageName);
          }
        }
      }
    }

    return packagesToUpdate;
  }

  /**
   * Generate human-readable report text
   */
  private static generateReportText(
    totalDeps: number,
    compatibleCount: number,
    conflicts: ResolutionConflict[],
    summary: { criticalConflicts: number; highConflicts: number; mediumConflicts: number }
  ): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('DEPENDENCY RESOLUTION SIMULATION REPORT');
    lines.push('='.repeat(60));
    lines.push('');

    // Summary section
    lines.push('SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(`Total dependencies analyzed: ${totalDeps}`);
    lines.push(`Compatible: ${compatibleCount}`);
    lines.push(`Conflicts: ${conflicts.length}`);

    if (conflicts.length > 0) {
      lines.push('');
      lines.push(`  Critical: ${summary.criticalConflicts}`);
      lines.push(`  High: ${summary.highConflicts}`);
      lines.push(`  Medium: ${summary.mediumConflicts}`);
    }

    lines.push('');

    // Conflicts section
    if (conflicts.length > 0) {
      lines.push('CONFLICTS');
      lines.push('-'.repeat(40));

      for (const conflict of conflicts) {
        lines.push('');
        lines.push(`[${conflict.severity.toUpperCase()}] ${conflict.dependencyName}`);

        for (const c of conflict.constraints) {
          const devLabel = c.isDev ? ' (dev)' : '';
          lines.push(`  - ${c.packageName}: ${c.constraint}${devLabel}`);
        }

        lines.push(`  Reason: ${conflict.reason}`);
        lines.push(`  Suggestion: ${conflict.suggestion}`);

        if (conflict.packagesToUpdate.length > 0) {
          lines.push(`  Packages to update: ${conflict.packagesToUpdate.join(', ')}`);
        }
      }
    } else {
      lines.push('No conflicts detected. All dependencies should resolve successfully.');
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Quick check if there are any conflicts without full report
   */
  static hasConflicts(pubspecs: PubspecInfo[]): boolean {
    const allConstraints = this.aggregateConstraints(pubspecs);

    for (const [, aggregated] of allConstraints) {
      if (aggregated.constraints.length <= 1) {
        continue;
      }

      const analysis = ConstraintSolver.analyzeConstraints(
        aggregated.dependencyName,
        aggregated.constraints
      );

      if (!analysis.resolvable) {
        return true;
      }
    }

    return false;
  }
}
