/**
 * Type of Dart/Flutter package detected from pubspec.yaml content
 */
export type PackageType = 'flutter_app' | 'dart_package' | 'flutter_plugin';

/**
 * Resolution mode for workspace packages
 */
export type ResolutionMode = 'workspace' | 'standalone';

/**
 * Dependency source types
 */
export type DependencySource = 'pub.dev' | 'path' | 'git' | 'sdk';

/**
 * Represents a single dependency entry from pubspec.yaml
 */
export interface DependencyInfo {
  /** Dependency name */
  name: string;
  /** Version constraint or special value like 'path', 'git' */
  constraint: string;
  /** Source of the dependency */
  source: DependencySource;
  /** For path dependencies - relative or absolute path */
  path?: string;
  /** For git dependencies - repository URL */
  gitUrl?: string;
  /** For git dependencies - branch, tag, or commit ref */
  gitRef?: string;
}

/**
 * Parsed information from a single pubspec.yaml file
 */
export interface PubspecInfo {
  /** Absolute path to the pubspec.yaml file */
  path: string;

  /** Directory containing the pubspec.yaml */
  directory: string;

  /** Package name from 'name:' field */
  name: string;

  /** Package version if specified */
  version?: string;

  /** Package description */
  description?: string;

  /** Detected package type */
  type: PackageType;

  /** SDK constraint from environment.sdk */
  sdkConstraint?: string;

  /** Flutter SDK constraint from environment.flutter */
  flutterConstraint?: string;

  /** Regular dependencies */
  dependencies: Map<string, DependencyInfo>;

  /** Development dependencies */
  devDependencies: Map<string, DependencyInfo>;

  /** Whether this package is part of a workspace (has resolution: workspace) */
  isWorkspacePackage: boolean;

  /** Resolution mode (workspace or standalone) */
  resolutionMode: ResolutionMode;

  /** Workspace packages (if this is a root workspace pubspec) */
  workspacePackages?: string[];

  /** Raw parsed YAML for advanced access */
  raw: Record<string, unknown>;
}

/**
 * Error information for parse failures
 */
export interface PubspecParseError {
  /** Path to the file that failed to parse */
  path: string;
  /** Error message */
  message: string;
  /** Line number where error occurred (if available) */
  line?: number;
  /** Column number where error occurred (if available) */
  column?: number;
}
