import * as vscode from 'vscode';
import { DashboardProvider, DashboardTreeItem } from './providers/DashboardProvider';
import { registerCommands } from './commands';
import { ConflictDiagnosticProvider } from './diagnostics';
import { DependencyResolver, VersionAnalyzer } from './core';

let dashboardProvider: DashboardProvider | undefined;
let diagnosticProvider: ConflictDiagnosticProvider | undefined;
let dashboardTreeView: vscode.TreeView<DashboardTreeItem> | undefined;

/**
 * Extension activation
 *
 * Called when VS Code activates the extension (when a pubspec.yaml is found)
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Pubspec Master is now active');

  // Create dashboard provider
  dashboardProvider = new DashboardProvider();
  context.subscriptions.push(dashboardProvider);

  // Create diagnostic provider for Problems panel
  diagnosticProvider = new ConflictDiagnosticProvider();
  context.subscriptions.push(diagnosticProvider);

  // Register tree view
  dashboardTreeView = vscode.window.createTreeView('pubspecMaster.dashboard', {
    treeDataProvider: dashboardProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(dashboardTreeView);

  // Register commands (pass tree view for expand all)
  registerCommands(context, dashboardProvider, dashboardTreeView);

  // Update diagnostics whenever the dashboard data changes
  dashboardProvider.onDidChangeTreeData(() => {
    updateDiagnostics();
  });

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'Pubspec Master is ready! Click the Pubspec Master icon in the activity bar to view your packages.',
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
  console.log('Pubspec Master deactivated');
  // Cleanup is handled via disposables registered in context.subscriptions
}
