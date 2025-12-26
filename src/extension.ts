import * as vscode from 'vscode';
import * as path from 'path';
import {
  DashboardProvider,
  DashboardTreeItem,
  PackageTreeItem,
  FolderGroupTreeItem,
  AppsCategoryTreeItem,
  PackagesCategoryTreeItem,
} from './providers/DashboardProvider';
import { registerCommands } from './commands';
import { ConflictDiagnosticProvider, QuickFixProvider } from './diagnostics';
import { DependencyResolver, VersionAnalyzer } from './core';
import { PubspecInfo } from './types';
import { DashboardPanel } from './webview';

let dashboardProvider: DashboardProvider | undefined;
let diagnosticProvider: ConflictDiagnosticProvider | undefined;
let dashboardTreeView: vscode.TreeView<DashboardTreeItem> | undefined;

// Track selected packages for contextual dashboard
let selectedPackages: PubspecInfo[] | undefined;
let selectionLabel: string | undefined;

/**
 * Extract packages from the tree view selection
 * Returns both the packages and a label describing the selection
 */
function getPackagesFromSelection(
  selection: readonly DashboardTreeItem[],
  provider: DashboardProvider
): { packages: PubspecInfo[]; label: string } | undefined {
  if (selection.length === 0) {
    return undefined;
  }

  const packages: PubspecInfo[] = [];
  const allPackages = provider.getPackages();
  const labels: string[] = [];

  for (const item of selection) {
    if (item instanceof PackageTreeItem) {
      packages.push(item.pubspec);
      labels.push(item.pubspec.name);
    } else if (item instanceof FolderGroupTreeItem) {
      // Add all packages in this folder (recursively)
      const inFolder = allPackages.filter(
        (pkg) =>
          pkg.directory.startsWith(item.folderPath + path.sep) ||
          pkg.directory === item.folderPath
      );
      packages.push(...inFolder);
      labels.push(item.displayName);
    } else if (item instanceof AppsCategoryTreeItem) {
      packages.push(...item.apps);
      labels.push('Apps');
    } else if (item instanceof PackagesCategoryTreeItem) {
      packages.push(...item.packages);
      labels.push('Packages');
    }
  }

  if (packages.length === 0) {
    return undefined;
  }

  // Deduplicate packages by path
  const uniquePackages = Array.from(
    new Map(packages.map((p) => [p.path, p])).values()
  );

  return {
    packages: uniquePackages,
    label: labels.join(', '),
  };
}

/**
 * Extension activation
 *
 * Called when VS Code activates the extension (when a pubspec.yaml is found)
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Moinsen Pubspec Master is now active');

  // Create dashboard provider
  dashboardProvider = new DashboardProvider();
  context.subscriptions.push(dashboardProvider);

  // Create diagnostic provider for Problems panel
  diagnosticProvider = new ConflictDiagnosticProvider();
  context.subscriptions.push(diagnosticProvider);

  // Register Quick Fix provider for pubspec.yaml files
  const quickFixProvider = new QuickFixProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { pattern: '**/pubspec.yaml' },
      quickFixProvider,
      {
        providedCodeActionKinds: QuickFixProvider.providedCodeActionKinds,
      }
    )
  );

  // Register tree view
  dashboardTreeView = vscode.window.createTreeView('pubspecMaster.dashboard', {
    treeDataProvider: dashboardProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(dashboardTreeView);

  // Listen for tree selection changes to update dashboard context
  context.subscriptions.push(
    dashboardTreeView.onDidChangeSelection((event) => {
      const result = getPackagesFromSelection(event.selection, dashboardProvider!);
      selectedPackages = result?.packages;
      selectionLabel = result?.label;

      // If dashboard is open, update it with filtered data
      if (DashboardPanel.currentPanel) {
        const packagesToShow = selectedPackages ?? dashboardProvider!.getPackages();
        DashboardPanel.currentPanel.updateData(packagesToShow, selectionLabel);
      }
    })
  );

  // Register commands (pass tree view for expand all and selection getter)
  registerCommands(context, dashboardProvider, dashboardTreeView, () => ({
    packages: selectedPackages,
    label: selectionLabel,
  }));

  // Update diagnostics whenever the dashboard data changes
  dashboardProvider.onDidChangeTreeData(() => {
    updateDiagnostics();
  });

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'Moinsen Pubspec Master is ready! Click the icon in the activity bar to view your packages.',
      'Got it'
    );
    context.globalState.update('hasShownWelcome', true);
  }
}

/**
 * Update diagnostics based on current workspace state
 */
function updateDiagnostics(): void {
  if (!dashboardProvider || !diagnosticProvider) {return;}

  const packages = dashboardProvider.getPackages();
  if (packages.length === 0) {
    diagnosticProvider.clear();
    return;
  }

  // Analyze for conflicts
  const resolver = new DependencyResolver();
  const analyzer = new VersionAnalyzer();
  const graph = resolver.buildGraph(packages);
  const analysis = analyzer.analyze(packages, graph);

  // Update diagnostics
  diagnosticProvider.updateDiagnostics(packages, analysis);
}

/**
 * Extension deactivation
 *
 * Called when VS Code deactivates the extension
 */
export function deactivate(): void {
  console.log('Moinsen Pubspec Master deactivated');
  // Cleanup is handled via disposables registered in context.subscriptions
}
