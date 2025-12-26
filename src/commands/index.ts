import * as vscode from 'vscode';
import { DashboardProvider, PackageTreeItem, DashboardTreeItem } from '../providers/DashboardProvider';
import { pubGetAllCommand } from './pubGetAll';
import { pubUpgradeAllCommand } from './pubUpgradeAll';
import { runPubGet, runPubUpgrade } from '../utils/processUtils';
import { PubspecInfo } from '../types';
import { DashboardPanel, GraphPanel } from '../webview';
import { MigrationWizard } from '../webview/wizard';
import { VersionSyncService, ConfigService } from '../services';
import { DependencyResolver, VersionAnalyzer } from '../core';

/**
 * Selection context from tree view
 */
export interface SelectionContext {
  packages: PubspecInfo[] | undefined;
  label: string | undefined;
}

/**
 * Register all extension commands
 *
 * @param context - Extension context
 * @param dashboardProvider - Dashboard provider instance
 * @param treeView - Tree view instance for expand/collapse operations
 * @param getSelection - Function to get current tree selection context
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  dashboardProvider: DashboardProvider,
  treeView?: vscode.TreeView<DashboardTreeItem>,
  getSelection?: () => SelectionContext
): void {
  // Refresh command - updates both tree view and webview panel
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.refresh', async () => {
      await dashboardProvider.refresh();
      // Also update the webview panel if it's open
      if (DashboardPanel.currentPanel) {
        const selection = getSelection?.();
        const packagesToShow = selection?.packages ?? dashboardProvider.getPackages();
        await DashboardPanel.currentPanel.updateData(packagesToShow, selection?.label);
      }
    })
  );

  // Expand all command - expands all packages in tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.expandAll', async () => {
      if (!treeView) {
        return;
      }

      // Get cached package tree items (same instances used in tree view)
      const packageItems = dashboardProvider.getPackageItems();
      for (const item of packageItems) {
        try {
          await treeView.reveal(item, { expand: 2, select: false, focus: false });
        } catch {
          // Item might not be visible yet, continue with next
        }
      }
    })
  );

  // Toggle view mode command - switches between hierarchical and logical views
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.toggleViewMode', () => {
      dashboardProvider.toggleViewMode();
    })
  );

  // Pub get all command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.pubGetAll', () => {
      pubGetAllCommand(() => dashboardProvider.getPackages());
    })
  );

  // Pub upgrade all command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.pubUpgradeAll', () => {
      pubUpgradeAllCommand(() => dashboardProvider.getPackages());
    })
  );

  // Open pubspec.yaml command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pubspecMaster.openPubspec',
      async (pathOrItem: string | PackageTreeItem) => {
        let filePath: string;

        if (typeof pathOrItem === 'string') {
          filePath = pathOrItem;
        } else if (pathOrItem instanceof PackageTreeItem) {
          filePath = pathOrItem.pubspec.path;
        } else {
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Moinsen: Failed to open file: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
  );

  // Single package pub get command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pubspecMaster.pubGet',
      async (item: PackageTreeItem) => {
        if (!(item instanceof PackageTreeItem)) {
          return;
        }

        const pkg: PubspecInfo = item.pubspec;
        const isFlutter = pkg.type === 'flutter_app' || pkg.type === 'flutter_plugin';

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Moinsen: Running pub get for ${pkg.name}`,
          },
          async () => {
            const result = await runPubGet(pkg.directory, isFlutter);

            if (result.exitCode === 0) {
              vscode.window.showInformationMessage(
                `Moinsen: Pub get completed for ${pkg.name}`
              );
            } else {
              vscode.window.showErrorMessage(
                `Moinsen: Pub get failed for ${pkg.name}: ${result.stderr}`
              );
            }
          }
        );
      }
    )
  );

  // Single package pub upgrade command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pubspecMaster.pubUpgrade',
      async (item: PackageTreeItem) => {
        if (!(item instanceof PackageTreeItem)) {
          return;
        }

        const pkg: PubspecInfo = item.pubspec;
        const isFlutter = pkg.type === 'flutter_app' || pkg.type === 'flutter_plugin';

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Moinsen: Running pub upgrade for ${pkg.name}`,
          },
          async () => {
            const result = await runPubUpgrade(pkg.directory, isFlutter);

            if (result.exitCode === 0) {
              vscode.window.showInformationMessage(
                `Moinsen: Pub upgrade completed for ${pkg.name}`
              );
            } else {
              vscode.window.showErrorMessage(
                `Moinsen: Pub upgrade failed for ${pkg.name}: ${result.stderr}`
              );
            }
          }
        );
      }
    )
  );

  // Show dashboard panel command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.showDashboard', async () => {
      const panel = DashboardPanel.createOrShow(context.extensionUri, context);
      const selection = getSelection?.();
      const packagesToShow = selection?.packages ?? dashboardProvider.getPackages();
      await panel.updateData(packagesToShow, selection?.label);
    })
  );

  // Show dependency graph command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.showGraph', async () => {
      const panel = GraphPanel.createOrShow(context.extensionUri);
      await panel.updateData(dashboardProvider.getPackages());
    })
  );

  // Sync all versions command (from command palette)
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.syncAllVersions', async () => {
      const packages = dashboardProvider.getPackages();
      if (packages.length === 0) {
        vscode.window.showWarningMessage('Moinsen: No packages found in workspace.');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('Moinsen: No workspace folder open.');
        return;
      }

      // Analyze for conflicts
      const resolver = new DependencyResolver();
      const analyzer = new VersionAnalyzer();
      const graph = resolver.buildGraph(packages);
      const analysis = analyzer.analyze(packages, graph);

      const fixableConflicts = analysis.conflicts.filter(c => c.suggestedResolution);
      if (fixableConflicts.length === 0) {
        vscode.window.showInformationMessage('Moinsen: No version conflicts to fix.');
        return;
      }

      // Confirm
      const response = await vscode.window.showInformationMessage(
        `Fix ${fixableConflicts.length} version conflict(s)? This will update multiple pubspec.yaml files.`,
        { modal: true },
        'Apply All Fixes',
        'Cancel'
      );

      if (response !== 'Apply All Fixes') {
        return;
      }

      // Apply fixes
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Fixing all version conflicts...',
          cancellable: false,
        },
        async () => {
          const syncService = new VersionSyncService(workspaceRoot);
          const result = await syncService.syncAll(fixableConflicts, packages);

          if (result.success) {
            vscode.window.showInformationMessage(
              `Moinsen: Fixed all conflicts - Updated ${result.filesUpdated.length} file(s)` +
              (result.backupPath ? `. Backup saved.` : '')
            );
            dashboardProvider.refresh();
          } else {
            vscode.window.showWarningMessage(
              `Moinsen: Partially completed - ${result.filesUpdated.length} updated, ${result.errors.length} failed`
            );
            dashboardProvider.refresh();
          }
        }
      );
    })
  );

  // Fix conflict command (for programmatic use)
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.fixConflict', () => {
      // This command opens the dashboard where fix buttons are available
      vscode.commands.executeCommand('pubspecMaster.showDashboard');
    })
  );

  // Fix SDK mismatch command (for programmatic use)
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.fixSdkMismatch', () => {
      // This command opens the dashboard where fix buttons are available
      vscode.commands.executeCommand('pubspecMaster.showDashboard');
    })
  );

  // Migration wizard command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.showMigrationWizard', () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('Moinsen: No workspace folder open.');
        return;
      }
      MigrationWizard.createOrShow(context.extensionUri, workspaceRoot);
    })
  );

  // Create config file command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.createConfig', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('Moinsen: No workspace folder open.');
        return;
      }

      const configService = new ConfigService(workspaceRoot);
      const hasConfig = await configService.hasConfigFile();

      if (hasConfig) {
        const response = await vscode.window.showWarningMessage(
          '.pubspec-master.json already exists. Overwrite?',
          'Overwrite',
          'Cancel'
        );
        if (response !== 'Overwrite') {
          return;
        }
      }

      await configService.createConfigFile();

      // Open the file for editing
      const configPath = vscode.Uri.joinPath(
        vscode.Uri.file(workspaceRoot),
        '.pubspec-master.json'
      );
      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc);
    })
  );

  // Open config file command
  context.subscriptions.push(
    vscode.commands.registerCommand('pubspecMaster.openConfig', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('Moinsen: No workspace folder open.');
        return;
      }

      const configService = new ConfigService(workspaceRoot);
      const hasConfig = await configService.hasConfigFile();

      if (!hasConfig) {
        const response = await vscode.window.showInformationMessage(
          'No .pubspec-master.json found. Create one?',
          'Create',
          'Cancel'
        );
        if (response === 'Create') {
          await vscode.commands.executeCommand('pubspecMaster.createConfig');
        }
        return;
      }

      const configPath = vscode.Uri.joinPath(
        vscode.Uri.file(workspaceRoot),
        '.pubspec-master.json'
      );
      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc);
    })
  );
}
