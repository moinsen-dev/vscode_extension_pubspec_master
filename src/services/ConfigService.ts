import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DEFAULTS } from '../constants';

/**
 * Configuration options for the extension
 */
export interface PubspecMasterConfig {
  // Scan settings
  scan?: {
    excludePatterns?: string[];
    maxDepth?: number;
  };

  // Dashboard settings
  dashboard?: {
    refreshOnSave?: boolean;
  };

  // Cache settings
  cache?: {
    ttlMinutes?: number;
    offlineMaxHours?: number;
  };

  // Sync settings
  sync?: {
    createBackup?: boolean;
    backupLocation?: string;
    ignoredPackages?: string[];
    ignoredDependencies?: string[];
    analyzeAfterFix?: boolean;
  };

  // Output settings
  output?: {
    showTerminal?: boolean;
  };

  // Version rules (per-dependency overrides)
  versionRules?: {
    [dependencyName: string]: {
      preferredVersion?: string;
      allowedVersions?: string[];
      excludeFromConflictCheck?: boolean;
    };
  };

  // Package groups (for batch operations)
  packageGroups?: {
    [groupName: string]: string[];
  };
}

const CONFIG_FILE_NAME = '.pubspec-master.json';

/**
 * Configuration service for per-workspace settings
 *
 * Loads configuration from:
 * 1. .pubspec-master.json in workspace root (highest priority)
 * 2. VS Code settings (fallback)
 */
export class ConfigService {
  private workspaceRoot: string;
  private cachedConfig: PubspecMasterConfig | null = null;
  private configWatcher?: vscode.FileSystemWatcher;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.setupConfigWatcher();
  }

  /**
   * Get the full configuration (merged from file and VS Code settings)
   */
  async getConfig(): Promise<PubspecMasterConfig> {
    const fileConfig = await this.loadConfigFile();
    const vscodeConfig = this.getVSCodeConfig();

    // Merge configurations (file config takes precedence)
    return this.mergeConfigs(vscodeConfig, fileConfig);
  }

  /**
   * Get a specific configuration value
   */
  async get<K extends keyof PubspecMasterConfig>(
    section: K
  ): Promise<PubspecMasterConfig[K] | undefined> {
    const config = await this.getConfig();
    return config[section];
  }

  /**
   * Check if workspace config file exists
   */
  async hasConfigFile(): Promise<boolean> {
    const configPath = path.join(this.workspaceRoot, CONFIG_FILE_NAME);
    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a default config file in the workspace
   */
  async createConfigFile(): Promise<void> {
    const configPath = path.join(this.workspaceRoot, CONFIG_FILE_NAME);
    const defaultConfig: PubspecMasterConfig = {
      scan: {
        excludePatterns: [
          '**/build/**',
          '**/.dart_tool/**',
          '**/ios/Pods/**',
          '**/android/.gradle/**',
        ],
        maxDepth: 10,
      },
      sync: {
        createBackup: true,
        backupLocation: DEFAULTS.BACKUP_LOCATION,
        ignoredPackages: [],
        ignoredDependencies: [],
      },
      packageGroups: {
        apps: [],
        packages: [],
        plugins: [],
      },
      versionRules: {},
    };

    await fs.writeFile(
      configPath,
      JSON.stringify(defaultConfig, null, 2),
      'utf-8'
    );

    vscode.window.showInformationMessage(
      `Moinsen: Created ${CONFIG_FILE_NAME} in workspace root`
    );
  }

  /**
   * Invalidate cached configuration
   */
  invalidateCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.configWatcher?.dispose();
  }

  /**
   * Load configuration from .pubspec-master.json file
   */
  private async loadConfigFile(): Promise<PubspecMasterConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const configPath = path.join(this.workspaceRoot, CONFIG_FILE_NAME);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as PubspecMasterConfig;
      this.cachedConfig = config;
      return config;
    } catch {
      // Config file doesn't exist or is invalid
      return {};
    }
  }

  /**
   * Get configuration from VS Code settings
   */
  private getVSCodeConfig(): PubspecMasterConfig {
    const vscodeConfig = vscode.workspace.getConfiguration('pubspecMaster');

    return {
      scan: {
        excludePatterns: vscodeConfig.get<string[]>('scan.excludePatterns'),
        maxDepth: vscodeConfig.get<number>('scan.maxDepth'),
      },
      dashboard: {
        refreshOnSave: vscodeConfig.get<boolean>('dashboard.refreshOnSave'),
      },
      cache: {
        ttlMinutes: vscodeConfig.get<number>('cache.ttlMinutes'),
        offlineMaxHours: vscodeConfig.get<number>('cache.offlineMaxHours'),
      },
      sync: {
        createBackup: vscodeConfig.get<boolean>('sync.createBackup'),
        backupLocation: vscodeConfig.get<string>('sync.backupLocation'),
        ignoredPackages: vscodeConfig.get<string[]>('sync.ignoredPackages'),
        ignoredDependencies: vscodeConfig.get<string[]>('sync.ignoredDependencies'),
        analyzeAfterFix: vscodeConfig.get<boolean>('sync.analyzeAfterFix'),
      },
      output: {
        showTerminal: vscodeConfig.get<boolean>('output.showTerminal'),
      },
    };
  }

  /**
   * Merge two configurations (source takes precedence over base)
   */
  private mergeConfigs(
    base: PubspecMasterConfig,
    source: PubspecMasterConfig
  ): PubspecMasterConfig {
    const result: PubspecMasterConfig = { ...base };

    if (source.scan) {
      result.scan = {
        ...result.scan,
        ...this.removeUndefined(source.scan),
      };
    }

    if (source.dashboard) {
      result.dashboard = {
        ...result.dashboard,
        ...this.removeUndefined(source.dashboard),
      };
    }

    if (source.cache) {
      result.cache = {
        ...result.cache,
        ...this.removeUndefined(source.cache),
      };
    }

    if (source.sync) {
      result.sync = {
        ...result.sync,
        ...this.removeUndefined(source.sync),
      };
    }

    if (source.output) {
      result.output = {
        ...result.output,
        ...this.removeUndefined(source.output),
      };
    }

    if (source.versionRules) {
      result.versionRules = {
        ...result.versionRules,
        ...source.versionRules,
      };
    }

    if (source.packageGroups) {
      result.packageGroups = {
        ...result.packageGroups,
        ...source.packageGroups,
      };
    }

    return result;
  }

  /**
   * Remove undefined values from an object
   */
  private removeUndefined<T extends object>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  }

  /**
   * Set up file watcher for config file changes
   */
  private setupConfigWatcher(): void {
    const configPattern = new vscode.RelativePattern(
      this.workspaceRoot,
      CONFIG_FILE_NAME
    );

    this.configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

    this.configWatcher.onDidChange(() => {
      this.invalidateCache();
      vscode.window.showInformationMessage('Moinsen config reloaded');
    });

    this.configWatcher.onDidCreate(() => {
      this.invalidateCache();
      vscode.window.showInformationMessage('Moinsen config loaded');
    });

    this.configWatcher.onDidDelete(() => {
      this.invalidateCache();
      vscode.window.showInformationMessage('Moinsen config removed');
    });
  }
}
