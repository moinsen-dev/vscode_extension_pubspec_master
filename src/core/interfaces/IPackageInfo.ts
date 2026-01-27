import { EcosystemType, DependencySource } from './types';

/**
 * Information about a dependency
 */
export interface IDependencyInfo {
  /** Dependency package name */
  name: string;
  /** Version constraint (e.g., "^1.0.0", ">=1.0.0 <2.0.0") */
  constraint: string;
  /** Source of the dependency */
  source: DependencySource;
  /** Whether this is a dev dependency */
  isDev: boolean;
  /** Path for local dependencies */
  path?: string;
  /** Git URL for git dependencies */
  gitUrl?: string;
  /** Git ref (branch, tag, commit) */
  gitRef?: string;
  /** Ecosystem-specific extra data */
  extras?: Record<string, unknown>;
}

/**
 * Universal package information interface
 *
 * All ecosystem-specific package parsers must produce data
 * conforming to this interface.
 */
export interface IPackageInfo {
  // Identity
  /** Absolute path to the manifest file */
  path: string;
  /** Directory containing the manifest */
  directory: string;
  /** Package name */
  name: string;
  /** Package version */
  version?: string;
  /** Package description */
  description?: string;

  // Ecosystem
  /** The ecosystem this package belongs to */
  ecosystem: EcosystemType;
  /** Ecosystem-specific package type (e.g., 'flutter_app', 'npm_module') */
  packageType: string;

  // Dependencies
  /** Production dependencies */
  dependencies: Map<string, IDependencyInfo>;
  /** Development dependencies */
  devDependencies: Map<string, IDependencyInfo>;

  // Constraints
  /** SDK/runtime version constraint */
  sdkConstraint?: string;
  /** Additional runtime constraints (e.g., Flutter constraint for Dart) */
  runtimeConstraints?: Record<string, string>;

  // Workspace
  /** Whether this is a workspace root */
  isWorkspaceRoot: boolean;
  /** Workspace member patterns (for workspace roots) */
  workspaceMembers?: string[];
  /** Whether this package is a workspace member */
  isWorkspaceMember: boolean;

  // Raw data
  /** Original parsed manifest data */
  raw: Record<string, unknown>;
}

/**
 * Create an empty IPackageInfo with defaults
 */
export function createEmptyPackageInfo(
  path: string,
  ecosystem: EcosystemType
): IPackageInfo {
  return {
    path,
    directory: path.substring(0, path.lastIndexOf('/')),
    name: '',
    ecosystem,
    packageType: 'unknown',
    dependencies: new Map(),
    devDependencies: new Map(),
    isWorkspaceRoot: false,
    isWorkspaceMember: false,
    raw: {},
  };
}
