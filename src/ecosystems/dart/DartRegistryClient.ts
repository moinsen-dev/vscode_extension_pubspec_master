import * as vscode from 'vscode';
import {
  EcosystemType,
  IRegistryClient,
  RegistryPackageInfo,
  VersionCheckRequest,
  VersionCheckResult,
} from '../../core/interfaces';
import { PubDevClient } from '../../api/PubDevClient';

/**
 * Dart registry client implementing IRegistryClient
 *
 * Wraps the existing PubDevClient to conform to the multi-ecosystem interface.
 */
export class DartRegistryClient implements IRegistryClient {
  readonly ecosystem: EcosystemType = 'dart';
  readonly registryUrl = 'https://pub.dev';

  private readonly client: PubDevClient;

  constructor(context: vscode.ExtensionContext) {
    this.client = new PubDevClient(context);
  }

  /**
   * Get package information from pub.dev
   */
  async getPackageInfo(packageName: string): Promise<RegistryPackageInfo | null> {
    const info = await this.client.getPackageInfo(packageName);

    if (!info) {
      return null;
    }

    return {
      name: info.name,
      latestVersion: info.latest.version,
      description: info.latest.pubspec.description,
      publishedAt: info.latestPublished,
      repositoryUrl: info.repositoryUrl,
      isDiscontinued: info.isDiscontinued,
      score: info.score,
      popularity: info.popularity,
    };
  }

  /**
   * Get the latest version of a package
   */
  async getLatestVersion(packageName: string): Promise<string | null> {
    return this.client.getLatestVersion(packageName);
  }

  /**
   * Check multiple packages for updates
   */
  async checkForUpdates(packages: VersionCheckRequest[]): Promise<VersionCheckResult[]> {
    const legacyPackages = packages.map(p => ({
      name: p.name,
      currentVersion: p.currentVersion ?? '',
    }));

    const results = await this.client.checkForUpdates(legacyPackages);

    return results.map(r => ({
      name: r.name,
      currentVersion: r.current,
      latestVersion: r.latest ?? undefined,
      isOutdated: r.hasUpdate,
    }));
  }

  /**
   * Check if the client can reach pub.dev
   */
  isOnline(): boolean {
    return this.client.getOnlineStatus();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.client.clearCache();
  }

  /**
   * Save cache to persistent storage
   */
  async persistCache(context: vscode.ExtensionContext): Promise<void> {
    await this.client.persistCache(context);
  }

  /**
   * Get the underlying PubDevClient for advanced operations
   */
  getUnderlyingClient(): PubDevClient {
    return this.client;
  }
}
