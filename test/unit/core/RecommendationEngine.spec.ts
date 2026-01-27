import { expect } from 'chai';
import { RecommendationEngine, RecommendationReport, DependencyRecommendation } from '../../../src/core/RecommendationEngine';
import { PubspecInfo, PackageType } from '../../../src/types';

// Helper to create a minimal PubspecInfo for testing
function createPubspecInfo(
  name: string,
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {},
  options: { type?: PackageType; sdkConstraint?: string } = {}
): PubspecInfo {
  const deps = new Map<string, { name: string; constraint: string; source: 'pub.dev' | 'path' | 'git' | 'sdk' }>();
  const devDeps = new Map<string, { name: string; constraint: string; source: 'pub.dev' | 'path' | 'git' | 'sdk' }>();

  for (const [depName, constraint] of Object.entries(dependencies)) {
    deps.set(depName, { name: depName, constraint, source: 'pub.dev' });
  }

  for (const [depName, constraint] of Object.entries(devDependencies)) {
    devDeps.set(depName, { name: depName, constraint, source: 'pub.dev' });
  }

  return {
    path: `/test/${name}/pubspec.yaml`,
    directory: `/test/${name}`,
    name,
    version: '1.0.0',
    type: options.type ?? 'flutter_app',
    sdkConstraint: options.sdkConstraint ?? '>=3.0.0 <4.0.0',
    dependencies: deps,
    devDependencies: devDeps,
    isWorkspacePackage: false,
    resolutionMode: 'standalone',
    raw: {},
  };
}

// Mock the extension context for tests
const mockContext = {
  globalState: {
    get: () => [],
    update: () => Promise.resolve(),
  },
  subscriptions: [],
} as unknown as import('vscode').ExtensionContext;

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine(mockContext);
  });

  describe('generateRecommendations()', () => {
    it('should return empty report for empty pubspecs', async () => {
      const report = await engine.generateRecommendations([]);

      expect(report).to.exist;
      expect(report.totalDependencies).to.equal(0);
      expect(report.recommendations).to.have.length(0);
      expect(report.summary.upgradeAvailable).to.equal(0);
    });

    it('should analyze dependencies from pubspecs', async () => {
      const pubspecs = [
        createPubspecInfo('app', {
          'http': '^1.0.0',
          'path': '^1.8.0',
        }),
      ];

      const report = await engine.generateRecommendations(pubspecs);

      expect(report).to.exist;
      expect(report.totalDependencies).to.equal(2);
      expect(report.installedSdk).to.exist;
    });

    it('should track which packages use each dependency', async () => {
      const pubspecs = [
        createPubspecInfo('app1', { 'http': '^1.0.0' }),
        createPubspecInfo('app2', { 'http': '^1.0.0' }),
      ];

      const report = await engine.generateRecommendations(pubspecs);

      // Find the http recommendation
      const httpRec = report.recommendations.find(
        r => r.recommendation.name === 'http'
      );

      expect(httpRec).to.exist;
      expect(httpRec!.recommendation.usedBy).to.include('app1');
      expect(httpRec!.recommendation.usedBy).to.include('app2');
    });

    it('should include dev dependencies', async () => {
      const pubspecs = [
        createPubspecInfo('app', {}, {
          'test': '^1.24.0',
          'build_runner': '^2.4.0',
        }),
      ];

      const report = await engine.generateRecommendations(pubspecs);

      expect(report.totalDependencies).to.equal(2);
    });

    it('should not include path dependencies', async () => {
      const pubspec = createPubspecInfo('app', {});
      pubspec.dependencies.set('local_pkg', {
        name: 'local_pkg',
        constraint: '../local_pkg',
        source: 'path',
      });

      const report = await engine.generateRecommendations([pubspec]);

      const localRec = report.recommendations.find(
        r => r.recommendation.name === 'local_pkg'
      );
      expect(localRec).to.be.undefined;
    });

    it('should generate summary counts', async () => {
      const pubspecs = [
        createPubspecInfo('app', {
          'http': '^1.0.0',
          'path': '^1.8.0',
        }),
      ];

      const report = await engine.generateRecommendations(pubspecs);

      expect(report.summary).to.exist;
      expect(report.summary.upgradeAvailable).to.be.a('number');
      expect(report.summary.incompatibleUpgrades).to.be.a('number');
      expect(report.summary.conflicts).to.be.a('number');
      expect(report.summary.upToDate).to.be.a('number');
    });

    it('should generate human-readable report text', async () => {
      const pubspecs = [
        createPubspecInfo('app', { 'http': '^1.0.0' }),
      ];

      const report = await engine.generateRecommendations(pubspecs);

      expect(report.reportText).to.exist;
      expect(report.reportText).to.be.a('string');
      expect(report.reportText).to.include('DEPENDENCY UPGRADE RECOMMENDATIONS');
      expect(report.reportText).to.include('INSTALLED SDK');
    });
  });

  describe('recommendation priorities', () => {
    it('should sort recommendations by priority', async () => {
      const pubspecs = [
        createPubspecInfo('app', {
          'http': '^0.13.0',  // older version
          'path': '^1.8.0',  // common package
        }),
      ];

      const report = await engine.generateRecommendations(pubspecs);

      // Recommendations should be sorted (critical, high, medium, low, info)
      let lastPriority = -1;
      const priorityOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };

      for (const rec of report.recommendations) {
        const currentPriority = priorityOrder[rec.priority] ?? 5;
        expect(currentPriority).to.be.at.least(lastPriority);
        lastPriority = currentPriority;
      }
    });
  });

  describe('report structure', () => {
    it('should include installed SDK information', async () => {
      const pubspecs = [createPubspecInfo('app', { 'http': '^1.0.0' })];

      const report = await engine.generateRecommendations(pubspecs);

      expect(report.installedSdk).to.exist;
      // SDK might be null if not installed, but the structure should exist
      expect(report.installedSdk).to.have.property('dart');
      expect(report.installedSdk).to.have.property('flutter');
    });

    it('should include recommendation details', async () => {
      const pubspecs = [createPubspecInfo('app', { 'http': '^1.0.0' })];

      const report = await engine.generateRecommendations(pubspecs);

      for (const { recommendation, priority, explanation } of report.recommendations) {
        expect(recommendation.name).to.be.a('string');
        expect(recommendation.currentVersion).to.be.a('string');
        expect(recommendation.action).to.be.oneOf(['upgrade', 'keep', 'downgrade', 'incompatible']);
        expect(recommendation.reason).to.be.a('string');
        expect(recommendation.usedBy).to.be.an('array');
        expect(recommendation.hasConflict).to.be.a('boolean');
        expect(priority).to.be.oneOf(['critical', 'high', 'medium', 'low', 'info']);
        expect(explanation).to.be.a('string');
      }
    });
  });
});

describe('RecommendationReport interface', () => {
  it('should have all required fields', () => {
    const report: RecommendationReport = {
      installedSdk: { dart: '3.4.0', flutter: '3.24.0', detectedAt: Date.now() },
      totalDependencies: 5,
      recommendations: [],
      summary: {
        upgradeAvailable: 2,
        incompatibleUpgrades: 1,
        conflicts: 0,
        upToDate: 2,
      },
      reportText: 'Test report',
    };

    expect(report.installedSdk).to.exist;
    expect(report.totalDependencies).to.equal(5);
    expect(report.recommendations).to.be.an('array');
    expect(report.summary.upgradeAvailable).to.equal(2);
    expect(report.reportText).to.be.a('string');
  });
});

describe('DependencyRecommendation interface', () => {
  it('should have all required fields', () => {
    const rec: DependencyRecommendation = {
      name: 'http',
      currentVersion: '^1.0.0',
      latestVersion: '1.2.0',
      recommendedVersion: '1.2.0',
      action: 'upgrade',
      score: {
        compatibility: 95,
        risk: 85,
        freshness: 90,
        community: 80,
        overall: 88,
        breakdown: {
          compatibility: { raw: 95, weight: 0.35, contribution: 33 },
          risk: { raw: 85, weight: 0.25, contribution: 21 },
          freshness: { raw: 90, weight: 0.25, contribution: 23 },
          community: { raw: 80, weight: 0.15, contribution: 12 },
        },
      },
      reason: 'Update available',
      usedBy: ['app1', 'app2'],
      hasConflict: false,
    };

    expect(rec.name).to.equal('http');
    expect(rec.action).to.equal('upgrade');
    expect(rec.score).to.exist;
    expect(rec.score!.overall).to.equal(88);
    expect(rec.usedBy).to.have.length(2);
  });

  it('should handle null score for unknown packages', () => {
    const rec: DependencyRecommendation = {
      name: 'unknown_pkg',
      currentVersion: '^1.0.0',
      latestVersion: null,
      recommendedVersion: null,
      action: 'keep',
      score: null,
      reason: 'Unable to fetch package info',
      usedBy: ['app'],
      hasConflict: false,
    };

    expect(rec.score).to.be.null;
    expect(rec.latestVersion).to.be.null;
  });
});
