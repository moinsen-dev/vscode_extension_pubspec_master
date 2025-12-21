import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PubspecParser } from './PubspecParser';
import {
  PubspecInfo,
  WorkspaceScanResult,
  FileChangeEvent,
  PubspecParseError,
} from '../types';

/**
 * Scanner for discovering and watching pubspec.yaml files in a workspace
 *
 * Handles recursive discovery of packages, respects exclude patterns,
 * and provides file watching for real-time updates.
 */
export class WorkspaceScanner implements vscode.Disposable {
  private readonly parser: PubspecParser;
  private watcher?: vscode.FileSystemWatcher;
  private readonly onChangeEmitter = new vscode.EventEmitter<FileChangeEvent>();

  /** Event fired when a pubspec.yaml file is created, changed, or deleted */
  readonly onDidChange = this.onChangeEmitter.event;

  constructor() {
    this.parser = new PubspecParser();
  }

  /**
   * Scan workspace for all pubspec.yaml files
   *
   * @param workspaceFolder - The workspace folder to scan
   * @returns Scan result with all discovered packages and metadata
   */
  async scan(workspaceFolder: vscode.WorkspaceFolder): Promise<WorkspaceScanResult> {
    const startTime = Date.now();

    // Get configuration
    const config = vscode.workspace.getConfiguration('pubspecMaster.scan');
    const excludePatterns = config.get<string[]>('excludePatterns', [
      '**/build/**',
      '**/.dart_tool/**',
      '**/ios/Pods/**',
      '**/android/.gradle/**',
      '**/test/fixtures/**',
    ]);
    const maxDepth = config.get<number>('maxDepth', 10);

    // Build exclude pattern for findFiles
    const excludePattern = excludePatterns.length > 0
      ? `{${excludePatterns.join(',')}}`
      : undefined;

    // Find all pubspec.yaml files
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/pubspec.yaml');
    const files = await vscode.workspace.findFiles(pattern, excludePattern);

    const packages: PubspecInfo[] = [];
    const parseErrors: PubspecParseError[] = [];
    let rootPubspec: PubspecInfo | undefined;

    // Track seen paths to avoid duplicates (can happen with symlinks or worktrees)
    const seenPaths = new Set<string>();

    // Parse each file
    for (const file of files) {
      try {
        // Resolve to real path to detect duplicates from symlinks
        const realPath = await this.getRealPath(file.fsPath);

        // Skip if we've already processed this file
        if (seenPaths.has(realPath)) {
          continue;
        }
        seenPaths.add(realPath);

        // Check depth limit
        const relativePath = path.relative(workspaceFolder.uri.fsPath, file.fsPath);
        const depth = relativePath.split(path.sep).length - 1; // -1 because pubspec.yaml itself is a level
        if (depth > maxDepth) {
          continue;
        }

        const pubspec = await this.parser.parse(file.fsPath);
        packages.push(pubspec);

        // Detect root workspace pubspec (has workspace: [...] field)
        if (pubspec.workspacePackages && pubspec.workspacePackages.length > 0) {
          rootPubspec = pubspec;
        }
      } catch (error) {
        parseErrors.push({
          path: file.fsPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Check for melos.yaml
    const melosFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, 'melos.yaml'),
      undefined,
      1
    );

    const scanDurationMs = Date.now() - startTime;

    return {
      rootPubspec,
      packages,
      parseErrors,
      isMonorepo: packages.length > 1,
      usesPubWorkspaces: rootPubspec?.workspacePackages !== undefined,
      usesMelos: melosFiles.length > 0,
      scanDurationMs,
    };
  }

  /**
   * Start watching for pubspec.yaml file changes
   *
   * Events are emitted via the onDidChange event.
   */
  startWatching(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = vscode.workspace.createFileSystemWatcher('**/pubspec.yaml');

    this.watcher.onDidCreate((uri) => {
      this.onChangeEmitter.fire({ type: 'created', path: uri.fsPath });
    });

    this.watcher.onDidChange((uri) => {
      this.onChangeEmitter.fire({ type: 'changed', path: uri.fsPath });
    });

    this.watcher.onDidDelete((uri) => {
      this.onChangeEmitter.fire({ type: 'deleted', path: uri.fsPath });
    });
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopWatching();
    this.onChangeEmitter.dispose();
  }

  /**
   * Get the real path of a file, resolving symlinks
   */
  private async getRealPath(filePath: string): Promise<string> {
    try {
      return await fs.realpath(filePath);
    } catch {
      // If realpath fails, return the original path
      return filePath;
    }
  }
}
