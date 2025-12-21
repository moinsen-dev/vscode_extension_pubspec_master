import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceScanner } from '../core/WorkspaceScanner';
import {
  PubspecInfo,
  DependencyInfo,
  WorkspaceScanResult,
} from '../types';

/**
 * Base tree item for the dashboard
 */
export abstract class DashboardTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

/**
 * Tree item representing a package
 */
export class PackageTreeItem extends DashboardTreeItem {
  constructor(public readonly pubspec: PubspecInfo) {
    super(pubspec.name, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = this.getDescription();
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();
    this.contextValue = 'package';

    // Click to open pubspec.yaml
    this.command = {
      command: 'pubspecMaster.openPubspec',
      title: 'Open pubspec.yaml',
      arguments: [pubspec.path],
    };
  }

  private getDescription(): string {
    const parts: string[] = [];
    parts.push(this.getTypeLabel());
    if (this.pubspec.sdkConstraint) {
      parts.push(`SDK ${this.pubspec.sdkConstraint}`);
    }
    if (this.pubspec.isWorkspacePackage) {
      parts.push('workspace');
    }
    return parts.join(' | ');
  }

  private getTypeLabel(): string {
    switch (this.pubspec.type) {
      case 'flutter_app':
        return 'Flutter App';
      case 'flutter_plugin':
        return 'Plugin';
      case 'dart_package':
        return 'Package';
    }
  }

  private getTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${this.pubspec.name}**\n\n`);

    if (this.pubspec.description) {
      md.appendMarkdown(`${this.pubspec.description}\n\n`);
    }

    md.appendMarkdown(`- **Type:** ${this.getTypeLabel()}\n`);
    md.appendMarkdown(`- **Path:** \`${this.pubspec.directory}\`\n`);

    if (this.pubspec.version) {
      md.appendMarkdown(`- **Version:** ${this.pubspec.version}\n`);
    }

    if (this.pubspec.sdkConstraint) {
      md.appendMarkdown(`- **SDK:** ${this.pubspec.sdkConstraint}\n`);
    }

    const depCount = this.pubspec.dependencies.size + this.pubspec.devDependencies.size;
    md.appendMarkdown(`- **Dependencies:** ${depCount}\n`);

    if (this.pubspec.isWorkspacePackage) {
      md.appendMarkdown(`- **Resolution:** workspace\n`);
    }

    return md;
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.pubspec.type) {
      case 'flutter_app':
        return new vscode.ThemeIcon('device-mobile', new vscode.ThemeColor('charts.blue'));
      case 'flutter_plugin':
        return new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.purple'));
      case 'dart_package':
        return new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.green'));
    }
  }
}

/**
 * Tree item for dependency group (dependencies / dev_dependencies)
 */
export class DependencyGroupTreeItem extends DashboardTreeItem {
  constructor(
    public readonly pubspec: PubspecInfo,
    public readonly isDev: boolean
  ) {
    const deps = isDev ? pubspec.devDependencies : pubspec.dependencies;
    const label = isDev ? 'dev_dependencies' : 'dependencies';

    super(
      `${label} (${deps.size})`,
      deps.size > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.iconPath = new vscode.ThemeIcon(isDev ? 'tools' : 'library');
    this.contextValue = 'dependencyGroup';
  }
}

/**
 * Tree item for a single dependency
 */
export class DependencyTreeItem extends DashboardTreeItem {
  constructor(public readonly dependency: DependencyInfo) {
    super(dependency.name, vscode.TreeItemCollapsibleState.None);

    this.description = dependency.constraint;
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();
    this.contextValue = 'dependency';
  }

  private getTooltip(): string {
    switch (this.dependency.source) {
      case 'path':
        return `Path: ${this.dependency.path}`;
      case 'git':
        return `Git: ${this.dependency.gitUrl}${this.dependency.gitRef ? ` (${this.dependency.gitRef})` : ''}`;
      case 'sdk':
        return `SDK: ${this.dependency.constraint}`;
      default:
        return `pub.dev: ${this.dependency.constraint}`;
    }
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.dependency.source) {
      case 'path':
        return new vscode.ThemeIcon('folder');
      case 'git':
        return new vscode.ThemeIcon('git-branch');
      case 'sdk':
        return new vscode.ThemeIcon('symbol-namespace');
      default:
        return new vscode.ThemeIcon('cloud');
    }
  }
}

/**
 * TreeDataProvider for the Pubspec Master dashboard
 */
export class DashboardProvider
  implements vscode.TreeDataProvider<DashboardTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    DashboardTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly scanner: WorkspaceScanner;
  private packages: PubspecInfo[] = [];
  private scanResult?: WorkspaceScanResult;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.scanner = new WorkspaceScanner();

    // Set up file watching
    this.scanner.startWatching();
    this.disposables.push(
      this.scanner.onDidChange(() => this.onFileChange())
    );

    // Initial scan
    this.refresh();
  }

  /**
   * Refresh the tree view by rescanning the workspace
   */
  async refresh(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.packages = [];
      this.scanResult = undefined;
      this._onDidChangeTreeData.fire();
      return;
    }

    try {
      // For now, scan only the first workspace folder
      // Future: support multi-root workspaces
      this.scanResult = await this.scanner.scan(workspaceFolders[0]);
      this.packages = this.scanResult.packages;

      // Report parse errors as warnings
      for (const error of this.scanResult.parseErrors) {
        const fileName = path.basename(path.dirname(error.path));
        vscode.window.showWarningMessage(
          `Moinsen: Failed to parse ${fileName}/pubspec.yaml: ${error.message}`
        );
      }

      // Log scan summary
      console.log(
        `Moinsen Pubspec Master: Scanned ${this.packages.length} packages in ${this.scanResult.scanDurationMs}ms`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Moinsen: Failed to scan workspace: ${error instanceof Error ? error.message : String(error)}`
      );
      this.packages = [];
    }

    this._onDidChangeTreeData.fire();
  }

  /**
   * Handle file changes with debouncing
   */
  private onFileChange(): void {
    const config = vscode.workspace.getConfiguration('pubspecMaster.dashboard');
    if (!config.get<boolean>('refreshOnSave', true)) {
      return;
    }

    // Debounce refreshes (500ms as per PRD)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.refresh();
    }, 500);
  }

  /**
   * Get a tree item for an element
   */
  getTreeItem(element: DashboardTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for an element (or root)
   */
  getChildren(
    element?: DashboardTreeItem
  ): vscode.ProviderResult<DashboardTreeItem[]> {
    if (!element) {
      // Root level: return packages sorted by name
      return this.packages
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((pkg) => new PackageTreeItem(pkg));
    }

    if (element instanceof PackageTreeItem) {
      // Package level: return dependency groups
      const items: DashboardTreeItem[] = [];

      if (element.pubspec.dependencies.size > 0) {
        items.push(new DependencyGroupTreeItem(element.pubspec, false));
      }
      if (element.pubspec.devDependencies.size > 0) {
        items.push(new DependencyGroupTreeItem(element.pubspec, true));
      }

      return items;
    }

    if (element instanceof DependencyGroupTreeItem) {
      // Dependency group level: return individual dependencies
      const deps = element.isDev
        ? element.pubspec.devDependencies
        : element.pubspec.dependencies;

      return Array.from(deps.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((dep) => new DependencyTreeItem(dep));
    }

    return [];
  }

  /**
   * Get packages list for commands
   */
  getPackages(): PubspecInfo[] {
    return this.packages;
  }

  /**
   * Get the last scan result
   */
  getScanResult(): WorkspaceScanResult | undefined {
    return this.scanResult;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.scanner.dispose();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this._onDidChangeTreeData.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
