import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';
import * as vscode from 'vscode';
import { PubspecInfo } from '../types';
import { VersionConflict, SdkMismatch } from '../core/VersionAnalyzer';
import { runFlutterAnalyze, getOutputChannel } from '../utils/processUtils';
import { DEFAULTS } from '../constants';

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Whether all updates succeeded */
  success: boolean;
  /** List of files that were updated */
  filesUpdated: string[];
  /** List of errors encountered */
  errors: Array<{ file: string; error: string }>;
  /** Path to backup directory if backup was created */
  backupPath?: string;
}

/**
 * Options for sync operations
 */
export interface SyncOptions {
  /** Whether to create a backup before modifying files */
  createBackup?: boolean;
  /** Directory for backups (relative to workspace root) */
  backupLocation?: string;
  /** Whether to show confirmation dialog */
  showConfirmation?: boolean;
  /** Whether to run flutter analyze after applying fixes */
  analyzeAfterFix?: boolean;
}

/**
 * Result of an analyze operation
 */
export interface AnalyzeResult {
  success: boolean;
  issueCount: number;
  output: string;
}

/**
 * Service for applying version synchronization fixes to pubspec.yaml files
 */
export class VersionSyncService {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Fix a single version conflict by updating all affected pubspec.yaml files
   */
  async fixConflict(
    conflict: VersionConflict,
    pubspecs: PubspecInfo[],
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      createBackup = true,
      backupLocation = DEFAULTS.BACKUP_LOCATION,
    } = this.getOptionsWithDefaults(options);

    if (!conflict.suggestedResolution) {
      return {
        success: false,
        filesUpdated: [],
        errors: [{ file: '', error: 'No suggested resolution available for this conflict' }],
      };
    }

    // Collect all files that need to be updated
    const filesToUpdate: Array<{
      pubspecPath: string;
      depName: string;
      newConstraint: string;
      isDev: boolean;
    }> = [];

    for (const pkg of conflict.packages) {
      const pubspec = pubspecs.find((p) => p.name === pkg.packageName);
      if (!pubspec) {
        continue;
      }

      // Validate path is within workspace
      if (!this.isPathWithinWorkspace(pubspec.path)) {
        return {
          success: false,
          filesUpdated: [],
          errors: [{ file: pubspec.path, error: 'File path is outside workspace' }],
        };
      }

      filesToUpdate.push({
        pubspecPath: pubspec.path,
        depName: conflict.dependencyName,
        newConstraint: conflict.suggestedResolution,
        isDev: pkg.isDev,
      });
    }

    if (filesToUpdate.length === 0) {
      return {
        success: false,
        filesUpdated: [],
        errors: [{ file: '', error: 'No files found to update' }],
      };
    }

    // Create backup if enabled
    let backupPath: string | undefined;
    if (createBackup) {
      try {
        backupPath = await this.createBackup(
          filesToUpdate.map((f) => f.pubspecPath),
          backupLocation
        );
      } catch (error) {
        return {
          success: false,
          filesUpdated: [],
          errors: [{ file: '', error: `Failed to create backup: ${error}` }],
        };
      }
    }

    // Apply updates
    const result: SyncResult = {
      success: true,
      filesUpdated: [],
      errors: [],
      backupPath,
    };

    for (const update of filesToUpdate) {
      try {
        await this.updatePubspec(
          update.pubspecPath,
          update.depName,
          update.newConstraint,
          update.isDev
        );
        result.filesUpdated.push(update.pubspecPath);
      } catch (error) {
        result.success = false;
        result.errors.push({
          file: update.pubspecPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Fix an SDK constraint mismatch by updating all affected pubspec.yaml files
   */
  async fixSdkMismatch(
    mismatch: SdkMismatch,
    pubspecs: PubspecInfo[],
    targetConstraint: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      createBackup = true,
      backupLocation = DEFAULTS.BACKUP_LOCATION,
    } = this.getOptionsWithDefaults(options);

    // Collect all files that need to be updated
    const filesToUpdate: Array<{ pubspecPath: string; newConstraint: string }> = [];

    for (const pkg of mismatch.packages) {
      // Skip packages that already have the target constraint
      if (pkg.constraint === targetConstraint) {
        continue;
      }

      const pubspec = pubspecs.find((p) => p.name === pkg.packageName);
      if (!pubspec) {
        continue;
      }

      if (!this.isPathWithinWorkspace(pubspec.path)) {
        return {
          success: false,
          filesUpdated: [],
          errors: [{ file: pubspec.path, error: 'File path is outside workspace' }],
        };
      }

      filesToUpdate.push({
        pubspecPath: pubspec.path,
        newConstraint: targetConstraint,
      });
    }

    if (filesToUpdate.length === 0) {
      return {
        success: true,
        filesUpdated: [],
        errors: [],
      };
    }

    // Create backup if enabled
    let backupPath: string | undefined;
    if (createBackup) {
      try {
        backupPath = await this.createBackup(
          filesToUpdate.map((f) => f.pubspecPath),
          backupLocation
        );
      } catch (error) {
        return {
          success: false,
          filesUpdated: [],
          errors: [{ file: '', error: `Failed to create backup: ${error}` }],
        };
      }
    }

    // Apply updates
    const result: SyncResult = {
      success: true,
      filesUpdated: [],
      errors: [],
      backupPath,
    };

    for (const update of filesToUpdate) {
      try {
        await this.updateSdkConstraint(update.pubspecPath, update.newConstraint);
        result.filesUpdated.push(update.pubspecPath);
      } catch (error) {
        result.success = false;
        result.errors.push({
          file: update.pubspecPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Fix all version conflicts at once
   */
  async syncAll(
    conflicts: VersionConflict[],
    pubspecs: PubspecInfo[],
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      createBackup = true,
      backupLocation = DEFAULTS.BACKUP_LOCATION,
    } = this.getOptionsWithDefaults(options);

    // Filter to conflicts that have resolutions
    const fixableConflicts = conflicts.filter((c) => c.suggestedResolution);

    if (fixableConflicts.length === 0) {
      return {
        success: true,
        filesUpdated: [],
        errors: [],
      };
    }

    // Collect all unique files that need updates
    const allFilesToUpdate = new Set<string>();
    for (const conflict of fixableConflicts) {
      for (const pkg of conflict.packages) {
        const pubspec = pubspecs.find((p) => p.name === pkg.packageName);
        if (pubspec && this.isPathWithinWorkspace(pubspec.path)) {
          allFilesToUpdate.add(pubspec.path);
        }
      }
    }

    // Create single backup for all files
    let backupPath: string | undefined;
    if (createBackup && allFilesToUpdate.size > 0) {
      try {
        backupPath = await this.createBackup(
          Array.from(allFilesToUpdate),
          backupLocation
        );
      } catch (error) {
        return {
          success: false,
          filesUpdated: [],
          errors: [{ file: '', error: `Failed to create backup: ${error}` }],
        };
      }
    }

    // Apply all fixes
    const result: SyncResult = {
      success: true,
      filesUpdated: [],
      errors: [],
      backupPath,
    };

    for (const conflict of fixableConflicts) {
      const singleResult = await this.fixConflict(conflict, pubspecs, {
        createBackup: false, // Already created backup above
      });

      // Merge results
      result.filesUpdated.push(...singleResult.filesUpdated);
      result.errors.push(...singleResult.errors);
      if (!singleResult.success) {
        result.success = false;
      }
    }

    // Deduplicate files updated
    result.filesUpdated = [...new Set(result.filesUpdated)];

    return result;
  }

  /**
   * Create a backup of files before modification
   */
  private async createBackup(files: string[], backupLocation: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.workspaceRoot, backupLocation, timestamp);

    await fs.mkdir(backupDir, { recursive: true });

    for (const filePath of files) {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const backupFilePath = path.join(backupDir, relativePath);

      // Create subdirectories if needed
      await fs.mkdir(path.dirname(backupFilePath), { recursive: true });

      // Copy file to backup
      await fs.copyFile(filePath, backupFilePath);
    }

    return backupDir;
  }

  /**
   * Update a dependency constraint in a pubspec.yaml file
   */
  private async updatePubspec(
    filePath: string,
    depName: string,
    newConstraint: string,
    isDev: boolean
  ): Promise<void> {
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');

    // Parse with document mode to preserve comments and formatting
    const doc = YAML.parseDocument(content);

    // Get the appropriate dependencies section
    const section = isDev ? 'dev_dependencies' : 'dependencies';
    const deps = doc.get(section) as YAML.YAMLMap | undefined;

    if (!deps) {
      throw new Error(`No ${section} section found in ${filePath}`);
    }

    // Check if the dependency exists
    if (!deps.has(depName)) {
      throw new Error(`Dependency '${depName}' not found in ${section} of ${filePath}`);
    }

    // Get the current value
    const currentValue = deps.get(depName);

    // Update based on the type of the current value
    if (typeof currentValue === 'string' || currentValue === null) {
      // Simple version constraint - just update it
      deps.set(depName, newConstraint);
    } else if (YAML.isMap(currentValue)) {
      // Complex dependency (hosted, git, etc.) - update version field if present
      if (currentValue.has('version')) {
        currentValue.set('version', newConstraint);
      } else {
        // Convert to simple constraint if it was a hosted dependency without explicit version
        deps.set(depName, newConstraint);
      }
    }

    // Write back with preserved formatting
    const newContent = doc.toString();

    // Atomic write: write to temp file then rename
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, newContent, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * Update SDK constraint in environment section
   */
  private async updateSdkConstraint(filePath: string, newConstraint: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf8');
    const doc = YAML.parseDocument(content);

    const environment = doc.get('environment') as YAML.YAMLMap | undefined;
    if (!environment) {
      throw new Error(`No environment section found in ${filePath}`);
    }

    environment.set('sdk', newConstraint);

    const newContent = doc.toString();
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, newContent, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * Check if a path is within the workspace root
   */
  private isPathWithinWorkspace(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const workspaceResolved = path.resolve(this.workspaceRoot);
    return resolved.startsWith(workspaceResolved + path.sep);
  }

  /**
   * Get options with defaults from VS Code configuration
   */
  private getOptionsWithDefaults(options: SyncOptions): SyncOptions {
    const config = vscode.workspace.getConfiguration('pubspecMaster');

    return {
      createBackup: options.createBackup ?? config.get('sync.createBackup', true),
      backupLocation: options.backupLocation ?? config.get('sync.backupLocation', DEFAULTS.BACKUP_LOCATION),
      showConfirmation: options.showConfirmation ?? true,
    };
  }

  /**
   * Restore files from a backup
   */
  async restoreFromBackup(backupPath: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      filesUpdated: [],
      errors: [],
    };

    try {
      const files = await this.getFilesRecursively(backupPath);

      for (const backupFile of files) {
        const relativePath = path.relative(backupPath, backupFile);
        const originalPath = path.join(this.workspaceRoot, relativePath);

        try {
          await fs.copyFile(backupFile, originalPath);
          result.filesUpdated.push(originalPath);
        } catch (error) {
          result.success = false;
          result.errors.push({
            file: originalPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        file: backupPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * Get all files in a directory recursively
   */
  private async getFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.getFilesRecursively(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Run flutter analyze in the workspace
   */
  async analyzeWorkspace(): Promise<AnalyzeResult> {
    const channel = getOutputChannel();
    channel.show(true);

    const result = await runFlutterAnalyze(this.workspaceRoot);

    // Count issues from output
    let issueCount = 0;
    const issueMatch = result.stdout.match(/(\d+) issues? found/i);
    if (issueMatch) {
      issueCount = parseInt(issueMatch[1], 10);
    }

    return {
      success: result.exitCode === 0,
      issueCount,
      output: result.stdout + result.stderr,
    };
  }

  /**
   * Get list of available backups
   */
  async getAvailableBackups(
    backupLocation: string = '.pubspec-master-backup'
  ): Promise<Array<{ path: string; timestamp: string; fileCount: number }>> {
    const backupDir = path.join(this.workspaceRoot, backupLocation);

    try {
      const entries = await fs.readdir(backupDir, { withFileTypes: true });
      const backups: Array<{ path: string; timestamp: string; fileCount: number }> = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const backupPath = path.join(backupDir, entry.name);
          const files = await this.getFilesRecursively(backupPath);
          backups.push({
            path: backupPath,
            timestamp: entry.name,
            fileCount: files.length,
          });
        }
      }

      // Sort by timestamp descending (most recent first)
      backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return backups;
    } catch {
      // Backup directory doesn't exist or is inaccessible
      return [];
    }
  }

  /**
   * Update a dependency version across all packages that use it
   */
  async updateDependencyVersion(
    dependencyName: string,
    newVersion: string,
    pubspecs: PubspecInfo[],
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      createBackup = true,
      backupLocation = DEFAULTS.BACKUP_LOCATION,
    } = this.getOptionsWithDefaults(options);

    // Find all packages that use this dependency
    const filesToUpdate: Array<{
      pubspecPath: string;
      isDev: boolean;
    }> = [];

    for (const pubspec of pubspecs) {
      if (!this.isPathWithinWorkspace(pubspec.path)) {
        continue;
      }

      if (pubspec.dependencies.has(dependencyName)) {
        const depInfo = pubspec.dependencies.get(dependencyName)!;
        // Only update pub.dev dependencies
        if (depInfo.source === 'pub.dev') {
          filesToUpdate.push({
            pubspecPath: pubspec.path,
            isDev: false,
          });
        }
      }

      if (pubspec.devDependencies.has(dependencyName)) {
        const depInfo = pubspec.devDependencies.get(dependencyName)!;
        if (depInfo.source === 'pub.dev') {
          filesToUpdate.push({
            pubspecPath: pubspec.path,
            isDev: true,
          });
        }
      }
    }

    if (filesToUpdate.length === 0) {
      return {
        success: true,
        filesUpdated: [],
        errors: [],
      };
    }

    // Create backup if enabled
    let backupPath: string | undefined;
    if (createBackup) {
      try {
        backupPath = await this.createBackup(
          filesToUpdate.map((f) => f.pubspecPath),
          backupLocation
        );
      } catch (error) {
        return {
          success: false,
          filesUpdated: [],
          errors: [{ file: '', error: `Failed to create backup: ${error}` }],
        };
      }
    }

    // Apply updates
    const result: SyncResult = {
      success: true,
      filesUpdated: [],
      errors: [],
      backupPath,
    };

    for (const update of filesToUpdate) {
      try {
        await this.updatePubspec(
          update.pubspecPath,
          dependencyName,
          newVersion,
          update.isDev
        );
        result.filesUpdated.push(update.pubspecPath);
      } catch (error) {
        result.success = false;
        result.errors.push({
          file: update.pubspecPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupPath: string): Promise<void> {
    // Validate path is within workspace backup directory
    const backupLocation = vscode.workspace.getConfiguration('pubspecMaster').get('sync.backupLocation', '.pubspec-master-backup');
    const expectedPrefix = path.join(this.workspaceRoot, backupLocation);

    if (!backupPath.startsWith(expectedPrefix)) {
      throw new Error('Invalid backup path');
    }

    await fs.rm(backupPath, { recursive: true, force: true });
  }
}
