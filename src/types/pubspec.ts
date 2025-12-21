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

/**
 * Issue type for package health warnings
 */
export type PackageHealthIssueType =
  | 'unmaintained'
  | 'discontinued'
  | 'low-quality'
  | 'archived'
  | 'security-advisory'
  | 'high-issue-count'
  | 'stale-repo';

/**
 * Severity level for package health issues
 */
export type PackageHealthSeverity = 'critical' | 'warning' | 'info';

/**
 * GitHub repository metrics for package health assessment
 */
export interface GitHubHealthMetrics {
  /** Repository owner/repo (e.g., "dart-lang/sdk") */
  repoFullName?: string;
  /** Number of open issues */
  openIssues?: number;
  /** Number of open pull requests */
  openPRs?: number;
  /** Days since last commit */
  daysSinceLastCommit?: number;
  /** Number of stars */
  stars?: number;
  /** Whether the repository is archived */
  isArchived?: boolean;
  /** Number of security advisories */
  securityAdvisoryCount?: number;
  /** License type */
  license?: string;
}

/**
 * Represents a package health issue detected in the workspace
 */
export interface PackageHealthIssue {
  /** The dependency package with the health issue */
  packageName: string;
  /** Type of health issue */
  issueType: PackageHealthIssueType;
  /** Severity level */
  severity: PackageHealthSeverity;
  /** Days since the package was last updated on pub.dev */
  daysSinceUpdate: number;
  /** ISO date string of last update on pub.dev */
  lastUpdated?: string;
  /** Package score from pub.dev (0-160) */
  score?: number;
  /** List of workspace packages that depend on this package */
  usedBy: string[];
  /** Human-readable message describing the issue */
  message: string;
  /** Suggested action to resolve the issue */
  suggestion: string;
  /** GitHub repository metrics (if available) */
  github?: GitHubHealthMetrics;
  /** Calculated risk score (0-100, higher = more risky) */
  riskScore?: number;
}
