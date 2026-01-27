import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceScanner } from '../core/WorkspaceScanner';
import {
  PubspecInfo,
  DependencyInfo,
  WorkspaceScanResult,
} from '../types';

/**
 * View mode for the dashboard tree
 */
export type ViewMode = 'hierarchical' | 'logical';

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
 * Tree item representing a folder group in hierarchical view
 */
export class FolderGroupTreeItem extends DashboardTreeItem {
  constructor(
    public readonly folderPath: string,
    public readonly relativePath: string,
    public readonly displayName: string,
    public readonly childPackages: PubspecInfo[],
    public readonly childFolders: string[]
  ) {
    super(displayName, vscode.TreeItemCollapsibleState.Expanded);

    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'folderGroup';

    const packageCount = childPackages.length;
    const folderCount = childFolders.length;
    const parts: string[] = [];
    if (packageCount > 0) {parts.push(`${packageCount} package${packageCount !== 1 ? 's' : ''}`);}
    if (folderCount > 0) {parts.push(`${folderCount} folder${folderCount !== 1 ? 's' : ''}`);}
    this.description = parts.join(', ');

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${relativePath}**\n\n`);
    this.tooltip.appendMarkdown(`- Packages: ${packageCount}\n`);
    this.tooltip.appendMarkdown(`- Subfolders: ${folderCount}\n`);
  }
}

/**
 * Tree item representing the Apps category in logical view
 */
export class AppsCategoryTreeItem extends DashboardTreeItem {
  constructor(public readonly apps: PubspecInfo[]) {
    super('Apps', vscode.TreeItemCollapsibleState.Expanded);

    this.iconPath = new vscode.ThemeIcon('device-mobile', new vscode.ThemeColor('charts.blue'));
    this.contextValue = 'appsCategory';
    this.description = `${apps.length} app${apps.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Tree item representing the Packages category in logical view
 */
export class PackagesCategoryTreeItem extends DashboardTreeItem {
  constructor(public readonly packages: PubspecInfo[]) {
    super('Packages', vscode.TreeItemCollapsibleState.Expanded);

    this.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.green'));
    this.contextValue = 'packagesCategory';
    this.description = `${packages.length} package${packages.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Tree item representing a package
 */
export class PackageTreeItem extends DashboardTreeItem {
  constructor(
    public readonly pubspec: PubspecInfo,
    private readonly showRelativePath: boolean = false,
    private readonly workspaceRoot?: string
  ) {
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

    // Show relative path first if in logical view mode
    if (this.showRelativePath && this.workspaceRoot) {
      const relativePath = path.relative(this.workspaceRoot, this.pubspec.directory);
      const shortPath = this.getShortPath(relativePath);
      if (shortPath) {
        parts.push(shortPath);
      }
    }

    parts.push(this.getTypeLabel());
    if (this.pubspec.sdkConstraint) {
      parts.push(`SDK ${this.pubspec.sdkConstraint}`);
    }
    if (this.pubspec.isWorkspacePackage) {
      parts.push('workspace');
    }
    return parts.join(' | ');
  }

  private getShortPath(relativePath: string): string {
    // Get the top-level folder (e.g., "example" from "example/apps/admin_app")
    const parts = relativePath.split(path.sep);
    if (parts.length >= 1) {
      return parts[0];
    }
    return '';
  }

  private getTypeLabel(): string {
    switch (this.pubspec.type) {
      case 'flutter_app':
        return 'Flutter App';
      case 'flutter_plugin':
        return 'Plugin';
      case 'flutter_package':
        return 'Flutter Package';
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
      case 'flutter_package':
        return new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.orange'));
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
 * Folder tree node for building hierarchy
 */
interface FolderNode {
  name: string;
  fullPath: string;
  relativePath: string;
  packages: PubspecInfo[];
  children: Map<string, FolderNode>;
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

  // View mode
  private viewMode: ViewMode = 'hierarchical';

  // Cache tree items for expand/collapse operations
  private packageItems: Map<string, PackageTreeItem> = new Map();
  private folderItems: Map<string, FolderGroupTreeItem> = new Map();

  constructor() {
    this.scanner = new WorkspaceScanner();

    // Load saved view mode from configuration
    const config = vscode.workspace.getConfiguration('pubspecMaster.dashboard');
    this.viewMode = config.get<ViewMode>('viewMode', 'hierarchical');

    // Set up file watching
    this.scanner.startWatching();
    this.disposables.push(
      this.scanner.onDidChange(() => this.onFileChange())
    );

    // Initial scan
    this.refresh();
  }

  /**
   * Get current view mode
   */
  getViewMode(): ViewMode {
    return this.viewMode;
  }

  /**
   * Toggle between hierarchical and logical view modes
   */
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'hierarchical' ? 'logical' : 'hierarchical';

    // Save to configuration
    const config = vscode.workspace.getConfiguration('pubspecMaster.dashboard');
    config.update('viewMode', this.viewMode, vscode.ConfigurationTarget.Workspace);

    // Clear caches and refresh
    this.packageItems.clear();
    this.folderItems.clear();
    this._onDidChangeTreeData.fire();

    // Show notification
    const modeName = this.viewMode === 'hierarchical' ? 'Folder View' : 'Logical View';
    vscode.window.showInformationMessage(`Pubspec Master: Switched to ${modeName}`);
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

    // Clear caches on refresh
    this.packageItems.clear();
    this.folderItems.clear();
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
   * Get parent for an element (needed for reveal to work)
   */
  getParent(element: DashboardTreeItem): vscode.ProviderResult<DashboardTreeItem> {
    if (element instanceof DependencyTreeItem) {
      // Parent is a DependencyGroupTreeItem - but we don't track these
      return undefined;
    }
    if (element instanceof DependencyGroupTreeItem) {
      // Parent is a PackageTreeItem
      return this.packageItems.get(element.pubspec.path);
    }
    if (element instanceof PackageTreeItem) {
      // In hierarchical view, parent is a FolderGroupTreeItem
      if (this.viewMode === 'hierarchical') {
        const parentFolder = path.dirname(element.pubspec.directory);
        return this.folderItems.get(parentFolder);
      }
      // In logical view, no direct parent tracking (would need category items)
      return undefined;
    }
    if (element instanceof FolderGroupTreeItem) {
      // Parent folder
      const parentPath = path.dirname(element.folderPath);
      return this.folderItems.get(parentPath);
    }
    return undefined;
  }

  /**
   * Get children for an element (or root)
   */
  getChildren(
    element?: DashboardTreeItem
  ): vscode.ProviderResult<DashboardTreeItem[]> {
    if (!element) {
      // Root level: depends on view mode
      return this.viewMode === 'hierarchical'
        ? this.buildFolderHierarchy()
        : this.buildLogicalView();
    }

    // Handle folder groups in hierarchical view
    if (element instanceof FolderGroupTreeItem) {
      return this.getFolderChildren(element);
    }

    // Handle category items in logical view
    if (element instanceof AppsCategoryTreeItem) {
      return this.getAppsChildren(element);
    }

    if (element instanceof PackagesCategoryTreeItem) {
      return this.getPackagesChildren(element);
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
   * Build folder hierarchy view
   */
  private buildFolderHierarchy(): DashboardTreeItem[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot || this.packages.length === 0) {
      return [];
    }

    // Build folder tree
    const rootNode: FolderNode = {
      name: '',
      fullPath: workspaceRoot,
      relativePath: '',
      packages: [],
      children: new Map(),
    };

    // Sort packages into folder tree
    for (const pkg of this.packages) {
      const relativePath = path.relative(workspaceRoot, pkg.directory);
      const parts = relativePath.split(path.sep);

      let currentNode = rootNode;
      let currentPath = workspaceRoot;
      let currentRelative = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = path.join(currentPath, part);
        currentRelative = currentRelative ? path.join(currentRelative, part) : part;

        if (!currentNode.children.has(part)) {
          currentNode.children.set(part, {
            name: part,
            fullPath: currentPath,
            relativePath: currentRelative,
            packages: [],
            children: new Map(),
          });
        }
        currentNode = currentNode.children.get(part)!;
      }

      // Add package to its direct parent folder
      currentNode.packages.push(pkg);
    }

    // Convert folder tree to tree items
    return this.convertFolderNodeToItems(rootNode, workspaceRoot);
  }

  /**
   * Convert folder node to tree items
   */
  private convertFolderNodeToItems(node: FolderNode, workspaceRoot: string): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];

    // Note: We could flatten the hierarchy when there's only one child folder at root,
    // but for now we keep the full structure for clarity

    // Add child folders
    const sortedChildren = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const childNode of sortedChildren) {
      // Check if this folder or its descendants have packages
      if (this.folderHasPackages(childNode)) {
        const childFolderNames = Array.from(childNode.children.keys());
        const folderItem = new FolderGroupTreeItem(
          childNode.fullPath,
          childNode.relativePath,
          `${childNode.name}/`,
          childNode.packages,
          childFolderNames
        );
        this.folderItems.set(childNode.fullPath, folderItem);
        items.push(folderItem);
      }
    }

    // Add packages directly in root (if any)
    for (const pkg of node.packages) {
      const pkgItem = new PackageTreeItem(pkg, false, workspaceRoot);
      this.packageItems.set(pkg.path, pkgItem);
      items.push(pkgItem);
    }

    return items;
  }

  /**
   * Check if a folder node has any packages (directly or in descendants)
   */
  private folderHasPackages(node: FolderNode): boolean {
    if (node.packages.length > 0) {
      return true;
    }
    for (const child of node.children.values()) {
      if (this.folderHasPackages(child)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get children of a folder group
   */
  private getFolderChildren(element: FolderGroupTreeItem): DashboardTreeItem[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {return [];}

    const items: DashboardTreeItem[] = [];

    // Find all packages that are in this folder or subfolders
    const packagesInFolder = this.packages.filter((pkg) => {
      const pkgDir = pkg.directory;
      return pkgDir.startsWith(element.folderPath + path.sep) || pkgDir === element.folderPath;
    });

    // Group by immediate subfolder
    const subfolderMap = new Map<string, PubspecInfo[]>();
    const directPackages: PubspecInfo[] = [];

    for (const pkg of packagesInFolder) {
      const relativeTofolder = path.relative(element.folderPath, pkg.directory);
      const parts = relativeTofolder.split(path.sep);

      if (parts.length === 1 && parts[0] === '') {
        // Package is directly in this folder (the pubspec.yaml is here)
        directPackages.push(pkg);
      } else if (parts.length === 1) {
        // Package is directly in this folder (one level deep - the package folder itself)
        directPackages.push(pkg);
      } else {
        // Package is in a subfolder
        const immediateSubfolder = parts[0];
        if (!subfolderMap.has(immediateSubfolder)) {
          subfolderMap.set(immediateSubfolder, []);
        }
        subfolderMap.get(immediateSubfolder)!.push(pkg);
      }
    }

    // Add subfolders
    const sortedSubfolders = Array.from(subfolderMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    for (const [subfolderName, subPackages] of sortedSubfolders) {
      const subfolderPath = path.join(element.folderPath, subfolderName);
      const subfolderRelative = path.join(element.relativePath, subfolderName);

      // Get child folder names for this subfolder
      const childFolderNames = new Set<string>();
      for (const pkg of subPackages) {
        const relToSub = path.relative(subfolderPath, pkg.directory);
        const parts = relToSub.split(path.sep);
        if (parts.length > 1) {
          childFolderNames.add(parts[0]);
        }
      }

      // Direct packages in this subfolder
      const directInSub = subPackages.filter((pkg) => {
        const relToSub = path.relative(subfolderPath, pkg.directory);
        const parts = relToSub.split(path.sep);
        return parts.length === 1;
      });

      const folderItem = new FolderGroupTreeItem(
        subfolderPath,
        subfolderRelative,
        `${subfolderName}/`,
        directInSub,
        Array.from(childFolderNames)
      );
      this.folderItems.set(subfolderPath, folderItem);
      items.push(folderItem);
    }

    // Add direct packages
    for (const pkg of directPackages.sort((a, b) => a.name.localeCompare(b.name))) {
      const pkgItem = new PackageTreeItem(pkg, false, workspaceRoot);
      this.packageItems.set(pkg.path, pkgItem);
      items.push(pkgItem);
    }

    return items;
  }

  /**
   * Build logical view (Apps -> Dependencies)
   */
  private buildLogicalView(): DashboardTreeItem[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot || this.packages.length === 0) {
      return [];
    }

    // Separate apps from packages
    const apps = this.packages.filter((pkg) => pkg.type === 'flutter_app');
    const nonApps = this.packages.filter((pkg) => pkg.type !== 'flutter_app');

    const items: DashboardTreeItem[] = [];

    if (apps.length > 0) {
      items.push(new AppsCategoryTreeItem(apps));
    }

    if (nonApps.length > 0) {
      items.push(new PackagesCategoryTreeItem(nonApps));
    }

    return items;
  }

  /**
   * Get children of the Apps category
   */
  private getAppsChildren(element: AppsCategoryTreeItem): DashboardTreeItem[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {return [];}

    return element.apps
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((app) => {
        const item = new PackageTreeItem(app, true, workspaceRoot);
        this.packageItems.set(app.path, item);
        return item;
      });
  }

  /**
   * Get children of the Packages category
   */
  private getPackagesChildren(element: PackagesCategoryTreeItem): DashboardTreeItem[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {return [];}

    return element.packages
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pkg) => {
        const item = new PackageTreeItem(pkg, true, workspaceRoot);
        this.packageItems.set(pkg.path, item);
        return item;
      });
  }

  /**
   * Get packages list for commands
   */
  getPackages(): PubspecInfo[] {
    return this.packages;
  }

  /**
   * Get cached package tree items for expand operations
   */
  getPackageItems(): PackageTreeItem[] {
    return Array.from(this.packageItems.values());
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
