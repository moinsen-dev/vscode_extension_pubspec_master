import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';
import {
  EcosystemType,
  IManifestWriter,
  IDependencyInfo,
  WriteOptions,
  WriteResult,
} from '../../core/interfaces';
import { DEFAULTS } from '../../constants';

/**
 * Dart manifest writer implementing IManifestWriter
 *
 * Handles reading and writing pubspec.yaml files while preserving
 * formatting and comments where possible.
 */
export class DartManifestWriter implements IManifestWriter {
  readonly ecosystem: EcosystemType = 'dart';

  /**
   * Add or update a dependency in pubspec.yaml
   */
  async addDependency(
    filePath: string,
    dependency: IDependencyInfo,
    options?: WriteOptions
  ): Promise<WriteResult> {
    try {
      if (options?.backup) {
        await this.createBackup(filePath);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const doc = YAML.parseDocument(content);

      const section = dependency.isDev ? 'dev_dependencies' : 'dependencies';

      // Ensure section exists
      if (!doc.has(section)) {
        doc.set(section, {});
      }

      // Build dependency value based on source
      const depValue = this.buildDependencyValue(dependency);

      // Set the dependency
      doc.setIn([section, dependency.name], depValue);

      await fs.writeFile(filePath, doc.toString());

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Remove a dependency from pubspec.yaml
   */
  async removeDependency(
    filePath: string,
    packageName: string,
    isDev: boolean,
    options?: WriteOptions
  ): Promise<WriteResult> {
    try {
      if (options?.backup) {
        await this.createBackup(filePath);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const doc = YAML.parseDocument(content);

      const section = isDev ? 'dev_dependencies' : 'dependencies';
      doc.deleteIn([section, packageName]);

      await fs.writeFile(filePath, doc.toString());

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update a dependency version constraint
   */
  async updateVersion(
    filePath: string,
    packageName: string,
    newConstraint: string,
    options?: WriteOptions
  ): Promise<WriteResult> {
    try {
      if (options?.backup) {
        await this.createBackup(filePath);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const doc = YAML.parseDocument(content);

      // Check both dependencies and dev_dependencies
      const sections = ['dependencies', 'dev_dependencies'] as const;
      let found = false;

      for (const section of sections) {
        if (doc.hasIn([section, packageName])) {
          const current = doc.getIn([section, packageName]);

          // If current is a string, just replace with new constraint
          if (typeof current === 'string') {
            doc.setIn([section, packageName], newConstraint);
          } else if (typeof current === 'object' && current !== null) {
            // If it's an object with version, update the version
            doc.setIn([section, packageName, 'version'], newConstraint);
          }

          found = true;
          break;
        }
      }

      if (!found) {
        return {
          success: false,
          error: `Package '${packageName}' not found in pubspec.yaml`,
        };
      }

      await fs.writeFile(filePath, doc.toString());

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Batch update multiple dependency versions
   */
  async batchUpdateVersions(
    filePath: string,
    updates: Map<string, string>,
    options?: WriteOptions
  ): Promise<WriteResult> {
    try {
      if (options?.backup) {
        await this.createBackup(filePath);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const doc = YAML.parseDocument(content);

      const sections = ['dependencies', 'dev_dependencies'] as const;
      const notFound: string[] = [];

      for (const [packageName, newConstraint] of updates) {
        let found = false;

        for (const section of sections) {
          if (doc.hasIn([section, packageName])) {
            const current = doc.getIn([section, packageName]);

            if (typeof current === 'string') {
              doc.setIn([section, packageName], newConstraint);
            } else if (typeof current === 'object' && current !== null) {
              doc.setIn([section, packageName, 'version'], newConstraint);
            }

            found = true;
            break;
          }
        }

        if (!found) {
          notFound.push(packageName);
        }
      }

      await fs.writeFile(filePath, doc.toString());

      if (notFound.length > 0) {
        return {
          success: true,
          error: `Some packages not found: ${notFound.join(', ')}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update the package's own version
   */
  async updatePackageVersion(
    filePath: string,
    newVersion: string,
    options?: WriteOptions
  ): Promise<WriteResult> {
    try {
      if (options?.backup) {
        await this.createBackup(filePath);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const doc = YAML.parseDocument(content);

      doc.set('version', newVersion);

      await fs.writeFile(filePath, doc.toString());

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a backup of the manifest file
   */
  async createBackup(filePath: string): Promise<string> {
    const dir = path.dirname(filePath);
    const backupDir = path.join(dir, DEFAULTS.BACKUP_LOCATION);

    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `pubspec.yaml.${timestamp}.bak`);

    await fs.copyFile(filePath, backupPath);

    return backupPath;
  }

  /**
   * Restore manifest from a backup
   */
  async restoreFromBackup(filePath: string, backupPath: string): Promise<boolean> {
    try {
      await fs.copyFile(backupPath, filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build YAML value for a dependency based on its source
   */
  private buildDependencyValue(dep: IDependencyInfo): unknown {
    switch (dep.source) {
      case 'registry':
        return dep.constraint;

      case 'path':
        return { path: dep.path };

      case 'git':
        if (dep.gitRef) {
          return {
            git: {
              url: dep.gitUrl,
              ref: dep.gitRef,
            },
          };
        }
        return { git: dep.gitUrl };

      case 'sdk':
        return { sdk: dep.constraint };

      default:
        return dep.constraint;
    }
  }
}
