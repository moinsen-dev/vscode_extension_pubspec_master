import * as https from 'https';
import * as vscode from 'vscode';

/**
 * GitHub repository metrics for package health assessment
 */
export interface GitHubMetrics {
  /** Repository owner/name (e.g., "dart-lang/sdk") */
  repoFullName: string;
  /** Number of open issues */
  openIssues: number;
  /** Number of open pull requests */
  openPRs: number;
  /** ISO date of last commit to default branch */
  lastCommitDate?: string;
  /** Days since last commit */
  daysSinceLastCommit: number;
  /** Number of stars */
  stars: number;
  /** Number of forks */
  forks: number;
  /** Whether the repository is archived */
  isArchived: boolean;
  /** Whether the repository has security advisories */
  hasSecurityAdvisories: boolean;
  /** Number of open security advisories */
  securityAdvisoryCount: number;
  /** Average days to close issues (if calculable) */
  avgIssueCloseTimeDays?: number;
  /** Average days to merge PRs (if calculable) */
  avgPRMergeTimeDays?: number;
  /** License type (e.g., "MIT", "BSD-3-Clause") */
  license?: string;
  /** Timestamp when metrics were fetched */
  fetchedAt: number;
}

/**
 * Parsed GitHub repository info from URL
 */
interface RepoInfo {
  owner: string;
  repo: string;
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
 * GitHub API client for fetching repository metrics
 *
 * Rate limits:
 * - Unauthenticated: 60 requests/hour
 * - Authenticated: 5000 requests/hour
 *
 * We use authentication when available to avoid rate limiting.
 */
export class GitHubClient {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtl: number;
  private token?: string;
  private rateLimitRemaining = 60;
  private rateLimitReset = 0;

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('pubspecMaster.github');
    this.defaultTtl = (config.get<number>('cacheTtlMinutes', 60) || 60) * 60 * 1000;
    this.token = config.get<string>('token');

    // Restore cache from global state
    const savedCache = context.globalState.get<Array<[string, CacheEntry<unknown>]>>(
      'githubMetricsCache',
      []
    );
    for (const [key, entry] of savedCache) {
      this.cache.set(key, entry);
    }
  }

  /**
   * Parse GitHub repository URL to extract owner and repo name
   * Handles various formats:
   * - https://github.com/owner/repo
   * - https://github.com/owner/repo.git
   * - git@github.com:owner/repo.git
   * - github.com/owner/repo
   */
  parseRepoUrl(url: string): RepoInfo | null {
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
   * Get repository metrics from GitHub API
   */
  async getRepoMetrics(repoUrl: string): Promise<GitHubMetrics | null> {
    const repoInfo = this.parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return null;
    }

    const cacheKey = `repo:${repoInfo.owner}/${repoInfo.repo}`;
    const cached = this.getFromCache<GitHubMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check rate limit
    if (this.rateLimitRemaining <= 1 && Date.now() < this.rateLimitReset) {
      console.warn('Moinsen: GitHub API rate limit reached, using cached data');
      return this.getFromCache<GitHubMetrics>(cacheKey, true);
    }

    try {
      // Fetch repository info
      const repoData = await this.fetchRepo(repoInfo.owner, repoInfo.repo);
      if (!repoData) {
        return null;
      }

      // Fetch additional data in parallel
      const [openPRs, lastCommit, securityAdvisories] = await Promise.all([
        this.fetchOpenPRCount(repoInfo.owner, repoInfo.repo),
        this.fetchLastCommit(repoInfo.owner, repoInfo.repo),
        this.fetchSecurityAdvisories(repoInfo.owner, repoInfo.repo),
      ]);

      const now = Date.now();
      const lastCommitDate = lastCommit?.commit?.committer?.date;
      const daysSinceLastCommit = lastCommitDate
        ? Math.floor((now - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const metrics: GitHubMetrics = {
        repoFullName: `${repoInfo.owner}/${repoInfo.repo}`,
        openIssues: repoData.open_issues_count ?? 0,
        openPRs: openPRs ?? 0,
        lastCommitDate,
        daysSinceLastCommit,
        stars: repoData.stargazers_count ?? 0,
        forks: repoData.forks_count ?? 0,
        isArchived: repoData.archived ?? false,
        hasSecurityAdvisories: (securityAdvisories?.length ?? 0) > 0,
        securityAdvisoryCount: securityAdvisories?.length ?? 0,
        license: repoData.license?.spdx_id,
        fetchedAt: now,
      };

      this.setCache(cacheKey, metrics);
      return metrics;
    } catch (error) {
      console.error(`Moinsen: Failed to fetch GitHub metrics for ${repoUrl}:`, error);
      // Return stale cache if available
      return this.getFromCache<GitHubMetrics>(cacheKey, true);
    }
  }

  /**
   * Fetch repository info from GitHub API
   */
  private async fetchRepo(
    owner: string,
    repo: string
  ): Promise<{
    open_issues_count?: number;
    stargazers_count?: number;
    forks_count?: number;
    archived?: boolean;
    license?: { spdx_id?: string };
    default_branch?: string;
  } | null> {
    return this.fetch(`/repos/${owner}/${repo}`);
  }

  /**
   * Fetch open PR count
   */
  private async fetchOpenPRCount(owner: string, repo: string): Promise<number> {
    // Use search API to get just the count without fetching all PRs
    const result = await this.fetch<{ total_count?: number }>(
      `/search/issues?q=repo:${owner}/${repo}+type:pr+state:open&per_page=1`
    );
    return result?.total_count ?? 0;
  }

  /**
   * Fetch last commit on default branch
   */
  private async fetchLastCommit(
    owner: string,
    repo: string
  ): Promise<{ commit?: { committer?: { date?: string } } } | null> {
    const commits = await this.fetch<Array<{ commit?: { committer?: { date?: string } } }>>(
      `/repos/${owner}/${repo}/commits?per_page=1`
    );
    return commits?.[0] ?? null;
  }

  /**
   * Fetch security advisories (requires repo to have security advisories enabled)
   */
  private async fetchSecurityAdvisories(
    owner: string,
    repo: string
  ): Promise<Array<{ ghsa_id: string }>> {
    try {
      const result = await this.fetch<Array<{ ghsa_id: string }>>(
        `/repos/${owner}/${repo}/security-advisories?state=published`
      );
      return result ?? [];
    } catch {
      // Security advisories API may not be available for all repos
      return [];
    }
  }

  /**
   * Make authenticated HTTP GET request to GitHub API
   */
  private fetch<T>(path: string): Promise<T | null> {
    return new Promise((resolve) => {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'moinsen-pubspec-master-vscode/0.7.0',
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const options = {
        hostname: 'api.github.com',
        port: 443,
        path,
        method: 'GET',
        headers,
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        // Update rate limit info from headers
        const remaining = res.headers['x-ratelimit-remaining'];
        const reset = res.headers['x-ratelimit-reset'];
        if (remaining) {
          this.rateLimitRemaining = parseInt(remaining as string, 10);
        }
        if (reset) {
          this.rateLimitReset = parseInt(reset as string, 10) * 1000;
        }

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
          } else if (res.statusCode === 403 && this.rateLimitRemaining === 0) {
            console.warn('Moinsen: GitHub API rate limited');
            resolve(null);
          } else if (res.statusCode === 404) {
            // Repository not found or private
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
      // Allow stale data up to 24 hours in offline/rate-limited mode
      if (age < 24 * 60 * 60 * 1000) {
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
   * Get remaining rate limit
   */
  getRateLimitRemaining(): number {
    return this.rateLimitRemaining;
  }

  /**
   * Check if token is configured
   */
  hasToken(): boolean {
    return !!this.token;
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
    await context.globalState.update('githubMetricsCache', entries);
  }
}
