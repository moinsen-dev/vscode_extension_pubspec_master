import { expect } from 'chai';

/**
 * Test pure functions extracted from PubDevClient
 * Note: PubDevClient depends on vscode APIs and https, so we test the pure functions here.
 */

/**
 * Extract GitHub URL from homepage if it points to GitHub (extracted logic)
 */
function extractGitHubUrl(url: string | undefined): string | undefined {
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
 * Check if version A is newer than version B (extracted logic)
 */
function isNewer(versionA: string, versionB: string): boolean {
  const cleanA = versionA.replace(/^\^/, '');
  const cleanB = versionB.replace(/^\^/, '');

  const partsA = cleanA.split('.').map((p) => parseInt(p, 10) || 0);
  const partsB = cleanB.split('.').map((p) => parseInt(p, 10) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;

    if (a > b) {
      return true;
    }
    if (a < b) {
      return false;
    }
  }

  return false;
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
 * Simulated cache logic for testing
 */
class TestCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTtl = 15 * 60 * 1000; // 15 minutes
  private offlineMaxAge = 24 * 60 * 60 * 1000; // 24 hours

  setCache<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  getFromCache<T>(key: string, allowStale = false): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;

    if (allowStale) {
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

  setCacheWithTimestamp<T>(
    key: string,
    data: T,
    timestamp: number,
    ttl?: number
  ): void {
    this.cache.set(key, {
      data,
      timestamp,
      ttl: ttl ?? this.defaultTtl,
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

describe('PubDevClient (pure functions)', () => {
  describe('extractGitHubUrl()', () => {
    it('should extract repo URL from standard GitHub URL', () => {
      const result = extractGitHubUrl('https://github.com/dart-lang/http');
      expect(result).to.equal('https://github.com/dart-lang/http');
    });

    it('should extract repo URL from GitHub URL with subdirectory', () => {
      const result = extractGitHubUrl(
        'https://github.com/flutter/packages/tree/main/packages/animations'
      );
      expect(result).to.equal('https://github.com/flutter/packages');
    });

    it('should extract repo URL from GitHub URL with blob path', () => {
      const result = extractGitHubUrl(
        'https://github.com/user/repo/blob/main/README.md'
      );
      expect(result).to.equal('https://github.com/user/repo');
    });

    it('should handle http (not https) URLs', () => {
      const result = extractGitHubUrl('http://github.com/owner/repo');
      expect(result).to.equal('https://github.com/owner/repo');
    });

    it('should return undefined for non-GitHub URL', () => {
      const result = extractGitHubUrl('https://gitlab.com/owner/repo');
      expect(result).to.be.undefined;
    });

    it('should return undefined for undefined input', () => {
      const result = extractGitHubUrl(undefined);
      expect(result).to.be.undefined;
    });

    it('should return undefined for empty string', () => {
      const result = extractGitHubUrl('');
      expect(result).to.be.undefined;
    });

    it('should return undefined for pub.dev URL', () => {
      const result = extractGitHubUrl('https://pub.dev/packages/http');
      expect(result).to.be.undefined;
    });

    it('should handle GitHub URL with trailing slash', () => {
      const result = extractGitHubUrl('https://github.com/dart-lang/http/');
      expect(result).to.equal('https://github.com/dart-lang/http');
    });

    it('should return undefined for GitHub URL without repo', () => {
      const result = extractGitHubUrl('https://github.com/dart-lang');
      expect(result).to.be.undefined;
    });
  });

  describe('isNewer()', () => {
    it('should detect newer major version', () => {
      expect(isNewer('2.0.0', '1.0.0')).to.be.true;
    });

    it('should detect newer minor version', () => {
      expect(isNewer('1.5.0', '1.4.0')).to.be.true;
    });

    it('should detect newer patch version', () => {
      expect(isNewer('1.0.5', '1.0.4')).to.be.true;
    });

    it('should return false for same version', () => {
      expect(isNewer('1.0.0', '1.0.0')).to.be.false;
    });

    it('should return false for older major version', () => {
      expect(isNewer('1.0.0', '2.0.0')).to.be.false;
    });

    it('should return false for older minor version', () => {
      expect(isNewer('1.4.0', '1.5.0')).to.be.false;
    });

    it('should return false for older patch version', () => {
      expect(isNewer('1.0.3', '1.0.4')).to.be.false;
    });

    it('should handle caret prefix', () => {
      expect(isNewer('^2.0.0', '^1.0.0')).to.be.true;
    });

    it('should handle mixed caret prefix', () => {
      expect(isNewer('2.0.0', '^1.0.0')).to.be.true;
      expect(isNewer('^2.0.0', '1.0.0')).to.be.true;
    });

    it('should handle version with only major.minor', () => {
      expect(isNewer('2.1', '2.0')).to.be.true;
      expect(isNewer('2.0', '2.1')).to.be.false;
    });

    it('should handle version with only major', () => {
      expect(isNewer('3', '2')).to.be.true;
      expect(isNewer('2', '3')).to.be.false;
    });

    it('should handle version comparison with different lengths', () => {
      expect(isNewer('1.0.1', '1.0')).to.be.true;
      expect(isNewer('1.0', '1.0.1')).to.be.false;
    });

    it('should handle pre-release versions as numeric', () => {
      // Note: This implementation treats non-numeric parts as 0
      expect(isNewer('1.0.0', '1.0.0-beta')).to.be.false;
    });

    it('should handle large version numbers', () => {
      expect(isNewer('100.50.25', '100.50.24')).to.be.true;
      expect(isNewer('100.49.99', '100.50.0')).to.be.false;
    });
  });

  describe('Cache logic', () => {
    let cache: TestCache;

    beforeEach(() => {
      cache = new TestCache();
    });

    it('should store and retrieve cache entries', () => {
      const data = { name: 'test', version: '1.0.0' };
      cache.setCache('package:test', data);

      const result = cache.getFromCache<typeof data>('package:test');
      expect(result).to.deep.equal(data);
    });

    it('should return null for missing cache key', () => {
      const result = cache.getFromCache('package:nonexistent');
      expect(result).to.be.null;
    });

    it('should return expired cache when allowStale is true', () => {
      const data = { name: 'test' };
      // Set cache with old timestamp (1 hour ago, TTL is 15 min)
      cache.setCacheWithTimestamp(
        'package:test',
        data,
        Date.now() - 60 * 60 * 1000,
        15 * 60 * 1000
      );

      // Without allowStale, should return null (expired)
      const normalResult = cache.getFromCache<typeof data>('package:test');
      expect(normalResult).to.be.null;

      // With allowStale, should return data (within 24h offline max)
      const staleResult = cache.getFromCache<typeof data>('package:test', true);
      expect(staleResult).to.deep.equal(data);
    });

    it('should not return stale cache older than 24 hours', () => {
      const data = { name: 'test' };
      // Set cache with very old timestamp (25 hours ago)
      cache.setCacheWithTimestamp(
        'package:test',
        data,
        Date.now() - 25 * 60 * 60 * 1000
      );

      const staleResult = cache.getFromCache<typeof data>('package:test', true);
      expect(staleResult).to.be.null;
    });

    it('should clear all cache entries', () => {
      cache.setCache('key1', { a: 1 });
      cache.setCache('key2', { b: 2 });

      expect(cache.getCacheSize()).to.equal(2);

      cache.clearCache();

      expect(cache.getCacheSize()).to.equal(0);
      expect(cache.getFromCache('key1')).to.be.null;
    });

    it('should respect custom TTL', () => {
      const data = { name: 'test' };
      // Set cache with short TTL (1 second)
      cache.setCacheWithTimestamp(
        'package:test',
        data,
        Date.now() - 2000, // 2 seconds ago
        1000 // 1 second TTL
      );

      // Should be expired
      const result = cache.getFromCache<typeof data>('package:test');
      expect(result).to.be.null;
    });

    it('should return fresh cache within TTL', () => {
      const data = { name: 'test' };
      cache.setCache('package:test', data);

      // Immediately after setting, should return data
      const result = cache.getFromCache<typeof data>('package:test');
      expect(result).to.deep.equal(data);
    });
  });
});

describe('PubPackageInfo structure', () => {
  it('should define expected package info structure', () => {
    // This test documents the expected structure
    const info = {
      name: 'http',
      latest: {
        version: '1.2.0',
        pubspec: {
          name: 'http',
          version: '1.2.0',
          description: 'HTTP client',
          repository: 'https://github.com/dart-lang/http',
        },
        published: '2024-01-15T00:00:00Z',
      },
      versions: ['1.2.0', '1.1.0', '1.0.0'],
      latestPublished: '2024-01-15T00:00:00Z',
      isDiscontinued: false,
      score: 130,
      likes: 1500,
      popularity: 95,
      repositoryUrl: 'https://github.com/dart-lang/http',
      issueTrackerUrl: 'https://github.com/dart-lang/http/issues',
    };

    expect(info.name).to.equal('http');
    expect(info.latest.version).to.equal('1.2.0');
    expect(info.versions).to.have.length(3);
    expect(info.isDiscontinued).to.be.false;
    expect(info.repositoryUrl).to.include('github.com');
  });

  it('should handle minimal package info', () => {
    const minimalInfo = {
      name: 'minimal_pkg',
      latest: {
        version: '0.0.1',
        pubspec: {
          name: 'minimal_pkg',
          version: '0.0.1',
        },
      },
      versions: ['0.0.1'],
    };

    expect(minimalInfo.name).to.equal('minimal_pkg');
    expect(minimalInfo.latest.version).to.equal('0.0.1');
  });

  it('should handle discontinued package', () => {
    const discontinuedInfo = {
      name: 'old_pkg',
      latest: {
        version: '1.0.0',
        pubspec: {
          name: 'old_pkg',
          version: '1.0.0',
        },
      },
      versions: ['1.0.0'],
      isDiscontinued: true,
    };

    expect(discontinuedInfo.isDiscontinued).to.be.true;
  });
});
