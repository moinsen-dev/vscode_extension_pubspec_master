import { EcosystemType } from './types';
import { IDependencyInfo } from './IPackageInfo';

/**
 * Options for writing manifest changes
 */
export interface WriteOptions {
  /** Create backup before writing */
  backup?: boolean;
  /** Preserve comments in the manifest (if supported) */
  preserveComments?: boolean;
  /** Format/prettify the output */
  format?: boolean;
}

/**
 * Result of a write operation
 */
export interface WriteResult {
  /** Whether the write succeeded */
  success: boolean;
  /** Path to backup file if created */
  backupPath?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Interface for writing changes to package manifest files
 *
 * Each ecosystem must implement this interface to modify its
 * manifest files (pubspec.yaml, package.json, pyproject.toml).
 */
export interface IManifestWriter {
  /** The ecosystem this writer handles */
  readonly ecosystem: EcosystemType;

  /**
   * Add or update a dependency in the manifest
   *
   * @param filePath - Path to the manifest file
   * @param dependency - Dependency information
   * @param options - Write options
   * @returns Write result
   */
  addDependency(
    filePath: string,
    dependency: IDependencyInfo,
    options?: WriteOptions
  ): Promise<WriteResult>;

  /**
   * Remove a dependency from the manifest
   *
   * @param filePath - Path to the manifest file
   * @param packageName - Name of the package to remove
   * @param isDev - Whether to remove from dev dependencies
   * @param options - Write options
   * @returns Write result
   */
  removeDependency(
    filePath: string,
    packageName: string,
    isDev: boolean,
    options?: WriteOptions
  ): Promise<WriteResult>;

  /**
   * Update a dependency version constraint
   *
   * @param filePath - Path to the manifest file
   * @param packageName - Name of the package
   * @param newConstraint - New version constraint
   * @param options - Write options
   * @returns Write result
   */
  updateVersion(
    filePath: string,
    packageName: string,
    newConstraint: string,
    options?: WriteOptions
  ): Promise<WriteResult>;

  /**
   * Batch update multiple dependency versions
   *
   * @param filePath - Path to the manifest file
   * @param updates - Map of package name to new constraint
   * @param options - Write options
   * @returns Write result
   */
  batchUpdateVersions(
    filePath: string,
    updates: Map<string, string>,
    options?: WriteOptions
  ): Promise<WriteResult>;

  /**
   * Update the package's own version
   *
   * @param filePath - Path to the manifest file
   * @param newVersion - New version string
   * @param options - Write options
   * @returns Write result
   */
  updatePackageVersion(
    filePath: string,
    newVersion: string,
    options?: WriteOptions
  ): Promise<WriteResult>;

  /**
   * Create a backup of the manifest file
   *
   * @param filePath - Path to the manifest file
   * @returns Path to the backup file
   */
  createBackup(filePath: string): Promise<string>;

  /**
   * Restore manifest from a backup
   *
   * @param filePath - Path to the manifest file
   * @param backupPath - Path to the backup file
   * @returns Whether restore succeeded
   */
  restoreFromBackup(filePath: string, backupPath: string): Promise<boolean>;
}
