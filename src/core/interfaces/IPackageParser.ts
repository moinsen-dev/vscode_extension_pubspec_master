import { EcosystemType } from './types';
import { IPackageInfo } from './IPackageInfo';

/**
 * Interface for parsing package manifest files
 *
 * Each ecosystem must implement this interface to parse its
 * specific manifest format (pubspec.yaml, package.json, pyproject.toml).
 */
export interface IPackageParser {
  /** The ecosystem this parser handles */
  readonly ecosystem: EcosystemType;

  /**
   * Glob patterns to find manifest files
   * e.g., ['** /pubspec.yaml'] for Dart
   */
  readonly manifestPatterns: string[];

  /**
   * Parse a manifest file from disk
   *
   * @param filePath - Absolute path to the manifest file
   * @returns Parsed package information
   * @throws Error if file cannot be read or parsed
   */
  parse(filePath: string): Promise<IPackageInfo>;

  /**
   * Parse manifest content directly
   *
   * @param content - Raw manifest content
   * @param filePath - Path to associate with this content (for error messages)
   * @returns Parsed package information
   * @throws Error if content is invalid
   */
  parseContent(content: string, filePath: string): IPackageInfo;

  /**
   * Check if a file path matches this parser's manifest patterns
   *
   * @param filePath - Path to check
   * @returns True if this parser can handle the file
   */
  canParse(filePath: string): boolean;
}
