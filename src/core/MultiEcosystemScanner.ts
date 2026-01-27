import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ecosystemRegistry } from './EcosystemRegistry';
import { EcosystemType, IPackageInfo } from './interfaces';
import { DEFAULTS } from '../constants';

/**
 * Parse error information
 */
export interface PackageParseError {
  /** Path to the manifest file */
  path: string;
  /** Error message */
  message: string;
  /** Ecosystem that failed to parse */
  ecosystem?: EcosystemType;
}

/**
 * File change event for manifest files
 */
export interface ManifestChangeEvent {
  /** Type of change */
  type: 'created' | 'changed' | 'deleted';
  /** Path to the manifest file */
  path: string;
  /** Ecosystem of the manifest */
  ecosystem?: EcosystemType;
}

/**
 * Result of a multi-ecosystem workspace scan
 */
export interface MultiEcosystemScanResult {
  /** All discovered packages */
  packages: IPackageInfo[];
  /** Packages grouped by ecosystem */
  packagesByEcosystem: Map<EcosystemType, IPackageInfo[]>;
  /** Parse errors encountered */
  parseErrors: PackageParseError[];
  /** Detected ecosystems */
  ecosystems: EcosystemType[];
  /** Workspace roots per ecosystem */
  workspaceRoots: Map<EcosystemType, IPackageInfo | undefined>;
  /** Whether this is a monorepo (multiple packages) */
  isMonorepo: boolean;
  /** Whether this is a mixed-ecosystem monorepo */
  isMixedEcosystem: boolean;
  /** Scan duration in milliseconds */
  scanDurationMs: number;
  /** Monorepo tool detection */
  monorepoTools: {
    /** Pub Workspaces (Dart) */
    pubWorkspaces: boolean;
    /** Melos (Dart) */
    melos: boolean;
    /** npm/pnpm/yarn workspaces (Node.js) */
    nodeWorkspaces: boolean;
    /** uv workspaces (Python) */
    uvWorkspaces: boolean;
  };
}

/**
 * Multi-ecosystem scanner for discovering packages across different ecosystems
 *
 * Uses the EcosystemRegistry to determine which file patterns to search for
 * and which parsers to use.
 */
export class MultiEcosystemScanner implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private readonly onChangeEmitter = new vscode.EventEmitter<ManifestChangeEvent>();

  /** Event fired when a manifest file is created, changed, or deleted */
  readonly onDidChange = this.onChangeEmitter.event;

  /**
   * Scan workspace for all package manifest files across all ecosystems
   *
   * @param workspaceFolder - The workspace folder to scan
   * @param ecosystems - Optional filter for specific ecosystems (default: all registered)
   * @returns Scan result with all discovered packages
   */
  async scan(
    workspaceFolder: vscode.WorkspaceFolder,
    ecosystems?: EcosystemType[]
  ): Promise<MultiEcosystemScanResult> {
    const startTime = Date.now();

    // Get configuration
    const config = vscode.workspace.getConfiguration('pubspecMaster.scan');
    const excludePatterns = config.get<string[]>('excludePatterns', [...DEFAULTS.EXCLUDE_PATTERNS]);
    const maxDepth = config.get<number>('maxDepth', DEFAULTS.MAX_DEPTH);

    // Build exclude pattern
    const excludePattern = excludePatterns.length > 0
      ? `{${excludePatterns.join(',')}}`
      : undefined;

    // Get adapters to use
    const adapters = ecosystems
      ? ecosystems.map((e) => ecosystemRegistry.getAdapter(e)).filter(Boolean)
      : ecosystemRegistry.getAllAdapters();

    const packages: IPackageInfo[] = [];
    const parseErrors: PackageParseError[] = [];
    const packagesByEcosystem = new Map<EcosystemType, IPackageInfo[]>();
    const workspaceRoots = new Map<EcosystemType, IPackageInfo | undefined>();
    const detectedEcosystems = new Set<EcosystemType>();

    // Track seen paths to avoid duplicates
    const seenPaths = new Set<string>();

    // Scan for each ecosystem
    for (const adapter of adapters) {
      if (!adapter) continue;

      const ecosystemPackages: IPackageInfo[] = [];

      for (const manifestPattern of adapter.manifestPatterns) {
        const pattern = new vscode.RelativePattern(workspaceFolder, manifestPattern);
        const files = await vscode.workspace.findFiles(pattern, excludePattern);

        for (const file of files) {
          try {
            // Resolve to real path to detect duplicates
            const realPath = await this.getRealPath(file.fsPath);
            if (seenPaths.has(realPath)) {
              continue;
            }
            seenPaths.add(realPath);

            // Check depth limit
            const relativePath = path.relative(workspaceFolder.uri.fsPath, file.fsPath);
            const depth = relativePath.split(path.sep).length - 1;
            if (depth > maxDepth) {
              continue;
            }

            // Parse with the appropriate parser
            const pkg = await adapter.parser.parse(file.fsPath);
            packages.push(pkg);
            ecosystemPackages.push(pkg);
            detectedEcosystems.add(adapter.type);

            // Detect workspace root
            if (pkg.isWorkspaceRoot && !workspaceRoots.has(adapter.type)) {
              workspaceRoots.set(adapter.type, pkg);
            }
          } catch (error) {
            parseErrors.push({
              path: file.fsPath,
              message: error instanceof Error ? error.message : String(error),
              ecosystem: adapter.type,
            });
          }
        }
      }

      packagesByEcosystem.set(adapter.type, ecosystemPackages);
    }

    // Detect monorepo tools
    const monorepoTools = await this.detectMonorepoTools(workspaceFolder);

    const scanDurationMs = Date.now() - startTime;
    const ecosystemArray = Array.from(detectedEcosystems);

    return {
      packages,
      packagesByEcosystem,
      parseErrors,
      ecosystems: ecosystemArray,
      workspaceRoots,
      isMonorepo: packages.length > 1,
      isMixedEcosystem: ecosystemArray.length > 1,
      scanDurationMs,
      monorepoTools,
    };
  }

  /**
   * Detect monorepo management tools
   */
  private async detectMonorepoTools(
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<MultiEcosystemScanResult['monorepoTools']> {
    const result = {
      pubWorkspaces: false,
      melos: false,
      nodeWorkspaces: false,
      uvWorkspaces: false,
    };

    // Check for melos.yaml (Dart)
    const melosFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, 'melos.yaml'),
      undefined,
      1
    );
    result.melos = melosFiles.length > 0;

    // Check for pub workspaces (Dart) - detected via pubspec.yaml workspace field
    const rootPubspec = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, 'pubspec.yaml'),
      undefined,
      1
    );
    if (rootPubspec.length > 0) {
      try {
        const content = await fs.readFile(rootPubspec[0].fsPath, 'utf8');
        result.pubWorkspaces = content.includes('workspace:');
      } catch {
        // Ignore read errors
      }
    }

    // Check for package.json workspaces (Node.js)
    const rootPackageJson = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, 'package.json'),
      undefined,
      1
    );
    if (rootPackageJson.length > 0) {
      try {
        const content = await fs.readFile(rootPackageJson[0].fsPath, 'utf8');
        const parsed = JSON.parse(content);
        result.nodeWorkspaces = !!parsed.workspaces;
      } catch {
        // Ignore parse errors
      }
    }

    // Check for pnpm-workspace.yaml (Node.js)
    const pnpmWorkspace = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, 'pnpm-workspace.yaml'),
      undefined,
      1
    );
    if (pnpmWorkspace.length > 0) {
      result.nodeWorkspaces = true;
    }

    // Check for uv.lock or uv.toml (Python)
    const uvFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '{uv.lock,uv.toml}'),
      undefined,
      1
    );
    if (uvFiles.length > 0) {
      result.uvWorkspaces = true;
    }

    return result;
  }

  /**
   * Start watching for manifest file changes across all ecosystems
   */
  startWatching(ecosystems?: EcosystemType[]): void {
    this.stopWatching();

    const adapters = ecosystems
      ? ecosystems.map((e) => ecosystemRegistry.getAdapter(e)).filter(Boolean)
      : ecosystemRegistry.getAllAdapters();

    for (const adapter of adapters) {
      if (!adapter) continue;

      for (const pattern of adapter.manifestPatterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate((uri) => {
          this.onChangeEmitter.fire({
            type: 'created',
            path: uri.fsPath,
            ecosystem: adapter.type,
          });
        });

        watcher.onDidChange((uri) => {
          this.onChangeEmitter.fire({
            type: 'changed',
            path: uri.fsPath,
            ecosystem: adapter.type,
          });
        });

        watcher.onDidDelete((uri) => {
          this.onChangeEmitter.fire({
            type: 'deleted',
            path: uri.fsPath,
            ecosystem: adapter.type,
          });
        });

        this.watchers.push(watcher);
      }
    }
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
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
      return filePath;
    }
  }
}
