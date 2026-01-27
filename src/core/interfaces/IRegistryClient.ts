import { EcosystemType, RegistryPackageInfo, VersionCheckRequest, VersionCheckResult } from './types';

/**
 * Interface for package registry API clients
 *
 * Each ecosystem must implement this interface to interact with
 * its package registry (pub.dev, npm, pypi).
 */
export interface IRegistryClient {
  /** The ecosystem this client handles */
  readonly ecosystem: EcosystemType;

  /** The base URL of the registry */
  readonly registryUrl: string;

  /**
   * Get package information from the registry
   *
   * @param packageName - Name of the package
   * @returns Package info or null if not found
   */
  getPackageInfo(packageName: string): Promise<RegistryPackageInfo | null>;

  /**
   * Get the latest version of a package
   *
   * @param packageName - Name of the package
   * @returns Latest version string or null if not found
   */
  getLatestVersion(packageName: string): Promise<string | null>;

  /**
   * Check multiple packages for updates
   *
   * @param packages - Packages to check
   * @returns Version check results
   */
  checkForUpdates(packages: VersionCheckRequest[]): Promise<VersionCheckResult[]>;

  /**
   * Check if the client can reach the registry
   *
   * @returns True if online
   */
  isOnline(): boolean;

  /**
   * Clear the cache
   */
  clearCache(): void;
}
