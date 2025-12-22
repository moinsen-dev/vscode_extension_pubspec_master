import { expect } from 'chai';
import { VersionAnalyzer } from '../../../src/core/VersionAnalyzer';
import { DependencyResolver } from '../../../src/core/DependencyResolver';
import { PubspecInfo, DependencyInfo } from '../../../src/types';
import { PubPackageInfo } from '../../../src/api/PubDevClient';
import { GitHubMetrics } from '../../../src/api/GitHubClient';

// Helper to create a minimal PubPackageInfo matching the actual interface
function createPubPackageInfo(
  name: string,
  options: {
    isDiscontinued?: boolean;
    latestPublished?: string;
    score?: number;
  } = {}
): PubPackageInfo {
  return {
    name,
    latest: {
      version: '1.0.0',
      pubspec: {
        name,
        version: '1.0.0',
      },
      published: options.latestPublished,
    },
    versions: ['1.0.0'],
    latestPublished: options.latestPublished,
    isDiscontinued: options.isDiscontinued,
    score: options.score,
  };
}

// Helper to create GitHubMetrics
function createGitHubMetrics(
  repoFullName: string,
  options: {
    openIssues?: number;
    openPRs?: number;
    daysSinceLastCommit?: number;
    stars?: number;
    isArchived?: boolean;
    hasSecurityAdvisories?: boolean;
    securityAdvisoryCount?: number;
  } = {}
): GitHubMetrics {
  return {
    repoFullName,
    openIssues: options.openIssues ?? 0,
    openPRs: options.openPRs ?? 0,
    daysSinceLastCommit: options.daysSinceLastCommit ?? 0,
    stars: options.stars ?? 100,
    forks: 10,
    isArchived: options.isArchived ?? false,
    hasSecurityAdvisories: options.hasSecurityAdvisories ?? false,
    securityAdvisoryCount: options.securityAdvisoryCount ?? 0,
    fetchedAt: Date.now(),
  };
}

// Helper to create a minimal PubspecInfo
function createPubspec(
  name: string,
  dependencies: Map<string, DependencyInfo> = new Map(),
  devDependencies: Map<string, DependencyInfo> = new Map(),
  sdkConstraint?: string
): PubspecInfo {
  return {
    path: `/packages/${name}/pubspec.yaml`,
    directory: `/packages/${name}`,
    name,
    type: 'dart_package',
    dependencies,
    devDependencies,
    isWorkspacePackage: false,
    resolutionMode: 'standalone',
    sdkConstraint,
    raw: {},
  };
}

// Helper to create a dependency info
function createDep(
  name: string,
  constraint: string,
  source: 'pub.dev' | 'path' | 'git' | 'sdk' = 'pub.dev'
): DependencyInfo {
  return { name, constraint, source };
}

describe('VersionAnalyzer', () => {
  let analyzer: VersionAnalyzer;
  let resolver: DependencyResolver;

  beforeEach(() => {
    analyzer = new VersionAnalyzer();
    resolver = new DependencyResolver();
  });

  describe('analyze()', () => {
    it('should return empty analysis for no packages', () => {
      const graph = resolver.buildGraph([]);
      const result = analyzer.analyze([], graph);

      expect(result.conflicts).to.be.empty;
      expect(result.sdkMismatches).to.be.empty;
      expect(result.healthScore).to.equal(100);
      expect(result.summary.totalPackages).to.equal(0);
    });

    it('should analyze a single package without conflicts', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('http', createDep('http', '^1.1.0'));

      const pubspecs = [createPubspec('my_package', deps)];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.be.empty;
      expect(result.healthScore).to.equal(100);
      expect(result.summary.totalPackages).to.equal(1);
      expect(result.summary.totalDependencies).to.equal(1);
    });

    it('should count unique dependencies across packages', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));
      deps1.set('provider', createDep('provider', '^6.0.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.1.0'));
      deps2.set('dio', createDep('dio', '^5.0.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      // http, provider, dio = 3 unique dependencies
      expect(result.summary.totalDependencies).to.equal(3);
      expect(result.summary.totalPackages).to.equal(2);
    });
  });

  describe('detectConflicts()', () => {
    it('should detect version conflicts between packages', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.2.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.have.length(1);
      expect(result.conflicts[0].dependencyName).to.equal('http');
      expect(result.conflicts[0].packages).to.have.length(2);
    });

    it('should not report conflict for same version constraint', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.1.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.be.empty;
    });

    it('should skip internal path dependencies from conflict detection', () => {
      // pkg2 is an internal package, so it shouldn't be flagged as conflict
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('pkg2', { name: 'pkg2', constraint: 'path', source: 'path', path: '../pkg2' });

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('pkg2', { name: 'pkg2', constraint: 'path', source: 'path', path: '../pkg2' });

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
        createPubspec('pkg3', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      // pkg2 is internal, shouldn't be a conflict
      expect(result.conflicts).to.be.empty;
    });

    it('should determine high severity for different major versions', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^0.13.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.0.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.have.length(1);
      expect(result.conflicts[0].severity).to.equal('high');
    });

    it('should determine medium severity for exact vs caret conflicts', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '1.1.0')); // exact version

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.1.0')); // caret version

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.have.length(1);
      expect(result.conflicts[0].severity).to.equal('medium');
    });

    it('should determine low severity for minor version differences', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.2.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.have.length(1);
      expect(result.conflicts[0].severity).to.equal('low');
    });

    it('should suggest resolution using highest caret constraint', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.2.5'));

      const deps3 = new Map<string, DependencyInfo>();
      deps3.set('http', createDep('http', '^1.2.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
        createPubspec('pkg3', deps3),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts).to.have.length(1);
      expect(result.conflicts[0].suggestedResolution).to.equal('^1.2.5');
    });

    it('should sort conflicts by severity (high first)', () => {
      // Create high severity conflict
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('pkg_a', createDep('pkg_a', '^0.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('pkg_a', createDep('pkg_a', '^1.0.0'));
      deps2.set('pkg_b', createDep('pkg_b', '^1.1.0'));

      const deps3 = new Map<string, DependencyInfo>();
      deps3.set('pkg_b', createDep('pkg_b', '^1.2.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
        createPubspec('pkg3', deps3),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.conflicts.length).to.be.greaterThan(1);
      expect(result.conflicts[0].severity).to.equal('high');
    });
  });

  describe('detectSdkMismatches()', () => {
    it('should not report mismatch when all packages have same SDK constraint', () => {
      const pubspecs = [
        createPubspec('pkg1', new Map(), new Map(), '^3.0.0'),
        createPubspec('pkg2', new Map(), new Map(), '^3.0.0'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.sdkMismatches).to.be.empty;
    });

    it('should detect SDK constraint mismatches', () => {
      const pubspecs = [
        createPubspec('pkg1', new Map(), new Map(), '^3.0.0'),
        createPubspec('pkg2', new Map(), new Map(), '^3.6.0'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.sdkMismatches).to.have.length(1);
      expect(result.sdkMismatches[0].packages).to.have.length(2);
    });

    it('should correctly order SDK constraints by version', () => {
      const pubspecs = [
        createPubspec('pkg1', new Map(), new Map(), '^3.6.0'),
        createPubspec('pkg2', new Map(), new Map(), '^3.0.0'),
        createPubspec('pkg3', new Map(), new Map(), '^3.10.0'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.sdkMismatches).to.have.length(1);
      expect(result.sdkMismatches[0].lowestConstraint).to.equal('^3.0.0');
      expect(result.sdkMismatches[0].highestConstraint).to.equal('^3.10.0');
    });

    it('should determine medium severity for different minor versions', () => {
      const pubspecs = [
        createPubspec('pkg1', new Map(), new Map(), '^3.0.0'),
        createPubspec('pkg2', new Map(), new Map(), '^3.6.0'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.sdkMismatches[0].severity).to.equal('medium');
    });

    it('should determine low severity for same major.minor', () => {
      const pubspecs = [
        createPubspec('pkg1', new Map(), new Map(), '^3.6.0'),
        createPubspec('pkg2', new Map(), new Map(), '^3.6.1'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.sdkMismatches[0].severity).to.equal('low');
    });
  });

  describe('calculateHealthScore()', () => {
    it('should return 100 for no packages', () => {
      const graph = resolver.buildGraph([]);
      const result = analyzer.analyze([], graph);
      expect(result.healthScore).to.equal(100);
    });

    it('should return 100 for packages with no issues', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('http', createDep('http', '^1.1.0'));

      const pubspecs = [createPubspec('pkg1', deps)];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.healthScore).to.equal(100);
    });

    it('should deduct points for conflicts', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.2.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      // 1 conflict = -10 points
      expect(result.healthScore).to.equal(90);
    });

    it('should deduct points for SDK mismatches', () => {
      const pubspecs = [
        createPubspec('pkg1', new Map(), new Map(), '^3.0.0'),
        createPubspec('pkg2', new Map(), new Map(), '^3.6.0'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      // 1 SDK mismatch = -15 points
      expect(result.healthScore).to.equal(85);
    });

    it('should cap conflict deduction at 50 points', () => {
      // Create 6 different conflicts (would be 60 points, but capped at 50)
      const deps1 = new Map<string, DependencyInfo>();
      const deps2 = new Map<string, DependencyInfo>();
      for (let i = 0; i < 6; i++) {
        deps1.set(`pkg${i}`, createDep(`pkg${i}`, `^1.0.0`));
        deps2.set(`pkg${i}`, createDep(`pkg${i}`, `^2.0.0`));
      }

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      // Max deduction is 50 for conflicts
      expect(result.healthScore).to.be.at.least(50);
    });

    it('should not go below 0', () => {
      // Create many conflicts and SDK mismatches
      const deps1 = new Map<string, DependencyInfo>();
      const deps2 = new Map<string, DependencyInfo>();
      for (let i = 0; i < 10; i++) {
        deps1.set(`pkg${i}`, createDep(`pkg${i}`, `^1.0.0`));
        deps2.set(`pkg${i}`, createDep(`pkg${i}`, `^2.0.0`));
      }

      const pubspecs = [
        createPubspec('pkg1', deps1, new Map(), '^3.0.0'),
        createPubspec('pkg2', deps2, new Map(), '^3.6.0'),
        createPubspec('pkg3', new Map(), new Map(), '^3.7.0'),
      ];
      const graph = resolver.buildGraph(pubspecs);
      const result = analyzer.analyze(pubspecs, graph);

      expect(result.healthScore).to.be.at.least(0);
    });
  });

  describe('getPackagesUsingDependency()', () => {
    it('should find all packages using a dependency', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('http', createDep('http', '^1.1.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('http', createDep('http', '^1.1.0'));

      const deps3 = new Map<string, DependencyInfo>();
      deps3.set('dio', createDep('dio', '^5.0.0'));

      const pubspecs = [
        createPubspec('pkg1', deps1),
        createPubspec('pkg2', deps2),
        createPubspec('pkg3', deps3),
      ];

      const result = analyzer.getPackagesUsingDependency(pubspecs, 'http');
      expect(result).to.have.members(['pkg1', 'pkg2']);
    });

    it('should include packages using dependency as devDependency', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('http', createDep('http', '^1.1.0'));

      const devDeps = new Map<string, DependencyInfo>();
      devDeps.set('http', createDep('http', '^1.1.0'));

      const pubspecs = [
        createPubspec('pkg1', deps),
        createPubspec('pkg2', new Map(), devDeps),
      ];

      const result = analyzer.getPackagesUsingDependency(pubspecs, 'http');
      expect(result).to.have.members(['pkg1', 'pkg2']);
    });

    it('should return empty array for unused dependency', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('http', createDep('http', '^1.1.0'));

      const pubspecs = [createPubspec('pkg1', deps)];
      const result = analyzer.getPackagesUsingDependency(pubspecs, 'dio');
      expect(result).to.be.empty;
    });
  });

  describe('analyzePackageHealth()', () => {
    it('should detect discontinued packages as critical', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('old_package', createDep('old_package', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('old_package', createPubPackageInfo('old_package', {
        isDiscontinued: true,
        latestPublished: '2020-01-01T00:00:00.000Z',
        score: 80,
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('discontinued');
      expect(issues[0].severity).to.equal('critical');
      expect(issues[0].packageName).to.equal('old_package');
    });

    it('should detect unmaintained packages (2+ years) as critical', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('old_package', createDep('old_package', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      // 3 years ago
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('old_package', createPubPackageInfo('old_package', {
        isDiscontinued: false,
        latestPublished: threeYearsAgo.toISOString(),
        score: 80,
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('unmaintained');
      expect(issues[0].severity).to.equal('critical');
    });

    it('should detect unmaintained packages (1+ year) as warning', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('old_package', createDep('old_package', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      // 18 months ago
      const eighteenMonthsAgo = new Date();
      eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('old_package', createPubPackageInfo('old_package', {
        isDiscontinued: false,
        latestPublished: eighteenMonthsAgo.toISOString(),
        score: 80,
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('unmaintained');
      expect(issues[0].severity).to.equal('warning');
    });

    it('should detect low quality packages as info', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('low_quality', createDep('low_quality', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('low_quality', createPubPackageInfo('low_quality', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 30, // Low score
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('low-quality');
      expect(issues[0].severity).to.equal('info');
    });

    it('should not report healthy packages', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('healthy', createDep('healthy', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('healthy', createPubPackageInfo('healthy', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 120, // High score
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.be.empty;
    });

    it('should track which packages use each dependency', () => {
      const deps1 = new Map<string, DependencyInfo>();
      deps1.set('old_package', createDep('old_package', '^1.0.0'));

      const deps2 = new Map<string, DependencyInfo>();
      deps2.set('old_package', createDep('old_package', '^1.0.0'));

      const pubspecs = [
        createPubspec('app1', deps1),
        createPubspec('app2', deps2),
      ];

      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('old_package', createPubPackageInfo('old_package', {
        isDiscontinued: false,
        latestPublished: threeYearsAgo.toISOString(),
        score: 80,
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.have.length(1);
      expect(issues[0].usedBy).to.have.members(['app1', 'app2']);
    });

    it('should sort issues by severity (critical first)', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('low_quality', createDep('low_quality', '^1.0.0'));
      deps.set('discontinued', createDep('discontinued', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('low_quality', createPubPackageInfo('low_quality', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 30,
      }));
      packageInfoMap.set('discontinued', createPubPackageInfo('discontinued', {
        isDiscontinued: true,
        latestPublished: new Date().toISOString(),
        score: 80,
      }));

      const issues = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);

      expect(issues).to.have.length(2);
      expect(issues[0].severity).to.equal('critical');
      expect(issues[1].severity).to.equal('info');
    });

    it('should respect custom thresholds', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('old_package', createDep('old_package', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      // 6 months ago
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('old_package', createPubPackageInfo('old_package', {
        isDiscontinued: false,
        latestPublished: sixMonthsAgo.toISOString(),
        score: 80,
      }));

      // With default 365 days threshold, no warning
      const issuesDefault = analyzer.analyzePackageHealth(pubspecs, packageInfoMap);
      expect(issuesDefault).to.be.empty;

      // With 90 days threshold, should warn
      const issuesCustom = analyzer.analyzePackageHealth(pubspecs, packageInfoMap, {
        unmaintainedThresholdDays: 90,
        criticalThresholdDays: 365,
        lowQualityScoreThreshold: 50,
      });
      expect(issuesCustom).to.have.length(1);
      expect(issuesCustom[0].severity).to.equal('warning');
    });
  });

  describe('analyzePackageHealthWithGitHub()', () => {
    it('should detect security advisories as critical', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('vulnerable', createDep('vulnerable', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('vulnerable', createPubPackageInfo('vulnerable', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 100,
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      githubMetricsMap.set('vulnerable', createGitHubMetrics('owner/vulnerable', {
        openIssues: 10,
        openPRs: 2,
        daysSinceLastCommit: 30,
        stars: 1000,
        isArchived: false,
        hasSecurityAdvisories: true,
        securityAdvisoryCount: 2,
      }));

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('security-advisory');
      expect(issues[0].severity).to.equal('critical');
      expect(issues[0].github?.securityAdvisoryCount).to.equal(2);
    });

    it('should detect archived repositories as critical', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('archived', createDep('archived', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('archived', createPubPackageInfo('archived', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 100,
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      githubMetricsMap.set('archived', createGitHubMetrics('owner/archived', {
        openIssues: 10,
        openPRs: 2,
        daysSinceLastCommit: 365,
        stars: 1000,
        isArchived: true,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
      }));

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('archived');
      expect(issues[0].severity).to.equal('critical');
    });

    it('should detect stale repositories as warning', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('stale', createDep('stale', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('stale', createPubPackageInfo('stale', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 100,
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      githubMetricsMap.set('stale', createGitHubMetrics('owner/stale', {
        openIssues: 10,
        openPRs: 2,
        daysSinceLastCommit: 200, // Over 180 threshold
        stars: 1000,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
      }));

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('stale-repo');
      expect(issues[0].severity).to.equal('warning');
    });

    it('should detect high issue count relative to stars', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('problematic', createDep('problematic', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('problematic', createPubPackageInfo('problematic', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 100,
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      githubMetricsMap.set('problematic', createGitHubMetrics('owner/problematic', {
        openIssues: 150, // High issue count
        openPRs: 20,
        daysSinceLastCommit: 10,
        stars: 100, // Low stars relative to issues
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
      }));

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      expect(issues).to.have.length(1);
      expect(issues[0].issueType).to.equal('high-issue-count');
      expect(issues[0].severity).to.equal('warning');
    });

    it('should calculate risk score correctly', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('test_pkg', createDep('test_pkg', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('test_pkg', createPubPackageInfo('test_pkg', {
        isDiscontinued: false,
        latestPublished: oneYearAgo.toISOString(),
        score: 80, // 50% of 160
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      githubMetricsMap.set('test_pkg', createGitHubMetrics('owner/test_pkg', {
        openIssues: 50,
        openPRs: 5,
        daysSinceLastCommit: 100,
        stars: 500,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
      }));

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      // Should have warning for 1 year unmaintained
      expect(issues).to.have.length(1);
      expect(issues[0].riskScore).to.be.a('number');
      expect(issues[0].riskScore).to.be.greaterThan(0);
      expect(issues[0].riskScore).to.be.lessThan(100);
    });

    it('should sort by risk score (highest first)', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('low_risk', createDep('low_risk', '^1.0.0'));
      deps.set('high_risk', createDep('high_risk', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('low_risk', createPubPackageInfo('low_risk', {
        isDiscontinued: false,
        latestPublished: sixMonthsAgo.toISOString(),
        score: 30, // Low score, triggers info
      }));
      packageInfoMap.set('high_risk', createPubPackageInfo('high_risk', {
        isDiscontinued: false,
        latestPublished: twoYearsAgo.toISOString(),
        score: 50, // Triggers critical unmaintained
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      // No GitHub metrics for simplicity

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      expect(issues).to.have.length(2);
      // high_risk should come first (higher risk score)
      expect(issues[0].packageName).to.equal('high_risk');
      expect(issues[0].riskScore).to.be.greaterThan(issues[1].riskScore!);
    });

    it('should include GitHub health metrics in issues', () => {
      const deps = new Map<string, DependencyInfo>();
      deps.set('stale', createDep('stale', '^1.0.0'));

      const pubspecs = [createPubspec('my_app', deps)];

      const packageInfoMap = new Map<string, PubPackageInfo>();
      packageInfoMap.set('stale', createPubPackageInfo('stale', {
        isDiscontinued: false,
        latestPublished: new Date().toISOString(),
        score: 100,
      }));

      const githubMetricsMap = new Map<string, GitHubMetrics>();
      githubMetricsMap.set('stale', createGitHubMetrics('owner/stale', {
        openIssues: 10,
        openPRs: 2,
        daysSinceLastCommit: 200,
        stars: 500,
        isArchived: false,
        hasSecurityAdvisories: false,
        securityAdvisoryCount: 0,
      }));

      const issues = analyzer.analyzePackageHealthWithGitHub(
        pubspecs,
        packageInfoMap,
        githubMetricsMap
      );

      expect(issues).to.have.length(1);
      expect(issues[0].github).to.exist;
      expect(issues[0].github?.repoFullName).to.equal('owner/stale');
      expect(issues[0].github?.openIssues).to.equal(10);
      expect(issues[0].github?.stars).to.equal(500);
    });
  });
});
