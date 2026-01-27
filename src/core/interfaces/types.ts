/**
 * Supported ecosystem types
 */
export type EcosystemType = 'dart' | 'nodejs' | 'python';

/**
 * Source of a dependency
 */
export type DependencySource =
  | 'registry'   // pub.dev, npm, pypi
  | 'path'       // local path
  | 'git'        // git repository
  | 'sdk'        // SDK dependency (Dart-specific)
  | 'url';       // Direct URL

/**
 * Result of a command execution
 */
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Result of a version check
 */
export interface VersionCheckRequest {
  name: string;
  currentVersion?: string;
}

export interface VersionCheckResult {
  name: string;
  currentVersion?: string;
  latestVersion?: string;
  isOutdated: boolean;
}

/**
 * Package info from a registry
 */
export interface RegistryPackageInfo {
  name: string;
  latestVersion: string;
  description?: string;
  publishedAt?: string;
  repositoryUrl?: string;
  isDiscontinued?: boolean;
  score?: number;
  popularity?: number;
}
