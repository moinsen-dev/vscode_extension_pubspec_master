import * as vscode from 'vscode';
import { PubspecInfo } from '../../types';
import {
  DependencyResolver,
  DependencyGraph,
  VersionAnalyzer,
  WorkspaceAnalysis,
} from '../../core';
import { PubDevClient, PubPackageInfo, GitHubClient, GitHubMetrics } from '../../api';
import { VersionSyncService } from '../../services';

/**
 * Dashboard WebView Panel
 *
 * Provides a full dashboard view with workspace statistics,
 * package list, issues, and quick actions.
 */
export class DashboardPanel implements vscode.Disposable {
  public static currentPanel: DashboardPanel | undefined;
  private static readonly viewType = 'pubspecMaster.dashboardPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly dependencyResolver: DependencyResolver;
  private readonly versionAnalyzer: VersionAnalyzer;
  private readonly pubDevClient: PubDevClient;
  private readonly githubClient: GitHubClient;
  private readonly versionSyncService: VersionSyncService;
  private disposables: vscode.Disposable[] = [];

  private packages: PubspecInfo[] = [];
  private graph?: DependencyGraph;
  private analysis?: WorkspaceAnalysis;
  private outdatedPackages: Array<{
    name: string;
    current: string;
    latest: string | null;
    hasUpdate: boolean;
    usedIn: string[];
  }> = [];
  private isCheckingUpdates = false;
  private selectionContext?: string;  // Label describing what's selected in tree view

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.dependencyResolver = new DependencyResolver();
    this.versionAnalyzer = new VersionAnalyzer();
    this.pubDevClient = new PubDevClient(context);
    this.githubClient = new GitHubClient(context);

    // Initialize VersionSyncService with workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this.versionSyncService = new VersionSyncService(workspaceRoot);

    // Set up webview
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'media'),
        vscode.Uri.joinPath(extensionUri, 'dist'),
      ],
    };

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Create or show the dashboard panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ): DashboardPanel {
    const column = vscode.ViewColumn.One;

    // If panel exists, show it
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      return DashboardPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Moinsen Pubspec Master Dashboard',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, context);
    return DashboardPanel.currentPanel;
  }

  /**
   * Update the dashboard with new package data
   * @param packages - Packages to display (filtered or all)
   * @param selectionContext - Optional label describing the current selection (e.g., "admin_app", "example/")
   */
  public async updateData(packages: PubspecInfo[], selectionContext?: string): Promise<void> {
    this.packages = packages;
    this.selectionContext = selectionContext;
    this.graph = this.dependencyResolver.buildGraph(packages);
    this.analysis = this.versionAnalyzer.analyze(packages, this.graph);

    await this.updateWebview();
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: {
    command: string;
    packageName?: string;
    packagePath?: string;
    conflictIndex?: number;
    sdkMismatchIndex?: number;
    targetConstraint?: string;
    backupPath?: string;
    dependencyName?: string;
    newVersion?: string;
  }): Promise<void> {
    switch (message.command) {
      case 'refresh':
        await vscode.commands.executeCommand('pubspecMaster.refresh');
        break;

      case 'showAll':
        // Clear selection by triggering refresh without selection context
        this.selectionContext = undefined;
        await vscode.commands.executeCommand('pubspecMaster.refresh');
        break;

      case 'pubGetAll':
        await vscode.commands.executeCommand('pubspecMaster.pubGetAll');
        break;

      case 'pubUpgradeAll':
        await vscode.commands.executeCommand('pubspecMaster.pubUpgradeAll');
        break;

      case 'openPubspec':
        if (message.packagePath) {
          await vscode.commands.executeCommand(
            'pubspecMaster.openPubspec',
            message.packagePath
          );
        }
        break;

      case 'showGraph':
        await vscode.commands.executeCommand('pubspecMaster.showGraph');
        break;

      case 'pubGet':
        if (message.packageName) {
          const pkg = this.packages.find((p) => p.name === message.packageName);
          if (pkg) {
            await vscode.commands.executeCommand('pubspecMaster.pubGet', pkg);
          }
        }
        break;

      case 'pubUpgrade':
        if (message.packageName) {
          const pkg = this.packages.find((p) => p.name === message.packageName);
          if (pkg) {
            await vscode.commands.executeCommand('pubspecMaster.pubUpgrade', pkg);
          }
        }
        break;

      case 'fixConflict':
        await this.handleFixConflict(message.conflictIndex);
        break;

      case 'fixSdkMismatch':
        await this.handleFixSdkMismatch(message.sdkMismatchIndex, message.targetConstraint);
        break;

      case 'fixAllConflicts':
        await this.handleFixAllConflicts();
        break;

      case 'analyze':
        await this.handleAnalyze();
        break;

      case 'showBackups':
        await this.handleShowBackups();
        break;

      case 'rollback':
        if (message.backupPath) {
          await this.handleRollback(message.backupPath);
        }
        break;

      case 'checkUpdates':
        await this.handleCheckUpdates();
        break;

      case 'updateDependency':
        if (message.dependencyName && message.newVersion) {
          await this.handleUpdateDependency(
            message.dependencyName,
            message.newVersion
          );
        }
        break;

      case 'updateAllOutdated':
        await this.handleUpdateAllOutdated();
        break;
    }
  }

  /**
   * Handle fixing a single version conflict
   */
  private async handleFixConflict(conflictIndex?: number): Promise<void> {
    if (conflictIndex === undefined || !this.analysis?.conflicts) {
      return;
    }

    const conflict = this.analysis.conflicts[conflictIndex];
    if (!conflict || !conflict.suggestedResolution) {
      vscode.window.showWarningMessage('No suggested resolution available for this conflict.');
      return;
    }

    // Show confirmation dialog
    const packageCount = conflict.packages.length;
    const response = await vscode.window.showInformationMessage(
      `Update ${packageCount} package(s) to use ${conflict.dependencyName}: ${conflict.suggestedResolution}?`,
      { modal: true },
      'Apply Fix',
      'Cancel'
    );

    if (response !== 'Apply Fix') {
      return;
    }

    // Apply fix with progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fixing ${conflict.dependencyName} conflict...`,
        cancellable: false,
      },
      async () => {
        const result = await this.versionSyncService.fixConflict(conflict, this.packages);

        if (result.success) {
          vscode.window.showInformationMessage(
            `Fixed ${conflict.dependencyName}: Updated ${result.filesUpdated.length} file(s)` +
            (result.backupPath ? `. Backup saved to ${result.backupPath}` : '')
          );
          // Refresh to show updated state
          await vscode.commands.executeCommand('pubspecMaster.refresh');
        } else {
          const errorMsg = result.errors.map(e => `${e.file}: ${e.error}`).join('\n');
          vscode.window.showErrorMessage(`Failed to fix conflict: ${errorMsg}`);
        }
      }
    );
  }

  /**
   * Handle fixing an SDK mismatch
   */
  private async handleFixSdkMismatch(
    mismatchIndex?: number,
    targetConstraint?: string
  ): Promise<void> {
    if (mismatchIndex === undefined || !this.analysis?.sdkMismatches) {
      return;
    }

    const mismatch = this.analysis.sdkMismatches[mismatchIndex];
    if (!mismatch) {
      return;
    }

    // If no target constraint provided, let user choose
    if (!targetConstraint) {
      const options = [
        { label: mismatch.highestConstraint, description: 'Use highest (most modern)' },
        { label: mismatch.lowestConstraint, description: 'Use lowest (most compatible)' },
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select target SDK constraint',
      });

      if (!selected) {
        return;
      }
      targetConstraint = selected.label;
    }

    // Show confirmation dialog
    const packageCount = mismatch.packages.filter(p => p.constraint !== targetConstraint).length;
    const response = await vscode.window.showInformationMessage(
      `Update ${packageCount} package(s) to use SDK: ${targetConstraint}?`,
      { modal: true },
      'Apply Fix',
      'Cancel'
    );

    if (response !== 'Apply Fix') {
      return;
    }

    // Apply fix with progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fixing SDK constraint mismatch...',
        cancellable: false,
      },
      async () => {
        const result = await this.versionSyncService.fixSdkMismatch(
          mismatch,
          this.packages,
          targetConstraint!
        );

        if (result.success) {
          vscode.window.showInformationMessage(
            `Fixed SDK constraints: Updated ${result.filesUpdated.length} file(s)` +
            (result.backupPath ? `. Backup saved to ${result.backupPath}` : '')
          );
          await vscode.commands.executeCommand('pubspecMaster.refresh');
        } else {
          const errorMsg = result.errors.map(e => `${e.file}: ${e.error}`).join('\n');
          vscode.window.showErrorMessage(`Failed to fix SDK mismatch: ${errorMsg}`);
        }
      }
    );
  }

  /**
   * Handle fixing all conflicts at once
   */
  private async handleFixAllConflicts(): Promise<void> {
    if (!this.analysis?.conflicts || this.analysis.conflicts.length === 0) {
      return;
    }

    const fixableConflicts = this.analysis.conflicts.filter(c => c.suggestedResolution);
    if (fixableConflicts.length === 0) {
      vscode.window.showWarningMessage('No conflicts have suggested resolutions.');
      return;
    }

    // Show confirmation dialog
    const response = await vscode.window.showInformationMessage(
      `Fix ${fixableConflicts.length} version conflict(s)? This will update multiple pubspec.yaml files.`,
      { modal: true },
      'Apply All Fixes',
      'Cancel'
    );

    if (response !== 'Apply All Fixes') {
      return;
    }

    // Apply all fixes with progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fixing all version conflicts...',
        cancellable: false,
      },
      async () => {
        const result = await this.versionSyncService.syncAll(
          fixableConflicts,
          this.packages
        );

        if (result.success) {
          vscode.window.showInformationMessage(
            `Fixed all conflicts: Updated ${result.filesUpdated.length} file(s)` +
            (result.backupPath ? `. Backup saved to ${result.backupPath}` : '')
          );
          await vscode.commands.executeCommand('pubspecMaster.refresh');
        } else {
          const successCount = result.filesUpdated.length;
          const errorCount = result.errors.length;
          vscode.window.showWarningMessage(
            `Partially completed: ${successCount} updated, ${errorCount} failed`
          );
          await vscode.commands.executeCommand('pubspecMaster.refresh');
        }
      }
    );
  }

  /**
   * Handle running flutter analyze
   */
  private async handleAnalyze(): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running flutter analyze...',
        cancellable: false,
      },
      async () => {
        const result = await this.versionSyncService.analyzeWorkspace();

        if (result.success) {
          vscode.window.showInformationMessage(
            'Flutter analyze completed: No issues found!'
          );
        } else {
          const response = await vscode.window.showWarningMessage(
            `Flutter analyze found ${result.issueCount} issue(s). Check the Output panel for details.`,
            'View Output',
            'Rollback Changes'
          );

          if (response === 'Rollback Changes') {
            await this.handleShowBackups();
          }
        }
      }
    );
  }

  /**
   * Handle showing available backups for rollback
   */
  private async handleShowBackups(): Promise<void> {
    const backups = await this.versionSyncService.getAvailableBackups();

    if (backups.length === 0) {
      vscode.window.showInformationMessage('No backups available.');
      return;
    }

    const items = backups.map(backup => ({
      label: this.formatBackupTimestamp(backup.timestamp),
      description: `${backup.fileCount} file(s)`,
      detail: backup.path,
      backup,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a backup to restore',
    });

    if (selected) {
      await this.handleRollback(selected.backup.path);
    }
  }

  /**
   * Handle rolling back to a backup
   */
  private async handleRollback(backupPath: string): Promise<void> {
    const response = await vscode.window.showWarningMessage(
      'This will restore all pubspec.yaml files from the backup. Continue?',
      { modal: true },
      'Restore',
      'Cancel'
    );

    if (response !== 'Restore') {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Restoring from backup...',
        cancellable: false,
      },
      async () => {
        const result = await this.versionSyncService.restoreFromBackup(backupPath);

        if (result.success) {
          vscode.window.showInformationMessage(
            `Restored ${result.filesUpdated.length} file(s) from backup.`
          );
          await vscode.commands.executeCommand('pubspecMaster.refresh');
        } else {
          const errorMsg = result.errors.map(e => `${e.file}: ${e.error}`).join('\n');
          vscode.window.showErrorMessage(`Rollback failed: ${errorMsg}`);
        }
      }
    );
  }

  /**
   * Handle checking for outdated packages
   */
  private async handleCheckUpdates(): Promise<void> {
    if (this.isCheckingUpdates) {
      return;
    }

    this.isCheckingUpdates = true;
    await this.updateWebview();

    try {
      // Collect all unique dependencies from all packages
      const allDeps = new Map<string, { name: string; constraint: string; usedIn: string[] }>();

      for (const pkg of this.packages) {
        for (const [depName, depInfo] of pkg.dependencies) {
          // Only check pub.dev dependencies
          if (depInfo.source !== 'pub.dev') {continue;}

          if (!allDeps.has(depName)) {
            allDeps.set(depName, {
              name: depName,
              constraint: depInfo.constraint,
              usedIn: [pkg.name],
            });
          } else {
            allDeps.get(depName)!.usedIn.push(pkg.name);
          }
        }

        for (const [depName, depInfo] of pkg.devDependencies) {
          if (depInfo.source !== 'pub.dev') {continue;}

          if (!allDeps.has(depName)) {
            allDeps.set(depName, {
              name: depName,
              constraint: depInfo.constraint,
              usedIn: [pkg.name],
            });
          } else {
            if (!allDeps.get(depName)!.usedIn.includes(pkg.name)) {
              allDeps.get(depName)!.usedIn.push(pkg.name);
            }
          }
        }
      }

      // Check for updates (limit concurrency to avoid rate limiting)
      const deps = Array.from(allDeps.values());
      const packagesToCheck = deps.map((d) => ({
        name: d.name,
        currentVersion: d.constraint.replace(/^\^/, ''),
      }));

      // Process in batches of 10 to avoid rate limiting
      const batchSize = 10;
      const results: Array<{
        name: string;
        current: string;
        latest: string | null;
        hasUpdate: boolean;
        usedIn: string[];
      }> = [];

      // Also collect package info for health analysis
      const packageInfoMap = new Map<string, PubPackageInfo>();

      for (let i = 0; i < packagesToCheck.length; i += batchSize) {
        const batch = packagesToCheck.slice(i, i + batchSize);
        const batchResults = await this.pubDevClient.checkForUpdates(batch);

        for (const result of batchResults) {
          const dep = allDeps.get(result.name);
          results.push({
            ...result,
            usedIn: dep?.usedIn || [],
          });

          // Fetch full package info for health analysis
          const pkgInfo = await this.pubDevClient.getPackageInfo(result.name);
          if (pkgInfo) {
            packageInfoMap.set(result.name, pkgInfo);
          }
        }

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < packagesToCheck.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Filter to only outdated packages
      this.outdatedPackages = results.filter((r) => r.hasUpdate);

      // Run package health analysis with configurable settings
      const healthConfig = vscode.workspace.getConfiguration('pubspecMaster.health');
      const healthEnabled = healthConfig.get<boolean>('enabled', true);
      const githubConfig = vscode.workspace.getConfiguration('pubspecMaster.github');
      const githubEnabled = githubConfig.get<boolean>('enabled', true);

      if (healthEnabled && this.analysis) {
        // Fetch GitHub metrics if enabled
        const githubMetricsMap = new Map<string, GitHubMetrics>();

        if (githubEnabled) {
          // Collect GitHub URLs from package info
          const packagesWithRepos: Array<{ name: string; repoUrl: string }> = [];
          for (const [name, pkgInfo] of packageInfoMap) {
            if (pkgInfo.repositoryUrl) {
              packagesWithRepos.push({ name, repoUrl: pkgInfo.repositoryUrl });
            }
          }

          // Fetch GitHub metrics in batches (respect rate limits)
          const githubBatchSize = 5;
          for (let i = 0; i < packagesWithRepos.length; i += githubBatchSize) {
            const batch = packagesWithRepos.slice(i, i + githubBatchSize);

            // Check rate limit before fetching
            if (this.githubClient.getRateLimitRemaining() <= batch.length) {
              console.warn('Moinsen: GitHub API rate limit approaching, skipping remaining repos');
              break;
            }

            await Promise.all(
              batch.map(async ({ name, repoUrl }) => {
                const metrics = await this.githubClient.getRepoMetrics(repoUrl);
                if (metrics) {
                  githubMetricsMap.set(name, metrics);
                }
              })
            );

            // Small delay between batches
            if (i + githubBatchSize < packagesWithRepos.length) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }
        }

        // Use enhanced health analysis with GitHub metrics
        const healthIssues = this.versionAnalyzer.analyzePackageHealthWithGitHub(
          this.packages,
          packageInfoMap,
          githubMetricsMap,
          {
            unmaintainedThresholdDays: healthConfig.get<number>('unmaintainedThresholdDays', 365),
            criticalThresholdDays: healthConfig.get<number>('criticalThresholdDays', 730),
            lowQualityScoreThreshold: healthConfig.get<number>('minScoreThreshold', 50),
            highIssueCountThreshold: githubConfig.get<number>('highIssueCountThreshold', 100),
            staleRepoThresholdDays: githubConfig.get<number>('staleRepoThresholdDays', 180),
          }
        );

        // Update analysis with health issues
        this.analysis.healthIssues = healthIssues;
        this.analysis.summary.totalHealthIssues = healthIssues.length;
      }

      const outdatedCount = this.outdatedPackages.length;
      const healthIssueCount = this.analysis?.healthIssues?.length || 0;

      if (outdatedCount > 0 || healthIssueCount > 0) {
        let message = '';
        if (outdatedCount > 0 && healthIssueCount > 0) {
          message = `Found ${outdatedCount} outdated package(s) and ${healthIssueCount} health warning(s)`;
        } else if (outdatedCount > 0) {
          message = `Found ${outdatedCount} outdated package(s)`;
        } else {
          message = `Found ${healthIssueCount} package health warning(s)`;
        }
        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showInformationMessage('All packages are up to date and healthy!');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to check for updates: ${error}`);
    } finally {
      this.isCheckingUpdates = false;
      await this.updateWebview();
    }
  }

  /**
   * Handle updating a single dependency
   */
  private async handleUpdateDependency(
    dependencyName: string,
    newVersion: string
  ): Promise<void> {
    const outdatedPkg = this.outdatedPackages.find((p) => p.name === dependencyName);
    if (!outdatedPkg) {
      return;
    }

    const response = await vscode.window.showInformationMessage(
      `Update ${dependencyName} from ${outdatedPkg.current} to ${newVersion} in ${outdatedPkg.usedIn.length} package(s)?`,
      { modal: true },
      'Update',
      'Cancel'
    );

    if (response !== 'Update') {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Updating ${dependencyName}...`,
        cancellable: false,
      },
      async () => {
        const result = await this.versionSyncService.updateDependencyVersion(
          dependencyName,
          `^${newVersion}`,
          this.packages
        );

        if (result.success) {
          vscode.window.showInformationMessage(
            `Updated ${dependencyName} to ^${newVersion} in ${result.filesUpdated.length} file(s)`
          );
          // Remove from outdated list
          this.outdatedPackages = this.outdatedPackages.filter(
            (p) => p.name !== dependencyName
          );
          await vscode.commands.executeCommand('pubspecMaster.refresh');
        } else {
          const errorMsg = result.errors.map((e) => `${e.file}: ${e.error}`).join('\n');
          vscode.window.showErrorMessage(`Failed to update: ${errorMsg}`);
        }
      }
    );
  }

  /**
   * Handle updating all outdated dependencies
   */
  private async handleUpdateAllOutdated(): Promise<void> {
    if (this.outdatedPackages.length === 0) {
      vscode.window.showInformationMessage('No outdated packages to update.');
      return;
    }

    const response = await vscode.window.showInformationMessage(
      `Update ${this.outdatedPackages.length} outdated package(s) to their latest versions?`,
      { modal: true },
      'Update All',
      'Cancel'
    );

    if (response !== 'Update All') {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating all outdated packages...',
        cancellable: false,
      },
      async (progress) => {
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < this.outdatedPackages.length; i++) {
          const pkg = this.outdatedPackages[i];
          if (!pkg.latest) {continue;}

          progress.report({
            message: `Updating ${pkg.name} (${i + 1}/${this.outdatedPackages.length})`,
            increment: 100 / this.outdatedPackages.length,
          });

          const result = await this.versionSyncService.updateDependencyVersion(
            pkg.name,
            `^${pkg.latest}`,
            this.packages
          );

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }

        if (errorCount === 0) {
          vscode.window.showInformationMessage(
            `Successfully updated ${successCount} package(s)`
          );
        } else {
          vscode.window.showWarningMessage(
            `Updated ${successCount} package(s), ${errorCount} failed`
          );
        }

        this.outdatedPackages = [];
        await vscode.commands.executeCommand('pubspecMaster.refresh');
      }
    );
  }

  /**
   * Format backup timestamp for display
   */
  private formatBackupTimestamp(timestamp: string): string {
    // Timestamp format: 2025-01-15T10-30-45-123Z
    try {
      const dateStr = timestamp.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z');
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  }

  /**
   * Update the webview content
   */
  private async updateWebview(): Promise<void> {
    this.panel.webview.html = this.getHtmlContent();

    // Send data to webview
    await this.panel.webview.postMessage({
      command: 'updateData',
      data: {
        packages: this.packages.map((p) => ({
          name: p.name,
          type: p.type,
          version: p.version,
          sdkConstraint: p.sdkConstraint,
          path: p.path,
          directory: p.directory,
          dependencyCount:
            p.dependencies.size + p.devDependencies.size,
          isWorkspacePackage: p.isWorkspacePackage,
        })),
        analysis: this.analysis,
        graph: this.graph
          ? {
              internalCount: this.graph.internalPackages.length,
              externalCount: this.graph.externalPackages.length,
              edgeCount: this.graph.edges.length,
              hasCycles: this.graph.cycles.length > 0,
              cycles: this.graph.cycles,
            }
          : null,
        outdatedPackages: this.outdatedPackages,
        isCheckingUpdates: this.isCheckingUpdates,
        isOnline: this.pubDevClient.getOnlineStatus(),
        selectionContext: this.selectionContext,  // Label for what's selected in tree view
      },
    });
  }

  /**
   * Get the HTML content for the webview
   */
  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <title>Moinsen Pubspec Master Dashboard</title>
  <style>
    :root {
      --pm-primary: var(--vscode-button-background);
      --pm-primary-hover: var(--vscode-button-hoverBackground);
      --pm-success: #4CAF50;
      --pm-warning: #FF9800;
      --pm-error: #F44336;
      --pm-neutral: var(--vscode-descriptionForeground);
      --pm-background: var(--vscode-editor-background);
      --pm-surface: var(--vscode-sideBar-background);
      --pm-text: var(--vscode-editor-foreground);
      --pm-border: var(--vscode-panel-border);
    }

    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--pm-text);
      background-color: var(--pm-background);
      padding: 20px;
      margin: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--pm-border);
    }

    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-actions { display: flex; gap: 8px; }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background-color 0.2s;
    }

    .btn-primary {
      background-color: var(--pm-primary);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover { background-color: var(--pm-primary-hover); }

    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background-color: var(--pm-surface);
      border: 1px solid var(--pm-border);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .stat-value { font-size: 36px; font-weight: bold; margin-bottom: 4px; }
    .stat-label { font-size: 13px; color: var(--pm-neutral); text-transform: uppercase; letter-spacing: 0.5px; }

    .stat-card.success .stat-value { color: var(--pm-success); }
    .stat-card.warning .stat-value { color: var(--pm-warning); }
    .stat-card.error .stat-value { color: var(--pm-error); }

    .section { margin-bottom: 24px; }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .section-title { font-size: 16px; font-weight: 600; margin: 0; }

    .package-list, .issues-list {
      background-color: var(--pm-surface);
      border: 1px solid var(--pm-border);
      border-radius: 8px;
      overflow: hidden;
    }

    .package-item, .issue-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--pm-border);
      cursor: pointer;
      transition: background-color 0.1s;
    }

    .package-item:last-child, .issue-item:last-child { border-bottom: none; }
    .package-item:hover { background-color: var(--vscode-list-hoverBackground); }

    .package-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      font-size: 16px;
    }

    .package-icon.flutter-app { background-color: rgba(33, 150, 243, 0.2); }
    .package-icon.flutter-plugin { background-color: rgba(156, 39, 176, 0.2); }
    .package-icon.dart-package { background-color: rgba(76, 175, 80, 0.2); }

    .package-info { flex: 1; }
    .package-name { font-weight: 500; margin-bottom: 2px; }
    .package-meta { font-size: 12px; color: var(--pm-neutral); }

    .package-actions, .issue-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.1s; }
    .package-item:hover .package-actions, .issue-item:hover .issue-actions { opacity: 1; }

    .fix-btn {
      padding: 4px 12px;
      border: none;
      border-radius: 4px;
      background-color: var(--pm-primary);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: background-color 0.2s;
    }

    .fix-btn:hover { background-color: var(--pm-primary-hover); }

    .fix-btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .fix-btn-secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }

    .icon-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background-color: transparent;
      color: var(--pm-text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-btn:hover { background-color: var(--vscode-toolbar-hoverBackground); }

    .issue-icon { margin-right: 12px; font-size: 18px; }
    .issue-content { flex: 1; }
    .issue-title { font-weight: 500; margin-bottom: 4px; }
    .issue-detail { font-size: 12px; color: var(--pm-neutral); }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      margin-left: 8px;
    }

    .badge.high { background-color: rgba(244, 67, 54, 0.2); color: var(--pm-error); }
    .badge.medium { background-color: rgba(255, 152, 0, 0.2); color: var(--pm-warning); }
    .badge.low { background-color: rgba(158, 158, 158, 0.2); color: var(--pm-neutral); }
    .badge.workspace { background-color: rgba(33, 150, 243, 0.2); color: #2196F3; }
    .badge.critical { background-color: rgba(244, 67, 54, 0.2); color: var(--pm-error); }
    .badge.warning { background-color: rgba(255, 152, 0, 0.2); color: var(--pm-warning); }
    .badge.info { background-color: rgba(158, 158, 158, 0.2); color: var(--pm-neutral); }
    .badge.discontinued { background-color: rgba(244, 67, 54, 0.3); color: var(--pm-error); }
    .badge.unmaintained { background-color: rgba(255, 152, 0, 0.3); color: var(--pm-warning); }

    .empty-state { text-align: center; padding: 40px; color: var(--pm-neutral); }
    .empty-state-icon { font-size: 48px; margin-bottom: 16px; }

    .selection-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      background-color: var(--pm-primary);
      color: var(--vscode-button-foreground);
      margin-left: 12px;
    }

    .offline-banner {
      background-color: rgba(255, 152, 0, 0.2);
      border: 1px solid var(--pm-warning);
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: none;
      align-items: center;
      gap: 8px;
    }

    .offline-banner.visible { display: flex; }

    .promo-banner {
      background: linear-gradient(90deg, var(--pm-primary) 0%, #6366f1 100%);
      color: white;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .promo-banner.hidden { display: none; }
    .promo-banner a {
      color: white;
      text-decoration: underline;
      font-weight: 500;
    }
    .promo-banner a:hover { opacity: 0.9; }
    .promo-dismiss {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      cursor: pointer;
      margin-left: auto;
      font-size: 16px;
      padding: 4px 8px;
      border-radius: 4px;
      line-height: 1;
    }
    .promo-dismiss:hover { background: rgba(255,255,255,0.3); }

    /* GitHub metrics styles */
    .github-metrics {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin: 8px 0;
      background-color: var(--pm-surface);
      border-radius: 6px;
      font-size: 12px;
      color: var(--pm-neutral);
      border: 1px solid var(--pm-border);
    }
    .github-link {
      color: var(--pm-primary);
      text-decoration: none;
      margin-left: auto;
    }
    .github-link:hover {
      text-decoration: underline;
    }
    .badge.security-advisory {
      background-color: #dc2626;
      color: white;
    }
    .badge.archived {
      background-color: #6b7280;
      color: white;
    }
    .badge.stale-repo {
      background-color: #f59e0b;
      color: white;
    }
    .badge.high-issue-count {
      background-color: #f97316;
      color: white;
    }
    .issue-detail.suggestion {
      color: var(--pm-primary);
      font-style: italic;
    }
    .fix-btn-link {
      background: transparent;
      color: var(--pm-primary);
      border: 1px solid var(--pm-primary);
    }
    .fix-btn-link:hover {
      background: var(--pm-primary);
      color: white;
    }

    .promo-subtle {
      padding: 12px 16px;
      font-size: 12px;
      color: var(--pm-neutral);
      background-color: var(--pm-surface);
      border-top: 1px solid var(--pm-border);
    }
    .promo-subtle a {
      color: var(--pm-primary);
      text-decoration: none;
    }
    .promo-subtle a:hover {
      text-decoration: underline;
    }
    .promo-subtle .coming-soon {
      color: var(--pm-neutral);
      font-style: italic;
      margin-left: 4px;
    }
  </style>
</head>
<body>
  <div id="promo-banner" class="promo-banner">
    <span>&#128640;</span>
    <span>Need private package hosting?</span>
    <a href="https://moinsen.pub" target="_blank">Try Moinsen Pub</a>
    <button class="promo-dismiss" id="promo-dismiss" title="Dismiss">&#10005;</button>
  </div>

  <div id="offline-banner" class="offline-banner">
    <span>&#9888;</span>
    <span>Offline mode - using cached data</span>
  </div>

  <div class="header">
    <h1>
      <span>&#128230;</span>
      <span>Moinsen Pubspec Master</span>
      <span class="selection-badge" id="selection-badge" style="display: none;"></span>
    </h1>
    <div class="header-actions">
      <button class="btn btn-secondary" id="btn-show-all" style="display: none;">
        <span>&#128203;</span> Show All
      </button>
      <button class="btn btn-secondary" id="btn-refresh">
        <span>&#128260;</span> Refresh
      </button>
      <button class="btn btn-primary" id="btn-pub-get-all">
        <span>&#128229;</span> Pub Get All
      </button>
      <button class="btn btn-secondary" id="btn-pub-upgrade-all">
        <span>&#11014;</span> Upgrade All
      </button>
      <button class="btn btn-secondary" id="btn-check-updates">
        <span>&#128270;</span> Check Updates
      </button>
      <button class="btn btn-secondary" id="btn-analyze">
        <span>&#128269;</span> Analyze
      </button>
      <button class="btn btn-secondary" id="btn-rollback">
        <span>&#8617;</span> Rollback
      </button>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value" id="package-count">0</div>
      <div class="stat-label">Packages</div>
    </div>
    <div class="stat-card" id="conflicts-card">
      <div class="stat-value" id="conflict-count">0</div>
      <div class="stat-label">Conflicts</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="dependency-count">0</div>
      <div class="stat-label">Dependencies</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="health-score">100</div>
      <div class="stat-label">Health Score</div>
    </div>
    <div class="stat-card" id="outdated-card">
      <div class="stat-value" id="outdated-count">-</div>
      <div class="stat-label">Outdated</div>
    </div>
  </div>

  <div class="section" id="outdated-section" style="display: none;">
    <div class="section-header">
      <h2 class="section-title">Outdated Packages</h2>
      <button class="btn btn-secondary" id="btn-update-all" style="display: none;">
        <span>&#11014;</span> Update All
      </button>
    </div>
    <div class="issues-list" id="outdated-list"></div>
  </div>

  <div class="section" id="health-section" style="display: none;">
    <div class="section-header">
      <h2 class="section-title">&#9888; Package Health Warnings</h2>
    </div>
    <div class="issues-list" id="health-list"></div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2 class="section-title">Issues</h2>
      <button class="btn btn-secondary" id="btn-fix-all" style="display: none;">
        <span>&#10003;</span> Fix All
      </button>
    </div>
    <div class="issues-list" id="issues-list"></div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2 class="section-title">Packages</h2>
      <button class="btn btn-secondary" id="btn-show-graph">
        <span>&#128279;</span> View Graph
      </button>
    </div>
    <div class="package-list" id="package-list"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Restore state (including promo banner dismissed status)
    const previousState = vscode.getState() || {};
    if (previousState.promoDismissed) {
      document.getElementById('promo-banner').classList.add('hidden');
    }

    // Handle promo banner dismiss
    document.getElementById('promo-dismiss').addEventListener('click', function() {
      document.getElementById('promo-banner').classList.add('hidden');
      vscode.setState({ ...vscode.getState(), promoDismissed: true });
    });

    // Sanitize text content to prevent XSS
    function sanitizeText(text) {
      if (typeof text !== 'string') return '';
      return text;
    }

    // Create element with text content (safe)
    function createTextElement(tag, text, className) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      el.textContent = sanitizeText(text);
      return el;
    }

    // Setup event listeners
    document.getElementById('btn-refresh').addEventListener('click', function() {
      vscode.postMessage({ command: 'refresh' });
    });

    document.getElementById('btn-pub-get-all').addEventListener('click', function() {
      vscode.postMessage({ command: 'pubGetAll' });
    });

    document.getElementById('btn-pub-upgrade-all').addEventListener('click', function() {
      vscode.postMessage({ command: 'pubUpgradeAll' });
    });

    document.getElementById('btn-show-graph').addEventListener('click', function() {
      vscode.postMessage({ command: 'showGraph' });
    });

    document.getElementById('btn-fix-all').addEventListener('click', function() {
      vscode.postMessage({ command: 'fixAllConflicts' });
    });

    document.getElementById('btn-analyze').addEventListener('click', function() {
      vscode.postMessage({ command: 'analyze' });
    });

    document.getElementById('btn-rollback').addEventListener('click', function() {
      vscode.postMessage({ command: 'showBackups' });
    });

    document.getElementById('btn-check-updates').addEventListener('click', function() {
      vscode.postMessage({ command: 'checkUpdates' });
    });

    document.getElementById('btn-update-all').addEventListener('click', function() {
      vscode.postMessage({ command: 'updateAllOutdated' });
    });

    document.getElementById('btn-show-all').addEventListener('click', function() {
      vscode.postMessage({ command: 'showAll' });
    });

    // Message handlers
    window.addEventListener('message', function(event) {
      const message = event.data;
      if (message.command === 'updateData') {
        updateUI(message.data);
      }
    });

    function updateUI(data) {
      // Update selection context badge and show all button
      const selectionBadge = document.getElementById('selection-badge');
      const showAllBtn = document.getElementById('btn-show-all');
      if (data.selectionContext) {
        selectionBadge.textContent = data.selectionContext;
        selectionBadge.style.display = 'inline-block';
        showAllBtn.style.display = 'flex';
      } else {
        selectionBadge.style.display = 'none';
        showAllBtn.style.display = 'none';
      }

      // Update stats using textContent (safe)
      document.getElementById('package-count').textContent = data.packages.length;
      document.getElementById('conflict-count').textContent = data.analysis?.conflicts?.length || 0;
      document.getElementById('dependency-count').textContent = data.analysis?.summary?.totalDependencies || 0;
      document.getElementById('health-score').textContent = data.analysis?.healthScore || 100;

      // Update conflicts card color
      const conflictsCard = document.getElementById('conflicts-card');
      const conflictCount = data.analysis?.conflicts?.length || 0;
      conflictsCard.className = 'stat-card' + (conflictCount > 0 ? ' error' : ' success');

      // Update offline banner
      const offlineBanner = document.getElementById('offline-banner');
      offlineBanner.className = data.isOnline ? 'offline-banner' : 'offline-banner visible';

      // Update outdated packages stat and section
      renderOutdatedPackages(data.outdatedPackages, data.isCheckingUpdates);

      // Update issues list using DOM methods (safe)
      renderIssues(data.analysis);

      // Update health issues (Package Health Warnings section)
      renderHealthIssues(data.analysis?.healthIssues || []);

      // Update package list using DOM methods (safe)
      renderPackages(data.packages);
    }

    function renderOutdatedPackages(outdatedPackages, isCheckingUpdates) {
      const outdatedSection = document.getElementById('outdated-section');
      const outdatedList = document.getElementById('outdated-list');
      const outdatedCountEl = document.getElementById('outdated-count');
      const outdatedCard = document.getElementById('outdated-card');
      const updateAllBtn = document.getElementById('btn-update-all');
      const checkUpdatesBtn = document.getElementById('btn-check-updates');

      // Handle loading state
      if (isCheckingUpdates) {
        outdatedCountEl.textContent = '...';
        checkUpdatesBtn.disabled = true;
        // Clear button and rebuild with safe DOM
        while (checkUpdatesBtn.firstChild) {
          checkUpdatesBtn.removeChild(checkUpdatesBtn.firstChild);
        }
        checkUpdatesBtn.appendChild(document.createTextNode('Checking...'));
        return;
      }

      // Reset check button using safe DOM methods
      checkUpdatesBtn.disabled = false;
      while (checkUpdatesBtn.firstChild) {
        checkUpdatesBtn.removeChild(checkUpdatesBtn.firstChild);
      }
      const btnIcon = document.createElement('span');
      btnIcon.textContent = '\\u{1F50D}';
      checkUpdatesBtn.appendChild(btnIcon);
      checkUpdatesBtn.appendChild(document.createTextNode(' Check Updates'));

      // Clear existing content
      while (outdatedList.firstChild) {
        outdatedList.removeChild(outdatedList.firstChild);
      }

      // Handle no data (not checked yet)
      if (!outdatedPackages || outdatedPackages.length === undefined) {
        outdatedCountEl.textContent = '-';
        outdatedCard.className = 'stat-card';
        outdatedSection.style.display = 'none';
        updateAllBtn.style.display = 'none';
        return;
      }

      // Update count
      outdatedCountEl.textContent = outdatedPackages.length;

      // Update card color based on count
      if (outdatedPackages.length === 0) {
        outdatedCard.className = 'stat-card success';
        outdatedSection.style.display = 'none';
        updateAllBtn.style.display = 'none';
        return;
      }

      outdatedCard.className = 'stat-card warning';
      outdatedSection.style.display = 'block';
      updateAllBtn.style.display = 'flex';

      // Render each outdated package
      outdatedPackages.forEach(function(pkg) {
        const item = document.createElement('div');
        item.className = 'issue-item';

        const icon = createTextElement('span', '\\u{1F4E6}', 'issue-icon');
        item.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'issue-content';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'issue-title';
        titleDiv.textContent = sanitizeText(pkg.name);

        const badge = createTextElement('span', 'update', 'badge medium');
        titleDiv.appendChild(badge);
        content.appendChild(titleDiv);

        var detailText = pkg.current + ' \\u2192 ' + (pkg.latest || 'unknown');
        if (pkg.usedIn && pkg.usedIn.length > 0) {
          detailText += ' (used in: ' + pkg.usedIn.join(', ') + ')';
        }
        const detailDiv = createTextElement('div', detailText, 'issue-detail');
        content.appendChild(detailDiv);

        item.appendChild(content);

        // Add Update button
        if (pkg.latest) {
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'issue-actions';

          const updateBtn = document.createElement('button');
          updateBtn.className = 'fix-btn';
          updateBtn.textContent = 'Update';
          updateBtn.title = 'Update to ' + pkg.latest;
          updateBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            vscode.postMessage({
              command: 'updateDependency',
              dependencyName: pkg.name,
              newVersion: pkg.latest
            });
          });
          actionsDiv.appendChild(updateBtn);
          item.appendChild(actionsDiv);
        }

        outdatedList.appendChild(item);
      });
    }

    function renderIssues(analysis) {
      const container = document.getElementById('issues-list');
      const fixAllBtn = document.getElementById('btn-fix-all');

      // Clear existing content
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      const conflicts = analysis?.conflicts || [];
      const sdkMismatches = analysis?.sdkMismatches || [];

      // Count fixable conflicts (those with suggestions)
      const fixableCount = conflicts.filter(function(c) { return c.suggestedResolution; }).length;

      // Show/hide Fix All button
      if (fixableCount > 1) {
        fixAllBtn.style.display = 'flex';
      } else {
        fixAllBtn.style.display = 'none';
      }

      if (conflicts.length === 0 && sdkMismatches.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        const emptyIcon = createTextElement('div', '\\u2705', 'empty-state-icon');
        const emptyText = createTextElement('div', 'No issues detected');
        emptyState.appendChild(emptyIcon);
        emptyState.appendChild(emptyText);
        container.appendChild(emptyState);
        return;
      }

      // Render conflicts
      conflicts.forEach(function(conflict, index) {
        const item = document.createElement('div');
        item.className = 'issue-item';

        const icon = createTextElement('span', '\\u274C', 'issue-icon');
        item.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'issue-content';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'issue-title';
        titleDiv.textContent = sanitizeText('Version conflict: ' + conflict.dependencyName);

        const badge = createTextElement('span', conflict.severity, 'badge ' + conflict.severity);
        titleDiv.appendChild(badge);
        content.appendChild(titleDiv);

        const detailText = conflict.packages.map(function(p) { return p.packageName + ' (' + p.constraint + ')'; }).join(', ');
        const detailDiv = createTextElement('div', detailText, 'issue-detail');
        content.appendChild(detailDiv);

        if (conflict.suggestedResolution) {
          const suggestionDiv = createTextElement('div', 'Suggested: ' + conflict.suggestedResolution, 'issue-detail');
          content.appendChild(suggestionDiv);
        }

        item.appendChild(content);

        // Add Fix button for conflicts with suggestions
        if (conflict.suggestedResolution) {
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'issue-actions';

          const fixBtn = document.createElement('button');
          fixBtn.className = 'fix-btn';
          fixBtn.textContent = 'Fix';
          fixBtn.title = 'Apply suggested fix: ' + conflict.suggestedResolution;
          fixBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            vscode.postMessage({ command: 'fixConflict', conflictIndex: index });
          });
          actionsDiv.appendChild(fixBtn);
          item.appendChild(actionsDiv);
        }

        container.appendChild(item);
      });

      // Render SDK mismatches
      sdkMismatches.forEach(function(mismatch, index) {
        const item = document.createElement('div');
        item.className = 'issue-item';

        const icon = createTextElement('span', '\\u26A0', 'issue-icon');
        item.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'issue-content';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'issue-title';
        titleDiv.textContent = 'SDK constraint mismatch';

        const badge = createTextElement('span', mismatch.severity, 'badge ' + mismatch.severity);
        titleDiv.appendChild(badge);
        content.appendChild(titleDiv);

        const detailDiv = createTextElement('div', 'Range: ' + mismatch.lowestConstraint + ' to ' + mismatch.highestConstraint, 'issue-detail');
        content.appendChild(detailDiv);

        item.appendChild(content);

        // Add Fix button for SDK mismatches
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'issue-actions';

        const fixBtn = document.createElement('button');
        fixBtn.className = 'fix-btn fix-btn-secondary';
        fixBtn.textContent = 'Fix';
        fixBtn.title = 'Unify SDK constraints';
        fixBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          vscode.postMessage({ command: 'fixSdkMismatch', sdkMismatchIndex: index });
        });
        actionsDiv.appendChild(fixBtn);
        item.appendChild(actionsDiv);

        container.appendChild(item);
      });
    }

    function renderHealthIssues(healthIssues) {
      const healthSection = document.getElementById('health-section');
      const healthList = document.getElementById('health-list');

      // Clear existing content
      while (healthList.firstChild) {
        healthList.removeChild(healthList.firstChild);
      }

      // Hide section if no health issues
      if (!healthIssues || healthIssues.length === 0) {
        healthSection.style.display = 'none';
        return;
      }

      // Show section
      healthSection.style.display = 'block';

      // Render each health issue
      healthIssues.forEach(function(issue) {
        const item = document.createElement('div');
        item.className = 'issue-item';

        // Icon based on severity and issue type
        var iconText = '\\u26A0'; // Default warning
        if (issue.severity === 'critical') {
          if (issue.issueType === 'security-advisory') {
            iconText = '\\u{1F6A8}'; // Police car light for security
          } else if (issue.issueType === 'archived') {
            iconText = '\\u{1F4E6}'; // Package for archived
          } else {
            iconText = '\\u{1F6D1}'; // Stop sign
          }
        } else if (issue.severity === 'info') {
          iconText = '\\u{1F4A1}'; // Light bulb
        }
        const icon = createTextElement('span', iconText, 'issue-icon');
        item.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'issue-content';

        // Title with package name and badges
        const titleDiv = document.createElement('div');
        titleDiv.className = 'issue-title';
        titleDiv.textContent = sanitizeText(issue.packageName);

        // Add risk score badge if available
        if (issue.riskScore !== undefined && issue.riskScore !== null) {
          var riskClass = 'badge ';
          if (issue.riskScore >= 70) {
            riskClass += 'critical';
          } else if (issue.riskScore >= 40) {
            riskClass += 'warning';
          } else {
            riskClass += 'info';
          }
          const riskBadge = createTextElement('span', 'Risk: ' + issue.riskScore + '/100', riskClass);
          titleDiv.appendChild(riskBadge);
        }

        // Add issue type badge
        var typeBadgeText = issue.issueType.replace(/-/g, ' ');
        var typeBadgeClass = 'badge ' + issue.issueType;
        const typeBadge = createTextElement('span', typeBadgeText, typeBadgeClass);
        titleDiv.appendChild(typeBadge);

        content.appendChild(titleDiv);

        // Detail line with message
        const detailDiv = createTextElement('div', issue.message, 'issue-detail');
        content.appendChild(detailDiv);

        // Show GitHub metrics if available
        if (issue.github) {
          const githubDiv = document.createElement('div');
          githubDiv.className = 'github-metrics';

          var metricsText = '\\u{1F4CA} GitHub: ';
          var metricParts = [];

          if (issue.github.stars !== undefined) {
            metricParts.push('\\u2B50 ' + issue.github.stars.toLocaleString());
          }
          if (issue.github.openIssues !== undefined) {
            metricParts.push('\\u{1F41B} ' + issue.github.openIssues + ' issues');
          }
          if (issue.github.openPRs !== undefined) {
            metricParts.push('\\u{1F500} ' + issue.github.openPRs + ' PRs');
          }
          if (issue.github.daysSinceLastCommit !== undefined && issue.github.daysSinceLastCommit > 30) {
            var commitMonths = Math.floor(issue.github.daysSinceLastCommit / 30);
            metricParts.push('\\u{23F0} ' + commitMonths + 'mo since commit');
          }
          if (issue.github.isArchived) {
            metricParts.push('\\u{1F4E6} Archived');
          }
          if (issue.github.securityAdvisoryCount > 0) {
            metricParts.push('\\u{1F6A8} ' + issue.github.securityAdvisoryCount + ' security alert' + (issue.github.securityAdvisoryCount > 1 ? 's' : ''));
          }

          metricsText += metricParts.join(' \\u2022 ');
          githubDiv.textContent = metricsText;

          // Make the repo name clickable if available
          if (issue.github.repoFullName) {
            const repoLink = document.createElement('a');
            repoLink.href = 'https://github.com/' + issue.github.repoFullName;
            repoLink.target = '_blank';
            repoLink.textContent = ' \\u2192 View on GitHub';
            repoLink.className = 'github-link';
            githubDiv.appendChild(repoLink);
          }

          content.appendChild(githubDiv);
        }

        // Show which packages use this dependency
        if (issue.usedBy && issue.usedBy.length > 0) {
          const usedByText = 'Used by: ' + issue.usedBy.join(', ');
          const usedByDiv = createTextElement('div', usedByText, 'issue-detail');
          content.appendChild(usedByDiv);
        }

        // Show time since last update on pub.dev
        if (issue.daysSinceUpdate > 0) {
          var ageText = '';
          var yearsAgo = Math.floor(issue.daysSinceUpdate / 365);
          var monthsAgo = Math.floor((issue.daysSinceUpdate % 365) / 30);
          if (yearsAgo > 0) {
            ageText = 'Last pub.dev update: ' + yearsAgo + ' year' + (yearsAgo > 1 ? 's' : '');
            if (monthsAgo > 0) {
              ageText += ' ' + monthsAgo + ' month' + (monthsAgo > 1 ? 's' : '');
            }
            ageText += ' ago';
          } else if (monthsAgo > 0) {
            ageText = 'Last pub.dev update: ' + monthsAgo + ' month' + (monthsAgo > 1 ? 's' : '') + ' ago';
          }
          if (ageText) {
            const ageDiv = createTextElement('div', ageText, 'issue-detail');
            content.appendChild(ageDiv);
          }
        }

        // Show suggestion if available
        if (issue.suggestion) {
          const suggestionDiv = createTextElement('div', '\\u{1F4A1} ' + issue.suggestion, 'issue-detail suggestion');
          content.appendChild(suggestionDiv);
        }

        item.appendChild(content);

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'issue-actions';

        // Add "Find Alternatives" button for critical issues
        if (issue.severity === 'critical' || issue.issueType === 'discontinued' || issue.issueType === 'archived') {
          const altBtn = document.createElement('button');
          altBtn.className = 'fix-btn fix-btn-secondary';
          altBtn.textContent = 'Find Alternatives';
          altBtn.title = 'Search for alternative packages on pub.dev';
          altBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            window.open('https://pub.dev/packages?q=' + encodeURIComponent(issue.packageName), '_blank');
          });
          actionsDiv.appendChild(altBtn);
        }

        // Add "View Issues" button if GitHub metrics show high issue count
        if (issue.github && issue.github.repoFullName && issue.github.openIssues > 0) {
          const issuesBtn = document.createElement('button');
          issuesBtn.className = 'fix-btn fix-btn-link';
          issuesBtn.textContent = 'View Issues';
          issuesBtn.title = 'View open issues on GitHub';
          issuesBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            window.open('https://github.com/' + issue.github.repoFullName + '/issues', '_blank');
          });
          actionsDiv.appendChild(issuesBtn);
        }

        if (actionsDiv.children.length > 0) {
          item.appendChild(actionsDiv);
        }

        healthList.appendChild(item);
      });

      // Add subtle Moinsen Pub promotion at the bottom
      var promoMessage = '\\u{1F4A1} ';
      if (healthIssues.some(function(i) { return i.severity === 'critical'; })) {
        promoMessage += 'Moinsen Pub patches issues before they become emergencies. ';
      } else if (healthIssues.some(function(i) { return i.severity === 'warning'; })) {
        promoMessage += 'Moinsen Pub keeps your dependencies healthy automatically. ';
      } else {
        promoMessage += 'Moinsen Pub monitors packages 24/7. ';
      }

      const promoDiv = document.createElement('div');
      promoDiv.className = 'promo-subtle';

      const promoText = document.createElement('span');
      promoText.textContent = promoMessage;
      promoDiv.appendChild(promoText);

      const promoLink = document.createElement('a');
      promoLink.href = 'https://pub.moinsen.dev';
      promoLink.target = '_blank';
      promoLink.textContent = 'Learn more \\u2192';
      promoDiv.appendChild(promoLink);

      const comingSoon = document.createElement('span');
      comingSoon.className = 'coming-soon';
      comingSoon.textContent = '(Coming Q1 2026)';
      promoDiv.appendChild(comingSoon);

      healthList.appendChild(promoDiv);
    }

    function renderPackages(packages) {
      const container = document.getElementById('package-list');
      // Clear existing content
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      if (packages.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        const emptyIcon = createTextElement('div', '\\u{1F4E6}', 'empty-state-icon');
        const emptyText = createTextElement('div', 'No packages found');
        emptyState.appendChild(emptyIcon);
        emptyState.appendChild(emptyText);
        container.appendChild(emptyState);
        return;
      }

      packages.forEach(function(pkg) {
        const item = document.createElement('div');
        item.className = 'package-item';

        const iconClass = pkg.type.replace('_', '-');
        var typeIcon = '\\u{1F4E6}';
        var typeLabel = 'Package';
        if (pkg.type === 'flutter_app') {
          typeIcon = '\\u{1F4F1}';
          typeLabel = 'Flutter App';
        } else if (pkg.type === 'flutter_plugin') {
          typeIcon = '\\u{1F50C}';
          typeLabel = 'Plugin';
        }

        const iconDiv = createTextElement('div', typeIcon, 'package-icon ' + iconClass);
        item.appendChild(iconDiv);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'package-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'package-name';
        nameDiv.textContent = sanitizeText(pkg.name);

        if (pkg.isWorkspacePackage) {
          const badge = createTextElement('span', 'workspace', 'badge workspace');
          nameDiv.appendChild(badge);
        }
        infoDiv.appendChild(nameDiv);

        const metaText = typeLabel + ' \\u2022 ' + (pkg.sdkConstraint || 'No SDK') + ' \\u2022 ' + pkg.dependencyCount + ' deps';
        const metaDiv = createTextElement('div', metaText, 'package-meta');
        infoDiv.appendChild(metaDiv);

        item.appendChild(infoDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'package-actions';

        const getBtn = document.createElement('button');
        getBtn.className = 'icon-btn';
        getBtn.title = 'Pub Get';
        getBtn.textContent = '\\u{1F4E5}';
        getBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          vscode.postMessage({ command: 'pubGet', packageName: pkg.name });
        });
        actionsDiv.appendChild(getBtn);

        const upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'icon-btn';
        upgradeBtn.title = 'Pub Upgrade';
        upgradeBtn.textContent = '\\u2B06';
        upgradeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          vscode.postMessage({ command: 'pubUpgrade', packageName: pkg.name });
        });
        actionsDiv.appendChild(upgradeBtn);

        item.appendChild(actionsDiv);

        // Store path as data attribute for click handler
        item.dataset.path = pkg.path;
        item.addEventListener('click', function() {
          vscode.postMessage({ command: 'openPubspec', packagePath: pkg.path });
        });

        container.appendChild(item);
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for Content Security Policy
   */
  private getNonce(): string {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
