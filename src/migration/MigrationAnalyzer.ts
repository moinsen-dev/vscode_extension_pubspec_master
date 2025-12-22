import * as path from 'path';
import * as fs from 'fs/promises';
import {
  WorkspaceAnalysis,
  WorkspaceState,
  PackageInfo,
  MigrationBlocker,
  MigrationWarning,
} from './types';
import { PubspecInfo, DependencyInfo } from '../types';

/**
 * Analyzes workspace to determine current state and migration readiness
 */
export class MigrationAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Perform full workspace analysis for migration
   */
  async analyze(packages: PubspecInfo[]): Promise<WorkspaceAnalysis> {
    const blockers: MigrationBlocker[] = [];
    const warnings: MigrationWarning[] = [];

    // Check for root pubspec.yaml
    const hasRootPubspec = await this.checkRootPubspec();

    // Check for melos.yaml
    const hasMelos = await this.checkMelos();

    // Detect current state
    const currentState = this.detectCurrentState(packages, hasRootPubspec, hasMelos);

    // Analyze SDK versions
    const sdkVersions = packages.map((p) => this.extractSdkVersion(p.sdkConstraint || '>=3.0.0'));
    const minSdkVersion = this.findMinSdkVersion(sdkVersions);
    const supportsPubWorkspaces = this.checkPubWorkspacesSupport(minSdkVersion);

    // Check for blockers
    if (!supportsPubWorkspaces) {
      blockers.push({
        type: 'sdk_too_old',
        message: `Dart SDK ${minSdkVersion} does not support Pub Workspaces (requires 3.6+)`,
        details: 'Update your SDK constraints to ^3.6.0 or higher',
      });
    }

    // Check for path dependencies outside workspace
    for (const pkg of packages) {
      const externalPaths = this.checkExternalPathDependencies(pkg);
      for (const extPath of externalPaths) {
        warnings.push({
          type: 'path_dependency_external',
          message: `Path dependency "${extPath.name}" points outside workspace`,
          package: pkg.name,
          details: extPath.path,
        });
      }

      // Check for git dependencies
      const gitDeps = this.checkGitDependencies(pkg);
      for (const gitDep of gitDeps) {
        warnings.push({
          type: 'git_dependency',
          message: `Git dependency "${gitDep}" will remain unchanged`,
          package: pkg.name,
        });
      }
    }

    // Check for existing lockfiles (will be deleted)
    for (const pkg of packages) {
      const hasLockfile = await this.checkLockfile(pkg.directory);
      if (hasLockfile) {
        warnings.push({
          type: 'existing_lockfile',
          message: `Lockfile will be deleted (replaced by root lockfile)`,
          package: pkg.name,
        });
      }
    }

    // Build package info
    const packageInfos: PackageInfo[] = packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      path: pkg.path,
      relativePath: path.relative(this.workspaceRoot, pkg.directory),
      type: pkg.type,
      sdkConstraint: pkg.sdkConstraint,
      hasResolutionWorkspace: pkg.resolutionMode === 'workspace',
      dependencyCount:
        pkg.dependencies.size + pkg.devDependencies.size,
    }));

    // Calculate total dependencies
    const totalDependencies = packages.reduce(
      (sum, pkg) =>
        sum + pkg.dependencies.size + pkg.devDependencies.size,
      0
    );

    return {
      currentState,
      packageCount: packages.length,
      totalDependencies,
      hasRootPubspec,
      hasMelos,
      minSdkVersion,
      supportsPubWorkspaces,
      packages: packageInfos,
      blockers,
      warnings,
    };
  }

  /**
   * Check if root pubspec.yaml exists
   */
  private async checkRootPubspec(): Promise<boolean> {
    try {
      await fs.access(path.join(this.workspaceRoot, 'pubspec.yaml'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if melos.yaml exists
   */
  private async checkMelos(): Promise<boolean> {
    try {
      await fs.access(path.join(this.workspaceRoot, 'melos.yaml'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect current workspace state
   */
  private detectCurrentState(
    packages: PubspecInfo[],
    hasRootPubspec: boolean,
    hasMelos: boolean
  ): WorkspaceState {
    if (hasMelos) {
      return 'melos';
    }

    // Check if any package has resolution: workspace
    const hasWorkspaceResolution = packages.some((p) => p.resolutionMode === 'workspace');

    // Check root pubspec for workspace config
    if (hasRootPubspec && hasWorkspaceResolution) {
      // Check if all packages have workspace resolution
      const allHaveWorkspace = packages.every((p) => p.resolutionMode === 'workspace');
      return allHaveWorkspace ? 'pub_workspaces' : 'mixed';
    }

    return 'standalone';
  }

  /**
   * Extract numeric SDK version from constraint
   */
  private extractSdkVersion(constraint: string): string {
    // Handle various constraint formats: ^3.0.0, >=3.0.0, 3.0.0
    const match = constraint.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : '0.0.0';
  }

  /**
   * Find minimum SDK version across all packages
   */
  private findMinSdkVersion(versions: string[]): string {
    if (versions.length === 0) {return '0.0.0';}

    return versions.reduce((min, current) => {
      return this.compareVersions(current, min) < 0 ? current : min;
    });
  }

  /**
   * Compare two semver versions
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const diff = (partsA[i] || 0) - (partsB[i] || 0);
      if (diff !== 0) {return diff;}
    }
    return 0;
  }

  /**
   * Check if SDK version supports Pub Workspaces (3.6+)
   */
  private checkPubWorkspacesSupport(version: string): boolean {
    const parts = version.split('.').map(Number);
    const major = parts[0] || 0;
    const minor = parts[1] || 0;

    return major > 3 || (major === 3 && minor >= 6);
  }

  /**
   * Check for path dependencies outside workspace
   */
  private checkExternalPathDependencies(
    pkg: PubspecInfo
  ): Array<{ name: string; path: string }> {
    const external: Array<{ name: string; path: string }> = [];

    const checkDeps = (deps: Map<string, DependencyInfo>) => {
      for (const [name, depInfo] of deps.entries()) {
        if (depInfo.source === 'path' && depInfo.path) {
          const absolutePath = path.resolve(pkg.directory, depInfo.path);

          if (!absolutePath.startsWith(this.workspaceRoot)) {
            external.push({ name, path: depInfo.path });
          }
        }
      }
    };

    checkDeps(pkg.dependencies);
    checkDeps(pkg.devDependencies);

    return external;
  }

  /**
   * Check for git dependencies
   */
  private checkGitDependencies(pkg: PubspecInfo): string[] {
    const gitDeps: string[] = [];

    const checkDeps = (deps: Map<string, DependencyInfo>) => {
      for (const [name, depInfo] of deps.entries()) {
        if (depInfo.source === 'git') {
          gitDeps.push(name);
        }
      }
    };

    checkDeps(pkg.dependencies);
    checkDeps(pkg.devDependencies);

    return gitDeps;
  }

  /**
   * Check if package has a lockfile
   */
  private async checkLockfile(packageDir: string): Promise<boolean> {
    try {
      await fs.access(path.join(packageDir, 'pubspec.lock'));
      return true;
    } catch {
      return false;
    }
  }
}
