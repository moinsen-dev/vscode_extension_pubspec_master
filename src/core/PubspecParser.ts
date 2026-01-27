import * as YAML from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  PubspecInfo,
  PackageType,
  DependencyInfo,
} from '../types';
import { DEFAULTS } from '../constants';
import { validatePubspec } from './PubspecValidator';
import { wrapError } from '../utils/ErrorWithContext';

/**
 * Parser for pubspec.yaml files
 *
 * Safely parses YAML and extracts package information including
 * dependencies, package type detection, and workspace configuration.
 */
export class PubspecParser {
  /**
   * Parse a pubspec.yaml file from disk
   *
   * @param filePath - Absolute path to the pubspec.yaml file
   * @returns Parsed pubspec information
   * @throws ErrorWithContext if file cannot be read or parsed
   */
  async parse(filePath: string): Promise<PubspecInfo> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw wrapError(error, 'reading pubspec.yaml', filePath, {
        suggestion: 'Ensure the file exists and is readable',
      });
    }
    return this.parseContent(content, filePath);
  }

  /**
   * Parse pubspec.yaml content directly
   *
   * @param content - Raw YAML content
   * @param filePath - Path to associate with this content (for error messages)
   * @returns Parsed pubspec information
   * @throws Error if YAML is invalid or missing required fields
   */
  parseContent(content: string, filePath: string): PubspecInfo {
    // Parse YAML with safe settings
    let parsed: Record<string, unknown> | null;
    try {
      parsed = YAML.parse(content, {
        strict: true,
        maxAliasCount: DEFAULTS.YAML_MAX_ALIAS_COUNT,
      }) as Record<string, unknown> | null;
    } catch (yamlError) {
      throw wrapError(yamlError, 'parsing YAML', filePath, {
        suggestion: 'Check the YAML syntax for errors',
      });
    }

    // Handle empty file
    if (!parsed) {
      throw new Error(`Empty or invalid pubspec.yaml at ${filePath}`);
    }

    // Validate the pubspec structure
    const validation = validatePubspec(parsed, filePath);
    if (!validation.valid) {
      // Throw the first error with a helpful message
      const firstError = validation.errors[0];
      throw firstError;
    }

    // Extract name (already validated)
    const name = parsed.name as string;

    const type = this.detectPackageType(parsed);
    const dependencies = this.extractDependencies(parsed.dependencies);
    const devDependencies = this.extractDependencies(parsed.dev_dependencies);

    // Extract environment constraints
    const environment = parsed.environment as Record<string, unknown> | undefined;
    const sdkConstraint = this.extractStringField(environment, 'sdk');
    const flutterConstraint = this.extractStringField(environment, 'flutter');

    // Detect workspace configuration
    const workspacePackages = this.extractWorkspacePackages(parsed);
    const resolution = parsed.resolution;
    const isWorkspacePackage = resolution === 'workspace';

    return {
      path: filePath,
      directory: path.dirname(filePath),
      name,
      version: this.extractStringField(parsed, 'version'),
      description: this.extractStringField(parsed, 'description'),
      type,
      sdkConstraint,
      flutterConstraint,
      dependencies,
      devDependencies,
      isWorkspacePackage,
      resolutionMode: isWorkspacePackage ? 'workspace' : 'standalone',
      workspacePackages,
      raw: parsed,
    };
  }

  /**
   * Detect the package type from parsed pubspec content
   *
   * Priority order:
   * 1. flutter_plugin - has flutter.plugin section
   * 2. flutter_app - has flutter dep + (publish_to: none OR uses-material-design)
   * 3. flutter_package - has flutter dep (but not app/plugin)
   * 4. dart_package - no flutter dependency
   */
  private detectPackageType(parsed: Record<string, unknown>): PackageType {
    const flutter = parsed.flutter as Record<string, unknown> | undefined;
    const deps = parsed.dependencies as Record<string, unknown> | undefined;

    // 1. Check for Flutter plugin - most specific first
    if (flutter?.plugin) {
      return 'flutter_plugin';
    }

    // Check for Flutter dependency
    const hasFlutterDep = deps?.flutter !== undefined;

    if (hasFlutterDep) {
      // Check indicators that suggest this is an app rather than a package
      const publishTo = parsed.publish_to;
      const usesMaterialDesign = flutter?.['uses-material-design'];

      // 2. Apps typically have publish_to: none and uses-material-design: true
      if (publishTo === 'none' || usesMaterialDesign === true) {
        return 'flutter_app';
      }

      // 3. Has Flutter dependency but no app/plugin indicators = Flutter package
      return 'flutter_package';
    }

    // 4. No Flutter dependency = pure Dart package
    return 'dart_package';
  }

  /**
   * Extract dependencies from a dependencies/dev_dependencies object
   */
  private extractDependencies(
    depsObj: unknown
  ): Map<string, DependencyInfo> {
    const result = new Map<string, DependencyInfo>();

    if (!depsObj || typeof depsObj !== 'object') {
      return result;
    }

    for (const [name, value] of Object.entries(depsObj)) {
      const dep = this.parseDependency(name, value);
      if (dep) {
        result.set(name, dep);
      }
    }

    return result;
  }

  /**
   * Parse a single dependency entry
   */
  private parseDependency(
    name: string,
    value: unknown
  ): DependencyInfo | null {
    // Simple string version constraint: "^1.0.0"
    if (typeof value === 'string') {
      return {
        name,
        constraint: value,
        source: 'pub.dev',
      };
    }

    // Complex dependency object
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;

      // Path dependency
      if (obj.path !== undefined) {
        return {
          name,
          constraint: 'path',
          source: 'path',
          path: String(obj.path),
        };
      }

      // Git dependency
      if (obj.git !== undefined) {
        return this.parseGitDependency(name, obj.git);
      }

      // SDK dependency (flutter, dart)
      if (obj.sdk !== undefined) {
        return {
          name,
          constraint: String(obj.sdk),
          source: 'sdk',
        };
      }

      // Hosted with version (e.g., custom pub server)
      if (obj.version !== undefined) {
        return {
          name,
          constraint: String(obj.version),
          source: 'pub.dev',
        };
      }

      // Hosted without version (any version)
      if (obj.hosted !== undefined) {
        return {
          name,
          constraint: 'any',
          source: 'pub.dev',
        };
      }
    }

    // Null or unrecognized format - skip silently
    return null;
  }

  /**
   * Parse a git dependency
   */
  private parseGitDependency(
    name: string,
    git: unknown
  ): DependencyInfo {
    // Simple git URL string
    if (typeof git === 'string') {
      return {
        name,
        constraint: 'git',
        source: 'git',
        gitUrl: git,
      };
    }

    // Git object with url and optional ref
    if (typeof git === 'object' && git !== null) {
      const gitObj = git as Record<string, unknown>;
      return {
        name,
        constraint: 'git',
        source: 'git',
        gitUrl: String(gitObj.url || ''),
        gitRef: gitObj.ref ? String(gitObj.ref) : undefined,
      };
    }

    // Fallback
    return {
      name,
      constraint: 'git',
      source: 'git',
    };
  }

  /**
   * Extract workspace package paths from pubspec
   */
  private extractWorkspacePackages(
    parsed: Record<string, unknown>
  ): string[] | undefined {
    const workspace = parsed.workspace;

    if (Array.isArray(workspace)) {
      return workspace.filter((p): p is string => typeof p === 'string');
    }

    return undefined;
  }

  /**
   * Safely extract a string field from an object
   */
  private extractStringField(
    obj: Record<string, unknown> | undefined,
    field: string
  ): string | undefined {
    if (!obj) {
      return undefined;
    }
    const value = obj[field];
    return typeof value === 'string' ? value : undefined;
  }
}
