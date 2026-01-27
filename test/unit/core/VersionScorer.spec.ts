import { expect } from 'chai';
import { VersionScorer, DEFAULT_WEIGHTS } from '../../../src/core/scoring';
import { PubPackageInfo } from '../../../src/api/PubDevClient';

// Helper to create a minimal PubPackageInfo matching the actual interface
function createPubPackageInfo(
  name: string,
  options: {
    isDiscontinued?: boolean;
    latestPublished?: string;
    score?: number;
    popularity?: number;
    likes?: number;
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
    popularity: options.popularity,
    likes: options.likes,
  };
}

describe('VersionScorer', () => {
  let scorer: VersionScorer;

  beforeEach(() => {
    scorer = new VersionScorer();
  });

  describe('DEFAULT_WEIGHTS', () => {
    it('should sum to 1.0', () => {
      const sum =
        DEFAULT_WEIGHTS.compatibility +
        DEFAULT_WEIGHTS.risk +
        DEFAULT_WEIGHTS.freshness +
        DEFAULT_WEIGHTS.community;
      expect(sum).to.equal(1.0);
    });
  });

  describe('scoreCompatibility()', () => {
    it('should return 100 when no SDK constraint', () => {
      const score = scorer.scoreCompatibility(undefined, '3.4.0');
      expect(score).to.equal(100);
    });

    it('should return 80 when no installed SDK', () => {
      const score = scorer.scoreCompatibility('>=3.0.0 <4.0.0', null);
      expect(score).to.equal(80);
    });

    it('should return 100 for exact match', () => {
      const score = scorer.scoreCompatibility('>=3.4.0 <4.0.0', '3.4.0');
      expect(score).to.equal(100);
    });

    it('should return 95 for compatible but not exact match', () => {
      const score = scorer.scoreCompatibility('>=3.0.0 <4.0.0', '3.4.0');
      expect(score).to.equal(95);
    });

    it('should return 10 for major version incompatibility', () => {
      const score = scorer.scoreCompatibility('>=4.0.0 <5.0.0', '3.4.0');
      expect(score).to.equal(10);
    });

    it('should return reduced score for minor version incompatibility', () => {
      const score = scorer.scoreCompatibility('>=3.6.0 <4.0.0', '3.4.0');
      // 3.6.0 requires SDK 3.6+, user has 3.4.0 - difference is 2 minor versions
      // Score = max(20, 80 - 2*15) = max(20, 50) = 50
      expect(score).to.equal(50);
    });
  });

  describe('scoreRisk()', () => {
    it('should return 50 for unknown package', () => {
      const score = scorer.scoreRisk(null);
      expect(score).to.equal(50);
    });

    it('should return reduced score for discontinued package', () => {
      const pkg = createPubPackageInfo('test', { isDiscontinued: true });
      const score = scorer.scoreRisk(pkg);
      expect(score).to.equal(50); // 100 - 50
    });

    it('should reduce score for very old packages', () => {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const pkg = createPubPackageInfo('test', {
        latestPublished: threeYearsAgo.toISOString()
      });
      const score = scorer.scoreRisk(pkg);
      expect(score).to.be.lessThan(80);
    });

    it('should return high score for well-maintained packages', () => {
      const pkg = createPubPackageInfo('test', {
        latestPublished: new Date().toISOString(),
        score: 140 // High pub.dev score
      });
      const score = scorer.scoreRisk(pkg);
      expect(score).to.be.greaterThan(90);
    });
  });

  describe('scoreFreshness()', () => {
    it('should return 50 for unknown publish date', () => {
      const score = scorer.scoreFreshness(undefined);
      expect(score).to.equal(50);
    });

    it('should return 100 for recently updated package', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const score = scorer.scoreFreshness(yesterday.toISOString());
      expect(score).to.equal(100);
    });

    it('should return 95 for package updated within a month', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const score = scorer.scoreFreshness(twoWeeksAgo.toISOString());
      expect(score).to.equal(95);
    });

    it('should return low score for very old packages', () => {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const score = scorer.scoreFreshness(threeYearsAgo.toISOString());
      expect(score).to.be.lessThan(30);
    });
  });

  describe('scoreCommunity()', () => {
    it('should return 50 for unknown package', () => {
      const score = scorer.scoreCommunity(null);
      expect(score).to.equal(50);
    });

    it('should use popularity as base score', () => {
      const pkg = createPubPackageInfo('test', { popularity: 80 });
      const score = scorer.scoreCommunity(pkg);
      expect(score).to.be.greaterThanOrEqual(80);
    });

    it('should add bonus for many likes', () => {
      const pkg = createPubPackageInfo('test', { popularity: 70, likes: 1500 });
      const score = scorer.scoreCommunity(pkg);
      expect(score).to.equal(90); // 70 + 20
    });

    it('should cap score at 100', () => {
      const pkg = createPubPackageInfo('test', { popularity: 95, likes: 2000 });
      const score = scorer.scoreCommunity(pkg);
      expect(score).to.equal(100);
    });
  });

  describe('calculateScore()', () => {
    it('should calculate weighted overall score', () => {
      const pkg = createPubPackageInfo('test', {
        latestPublished: new Date().toISOString(),
        score: 140,
        popularity: 80,
        likes: 100,
      });

      const score = scorer.calculateScore('>=3.0.0 <4.0.0', '3.4.0', pkg);

      expect(score.overall).to.be.greaterThan(80);
      expect(score.compatibility).to.be.greaterThan(90);
      expect(score.risk).to.be.greaterThan(80);
      expect(score.freshness).to.be.greaterThan(90);
      expect(score.community).to.be.greaterThan(80);
    });

    it('should include breakdown of contributions', () => {
      const pkg = createPubPackageInfo('test', {
        latestPublished: new Date().toISOString(),
        score: 140,
      });

      const score = scorer.calculateScore('>=3.0.0 <4.0.0', '3.4.0', pkg);

      expect(score.breakdown).to.exist;
      expect(score.breakdown.compatibility.weight).to.equal(0.35);
      expect(score.breakdown.risk.weight).to.equal(0.25);
      expect(score.breakdown.freshness.weight).to.equal(0.25);
      expect(score.breakdown.community.weight).to.equal(0.15);
    });

    it('should handle missing package info gracefully', () => {
      const score = scorer.calculateScore('>=3.0.0 <4.0.0', '3.4.0', null);

      expect(score.overall).to.be.greaterThan(0);
      expect(score.overall).to.be.lessThan(100);
      expect(score.risk).to.equal(50); // Neutral for unknown
      expect(score.community).to.equal(50); // Neutral for unknown
    });
  });

  describe('custom weights', () => {
    it('should use provided weights', () => {
      const customWeights = {
        compatibility: 0.5,
        risk: 0.2,
        freshness: 0.2,
        community: 0.1,
      };

      const customScorer = new VersionScorer(customWeights);
      const pkg = createPubPackageInfo('test', {
        latestPublished: new Date().toISOString(),
        score: 140,
      });

      const score = customScorer.calculateScore('>=3.0.0 <4.0.0', '3.4.0', pkg);

      expect(score.breakdown.compatibility.weight).to.equal(0.5);
      expect(score.breakdown.risk.weight).to.equal(0.2);
    });
  });

  describe('edge cases', () => {
    describe('isPreReleaseVersion()', () => {
      it('should detect dev versions', () => {
        expect(scorer.isPreReleaseVersion('1.0.0-dev.1')).to.be.true;
        expect(scorer.isPreReleaseVersion('2.0.0+dev')).to.be.true;
      });

      it('should detect alpha versions', () => {
        expect(scorer.isPreReleaseVersion('1.0.0-alpha.1')).to.be.true;
        expect(scorer.isPreReleaseVersion('1.0.0-alpha')).to.be.true;
      });

      it('should detect beta versions', () => {
        expect(scorer.isPreReleaseVersion('1.0.0-beta.2')).to.be.true;
        expect(scorer.isPreReleaseVersion('1.0.0-beta')).to.be.true;
      });

      it('should detect release candidate versions', () => {
        expect(scorer.isPreReleaseVersion('1.0.0-rc.1')).to.be.true;
        expect(scorer.isPreReleaseVersion('1.0.0-rc1')).to.be.true;
      });

      it('should not flag stable versions', () => {
        expect(scorer.isPreReleaseVersion('1.0.0')).to.be.false;
        expect(scorer.isPreReleaseVersion('2.5.3')).to.be.false;
        expect(scorer.isPreReleaseVersion('^1.0.0')).to.be.false;
      });
    });

    describe('preReleaseRiskPenalty()', () => {
      it('should return 0 for stable versions', () => {
        expect(scorer.preReleaseRiskPenalty('1.0.0')).to.equal(0);
      });

      it('should penalize alpha versions most', () => {
        expect(scorer.preReleaseRiskPenalty('1.0.0-alpha.1')).to.equal(30);
      });

      it('should penalize beta versions moderately', () => {
        expect(scorer.preReleaseRiskPenalty('1.0.0-beta.1')).to.equal(20);
      });

      it('should penalize RC versions least', () => {
        expect(scorer.preReleaseRiskPenalty('1.0.0-rc.1')).to.equal(10);
      });

      it('should penalize dev versions', () => {
        expect(scorer.preReleaseRiskPenalty('1.0.0-dev.1')).to.equal(25);
      });
    });

    describe('scoreGitDependency()', () => {
      it('should give highest score to semver tags', () => {
        expect(scorer.scoreGitDependency('v1.0.0')).to.equal(70);
        expect(scorer.scoreGitDependency('1.2.3')).to.equal(70);
      });

      it('should give moderate score to main branch', () => {
        expect(scorer.scoreGitDependency('main')).to.equal(55);
        expect(scorer.scoreGitDependency('master')).to.equal(55);
      });

      it('should give neutral score to commit hashes', () => {
        expect(scorer.scoreGitDependency('abc1234')).to.equal(50);
        expect(scorer.scoreGitDependency('a'.repeat(40))).to.equal(50);
      });

      it('should penalize dev branches', () => {
        expect(scorer.scoreGitDependency('develop')).to.equal(30);
        expect(scorer.scoreGitDependency('feature-xyz')).to.equal(30);
      });

      it('should return low score for missing ref', () => {
        expect(scorer.scoreGitDependency()).to.equal(40);
        expect(scorer.scoreGitDependency('')).to.equal(40);
      });
    });

    describe('scorePathDependency()', () => {
      it('should return neutral-positive score', () => {
        expect(scorer.scorePathDependency()).to.equal(75);
      });
    });

    describe('parseVersion()', () => {
      it('should parse simple versions', () => {
        const result = scorer.parseVersion('1.2.3');
        expect(result).to.deep.equal({ major: 1, minor: 2, patch: 3 });
      });

      it('should parse versions with caret prefix', () => {
        const result = scorer.parseVersion('^1.2.3');
        expect(result).to.deep.equal({ major: 1, minor: 2, patch: 3 });
      });

      it('should parse pre-release versions', () => {
        const result = scorer.parseVersion('1.2.3-beta.1');
        expect(result).to.deep.equal({ major: 1, minor: 2, patch: 3, preRelease: 'beta.1' });
      });

      it('should return null for invalid versions', () => {
        expect(scorer.parseVersion('invalid')).to.be.null;
        expect(scorer.parseVersion('1.2')).to.be.null;
      });
    });

    describe('compareVersions()', () => {
      it('should compare major versions', () => {
        expect(scorer.compareVersions('2.0.0', '1.0.0')).to.be.greaterThan(0);
        expect(scorer.compareVersions('1.0.0', '2.0.0')).to.be.lessThan(0);
      });

      it('should compare minor versions', () => {
        expect(scorer.compareVersions('1.2.0', '1.1.0')).to.be.greaterThan(0);
      });

      it('should compare patch versions', () => {
        expect(scorer.compareVersions('1.0.2', '1.0.1')).to.be.greaterThan(0);
      });

      it('should consider pre-release less than release', () => {
        expect(scorer.compareVersions('1.0.0-beta', '1.0.0')).to.be.lessThan(0);
        expect(scorer.compareVersions('1.0.0', '1.0.0-beta')).to.be.greaterThan(0);
      });

      it('should return 0 for equal versions', () => {
        expect(scorer.compareVersions('1.0.0', '1.0.0')).to.equal(0);
      });
    });

    describe('scoreCompatibility() with any constraint', () => {
      it('should handle "any" constraint', () => {
        expect(scorer.scoreCompatibility('any', '3.4.0')).to.equal(100);
        expect(scorer.scoreCompatibility('ANY', '3.4.0')).to.equal(100);
        expect(scorer.scoreCompatibility(' any ', '3.4.0')).to.equal(100);
      });
    });

    describe('scoreRisk() with pre-release versions', () => {
      it('should penalize pre-release versions', () => {
        const pkg = createPubPackageInfo('test', {
          latestPublished: new Date().toISOString(),
          score: 140,
        });
        // Manually set latest version to a pre-release
        pkg.latest.version = '1.0.0-beta.1';

        const score = scorer.scoreRisk(pkg);
        expect(score).to.be.lessThan(100);
      });
    });
  });
});
