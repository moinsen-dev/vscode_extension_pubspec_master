import * as vscode from 'vscode';
import { SdkVersionService, InstalledSdkVersions } from './SdkVersionService';
import { PubDevClient, VersionSdkConstraints } from '../api/PubDevClient';

/**
 * Result of a compatibility check
 */
export interface CompatibilityCheckResult {
  /** Package name */
  packageName: string;
  /** Current version in pubspec */
  currentVersion: string;
  /** Latest version on pub.dev */
  latestVersion: string | null;
  /** Whether the latest version is compatible with installed SDK */
  isLatestCompatible: boolean;
  /** Highest version compatible with installed SDK */
  highestCompatibleVersion: string | null;
  /** SDK constraint of the latest version */
  latestSdkConstraint?: string;
  /** User's installed Dart SDK version */
  installedDartSdk: string | null;
  /** Reason if incompatible */
  incompatibilityReason?: string;
}

/**
 * Summary of workspace compatibility
 */
export interface CompatibilitySummary {
  /** User's installed SDK versions */
  installedSdk: InstalledSdkVersions;
  /** Total packages checked */
  totalPackages: number;
  /** Packages with updates available */
  packagesWithUpdates: number;
  /** Packages where latest is compatible */
  compatibleUpdates: number;
  /** Packages where latest requires newer SDK */
  incompatibleUpdates: number;
  /** Detailed results per package */
  results: CompatibilityCheckResult[];
}

/**
 * Analyzer for SDK compatibility of package updates
 *
 * Checks if package updates are compatible with the user's installed SDK
 * and finds alternative compatible versions when they're not.
 */
export class CompatibilityAnalyzer {
  private readonly sdkService: SdkVersionService;
  private readonly pubDevClient: PubDevClient;

  constructor(context: vscode.ExtensionContext) {
    this.sdkService = SdkVersionService.getInstance();
    this.pubDevClient = new PubDevClient(context);
  }

  /**
   * Check if a package update is compatible with the installed SDK
   */
  async checkPackageCompatibility(
    packageName: string,
    currentVersion: string
  ): Promise<CompatibilityCheckResult> {
    const installedSdk = await this.sdkService.getInstalledVersions();

    // Get package info from pub.dev
    const packageInfo = await this.pubDevClient.getPackageInfo(packageName);

    if (!packageInfo) {
      return {
        packageName,
        currentVersion,
        latestVersion: null,
        isLatestCompatible: true,
        highestCompatibleVersion: null,
        installedDartSdk: installedSdk.dart,
        incompatibilityReason: 'Unable to fetch package info from pub.dev',
      };
    }

    const latestVersion = packageInfo.latest.version;

    // Get SDK constraint for latest version
    const latestConstraints = await this.pubDevClient.getVersionSdkConstraints(
      packageName,
      latestVersion
    );

    // Check if latest is compatible
    const isLatestCompatible = this.isVersionCompatible(
      latestConstraints,
      installedSdk
    );

    let highestCompatibleVersion: string | null = null;
    let incompatibilityReason: string | undefined;

    if (!isLatestCompatible && installedSdk.dart) {
      // Find highest compatible version
      highestCompatibleVersion = await this.pubDevClient.findHighestCompatibleVersion(
        packageName,
        installedSdk.dart
      );

      const minRequired = latestConstraints?.sdkConstraint
        ? SdkVersionService.extractMinVersion(latestConstraints.sdkConstraint)
        : null;

      if (minRequired) {
        incompatibilityReason = `Latest version requires Dart SDK ${minRequired}+, you have ${installedSdk.dart}`;
      } else {
        incompatibilityReason = 'Latest version has incompatible SDK requirements';
      }
    }

    return {
      packageName,
      currentVersion,
      latestVersion,
      isLatestCompatible,
      highestCompatibleVersion,
      latestSdkConstraint: latestConstraints?.sdkConstraint,
      installedDartSdk: installedSdk.dart,
      incompatibilityReason,
    };
  }

  /**
   * Analyze compatibility for multiple packages
   */
  async analyzeWorkspaceCompatibility(
    packages: Array<{ name: string; currentVersion: string }>
  ): Promise<CompatibilitySummary> {
    const installedSdk = await this.sdkService.getInstalledVersions();

    const results = await Promise.all(
      packages.map((pkg) =>
        this.checkPackageCompatibility(pkg.name, pkg.currentVersion)
      )
    );

    let packagesWithUpdates = 0;
    let compatibleUpdates = 0;
    let incompatibleUpdates = 0;

    for (const result of results) {
      if (result.latestVersion && result.latestVersion !== result.currentVersion) {
        packagesWithUpdates++;
        if (result.isLatestCompatible) {
          compatibleUpdates++;
        } else {
          incompatibleUpdates++;
        }
      }
    }

    return {
      installedSdk,
      totalPackages: packages.length,
      packagesWithUpdates,
      compatibleUpdates,
      incompatibleUpdates,
      results,
    };
  }

  /**
   * Get a user-friendly recommendation for a package update
   */
  getUpdateRecommendation(result: CompatibilityCheckResult): string {
    if (!result.latestVersion) {
      return `Unable to check updates for ${result.packageName}`;
    }

    if (result.latestVersion === result.currentVersion) {
      return `${result.packageName} is up to date`;
    }

    if (result.isLatestCompatible) {
      return `${result.packageName}: Update available ${result.currentVersion} → ${result.latestVersion}`;
    }

    if (result.highestCompatibleVersion) {
      if (result.highestCompatibleVersion === result.currentVersion) {
        return `${result.packageName}: Already at highest compatible version (latest ${result.latestVersion} requires SDK ${result.latestSdkConstraint})`;
      }
      return `${result.packageName}: ${result.currentVersion} → ${result.highestCompatibleVersion} (latest ${result.latestVersion} requires SDK ${result.latestSdkConstraint})`;
    }

    return `${result.packageName}: Latest ${result.latestVersion} incompatible - ${result.incompatibilityReason}`;
  }

  /**
   * Check if a version's constraints are compatible with installed SDK
   */
  private isVersionCompatible(
    constraints: VersionSdkConstraints | null,
    installedSdk: InstalledSdkVersions
  ): boolean {
    // If we couldn't get constraints, assume compatible
    if (!constraints) {
      return true;
    }

    // Check Dart SDK constraint
    if (constraints.sdkConstraint && installedSdk.dart) {
      if (!SdkVersionService.isConstraintSatisfied(
        constraints.sdkConstraint,
        installedSdk.dart
      )) {
        return false;
      }
    }

    // Check Flutter SDK constraint if present
    if (constraints.flutterConstraint && installedSdk.flutter) {
      if (!SdkVersionService.isConstraintSatisfied(
        constraints.flutterConstraint,
        installedSdk.flutter
      )) {
        return false;
      }
    }

    return true;
  }
}
