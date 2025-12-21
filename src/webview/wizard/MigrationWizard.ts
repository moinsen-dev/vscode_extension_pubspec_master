import * as vscode from 'vscode';
import * as path from 'path';
import {
  MigrationAnalyzer,
  MigrationPlanner,
  MigrationExecutor,
  WorkspaceAnalysis,
  MigrationTarget,
  MigrationPlan,
  WizardStepId,
} from '../../migration';
import { WorkspaceScanner } from '../../core';

/**
 * Migration Wizard WebView Panel
 *
 * Guides users through Pub Workspaces migration with a step-by-step wizard
 */
export class MigrationWizard {
  public static currentPanel: MigrationWizard | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly workspaceRoot: string;
  private disposables: vscode.Disposable[] = [];

  // Wizard state
  private currentStep: WizardStepId = 'analyze';
  private analysis: WorkspaceAnalysis | null = null;
  private selectedTarget: MigrationTarget = 'pub_workspaces';
  private plan: MigrationPlan | null = null;
  private backupPath: string | null = null;
  private isProcessing = false;

  private constructor(
    panel: vscode.WebviewPanel,
    workspaceRoot: string
  ) {
    this.panel = panel;
    this.workspaceRoot = workspaceRoot;

    // Set up message handling
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Initial render
    this.updatePanel();

    // Start analysis automatically
    this.runAnalysis();
  }

  /**
   * Create or show the migration wizard
   */
  public static createOrShow(extensionUri: vscode.Uri, workspaceRoot: string): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, show it
    if (MigrationWizard.currentPanel) {
      MigrationWizard.currentPanel.panel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'pubspecMaster.migrationWizard',
      'Migration Wizard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    MigrationWizard.currentPanel = new MigrationWizard(panel, workspaceRoot);
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: { command: string; target?: MigrationTarget }): Promise<void> {
    switch (message.command) {
      case 'selectTarget':
        if (message.target) {
          this.selectedTarget = message.target;
          this.updatePanel();
        }
        break;

      case 'next':
        await this.goToNextStep();
        break;

      case 'back':
        this.goToPreviousStep();
        break;

      case 'createPlan':
        await this.createPlan();
        break;

      case 'execute':
        await this.executePlan();
        break;

      case 'rollback':
        await this.rollback();
        break;

      case 'close':
        this.panel.dispose();
        break;
    }
  }

  /**
   * Run workspace analysis
   */
  private async runAnalysis(): Promise<void> {
    this.isProcessing = true;
    this.updatePanel();

    try {
      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
      }

      // First scan for packages
      const scanner = new WorkspaceScanner();
      const scanResult = await scanner.scan(workspaceFolders[0]);

      // Then analyze for migration
      const analyzer = new MigrationAnalyzer(this.workspaceRoot);
      this.analysis = await analyzer.analyze(scanResult.packages);
      this.currentStep = 'analyze';
    } catch (error) {
      vscode.window.showErrorMessage(`Analysis failed: ${error}`);
    } finally {
      this.isProcessing = false;
      this.updatePanel();
    }
  }

  /**
   * Create migration plan
   */
  private async createPlan(): Promise<void> {
    if (!this.analysis) {return;}

    this.isProcessing = true;
    this.updatePanel();

    try {
      const planner = new MigrationPlanner(this.workspaceRoot);
      this.plan = await planner.createPlan(this.analysis, this.selectedTarget);
      this.currentStep = 'preview';
    } catch (error) {
      vscode.window.showErrorMessage(`Plan creation failed: ${error}`);
    } finally {
      this.isProcessing = false;
      this.updatePanel();
    }
  }

  /**
   * Execute migration plan
   */
  private async executePlan(): Promise<void> {
    if (!this.plan) {return;}

    this.isProcessing = true;
    this.currentStep = 'apply';
    this.updatePanel();

    try {
      const executor = new MigrationExecutor(this.workspaceRoot);
      const result = await executor.execute(this.plan, {
        createBackup: true,
        runPostCommands: true,
      });

      this.backupPath = result.backupPath || null;

      if (result.success) {
        this.currentStep = 'complete';
        vscode.window.showInformationMessage('Migration completed successfully!');
        // Refresh dashboard
        vscode.commands.executeCommand('pubspecMaster.refresh');
      } else {
        const errors = result.errors.map((e) => e.error).join('\n');
        vscode.window.showWarningMessage(
          `Migration completed with issues:\n${errors}`,
          'View Output'
        ).then((selection) => {
          if (selection === 'View Output') {
            vscode.commands.executeCommand('workbench.action.output.show');
          }
        });
        this.currentStep = 'complete';
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Migration failed: ${error}`);
    } finally {
      this.isProcessing = false;
      this.updatePanel();
    }
  }

  /**
   * Rollback to backup
   */
  private async rollback(): Promise<void> {
    if (!this.backupPath) {
      vscode.window.showErrorMessage('No backup available for rollback');
      return;
    }

    this.isProcessing = true;
    this.updatePanel();

    try {
      const executor = new MigrationExecutor(this.workspaceRoot);
      const result = await executor.rollback(this.backupPath);

      if (result.success) {
        vscode.window.showInformationMessage('Rollback completed successfully');
        this.backupPath = null;
        // Refresh dashboard
        vscode.commands.executeCommand('pubspecMaster.refresh');
      } else {
        vscode.window.showErrorMessage(`Rollback failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Rollback failed: ${error}`);
    } finally {
      this.isProcessing = false;
      this.updatePanel();
    }
  }

  /**
   * Navigate to next step
   */
  private async goToNextStep(): Promise<void> {
    switch (this.currentStep) {
      case 'analyze':
        this.currentStep = 'select';
        break;
      case 'select':
        await this.createPlan();
        break;
      case 'preview':
        this.currentStep = 'backup';
        break;
      case 'backup':
        await this.executePlan();
        break;
    }
    this.updatePanel();
  }

  /**
   * Navigate to previous step
   */
  private goToPreviousStep(): void {
    switch (this.currentStep) {
      case 'select':
        this.currentStep = 'analyze';
        break;
      case 'preview':
        this.currentStep = 'select';
        break;
      case 'backup':
        this.currentStep = 'preview';
        break;
    }
    this.updatePanel();
  }

  /**
   * Update panel content
   */
  private updatePanel(): void {
    this.panel.webview.html = this.getHtmlContent();
  }

  /**
   * Get HTML content for webview
   */
  private getHtmlContent(): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Migration Wizard</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="wizard">
    ${this.renderStepper()}
    <div class="content">
      ${this.renderCurrentStep()}
    </div>
    ${this.renderFooter()}
  </div>
  <script nonce="${nonce}">
    ${this.getScript()}
  </script>
</body>
</html>`;
  }

  /**
   * Render stepper navigation
   */
  private renderStepper(): string {
    const steps: { key: WizardStepId; label: string }[] = [
      { key: 'analyze', label: 'Analyze' },
      { key: 'select', label: 'Select Target' },
      { key: 'preview', label: 'Preview' },
      { key: 'backup', label: 'Backup' },
      { key: 'apply', label: 'Apply' },
    ];

    const stepOrder: WizardStepId[] = ['analyze', 'select', 'preview', 'backup', 'apply', 'complete'];
    const currentIndex = stepOrder.indexOf(this.currentStep);

    const stepsHtml = steps.map((step, index) => {
      let className = 'step';
      if (index < currentIndex) {className += ' completed';}
      if (step.key === this.currentStep) {className += ' active';}
      return `<div class="${className}">
        <div class="step-number">${index + 1}</div>
        <div class="step-label">${this.escapeHtml(step.label)}</div>
      </div>`;
    }).join('');

    return `<div class="stepper">${stepsHtml}</div>`;
  }

  /**
   * Render current step content
   */
  private renderCurrentStep(): string {
    if (this.isProcessing) {
      return this.renderLoading();
    }

    switch (this.currentStep) {
      case 'analyze':
        return this.renderAnalyzeStep();
      case 'select':
        return this.renderSelectStep();
      case 'preview':
        return this.renderPreviewStep();
      case 'backup':
        return this.renderBackupStep();
      case 'apply':
        return this.renderApplyStep();
      case 'complete':
        return this.renderCompleteStep();
      default:
        return '';
    }
  }

  /**
   * Render loading state
   */
  private renderLoading(): string {
    return `<div class="loading">
      <div class="spinner"></div>
      <p>Processing...</p>
    </div>`;
  }

  /**
   * Render analyze step
   */
  private renderAnalyzeStep(): string {
    if (!this.analysis) {
      return this.renderLoading();
    }

    const { currentState, packages, blockers, warnings } = this.analysis;
    const canMigrate = blockers.length === 0;

    let blockersHtml = '';
    if (blockers.length > 0) {
      blockersHtml = `<div class="section blockers">
        <h3>Blockers</h3>
        <ul>${blockers.map((b) => `<li class="blocker">${this.escapeHtml(b.message)}</li>`).join('')}</ul>
      </div>`;
    }

    let warningsHtml = '';
    if (warnings.length > 0) {
      warningsHtml = `<div class="section warnings">
        <h3>Warnings</h3>
        <ul>${warnings.map((w) => `<li class="warning">${this.escapeHtml(w.message)}</li>`).join('')}</ul>
      </div>`;
    }

    const stateLabels: Record<string, string> = {
      standalone: 'Standalone Packages',
      pub_workspaces: 'Pub Workspaces',
      melos: 'Melos Monorepo',
      mixed: 'Mixed Configuration',
    };

    return `<div class="step-content">
      <h2>Workspace Analysis</h2>

      <div class="section">
        <h3>Current State</h3>
        <div class="state-badge ${currentState}">${this.escapeHtml(stateLabels[currentState] || currentState)}</div>
      </div>

      <div class="section">
        <h3>Packages Found</h3>
        <div class="package-count">${packages.length} packages</div>
        <ul class="package-list">
          ${packages.map((p) => `<li>${this.escapeHtml(p.name)} <span class="version">${this.escapeHtml(p.version || 'unknown')}</span></li>`).join('')}
        </ul>
      </div>

      ${blockersHtml}
      ${warningsHtml}

      ${!canMigrate ? '<div class="cannot-migrate"><p>Migration is blocked. Please resolve the blockers above before continuing.</p></div>' : ''}
    </div>`;
  }

  /**
   * Render target selection step
   */
  private renderSelectStep(): string {
    const targets: { value: MigrationTarget; label: string; description: string }[] = [
      {
        value: 'pub_workspaces',
        label: 'Pub Workspaces',
        description: 'Native Dart 3.6+ workspace support. Recommended for new projects.',
      },
      {
        value: 'pub_workspaces_melos',
        label: 'Pub Workspaces + Melos',
        description: 'Combine Pub Workspaces with Melos for advanced scripting and publishing.',
      },
      {
        value: 'keep_current',
        label: 'Keep Current',
        description: 'Make no changes to current workspace configuration.',
      },
    ];

    const targetsHtml = targets.map((t) => {
      const selected = t.value === this.selectedTarget ? 'selected' : '';
      return `<div class="target-option ${selected}" data-target="${t.value}">
        <div class="target-radio">${selected ? '●' : '○'}</div>
        <div class="target-info">
          <div class="target-label">${this.escapeHtml(t.label)}</div>
          <div class="target-description">${this.escapeHtml(t.description)}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="step-content">
      <h2>Select Migration Target</h2>
      <div class="target-list">${targetsHtml}</div>
    </div>`;
  }

  /**
   * Render preview step
   */
  private renderPreviewStep(): string {
    if (!this.plan) {
      return this.renderLoading();
    }

    const changesHtml = this.plan.changes.map((change) => {
      const icon = change.type === 'create' ? '+' : change.type === 'delete' ? '-' : '~';
      const className = change.type;
      return `<div class="change ${className}">
        <span class="change-icon">${icon}</span>
        <span class="change-path">${this.escapeHtml(change.relativePath)}</span>
      </div>`;
    }).join('');

    const commandsHtml = this.plan.postMigrationCommands.length > 0
      ? `<div class="section">
          <h3>Post-Migration Commands</h3>
          <ul class="command-list">
            ${this.plan.postMigrationCommands.map((cmd) => `<li><code>${this.escapeHtml(cmd)}</code></li>`).join('')}
          </ul>
        </div>`
      : '';

    return `<div class="step-content">
      <h2>Preview Changes</h2>

      <div class="section">
        <h3>File Changes</h3>
        <div class="changes-list">${changesHtml}</div>
      </div>

      ${commandsHtml}

      <div class="info-box">
        <p>Review the changes above. Click "Next" to proceed to backup configuration.</p>
      </div>
    </div>`;
  }

  /**
   * Render backup step
   */
  private renderBackupStep(): string {
    return `<div class="step-content">
      <h2>Backup Configuration</h2>

      <div class="section">
        <div class="backup-info">
          <div class="backup-icon">💾</div>
          <div class="backup-text">
            <h3>Automatic Backup</h3>
            <p>A backup will be created before applying changes. You can rollback at any time if something goes wrong.</p>
          </div>
        </div>
      </div>

      <div class="info-box warning">
        <p><strong>Important:</strong> Make sure you have committed any uncommitted changes to git before proceeding.</p>
      </div>
    </div>`;
  }

  /**
   * Render apply step (in progress)
   */
  private renderApplyStep(): string {
    return this.renderLoading();
  }

  /**
   * Render complete step
   */
  private renderCompleteStep(): string {
    const rollbackSection = this.backupPath
      ? `<div class="section">
          <h3>Rollback Available</h3>
          <p>A backup was created at:</p>
          <code>${this.escapeHtml(path.relative(this.workspaceRoot, this.backupPath))}</code>
          <button class="button secondary" onclick="rollback()">Rollback Changes</button>
        </div>`
      : '';

    return `<div class="step-content">
      <h2>Migration Complete</h2>

      <div class="success-icon">✅</div>

      <div class="section">
        <p>Your workspace has been migrated successfully.</p>
        <ul>
          <li>Run <code>dart pub get</code> to install dependencies</li>
          <li>Check the Output panel for any warnings</li>
          <li>Test your packages to ensure everything works</li>
        </ul>
      </div>

      ${rollbackSection}
    </div>`;
  }

  /**
   * Render footer with navigation buttons
   */
  private renderFooter(): string {
    if (this.isProcessing) {
      return '<div class="footer"></div>';
    }

    const canGoBack = ['select', 'preview', 'backup'].includes(this.currentStep);
    const canGoNext = this.currentStep !== 'complete' && this.currentStep !== 'apply';
    const isComplete = this.currentStep === 'complete';

    let nextLabel = 'Next';
    if (this.currentStep === 'backup') {nextLabel = 'Apply Changes';}
    if (this.currentStep === 'select') {nextLabel = 'Create Plan';}

    // Check if can proceed (no blockers means we can migrate)
    const canProceed = (this.analysis?.blockers.length === 0) || this.currentStep !== 'analyze';

    return `<div class="footer">
      ${canGoBack ? '<button class="button secondary" onclick="goBack()">Back</button>' : '<div></div>'}
      ${isComplete
        ? '<button class="button primary" onclick="closeWizard()">Close</button>'
        : canGoNext
          ? `<button class="button primary" onclick="goNext()" ${!canProceed ? 'disabled' : ''}>${this.escapeHtml(nextLabel)}</button>`
          : ''
      }
    </div>`;
  }

  /**
   * Get CSS styles
   */
  private getStyles(): string {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        padding: 20px;
      }

      .wizard {
        max-width: 800px;
        margin: 0 auto;
      }

      .stepper {
        display: flex;
        justify-content: space-between;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--vscode-widget-border);
      }

      .step {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        opacity: 0.5;
      }

      .step.active, .step.completed {
        opacity: 1;
      }

      .step-number {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--vscode-button-secondaryBackground);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
        font-weight: bold;
      }

      .step.active .step-number {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      .step.completed .step-number {
        background: var(--vscode-testing-iconPassed);
        color: white;
      }

      .step-label {
        font-size: 12px;
        text-align: center;
      }

      .content {
        min-height: 400px;
      }

      .step-content h2 {
        margin-bottom: 20px;
        color: var(--vscode-foreground);
      }

      .section {
        margin-bottom: 24px;
      }

      .section h3 {
        margin-bottom: 12px;
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .state-badge {
        display: inline-block;
        padding: 6px 16px;
        border-radius: 16px;
        font-weight: 500;
      }

      .state-badge.standalone {
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
      }

      .state-badge.pub_workspaces {
        background: var(--vscode-testing-iconPassed);
        color: white;
      }

      .state-badge.melos {
        background: var(--vscode-charts-purple);
        color: white;
      }

      .package-count {
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 12px;
      }

      .package-list {
        list-style: none;
        max-height: 200px;
        overflow-y: auto;
      }

      .package-list li {
        padding: 8px 12px;
        background: var(--vscode-list-hoverBackground);
        margin-bottom: 4px;
        border-radius: 4px;
      }

      .package-list .version {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }

      .blockers ul, .warnings ul {
        list-style: none;
      }

      .blocker, .warning {
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .blocker {
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
      }

      .warning {
        background: var(--vscode-inputValidation-warningBackground);
        border: 1px solid var(--vscode-inputValidation-warningBorder);
      }

      .cannot-migrate {
        padding: 16px;
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        border-radius: 4px;
        text-align: center;
      }

      .target-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .target-option {
        display: flex;
        align-items: flex-start;
        padding: 16px;
        border: 2px solid var(--vscode-widget-border);
        border-radius: 8px;
        cursor: pointer;
        transition: border-color 0.2s;
      }

      .target-option:hover {
        border-color: var(--vscode-focusBorder);
      }

      .target-option.selected {
        border-color: var(--vscode-button-background);
        background: var(--vscode-list-hoverBackground);
      }

      .target-radio {
        font-size: 18px;
        margin-right: 12px;
        color: var(--vscode-button-background);
      }

      .target-label {
        font-weight: 600;
        margin-bottom: 4px;
      }

      .target-description {
        color: var(--vscode-descriptionForeground);
        font-size: 13px;
      }

      .changes-list {
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 4px;
        max-height: 250px;
        overflow-y: auto;
      }

      .change {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-widget-border);
        font-family: monospace;
      }

      .change:last-child {
        border-bottom: none;
      }

      .change-icon {
        width: 20px;
        font-weight: bold;
      }

      .change.create .change-icon { color: var(--vscode-testing-iconPassed); }
      .change.modify .change-icon { color: var(--vscode-charts-yellow); }
      .change.delete .change-icon { color: var(--vscode-testing-iconFailed); }

      .command-list {
        list-style: none;
      }

      .command-list li {
        padding: 8px;
        background: var(--vscode-textCodeBlock-background);
        margin-bottom: 4px;
        border-radius: 4px;
      }

      .command-list code {
        font-family: monospace;
      }

      .info-box {
        padding: 16px;
        background: var(--vscode-textBlockQuote-background);
        border-left: 4px solid var(--vscode-textLink-foreground);
        border-radius: 4px;
      }

      .info-box.warning {
        border-left-color: var(--vscode-charts-yellow);
        background: var(--vscode-inputValidation-warningBackground);
      }

      .backup-info {
        display: flex;
        align-items: flex-start;
        padding: 20px;
        background: var(--vscode-list-hoverBackground);
        border-radius: 8px;
      }

      .backup-icon {
        font-size: 48px;
        margin-right: 20px;
      }

      .backup-text h3 {
        margin-bottom: 8px;
        text-transform: none;
        letter-spacing: normal;
      }

      .success-icon {
        font-size: 64px;
        text-align: center;
        margin: 20px 0;
      }

      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--vscode-widget-border);
        border-top-color: var(--vscode-button-background);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .footer {
        display: flex;
        justify-content: space-between;
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid var(--vscode-widget-border);
      }

      .button {
        padding: 10px 24px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }

      .button.primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      .button.primary:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .button.primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }

      .button.secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      code {
        background: var(--vscode-textCodeBlock-background);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: monospace;
      }
    `;
  }

  /**
   * Get client-side JavaScript
   */
  private getScript(): string {
    return `
      const vscode = acquireVsCodeApi();

      function goNext() {
        vscode.postMessage({ command: 'next' });
      }

      function goBack() {
        vscode.postMessage({ command: 'back' });
      }

      function closeWizard() {
        vscode.postMessage({ command: 'close' });
      }

      function rollback() {
        vscode.postMessage({ command: 'rollback' });
      }

      // Target selection
      document.querySelectorAll('.target-option').forEach(option => {
        option.addEventListener('click', () => {
          const target = option.dataset.target;
          vscode.postMessage({ command: 'selectTarget', target });
        });
      });
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    MigrationWizard.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
