import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { MigrationPlan, MigrationResult, FileChange } from './types';
import { runCommand, getOutputChannel } from '../utils/processUtils';

/**
 * Executes migration plans
 */
export class MigrationExecutor {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Execute a migration plan
   */
  async execute(
    plan: MigrationPlan,
    options: { createBackup?: boolean; runPostCommands?: boolean } = {}
  ): Promise<MigrationResult> {
    const { createBackup = true, runPostCommands = true } = options;

    const result: MigrationResult = {
      success: false,
      modifiedFiles: [],
      errors: [],
    };

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine('');
    channel.appendLine('='.repeat(60));
    channel.appendLine('MIGRATION: Starting Pub Workspaces Migration');
    channel.appendLine('='.repeat(60));
    channel.appendLine('');

    // Step 1: Create backup
    if (createBackup) {
      try {
        result.backupPath = await this.createBackup(plan.changes);
        channel.appendLine(`Backup created: ${result.backupPath}`);
      } catch (error) {
        result.errors.push({
          file: 'backup',
          error: `Failed to create backup: ${error}`,
        });
        channel.appendLine(`ERROR: Failed to create backup: ${error}`);
        return result;
      }
    }

    // Step 2: Apply changes
    channel.appendLine('');
    channel.appendLine('Applying changes...');

    for (const change of plan.changes) {
      try {
        await this.applyChange(change);
        result.modifiedFiles.push(change.path);
        channel.appendLine(`  [${change.type.toUpperCase()}] ${change.relativePath}`);
      } catch (error) {
        result.errors.push({
          file: change.path,
          error: error instanceof Error ? error.message : String(error),
        });
        channel.appendLine(`  [ERROR] ${change.relativePath}: ${error}`);
      }
    }

    // Step 3: Run post-migration commands
    if (runPostCommands && plan.postMigrationCommands.length > 0) {
      channel.appendLine('');
      channel.appendLine('Running post-migration commands...');

      for (const command of plan.postMigrationCommands) {
        channel.appendLine(`  $ ${command}`);
        try {
          const cmdResult = await this.runCommand(command);
          if (cmdResult.exitCode !== 0) {
            channel.appendLine(`  [WARN] Command completed with exit code ${cmdResult.exitCode}`);
          }
        } catch (error) {
          channel.appendLine(`  [ERROR] ${error}`);
          result.errors.push({
            file: 'command',
            error: `Command failed: ${command}`,
          });
        }
      }
    }

    // Step 4: Validate
    channel.appendLine('');
    channel.appendLine('Validating migration...');

    result.validation = await this.validateMigration();
    channel.appendLine(`  Pub get: ${result.validation.pubGetSuccess ? 'SUCCESS' : 'FAILED'}`);
    channel.appendLine(`  Analyze: ${result.validation.analyzeSuccess ? 'SUCCESS' : 'FAILED'}`);
    if (result.validation.issueCount > 0) {
      channel.appendLine(`  Issues found: ${result.validation.issueCount}`);
    }

    // Determine overall success
    result.success = result.errors.length === 0 && result.validation.pubGetSuccess;

    channel.appendLine('');
    channel.appendLine('='.repeat(60));
    channel.appendLine(`MIGRATION: ${result.success ? 'COMPLETED SUCCESSFULLY' : 'COMPLETED WITH ISSUES'}`);
    channel.appendLine('='.repeat(60));
    channel.appendLine('');

    return result;
  }

  /**
   * Create backup of files to be modified
   */
  private async createBackup(changes: FileChange[]): Promise<string> {
    const config = vscode.workspace.getConfiguration('pubspecMaster');
    const backupLocation = config.get('sync.backupLocation', '.pubspec-master-backup');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.workspaceRoot, backupLocation, `migration-${timestamp}`);

    await fs.mkdir(backupDir, { recursive: true });

    for (const change of changes) {
      if (change.type === 'modify' || change.type === 'delete') {
        const backupPath = path.join(backupDir, change.relativePath);
        await fs.mkdir(path.dirname(backupPath), { recursive: true });

        try {
          await fs.copyFile(change.path, backupPath);
        } catch {
          // File might not exist (shouldn't happen for modify/delete)
        }
      }
    }

    return backupDir;
  }

  /**
   * Apply a single file change
   */
  private async applyChange(change: FileChange): Promise<void> {
    switch (change.type) {
      case 'create':
      case 'modify': {
        if (!change.newContent) {
          throw new Error('No content provided for create/modify operation');
        }
        await fs.mkdir(path.dirname(change.path), { recursive: true });

        // Atomic write: write to temp file then rename
        const tempPath = `${change.path}.tmp`;
        await fs.writeFile(tempPath, change.newContent, 'utf8');
        await fs.rename(tempPath, change.path);
        break;
      }

      case 'delete':
        try {
          await fs.unlink(change.path);
        } catch {
          // File might already be deleted
        }
        break;
    }
  }

  /**
   * Run a shell command
   */
  private async runCommand(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const [cmd, ...args] = command.split(' ');
    return runCommand(cmd, args, this.workspaceRoot);
  }

  /**
   * Validate migration was successful
   */
  private async validateMigration(): Promise<{
    pubGetSuccess: boolean;
    analyzeSuccess: boolean;
    issueCount: number;
  }> {
    let pubGetSuccess = false;
    let analyzeSuccess = false;
    let issueCount = 0;

    // Try pub get
    try {
      const pubGetResult = await this.runCommand('dart pub get');
      pubGetSuccess = pubGetResult.exitCode === 0;
    } catch {
      pubGetSuccess = false;
    }

    // Try analyze (non-blocking)
    try {
      const analyzeResult = await this.runCommand('dart analyze');
      analyzeSuccess = analyzeResult.exitCode === 0;

      // Parse issue count
      const match = analyzeResult.stdout.match(/(\d+) issues? found/i);
      if (match) {
        issueCount = parseInt(match[1], 10);
      }
    } catch {
      analyzeSuccess = false;
    }

    return { pubGetSuccess, analyzeSuccess, issueCount };
  }

  /**
   * Rollback to a backup
   */
  async rollback(backupPath: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine('');
    channel.appendLine('='.repeat(60));
    channel.appendLine('ROLLBACK: Restoring from backup');
    channel.appendLine('='.repeat(60));
    channel.appendLine(`Backup path: ${backupPath}`);
    channel.appendLine('');

    try {
      const files = await this.getFilesRecursively(backupPath);

      for (const backupFile of files) {
        const relativePath = path.relative(backupPath, backupFile);
        const originalPath = path.join(this.workspaceRoot, relativePath);

        try {
          await fs.mkdir(path.dirname(originalPath), { recursive: true });
          await fs.copyFile(backupFile, originalPath);
          channel.appendLine(`  [RESTORED] ${relativePath}`);
        } catch (error) {
          errors.push(`Failed to restore ${relativePath}: ${error}`);
          channel.appendLine(`  [ERROR] ${relativePath}: ${error}`);
        }
      }

      // Run pub get after rollback
      channel.appendLine('');
      channel.appendLine('Running dart pub get...');
      await this.runCommand('dart pub get');

    } catch (error) {
      errors.push(`Rollback failed: ${error}`);
    }

    channel.appendLine('');
    channel.appendLine('='.repeat(60));
    channel.appendLine(`ROLLBACK: ${errors.length === 0 ? 'COMPLETED' : 'COMPLETED WITH ERRORS'}`);
    channel.appendLine('='.repeat(60));
    channel.appendLine('');

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Get all files in directory recursively
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
}
