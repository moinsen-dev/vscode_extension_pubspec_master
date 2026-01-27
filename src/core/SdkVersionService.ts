import { runCommand } from '../utils/processUtils';

/**
 * Installed SDK versions
 */
export interface InstalledSdkVersions {
  /** Dart SDK version (e.g., "3.4.0") */
  dart: string | null;
  /** Flutter SDK version (e.g., "3.24.0") */
  flutter: string | null;
  /** Timestamp when versions were detected */
  detectedAt: number;
}

/**
 * Service for detecting and caching installed Dart/Flutter SDK versions
 *
 * This service runs CLI commands to detect the user's installed SDK versions
 * and caches the result for the session to avoid repeated CLI calls.
 */
export class SdkVersionService {
  private static instance: SdkVersionService | null = null;
  private cachedVersions: InstalledSdkVersions | null = null;

  /** Cache TTL in milliseconds (5 minutes) */
  private readonly CACHE_TTL = 5 * 60 * 1000;

  /**
   * Get singleton instance
   */
  static getInstance(): SdkVersionService {
    if (!SdkVersionService.instance) {
      SdkVersionService.instance = new SdkVersionService();
    }
    return SdkVersionService.instance;
  }

  /**
   * Get installed SDK versions (uses cache if available)
   */
  async getInstalledVersions(): Promise<InstalledSdkVersions> {
    // Return cached versions if still valid
    if (this.cachedVersions && this.isCacheValid()) {
      return this.cachedVersions;
    }

    // Detect versions in parallel
    const [dartVersion, flutterVersion] = await Promise.all([
      this.detectDartVersion(),
      this.detectFlutterVersion(),
    ]);

    this.cachedVersions = {
      dart: dartVersion,
      flutter: flutterVersion,
      detectedAt: Date.now(),
    };

    return this.cachedVersions;
  }

  /**
   * Force refresh of SDK versions (ignores cache)
   */
  async refreshVersions(): Promise<InstalledSdkVersions> {
    this.cachedVersions = null;
    return this.getInstalledVersions();
  }

  /**
   * Clear the cached versions
   */
  clearCache(): void {
    this.cachedVersions = null;
  }

  /**
   * Check if the cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cachedVersions) {
      return false;
    }
    return Date.now() - this.cachedVersions.detectedAt < this.CACHE_TTL;
  }

  /**
   * Detect installed Dart SDK version
   */
  private async detectDartVersion(): Promise<string | null> {
    try {
      const result = await runCommand('dart', ['--version'], process.cwd());
      if (result.exitCode !== 0) {
        return null;
      }

      // Parse: "Dart SDK version: 3.4.0 (stable) (Tue Jan 14 11:45:00 2025 -0800) on "macos_arm64""
      const match = result.stdout.match(/Dart SDK version:\s*(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Detect installed Flutter SDK version
   */
  private async detectFlutterVersion(): Promise<string | null> {
    try {
      const result = await runCommand('flutter', ['--version'], process.cwd());
      if (result.exitCode !== 0) {
        return null;
      }

      // Parse: "Flutter 3.24.0 • channel stable • ..."
      const match = result.stdout.match(/Flutter\s+(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if an SDK constraint is satisfied by the installed version
   *
   * @param constraint - SDK constraint string (e.g., ">=3.4.0 <4.0.0", "^3.6.0")
   * @param installedVersion - Installed SDK version (e.g., "3.4.0")
   * @returns true if the installed version satisfies the constraint
   */
  static isConstraintSatisfied(
    constraint: string,
    installedVersion: string
  ): boolean {
    if (!constraint || !installedVersion) {
      return false;
    }

    const installed = SdkVersionService.parseVersion(installedVersion);
    if (!installed) {
      return false;
    }

    // Handle caret constraint: ^3.6.0 means >=3.6.0 <4.0.0
    if (constraint.startsWith('^')) {
      const minVersion = constraint.slice(1).trim();
      const min = SdkVersionService.parseVersion(minVersion);
      if (!min) {
        return false;
      }

      // Must be >= min version
      if (SdkVersionService.compareVersions(installed, min) < 0) {
        return false;
      }

      // Must be < next major version
      const maxMajor = min.major + 1;
      if (installed.major >= maxMajor) {
        return false;
      }

      return true;
    }

    // Handle range constraint: >=3.4.0 <4.0.0
    const rangeMatch = constraint.match(
      />=?\s*(\d+\.\d+\.\d+)\s*<?=?\s*(\d+\.\d+\.\d+)?/
    );
    if (rangeMatch) {
      const minVersion = rangeMatch[1];
      const maxVersion = rangeMatch[2];

      const min = SdkVersionService.parseVersion(minVersion);
      if (!min) {
        return false;
      }

      // Check minimum
      const isGte = constraint.includes('>=');
      const minCompare = SdkVersionService.compareVersions(installed, min);
      if (isGte ? minCompare < 0 : minCompare <= 0) {
        return false;
      }

      // Check maximum if specified
      if (maxVersion) {
        const max = SdkVersionService.parseVersion(maxVersion);
        if (max) {
          const isLte = constraint.includes('<=');
          const maxCompare = SdkVersionService.compareVersions(installed, max);
          if (isLte ? maxCompare > 0 : maxCompare >= 0) {
            return false;
          }
        }
      }

      return true;
    }

    // Handle simple version: 3.4.0 (exact match)
    const exact = SdkVersionService.parseVersion(constraint);
    if (exact) {
      return SdkVersionService.compareVersions(installed, exact) === 0;
    }

    // Unable to parse constraint - assume compatible
    return true;
  }

  /**
   * Extract the minimum required version from a constraint
   *
   * @param constraint - SDK constraint string
   * @returns The minimum version string, or null if unable to parse
   */
  static extractMinVersion(constraint: string): string | null {
    if (!constraint) {
      return null;
    }

    // Caret: ^3.6.0 -> 3.6.0
    if (constraint.startsWith('^')) {
      return constraint.slice(1).trim();
    }

    // Range: >=3.4.0 <4.0.0 -> 3.4.0
    const rangeMatch = constraint.match(/>=?\s*(\d+\.\d+\.\d+)/);
    if (rangeMatch) {
      return rangeMatch[1];
    }

    // Simple version
    const simpleMatch = constraint.match(/(\d+\.\d+\.\d+)/);
    if (simpleMatch) {
      return simpleMatch[1];
    }

    return null;
  }

  /**
   * Parse a version string into components
   */
  private static parseVersion(
    version: string
  ): { major: number; minor: number; patch: number } | null {
    const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      return null;
    }
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }

  /**
   * Compare two parsed versions
   * @returns negative if a < b, 0 if a === b, positive if a > b
   */
  private static compareVersions(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number }
  ): number {
    if (a.major !== b.major) {
      return a.major - b.major;
    }
    if (a.minor !== b.minor) {
      return a.minor - b.minor;
    }
    return a.patch - b.patch;
  }
}
