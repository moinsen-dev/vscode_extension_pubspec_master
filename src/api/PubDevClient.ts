import * as https from 'https';
import * as vscode from 'vscode';
import { DEFAULTS } from '../constants';

/**
 * Package info from pub.dev API
 */
export interface PubPackageInfo {
  name: string;
  latest: {
    version: string;
    pubspec: {
      name: string;
      version: string;
      description?: string;
      repository?: string;
      homepage?: string;
      issueTracker?: string;
    };
    published?: string;  // ISO date string
  };
  versions: string[];

  // Health indicators (extracted from pub.dev API)
  /** ISO date of the latest version publication */
  latestPublished?: string;
  /** Whether the package is marked as discontinued on pub.dev */
  isDiscontinued?: boolean;
  /** Package score (0-160 range on pub.dev) */
  score?: number;
  /** Number of likes on pub.dev */
  likes?: number;
  /** Popularity percentage (0-100) */
  popularity?: number;

  // Repository info (for GitHub integration)
  /** Repository URL (from pubspec repository or homepage) */
  repositoryUrl?: string;
  /** Issue tracker URL */
  issueTrackerUrl?: string;
}

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Client for pub.dev API with caching
 */
export class PubDevClient {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtl: number;
  private readonly offlineMaxAge: number;
  private isOnline = true;
  private offlineNotificationShown = false;

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('pubspecMaster.cache');
    this.defaultTtl = (config.get<number>('ttlMinutes', DEFAULTS.CACHE_TTL_MINUTES) || DEFAULTS.CACHE_TTL_MINUTES) * 60 * 1000;
    this.offlineMaxAge =
      (config.get<number>('offlineMaxHours', DEFAULTS.OFFLINE_MAX_HOURS) || DEFAULTS.OFFLINE_MAX_HOURS) * 60 * 60 * 1000;

    // Restore cache from global state
    const savedCache = context.globalState.get<
      Array<[string, CacheEntry<unknown>]>
    >('pubDevCache', []);
    for (const [key, entry] of savedCache) {
      this.cache.set(key, entry);
    }
  }

  /**
   * Get package info from pub.dev
   */
  async getPackageInfo(packageName: string): Promise<PubPackageInfo | null> {
    const cacheKey = `package:${packageName}`;
    const cached = this.getFromCache<PubPackageInfo>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // pub.dev API response structure
      const response = await this.fetch<{
        name: string;
        latest: {
          version: string;
          published?: string;
          pubspec: {
            name: string;
            version: string;
            description?: string;
            repository?: string;
            homepage?: string;
            issue_tracker?: string;
          };
        };
        versions: Array<{ version: string; published?: string }>;
        // Health indicators from pub.dev API
        isDiscontinued?: boolean;
      }>(`/packages/${packageName}`);

      if (response) {
        // Extract repository URL (prefer repository over homepage)
        const pubspec = response.latest.pubspec;
        const repositoryUrl = pubspec.repository || this.extractGitHubUrl(pubspec.homepage);
        const issueTrackerUrl = pubspec.issue_tracker || (repositoryUrl ? `${repositoryUrl}/issues` : undefined);

        const info: PubPackageInfo = {
          name: response.name,
          latest: {
            ...response.latest,
            pubspec: {
              ...response.latest.pubspec,
              repository: pubspec.repository,
              homepage: pubspec.homepage,
              issueTracker: pubspec.issue_tracker,
            },
          },
          versions: response.versions.map((v) => v.version),
          // Extract health data
          latestPublished: response.latest.published,
          isDiscontinued: response.isDiscontinued ?? false,
          // Repository info
          repositoryUrl,
          issueTrackerUrl,
        };
        this.setCache(cacheKey, info);
        this.isOnline = true;
        this.offlineNotificationShown = false; // Reset when back online

        // Fetch additional metrics (score, likes, popularity) from score endpoint
        this.fetchPackageMetrics(packageName, info);

        return info;
      }
    } catch (error) {
      const wasOnline = this.isOnline;
      this.isOnline = false;

      // Show notification once when going offline
      if (wasOnline && !this.offlineNotificationShown) {
        this.offlineNotificationShown = true;
        vscode.window.showWarningMessage(
          'Pubspec Master: Unable to reach pub.dev. Using cached data (may be outdated).',
          'OK'
        );
      }

      // Try to return stale cache in offline mode
      const stale = this.getFromCache<PubPackageInfo>(cacheKey, true);
      if (stale) {
        return stale;
      }
    }

    return null;
  }

  /**
   * Fetch additional package metrics (score, likes, popularity)
   * This updates the cached info asynchronously
   */
  private async fetchPackageMetrics(packageName: string, info: PubPackageInfo): Promise<void> {
    try {
      const metrics = await this.fetch<{
        score?: {
          grantedPoints?: number;
          maxPoints?: number;
          likeCount?: number;
          popularityScore?: number;
        };
        scorecard?: {
          grantedPoints?: number;
          maxPoints?: number;
        };
        likeCount?: number;
        popularityScore?: number;
      }>(`/packages/${packageName}/metrics`);

      if (metrics) {
        // Extract from different possible response structures
        info.likes = metrics.likeCount ?? metrics.score?.likeCount;
        info.popularity = metrics.popularityScore ?? metrics.score?.popularityScore;
        info.score = metrics.score?.grantedPoints ?? metrics.scorecard?.grantedPoints;

        // Update cache with metrics
        const cacheKey = `package:${packageName}`;
        this.setCache(cacheKey, info);
      }
    } catch {
      // Metrics are optional, don't fail if unavailable
    }
  }

  /**
   * Get latest version for a package
   */
  async getLatestVersion(packageName: string): Promise<string | null> {
    const info = await this.getPackageInfo(packageName);
    return info?.latest.version ?? null;
  }

  /**
   * Check multiple packages for updates
   */
  async checkForUpdates(
    packages: Array<{ name: string; currentVersion: string }>
  ): Promise<
    Array<{
      name: string;
      current: string;
      latest: string | null;
      hasUpdate: boolean;
    }>
  > {
    const results = await Promise.all(
      packages.map(async (pkg) => {
        const latest = await this.getLatestVersion(pkg.name);
        return {
          name: pkg.name,
          current: pkg.currentVersion,
          latest,
          hasUpdate: latest ? this.isNewer(latest, pkg.currentVersion) : false,
        };
      })
    );

    return results;
  }

  /**
   * Extract GitHub URL from homepage if it points to GitHub
   */
  private extractGitHubUrl(url: string | undefined): string | undefined {
    if (!url) {
      return undefined;
    }
    // Check if it's a GitHub URL
    if (url.includes('github.com')) {
      // Clean up the URL to get just the repo root
      const match = url.match(/https?:\/\/github\.com\/([^/]+\/[^/]+)/);
      if (match) {
        return `https://github.com/${match[1]}`;
      }
    }
    return undefined;
  }

  /**
   * Check if version A is newer than version B
   */
  private isNewer(versionA: string, versionB: string): boolean {
    const cleanA = versionA.replace(/^\^/, '');
    const cleanB = versionB.replace(/^\^/, '');

    const partsA = cleanA.split('.').map((p) => parseInt(p, 10) || 0);
    const partsB = cleanB.split('.').map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;

      if (a > b) {return true;}
      if (a < b) {return false;}
    }

    return false;
  }

  /**
   * Make HTTP GET request
   */
  private fetch<T>(path: string): Promise<T | null> {
    return new Promise((resolve) => {
      const options = {
        hostname: 'pub.dev',
        port: 443,
        path: `/api${path}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'moinsen-pubspec-master-vscode/0.6.0',
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          } else if (res.statusCode === 429) {
            // Rate limited
            console.warn('Moinsen: Rate limited by pub.dev');
            resolve(null);
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', () => {
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.end();
    });
  }

  /**
   * Get from cache
   */
  private getFromCache<T>(key: string, allowStale = false): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;

    if (allowStale) {
      // In offline mode, allow older cached data
      if (age < this.offlineMaxAge) {
        return entry.data;
      }
    } else {
      if (age < entry.ttl) {
        return entry.data;
      }
    }

    return null;
  }

  /**
   * Set cache entry
   */
  private setCache<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  /**
   * Check if client is online
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Save cache to persistent storage
   */
  async persistCache(context: vscode.ExtensionContext): Promise<void> {
    const entries = Array.from(this.cache.entries());
    await context.globalState.update('pubDevCache', entries);
  }
}
