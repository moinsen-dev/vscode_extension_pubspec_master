import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { MigrationAnalyzer } from '../../../src/migration/MigrationAnalyzer';
import { PubspecInfo, DependencyInfo } from '../../../src/types';

/**
 * Helper function to create a minimal PubspecInfo for testing
 */
function createPubspec(
  name: string,
  options: {
    version?: string;
    type?: 'flutter_app' | 'dart_package' | 'flutter_plugin';
    directory?: string;
    sdkConstraint?: string;
    resolutionMode?: 'standalone' | 'workspace';
    dependencies?: Map<string, DependencyInfo>;
    devDependencies?: Map<string, DependencyInfo>;
    workspacePackages?: string[];
  } = {}
): PubspecInfo {
  const directory = options.directory ?? `/workspace/${name}`;
  return {
    name,
    version: options.version ?? '1.0.0',
    type: options.type ?? 'dart_package',
    directory,
    path: `${directory}/pubspec.yaml`,
    dependencies: options.dependencies ?? new Map(),
    devDependencies: options.devDependencies ?? new Map(),
    sdkConstraint: options.sdkConstraint ?? '>=3.0.0 <4.0.0',
    resolutionMode: options.resolutionMode ?? 'standalone',
    isWorkspacePackage: options.resolutionMode === 'workspace',
    workspacePackages: options.workspacePackages,
    raw: {},
  };
}

/**
 * Helper function to create a DependencyInfo
 */
function createDep(
  depName: string,
  constraint: string,
  source: 'pub.dev' | 'path' | 'git' | 'sdk' = 'pub.dev',
  depPath?: string
): DependencyInfo {
  return { name: depName, constraint, source, path: depPath };
}

describe('MigrationAnalyzer', () => {
  let tempDir: string;
  let analyzer: MigrationAnalyzer;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-test-'));
    analyzer = new MigrationAnalyzer(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('analyze()', () => {
    it('should return empty analysis for no packages', async () => {
      const analysis = await analyzer.analyze([]);

      expect(analysis.packageCount).to.equal(0);
      expect(analysis.totalDependencies).to.equal(0);
      expect(analysis.currentState).to.equal('standalone');
      expect(analysis.packages).to.have.length(0);
      // With no packages, min SDK is 0.0.0 which triggers sdk_too_old blocker
      expect(analysis.blockers).to.have.length(1);
      expect(analysis.blockers[0].type).to.equal('sdk_too_old');
    });

    it('should analyze single package', async () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
      ]);
      const devDeps = new Map<string, DependencyInfo>([
        ['test', createDep('test', '^1.24.0')],
      ]);

      const packages = [
        createPubspec('my_app', {
          dependencies: deps,
          devDependencies: devDeps,
          directory: path.join(tempDir, 'my_app'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.packageCount).to.equal(1);
      expect(analysis.totalDependencies).to.equal(2);
      expect(analysis.packages[0].name).to.equal('my_app');
    });

    it('should count all dependencies across multiple packages', async () => {
      const packages = [
        createPubspec('pkg_a', {
          dependencies: new Map([['http', createDep('http', '^1.0.0')]]),
          directory: path.join(tempDir, 'pkg_a'),
        }),
        createPubspec('pkg_b', {
          dependencies: new Map([
            ['json', createDep('json', '^1.0.0')],
            ['path', createDep('path', '^1.0.0')],
          ]),
          directory: path.join(tempDir, 'pkg_b'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.packageCount).to.equal(2);
      expect(analysis.totalDependencies).to.equal(3);
    });

    it('should detect standalone state when no packages have workspace resolution', async () => {
      const packages = [
        createPubspec('pkg_a', {
          resolutionMode: 'standalone',
          directory: path.join(tempDir, 'pkg_a'),
        }),
        createPubspec('pkg_b', {
          resolutionMode: 'standalone',
          directory: path.join(tempDir, 'pkg_b'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.currentState).to.equal('standalone');
    });

    it('should detect melos state when melos.yaml exists', async () => {
      // Create melos.yaml in temp dir
      await fs.writeFile(path.join(tempDir, 'melos.yaml'), 'name: test_workspace\n');

      const packages = [
        createPubspec('pkg_a', { directory: path.join(tempDir, 'pkg_a') }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.currentState).to.equal('melos');
      expect(analysis.hasMelos).to.be.true;
    });

    it('should detect pub_workspaces state when all packages have workspace resolution', async () => {
      // Create root pubspec.yaml
      await fs.writeFile(
        path.join(tempDir, 'pubspec.yaml'),
        'name: workspace_root\nworkspace:\n  - pkg_a\n  - pkg_b\n'
      );

      const packages = [
        createPubspec('pkg_a', {
          resolutionMode: 'workspace',
          directory: path.join(tempDir, 'pkg_a'),
        }),
        createPubspec('pkg_b', {
          resolutionMode: 'workspace',
          directory: path.join(tempDir, 'pkg_b'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.currentState).to.equal('pub_workspaces');
      expect(analysis.hasRootPubspec).to.be.true;
    });

    it('should detect mixed state when only some packages have workspace resolution', async () => {
      // Create root pubspec.yaml
      await fs.writeFile(path.join(tempDir, 'pubspec.yaml'), 'name: root\n');

      const packages = [
        createPubspec('pkg_a', {
          resolutionMode: 'workspace',
          directory: path.join(tempDir, 'pkg_a'),
        }),
        createPubspec('pkg_b', {
          resolutionMode: 'standalone',
          directory: path.join(tempDir, 'pkg_b'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.currentState).to.equal('mixed');
    });
  });

  describe('SDK version analysis', () => {
    it('should extract minimum SDK version across packages', async () => {
      const packages = [
        createPubspec('pkg_a', {
          sdkConstraint: '>=3.4.0 <4.0.0',
          directory: path.join(tempDir, 'pkg_a'),
        }),
        createPubspec('pkg_b', {
          sdkConstraint: '>=3.2.0 <4.0.0',
          directory: path.join(tempDir, 'pkg_b'),
        }),
        createPubspec('pkg_c', {
          sdkConstraint: '>=3.6.0 <4.0.0',
          directory: path.join(tempDir, 'pkg_c'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.minSdkVersion).to.equal('3.2.0');
    });

    it('should detect when SDK supports Pub Workspaces (3.6+)', async () => {
      const packages = [
        createPubspec('pkg_a', {
          sdkConstraint: '>=3.6.0 <4.0.0',
          directory: path.join(tempDir, 'pkg_a'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.supportsPubWorkspaces).to.be.true;
      expect(analysis.blockers).to.have.length(0);
    });

    it('should add blocker when SDK does not support Pub Workspaces', async () => {
      const packages = [
        createPubspec('pkg_a', {
          sdkConstraint: '>=3.4.0 <4.0.0',
          directory: path.join(tempDir, 'pkg_a'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.supportsPubWorkspaces).to.be.false;
      expect(analysis.blockers).to.have.length(1);
      expect(analysis.blockers[0].type).to.equal('sdk_too_old');
    });

    it('should support SDK 4.x and higher', async () => {
      const packages = [
        createPubspec('pkg_a', {
          sdkConstraint: '>=4.0.0 <5.0.0',
          directory: path.join(tempDir, 'pkg_a'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.supportsPubWorkspaces).to.be.true;
    });

    it('should handle caret version constraints', async () => {
      const packages = [
        createPubspec('pkg_a', {
          sdkConstraint: '^3.6.0',
          directory: path.join(tempDir, 'pkg_a'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.minSdkVersion).to.equal('3.6.0');
      expect(analysis.supportsPubWorkspaces).to.be.true;
    });
  });

  describe('dependency analysis', () => {
    it('should detect git dependencies and add warnings', async () => {
      const deps = new Map<string, DependencyInfo>([
        ['custom_pkg', createDep('custom_pkg', 'main', 'git')],
      ]);

      const packages = [
        createPubspec('my_app', {
          dependencies: deps,
          sdkConstraint: '>=3.6.0',
          directory: path.join(tempDir, 'my_app'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.warnings.some((w) => w.type === 'git_dependency')).to.be.true;
      const gitWarning = analysis.warnings.find((w) => w.type === 'git_dependency');
      expect(gitWarning?.message).to.include('custom_pkg');
    });

    it('should detect path dependencies outside workspace and add warnings', async () => {
      const deps = new Map<string, DependencyInfo>([
        ['external_pkg', createDep('external_pkg', 'any', 'path', '../../outside')],
      ]);

      const packages = [
        createPubspec('my_app', {
          dependencies: deps,
          sdkConstraint: '>=3.6.0',
          directory: path.join(tempDir, 'my_app'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.warnings.some((w) => w.type === 'path_dependency_external')).to.be.true;
    });

    it('should not warn about path dependencies inside workspace', async () => {
      // Create a nested structure
      const pkgADir = path.join(tempDir, 'packages', 'pkg_a');
      const pkgBDir = path.join(tempDir, 'packages', 'pkg_b');

      const deps = new Map<string, DependencyInfo>([
        ['pkg_b', createDep('pkg_b', 'any', 'path', '../pkg_b')],
      ]);

      const packages = [
        createPubspec('pkg_a', {
          dependencies: deps,
          sdkConstraint: '>=3.6.0',
          directory: pkgADir,
        }),
        createPubspec('pkg_b', {
          sdkConstraint: '>=3.6.0',
          directory: pkgBDir,
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.warnings.filter((w) => w.type === 'path_dependency_external')).to.have.length(
        0
      );
    });
  });

  describe('lockfile detection', () => {
    it('should warn about existing lockfiles', async () => {
      // Create package directory with lockfile
      const pkgDir = path.join(tempDir, 'my_app');
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, 'pubspec.lock'), 'packages: {}');

      const packages = [
        createPubspec('my_app', {
          sdkConstraint: '>=3.6.0',
          directory: pkgDir,
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.warnings.some((w) => w.type === 'existing_lockfile')).to.be.true;
    });

    it('should not warn when no lockfile exists', async () => {
      // Create package directory without lockfile
      const pkgDir = path.join(tempDir, 'my_app');
      await fs.mkdir(pkgDir, { recursive: true });

      const packages = [
        createPubspec('my_app', {
          sdkConstraint: '>=3.6.0',
          directory: pkgDir,
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.warnings.filter((w) => w.type === 'existing_lockfile')).to.have.length(0);
    });
  });

  describe('package info extraction', () => {
    it('should extract package info correctly', async () => {
      const pkgDir = path.join(tempDir, 'packages', 'my_app');

      const packages = [
        createPubspec('my_app', {
          version: '2.5.0',
          type: 'flutter_app',
          sdkConstraint: '>=3.6.0',
          resolutionMode: 'standalone',
          directory: pkgDir,
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.packages[0].name).to.equal('my_app');
      expect(analysis.packages[0].version).to.equal('2.5.0');
      expect(analysis.packages[0].type).to.equal('flutter_app');
      expect(analysis.packages[0].relativePath).to.equal(path.join('packages', 'my_app'));
      expect(analysis.packages[0].hasResolutionWorkspace).to.be.false;
    });

    it('should calculate dependency count per package', async () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
        ['json', createDep('json', '^1.0.0')],
      ]);
      const devDeps = new Map<string, DependencyInfo>([
        ['test', createDep('test', '^1.24.0')],
      ]);

      const packages = [
        createPubspec('my_app', {
          dependencies: deps,
          devDependencies: devDeps,
          sdkConstraint: '>=3.6.0',
          directory: path.join(tempDir, 'my_app'),
        }),
      ];

      const analysis = await analyzer.analyze(packages);

      expect(analysis.packages[0].dependencyCount).to.equal(3);
    });
  });
});
