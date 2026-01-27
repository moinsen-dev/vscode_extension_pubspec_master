/**
 * Shared version comparison utilities for all ecosystems
 *
 * Handles semver and various version constraint formats used
 * across different package managers.
 */

/**
 * Parsed version components
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
  raw: string;
}

/**
 * Compare two version strings
 *
 * @returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  // Compare major
  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }

  // Compare minor
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }

  // Compare patch
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch - parsedB.patch;
  }

  // Prerelease versions have lower precedence than release versions
  if (parsedA.prerelease && !parsedB.prerelease) {
    return -1;
  }
  if (!parsedA.prerelease && parsedB.prerelease) {
    return 1;
  }
  if (parsedA.prerelease && parsedB.prerelease) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }

  return 0;
}

/**
 * Parse a version string into components
 */
export function parseVersion(version: string): ParsedVersion {
  // Remove leading constraint characters (^, ~, >=, >, <, <=)
  const cleaned = version.replace(/^[\^~>=<]+/, '').trim();

  // Handle prerelease and build metadata
  const [versionPart, preAndBuild] = cleaned.split('+');
  const [baseVersion, prerelease] = versionPart.split('-');

  const parts = baseVersion.split('.').map((p) => parseInt(p, 10) || 0);

  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    prerelease,
    build: preAndBuild,
    raw: version,
  };
}

/**
 * Check if version A is newer than version B
 */
export function isNewerVersion(versionA: string, versionB: string): boolean {
  return compareVersions(versionA, versionB) > 0;
}

/**
 * Check if version A is older than version B
 */
export function isOlderVersion(versionA: string, versionB: string): boolean {
  return compareVersions(versionA, versionB) < 0;
}

/**
 * Check if two versions are equal (ignoring build metadata)
 */
export function versionsEqual(versionA: string, versionB: string): boolean {
  return compareVersions(versionA, versionB) === 0;
}

/**
 * Extract the base version from a constraint string
 * e.g., "^1.2.3" -> "1.2.3", ">=1.0.0 <2.0.0" -> "1.0.0"
 */
export function extractVersionFromConstraint(constraint: string): string {
  const match = constraint.match(/[\^~>=<]*(\d+(?:\.\d+)*(?:-[\w.]+)?)/);
  return match ? match[1] : '0.0.0';
}

/**
 * Get the major version number from a version string
 */
export function getMajorVersion(version: string): number {
  return parseVersion(version).major;
}

/**
 * Get the minor version number from a version string
 */
export function getMinorVersion(version: string): number {
  return parseVersion(version).minor;
}

/**
 * Check if a constraint uses caret syntax (^)
 */
export function isCaretConstraint(constraint: string): boolean {
  return constraint.startsWith('^');
}

/**
 * Check if a constraint uses tilde syntax (~)
 */
export function isTildeConstraint(constraint: string): boolean {
  return constraint.startsWith('~');
}

/**
 * Check if a constraint is a range (e.g., ">=1.0.0 <2.0.0")
 */
export function isRangeConstraint(constraint: string): boolean {
  return constraint.includes(' ') && (constraint.includes('<') || constraint.includes('>'));
}

/**
 * Check if a constraint is exact (no operators)
 */
export function isExactConstraint(constraint: string): boolean {
  return !constraint.match(/^[\^~>=<]/);
}

/**
 * Sort an array of version strings in ascending order
 */
export function sortVersions(versions: string[]): string[] {
  return [...versions].sort(compareVersions);
}

/**
 * Get the highest version from an array
 */
export function getHighestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) {
    return undefined;
  }
  return sortVersions(versions)[versions.length - 1];
}

/**
 * Get the lowest version from an array
 */
export function getLowestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) {
    return undefined;
  }
  return sortVersions(versions)[0];
}
