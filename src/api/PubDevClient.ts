import * as https from 'https';
import * as vscode from 'vscode';

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
    };
  };
  versions: string[];
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

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('pubspecMaster.cache');
    this.defaultTtl = (config.get<number>('ttlMinutes', 15) || 15) * 60 * 1000;
    this.offlineMaxAge =
      (config.get<number>('offlineMaxHours', 24) || 24) * 60 * 60 * 1000;

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
      const response = await this.fetch<{
        name: string;
        latest: { version: string; pubspec: { name: string; version: string; description?: string } };
        versions: Array<{ version: string }>;
      }>(`/packages/${packageName}`);

      if (response) {
        const info: PubPackageInfo = {
          name: response.name,
          latest: response.latest,
          versions: response.versions.map((v) => v.version),
        };
        this.setCache(cacheKey, info);
        this.isOnline = true;
        return info;
      }
    } catch (error) {
      this.isOnline = false;
      // Try to return stale cache in offline mode
      const stale = this.getFromCache<PubPackageInfo>(cacheKey, true);
      if (stale) {
        return stale;
      }
    }

    return null;
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
          'User-Agent': 'pubspec-master-vscode',
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
            console.warn('Pubspec Master: Rate limited by pub.dev');
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
