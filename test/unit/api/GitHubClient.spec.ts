import { expect } from 'chai';

/**
 * Test pure functions extracted from GitHubClient
 * Note: GitHubClient depends on vscode APIs and https, so we test the pure functions here.
 */

/**
 * Parsed GitHub repository info from URL
 */
interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * Parse GitHub repository URL to extract owner and repo name (extracted logic)
 * Handles various formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - github.com/owner/repo
 */
function parseRepoUrl(url: string): RepoInfo | null {
  if (!url) {
    return null;
  }

  // Clean up the URL
  let cleaned = url.trim();

  // Remove trailing .git
  cleaned = cleaned.replace(/\.git$/, '');

  // Handle SSH format: git@github.com:owner/repo
  const sshMatch = cleaned.match(/git@github\.com:([^/]+)\/(.+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Handle HTTPS format: https://github.com/owner/repo
  const httpsMatch = cleaned.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
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
 * GitHubMetrics interface (extracted from GitHubClient)
 */
interface GitHubMetrics {
  repoFullName: string;
  openIssues: number;
  openPRs: number;
  lastCommitDate?: string;
  daysSinceLastCommit: number;
  stars: number;
  forks: number;
  isArchived: boolean;
  hasSecurityAdvisories: boolean;
  securityAdvisoryCount: number;
  avgIssueCloseTimeDays?: number;
  avgPRMergeTimeDays?: number;
  license?: string;
  fetchedAt: number;
}

/**
 * Simulated cache logic for testing (same as real implementation)
 */
class TestGitHubCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTtl = 60 * 60 * 1000; // 60 minutes
  private staleMaxAge = 24 * 60 * 60 * 1000; // 24 hours

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
      if (age < this.staleMaxAge) {
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

describe('GitHubClient (pure functions)', () => {
  describe('parseRepoUrl()', () => {
    describe('HTTPS URLs', () => {
      it('should parse standard HTTPS URL', () => {
        const result = parseRepoUrl('https://github.com/dart-lang/http');
        expect(result).to.deep.equal({ owner: 'dart-lang', repo: 'http' });
      });

      it('should parse HTTPS URL with .git suffix', () => {
        const result = parseRepoUrl('https://github.com/dart-lang/http.git');
        expect(result).to.deep.equal({ owner: 'dart-lang', repo: 'http' });
      });

      it('should parse HTTP URL (not HTTPS)', () => {
        const result = parseRepoUrl('http://github.com/owner/repo');
        expect(result).to.deep.equal({ owner: 'owner', repo: 'repo' });
      });

      it('should parse URL without protocol', () => {
        const result = parseRepoUrl('github.com/flutter/flutter');
        expect(result).to.deep.equal({ owner: 'flutter', repo: 'flutter' });
      });

      it('should handle URL with trailing content after repo name', () => {
        const result = parseRepoUrl('https://github.com/owner/repo/tree/main');
        expect(result).to.deep.equal({ owner: 'owner', repo: 'repo' });
      });

      it('should handle URL with blob path', () => {
        const result = parseRepoUrl(
          'https://github.com/owner/repo/blob/main/README.md'
        );
        expect(result).to.deep.equal({ owner: 'owner', repo: 'repo' });
      });
    });

    describe('SSH URLs', () => {
      it('should parse SSH URL', () => {
        const result = parseRepoUrl('git@github.com:dart-lang/http.git');
        expect(result).to.deep.equal({ owner: 'dart-lang', repo: 'http' });
      });

      it('should parse SSH URL without .git suffix', () => {
        const result = parseRepoUrl('git@github.com:flutter/flutter');
        expect(result).to.deep.equal({ owner: 'flutter', repo: 'flutter' });
      });

      it('should parse SSH URL with organization', () => {
        const result = parseRepoUrl('git@github.com:google/protobuf.dart.git');
        expect(result).to.deep.equal({ owner: 'google', repo: 'protobuf.dart' });
      });
    });

    describe('Edge cases', () => {
      it('should return null for empty string', () => {
        const result = parseRepoUrl('');
        expect(result).to.be.null;
      });

      it('should return null for null-like input', () => {
        // TypeScript wouldn't allow null, but test the function behavior
        const result = parseRepoUrl(undefined as unknown as string);
        expect(result).to.be.null;
      });

      it('should return null for non-GitHub URL', () => {
        const result = parseRepoUrl('https://gitlab.com/owner/repo');
        expect(result).to.be.null;
      });

      it('should return null for BitBucket URL', () => {
        const result = parseRepoUrl('https://bitbucket.org/owner/repo');
        expect(result).to.be.null;
      });

      it('should return null for incomplete GitHub URL (owner only)', () => {
        const result = parseRepoUrl('https://github.com/owner');
        expect(result).to.be.null;
      });

      it('should handle URL with whitespace', () => {
        const result = parseRepoUrl('  https://github.com/owner/repo  ');
        expect(result).to.deep.equal({ owner: 'owner', repo: 'repo' });
      });

      it('should return null for pub.dev URL', () => {
        const result = parseRepoUrl('https://pub.dev/packages/http');
        expect(result).to.be.null;
      });
    });

    describe('Real-world package URLs', () => {
      it('should parse flutter/packages repo', () => {
        const result = parseRepoUrl(
          'https://github.com/flutter/packages/tree/main/packages/animations'
        );
        expect(result).to.deep.equal({ owner: 'flutter', repo: 'packages' });
      });

      it('should parse dart-lang/sdk repo', () => {
        const result = parseRepoUrl('https://github.com/dart-lang/sdk');
        expect(result).to.deep.equal({ owner: 'dart-lang', repo: 'sdk' });
      });

      it('should parse firebase repos', () => {
        const result = parseRepoUrl(
          'https://github.com/firebase/flutterfire/tree/master/packages/firebase_core'
        );
        expect(result).to.deep.equal({ owner: 'firebase', repo: 'flutterfire' });
      });

      it('should handle repos with dots in name', () => {
        const result = parseRepoUrl('https://github.com/user/my.package.name');
        expect(result).to.deep.equal({ owner: 'user', repo: 'my.package.name' });
      });

      it('should handle repos with hyphens', () => {
        const result = parseRepoUrl('https://github.com/my-org/my-package');
        expect(result).to.deep.equal({ owner: 'my-org', repo: 'my-package' });
      });

      it('should handle repos with underscores', () => {
        const result = parseRepoUrl('https://github.com/my_org/my_package');
        expect(result).to.deep.equal({ owner: 'my_org', repo: 'my_package' });
      });
    });
  });

  describe('GitHubMetrics structure', () => {
    it('should define expected metrics structure', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'dart-lang/http',
        openIssues: 42,
        openPRs: 5,
        lastCommitDate: '2024-12-01T10:00:00Z',
        daysSinceLastCommit: 21,
        stars: 500,
        forks: 150,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        license: 'BSD-3-Clause',
        fetchedAt: Date.now(),
      };

      expect(metrics.repoFullName).to.equal('dart-lang/http');
      expect(metrics.openIssues).to.equal(42);
      expect(metrics.isArchived).to.be.false;
      expect(metrics.license).to.equal('BSD-3-Clause');
    });

    it('should handle archived repository metrics', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'old-owner/deprecated-repo',
        openIssues: 0,
        openPRs: 0,
        daysSinceLastCommit: 365,
        stars: 100,
        forks: 10,
        isArchived: true,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        fetchedAt: Date.now(),
      };

      expect(metrics.isArchived).to.be.true;
      expect(metrics.daysSinceLastCommit).to.be.greaterThan(300);
    });

    it('should handle repository with security advisories', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'vulnerable/package',
        openIssues: 100,
        openPRs: 10,
        daysSinceLastCommit: 5,
        stars: 1000,
        forks: 200,
        isArchived: false,
        hasSecurityAdvisories: true,
        securityAdvisoryCount: 3,
        fetchedAt: Date.now(),
      };

      expect(metrics.hasSecurityAdvisories).to.be.true;
      expect(metrics.securityAdvisoryCount).to.equal(3);
    });

    it('should handle metrics with optional fields', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'user/minimal-repo',
        openIssues: 5,
        openPRs: 1,
        daysSinceLastCommit: 10,
        stars: 50,
        forks: 5,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        fetchedAt: Date.now(),
        // Optional fields not set
      };

      expect(metrics.lastCommitDate).to.be.undefined;
      expect(metrics.avgIssueCloseTimeDays).to.be.undefined;
      expect(metrics.avgPRMergeTimeDays).to.be.undefined;
      expect(metrics.license).to.be.undefined;
    });
  });

  describe('Cache logic', () => {
    let cache: TestGitHubCache;

    beforeEach(() => {
      cache = new TestGitHubCache();
    });

    it('should store and retrieve metrics', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'dart-lang/http',
        openIssues: 10,
        openPRs: 2,
        daysSinceLastCommit: 5,
        stars: 500,
        forks: 100,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        fetchedAt: Date.now(),
      };

      cache.setCache('repo:dart-lang/http', metrics);
      const result = cache.getFromCache<GitHubMetrics>('repo:dart-lang/http');

      expect(result).to.deep.equal(metrics);
    });

    it('should return null for missing cache key', () => {
      const result = cache.getFromCache('repo:nonexistent/repo');
      expect(result).to.be.null;
    });

    it('should return expired cache when allowStale is true', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'test/repo',
        openIssues: 5,
        openPRs: 1,
        daysSinceLastCommit: 10,
        stars: 100,
        forks: 20,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      };

      // Set cache with 2 hour old timestamp (TTL is 60 min)
      cache.setCacheWithTimestamp(
        'repo:test/repo',
        metrics,
        Date.now() - 2 * 60 * 60 * 1000,
        60 * 60 * 1000
      );

      // Without allowStale, should return null
      const normalResult = cache.getFromCache<GitHubMetrics>('repo:test/repo');
      expect(normalResult).to.be.null;

      // With allowStale, should return metrics (within 24h)
      const staleResult = cache.getFromCache<GitHubMetrics>(
        'repo:test/repo',
        true
      );
      expect(staleResult).to.deep.equal(metrics);
    });

    it('should not return stale cache older than 24 hours', () => {
      const metrics: GitHubMetrics = {
        repoFullName: 'test/repo',
        openIssues: 5,
        openPRs: 1,
        daysSinceLastCommit: 10,
        stars: 100,
        forks: 20,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };

      // Set cache with very old timestamp
      cache.setCacheWithTimestamp(
        'repo:test/repo',
        metrics,
        Date.now() - 25 * 60 * 60 * 1000
      );

      const staleResult = cache.getFromCache<GitHubMetrics>(
        'repo:test/repo',
        true
      );
      expect(staleResult).to.be.null;
    });

    it('should clear all cache entries', () => {
      cache.setCache('repo:owner1/repo1', { data: 1 });
      cache.setCache('repo:owner2/repo2', { data: 2 });

      expect(cache.getCacheSize()).to.equal(2);

      cache.clearCache();

      expect(cache.getCacheSize()).to.equal(0);
    });

    it('should maintain separate cache entries per repo', () => {
      const metrics1: GitHubMetrics = {
        repoFullName: 'owner1/repo1',
        openIssues: 10,
        openPRs: 1,
        daysSinceLastCommit: 5,
        stars: 100,
        forks: 20,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
        fetchedAt: Date.now(),
      };

      const metrics2: GitHubMetrics = {
        repoFullName: 'owner2/repo2',
        openIssues: 50,
        openPRs: 10,
        daysSinceLastCommit: 1,
        stars: 5000,
        forks: 1000,
        isArchived: false,
        hasSecurityAdvisories: true,
        securityAdvisoryCount: 2,
        fetchedAt: Date.now(),
      };

      cache.setCache('repo:owner1/repo1', metrics1);
      cache.setCache('repo:owner2/repo2', metrics2);

      const result1 = cache.getFromCache<GitHubMetrics>('repo:owner1/repo1');
      const result2 = cache.getFromCache<GitHubMetrics>('repo:owner2/repo2');

      expect(result1?.openIssues).to.equal(10);
      expect(result2?.openIssues).to.equal(50);
      expect(result2?.hasSecurityAdvisories).to.be.true;
    });
  });

  describe('Rate limit handling', () => {
    it('should track rate limit remaining', () => {
      // Simulating rate limit tracking
      let rateLimitRemaining = 60;
      const rateLimitReset = Date.now() + 3600000; // 1 hour from now

      // Simulate consuming rate limit
      rateLimitRemaining--;
      expect(rateLimitRemaining).to.equal(59);

      // Check if should use cached data
      const shouldUseCached =
        rateLimitRemaining <= 1 && Date.now() < rateLimitReset;
      expect(shouldUseCached).to.be.false;
    });

    it('should detect when rate limited', () => {
      const rateLimitRemaining = 0;
      const rateLimitReset = Date.now() + 3600000;

      const isRateLimited =
        rateLimitRemaining <= 1 && Date.now() < rateLimitReset;
      expect(isRateLimited).to.be.true;
    });

    it('should allow requests after rate limit reset', () => {
      const rateLimitRemaining = 0;
      const rateLimitReset = Date.now() - 1000; // Reset was 1 second ago

      const isRateLimited =
        rateLimitRemaining <= 1 && Date.now() < rateLimitReset;
      expect(isRateLimited).to.be.false;
    });
  });

  describe('Days since last commit calculation', () => {
    it('should calculate days since last commit correctly', () => {
      const now = Date.now();
      const lastCommitDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

      const daysSinceLastCommit = Math.floor(
        (now - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysSinceLastCommit).to.equal(10);
    });

    it('should return 0 for commit today', () => {
      const now = Date.now();
      const lastCommitDate = new Date(now - 1000).toISOString(); // 1 second ago

      const daysSinceLastCommit = Math.floor(
        (now - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysSinceLastCommit).to.equal(0);
    });

    it('should handle year-old commits', () => {
      const now = Date.now();
      const lastCommitDate = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();

      const daysSinceLastCommit = Math.floor(
        (now - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysSinceLastCommit).to.equal(365);
    });

    it('should default to 0 when no last commit date', () => {
      const lastCommitDate: string | undefined = undefined;

      const daysSinceLastCommit = lastCommitDate
        ? Math.floor(
            (Date.now() - new Date(lastCommitDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      expect(daysSinceLastCommit).to.equal(0);
    });
  });
});
