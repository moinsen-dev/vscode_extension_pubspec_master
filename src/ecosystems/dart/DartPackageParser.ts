import * as path from 'path';
import {
  EcosystemType,
  IPackageParser,
  IPackageInfo,
  IDependencyInfo,
  DependencySource,
} from '../../core/interfaces';
import { PubspecParser } from '../../core/PubspecParser';
import { DependencyInfo as LegacyDependencyInfo } from '../../types';

/**
 * Map legacy dependency source to interface DependencySource
 */
function mapDependencySource(source: string): DependencySource {
  switch (source) {
    case 'pub.dev':
      return 'registry';
    case 'path':
      return 'path';
    case 'git':
      return 'git';
    case 'sdk':
      return 'sdk';
    default:
      return 'registry';
  }
}

/**
 * Convert legacy DependencyInfo to IDependencyInfo
 */
function convertDependency(dep: LegacyDependencyInfo, isDev: boolean): IDependencyInfo {
  return {
    name: dep.name,
    constraint: dep.constraint,
    source: mapDependencySource(dep.source),
    isDev,
    path: dep.path,
    gitUrl: dep.gitUrl,
    gitRef: dep.gitRef,
  };
}

/**
 * Dart/Flutter package parser implementing IPackageParser
 *
 * Wraps the existing PubspecParser to conform to the multi-ecosystem interface.
 */
export class DartPackageParser implements IPackageParser {
  readonly ecosystem: EcosystemType = 'dart';
  readonly manifestPatterns: string[] = ['**/pubspec.yaml'];

  private readonly parser = new PubspecParser();

  /**
   * Parse a pubspec.yaml file from disk
   */
  async parse(filePath: string): Promise<IPackageInfo> {
    const pubspec = await this.parser.parse(filePath);
    return this.convertToPackageInfo(pubspec, filePath);
  }

  /**
   * Parse pubspec.yaml content directly
   */
  parseContent(content: string, filePath: string): IPackageInfo {
    const pubspec = this.parser.parseContent(content, filePath);
    return this.convertToPackageInfo(pubspec, filePath);
  }

  /**
   * Check if a file path matches pubspec.yaml
   */
  canParse(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return fileName === 'pubspec.yaml';
  }

  /**
   * Convert PubspecInfo to IPackageInfo
   */
  private convertToPackageInfo(
    pubspec: ReturnType<PubspecParser['parseContent']>,
    filePath: string
  ): IPackageInfo {
    // Convert dependencies
    const dependencies = new Map<string, IDependencyInfo>();
    for (const [name, dep] of pubspec.dependencies) {
      dependencies.set(name, convertDependency(dep, false));
    }

    const devDependencies = new Map<string, IDependencyInfo>();
    for (const [name, dep] of pubspec.devDependencies) {
      devDependencies.set(name, convertDependency(dep, true));
    }

    // Map package type
    let packageType: string;
    switch (pubspec.type) {
      case 'flutter_app':
        packageType = 'flutter_app';
        break;
      case 'flutter_plugin':
        packageType = 'flutter_plugin';
        break;
      case 'dart_package':
      default:
        packageType = 'dart_package';
        break;
    }

    // Build runtime constraints
    const runtimeConstraints: Record<string, string> = {};
    if (pubspec.flutterConstraint) {
      runtimeConstraints.flutter = pubspec.flutterConstraint;
    }

    return {
      path: filePath,
      directory: path.dirname(filePath),
      name: pubspec.name,
      version: pubspec.version,
      description: pubspec.description,
      ecosystem: 'dart',
      packageType,
      dependencies,
      devDependencies,
      sdkConstraint: pubspec.sdkConstraint,
      runtimeConstraints: Object.keys(runtimeConstraints).length > 0 ? runtimeConstraints : undefined,
      isWorkspaceRoot: !!pubspec.workspacePackages && pubspec.workspacePackages.length > 0,
      workspaceMembers: pubspec.workspacePackages,
      isWorkspaceMember: pubspec.isWorkspacePackage,
      raw: pubspec.raw,
    };
  }
}
