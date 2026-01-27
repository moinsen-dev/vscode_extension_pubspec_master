import { EcosystemType, CommandResult } from './types';

/**
 * Options for package installation
 */
export interface InstallOptions {
  /** Install as dev dependency */
  dev?: boolean;
  /** Specific version to install */
  version?: string;
  /** Additional CLI flags */
  extraArgs?: string[];
}

/**
 * Options for package update
 */
export interface UpdateOptions {
  /** Update to specific version */
  version?: string;
  /** Update all packages */
  all?: boolean;
  /** Additional CLI flags */
  extraArgs?: string[];
}

/**
 * Interface for package manager CLI operations
 *
 * Each ecosystem must implement this interface to interact with
 * its package manager CLI (pub, npm, pip).
 */
export interface IPackageManager {
  /** The ecosystem this manager handles */
  readonly ecosystem: EcosystemType;

  /** The CLI command name (e.g., 'dart', 'npm', 'pip') */
  readonly cliCommand: string;

  /**
   * Check if the package manager CLI is available
   *
   * @returns True if CLI is installed and accessible
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the installed version of the package manager
   *
   * @returns Version string or null if not available
   */
  getVersion(): Promise<string | null>;

  /**
   * Install dependencies for a package
   *
   * @param packagePath - Path to the package directory
   * @returns Command result
   */
  install(packagePath: string): Promise<CommandResult>;

  /**
   * Install a specific package
   *
   * @param packagePath - Path to the package directory
   * @param packageName - Name of the package to install
   * @param options - Installation options
   * @returns Command result
   */
  installPackage(
    packagePath: string,
    packageName: string,
    options?: InstallOptions
  ): Promise<CommandResult>;

  /**
   * Update all dependencies
   *
   * @param packagePath - Path to the package directory
   * @param options - Update options
   * @returns Command result
   */
  update(packagePath: string, options?: UpdateOptions): Promise<CommandResult>;

  /**
   * Update a specific package
   *
   * @param packagePath - Path to the package directory
   * @param packageName - Name of the package to update
   * @param options - Update options
   * @returns Command result
   */
  updatePackage(
    packagePath: string,
    packageName: string,
    options?: UpdateOptions
  ): Promise<CommandResult>;

  /**
   * Remove a package
   *
   * @param packagePath - Path to the package directory
   * @param packageName - Name of the package to remove
   * @returns Command result
   */
  removePackage(
    packagePath: string,
    packageName: string
  ): Promise<CommandResult>;

  /**
   * Run a custom command in the package context
   *
   * @param packagePath - Path to the package directory
   * @param args - Command arguments
   * @returns Command result
   */
  runCommand(packagePath: string, args: string[]): Promise<CommandResult>;
}
