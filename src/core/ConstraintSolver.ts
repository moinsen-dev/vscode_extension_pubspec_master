/**
 * Represents a parsed semantic version
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Represents a version range (min/max bounds)
 */
export interface VersionRange {
  /** Minimum version (inclusive unless minExclusive is true) */
  min?: SemanticVersion;
  /** Maximum version (exclusive unless maxInclusive is true) */
  max?: SemanticVersion;
  /** Whether min bound is exclusive (> instead of >=) */
  minExclusive?: boolean;
  /** Whether max bound is inclusive (<= instead of <) */
  maxInclusive?: boolean;
}

/**
 * Result of constraint intersection
 */
export interface IntersectionResult {
  /** Whether the constraints can be satisfied together */
  compatible: boolean;
  /** The resulting range if compatible */
  range?: VersionRange;
  /** Human-readable description of why incompatible */
  reason?: string;
}

/**
 * Constraint analysis result for a dependency
 */
export interface ConstraintAnalysis {
  /** Dependency name */
  dependencyName: string;
  /** All constraints from different packages */
  constraints: Array<{
    packageName: string;
    constraint: string;
    isDev: boolean;
  }>;
  /** Whether all constraints can be satisfied */
  resolvable: boolean;
  /** The narrowest valid range if resolvable */
  resolvedRange?: VersionRange;
  /** Why constraints are incompatible if not resolvable */
  conflictReason?: string;
  /** Suggested resolution if there's a conflict */
  suggestion?: string;
}

/**
 * Solver for Dart/pub version constraints
 *
 * Handles constraint syntax:
 * - Caret: ^1.2.3 (>=1.2.3 <2.0.0)
 * - Range: >=1.0.0 <2.0.0
 * - Comparison: >=1.0.0, <2.0.0, >1.0.0, <=2.0.0
 * - Exact: 1.2.3
 * - Any: any
 */
export class ConstraintSolver {
  /**
   * Parse a version string into semantic version components
   */
  static parseVersion(version: string): SemanticVersion | null {
    const match = version.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/);
    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: match[2] ? parseInt(match[2], 10) : 0,
      patch: match[3] ? parseInt(match[3], 10) : 0,
      prerelease: match[4],
    };
  }

  /**
   * Compare two semantic versions
   * @returns negative if a < b, 0 if a === b, positive if a > b
   */
  static compareVersions(a: SemanticVersion, b: SemanticVersion): number {
    if (a.major !== b.major) {return a.major - b.major;}
    if (a.minor !== b.minor) {return a.minor - b.minor;}
    if (a.patch !== b.patch) {return a.patch - b.patch;}

    // Prerelease versions have lower precedence
    if (a.prerelease && !b.prerelease) {return -1;}
    if (!a.prerelease && b.prerelease) {return 1;}
    if (a.prerelease && b.prerelease) {
      return a.prerelease.localeCompare(b.prerelease);
    }

    return 0;
  }

  /**
   * Format a semantic version as a string
   */
  static formatVersion(v: SemanticVersion): string {
    let result = `${v.major}.${v.minor}.${v.patch}`;
    if (v.prerelease) {
      result += `-${v.prerelease}`;
    }
    return result;
  }

  /**
   * Parse a constraint string into a version range
   */
  static parseConstraint(constraint: string): VersionRange | null {
    const trimmed = constraint.trim();

    // Handle 'any'
    if (trimmed === 'any' || trimmed === '') {
      return {}; // No bounds = any version
    }

    // Handle caret syntax: ^1.2.3
    if (trimmed.startsWith('^')) {
      const version = this.parseVersion(trimmed.slice(1));
      if (!version) {return null;}

      return {
        min: version,
        max: { major: version.major + 1, minor: 0, patch: 0 },
        minExclusive: false,
      };
    }

    // Handle tilde syntax: ~1.2.3 (>=1.2.3 <1.3.0)
    if (trimmed.startsWith('~')) {
      const version = this.parseVersion(trimmed.slice(1));
      if (!version) {return null;}

      return {
        min: version,
        max: { major: version.major, minor: version.minor + 1, patch: 0 },
        minExclusive: false,
      };
    }

    // Handle range syntax: >=1.0.0 <2.0.0
    const rangeMatch = trimmed.match(/^(>=?)\s*(\S+)\s+(<=?)\s*(\S+)$/);
    if (rangeMatch) {
      const minOp = rangeMatch[1];
      const minVer = this.parseVersion(rangeMatch[2]);
      const maxOp = rangeMatch[3];
      const maxVer = this.parseVersion(rangeMatch[4]);

      if (!minVer || !maxVer) {return null;}

      return {
        min: minVer,
        max: maxVer,
        minExclusive: minOp === '>',
        maxInclusive: maxOp === '<=',
      };
    }

    // Handle single comparison: >=1.0.0, <2.0.0, etc.
    const compMatch = trimmed.match(/^(>=?|<=?)\s*(\S+)$/);
    if (compMatch) {
      const op = compMatch[1];
      const version = this.parseVersion(compMatch[2]);
      if (!version) {return null;}

      switch (op) {
        case '>=':
          return { min: version, minExclusive: false };
        case '>':
          return { min: version, minExclusive: true };
        case '<=':
          return { max: version, maxInclusive: true };
        case '<':
          return { max: version, maxInclusive: false };
      }
    }

    // Handle exact version: 1.2.3
    const exactVersion = this.parseVersion(trimmed);
    if (exactVersion) {
      return {
        min: exactVersion,
        max: exactVersion,
        minExclusive: false,
        maxInclusive: true,
      };
    }

    return null;
  }

  /**
   * Check if a version satisfies a range
   */
  static versionSatisfiesRange(version: SemanticVersion, range: VersionRange): boolean {
    // Check minimum bound
    if (range.min) {
      const cmp = this.compareVersions(version, range.min);
      if (range.minExclusive ? cmp <= 0 : cmp < 0) {
        return false;
      }
    }

    // Check maximum bound
    if (range.max) {
      const cmp = this.compareVersions(version, range.max);
      if (range.maxInclusive ? cmp > 0 : cmp >= 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find the intersection of two version ranges
   */
  static intersectRanges(a: VersionRange, b: VersionRange): IntersectionResult {
    const result: VersionRange = {};

    // Determine the higher minimum
    if (a.min && b.min) {
      const cmp = this.compareVersions(a.min, b.min);
      if (cmp > 0) {
        result.min = a.min;
        result.minExclusive = a.minExclusive;
      } else if (cmp < 0) {
        result.min = b.min;
        result.minExclusive = b.minExclusive;
      } else {
        result.min = a.min;
        result.minExclusive = a.minExclusive || b.minExclusive;
      }
    } else {
      result.min = a.min || b.min;
      result.minExclusive = a.min ? a.minExclusive : b.minExclusive;
    }

    // Determine the lower maximum
    if (a.max && b.max) {
      const cmp = this.compareVersions(a.max, b.max);
      if (cmp < 0) {
        result.max = a.max;
        result.maxInclusive = a.maxInclusive;
      } else if (cmp > 0) {
        result.max = b.max;
        result.maxInclusive = b.maxInclusive;
      } else {
        result.max = a.max;
        result.maxInclusive = a.maxInclusive && b.maxInclusive;
      }
    } else {
      result.max = a.max || b.max;
      result.maxInclusive = a.max ? a.maxInclusive : b.maxInclusive;
    }

    // Check if the intersection is valid (min <= max)
    if (result.min && result.max) {
      const cmp = this.compareVersions(result.min, result.max);
      if (cmp > 0) {
        return {
          compatible: false,
          reason: `No overlap: min ${this.formatVersion(result.min)} > max ${this.formatVersion(result.max)}`,
        };
      }
      if (cmp === 0) {
        // Min equals max - only valid if both bounds are inclusive
        if (result.minExclusive || !result.maxInclusive) {
          return {
            compatible: false,
            reason: `Empty range at ${this.formatVersion(result.min)}`,
          };
        }
      }
    }

    return { compatible: true, range: result };
  }

  /**
   * Find the intersection of multiple constraints
   */
  static intersectConstraints(constraints: string[]): IntersectionResult {
    if (constraints.length === 0) {
      return { compatible: true, range: {} };
    }

    let currentRange: VersionRange = {};

    for (const constraint of constraints) {
      const parsed = this.parseConstraint(constraint);
      if (!parsed) {
        return {
          compatible: false,
          reason: `Unable to parse constraint: ${constraint}`,
        };
      }

      const intersection = this.intersectRanges(currentRange, parsed);
      if (!intersection.compatible) {
        return intersection;
      }
      currentRange = intersection.range!;
    }

    return { compatible: true, range: currentRange };
  }

  /**
   * Format a version range as a human-readable string
   */
  static formatRange(range: VersionRange): string {
    if (!range.min && !range.max) {
      return 'any';
    }

    const parts: string[] = [];

    if (range.min) {
      parts.push(`${range.minExclusive ? '>' : '>='}${this.formatVersion(range.min)}`);
    }

    if (range.max) {
      parts.push(`${range.maxInclusive ? '<=' : '<'}${this.formatVersion(range.max)}`);
    }

    return parts.join(' ');
  }

  /**
   * Analyze constraints for a dependency and determine if they're compatible
   */
  static analyzeConstraints(
    dependencyName: string,
    constraints: Array<{ packageName: string; constraint: string; isDev: boolean }>
  ): ConstraintAnalysis {
    const constraintStrings = constraints.map(c => c.constraint);
    const intersection = this.intersectConstraints(constraintStrings);

    if (intersection.compatible) {
      return {
        dependencyName,
        constraints,
        resolvable: true,
        resolvedRange: intersection.range,
      };
    }

    // Generate suggestion for resolving the conflict
    const suggestion = this.generateResolutionSuggestion(constraints);

    return {
      dependencyName,
      constraints,
      resolvable: false,
      conflictReason: intersection.reason,
      suggestion,
    };
  }

  /**
   * Generate a suggestion for resolving a constraint conflict
   */
  private static generateResolutionSuggestion(
    constraints: Array<{ packageName: string; constraint: string; isDev: boolean }>
  ): string {
    // Parse all constraints and find the highest minimum
    let highestMin: SemanticVersion | null = null;

    for (const c of constraints) {
      const range = this.parseConstraint(c.constraint);
      if (range?.min) {
        if (!highestMin || this.compareVersions(range.min, highestMin) > 0) {
          highestMin = range.min;
        }
      }
    }

    if (highestMin) {
      // Find packages that need updating
      const needsUpdate: string[] = [];
      for (const c of constraints) {
        const range = this.parseConstraint(c.constraint);
        if (range?.max && this.compareVersions(range.max, highestMin) <= 0) {
          needsUpdate.push(c.packageName);
        }
      }

      if (needsUpdate.length > 0) {
        return `Update ${needsUpdate.join(', ')} to use ^${this.formatVersion(highestMin)} or higher`;
      }
    }

    return 'Manually review and align version constraints across packages';
  }

  /**
   * Check if a constraint string represents a major version difference
   * This helps identify breaking changes
   */
  static hasMajorVersionConflict(constraints: string[]): boolean {
    const majors = new Set<number>();

    for (const constraint of constraints) {
      const range = this.parseConstraint(constraint);
      if (range?.min) {
        majors.add(range.min.major);
      }
    }

    return majors.size > 1;
  }
}
