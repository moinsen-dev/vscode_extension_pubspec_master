import * as vscode from 'vscode';

/**
 * Provides Quick Fix code actions for pubspec.yaml version conflicts
 * and SDK mismatches in the VS Code lightbulb menu
 */
export class QuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  /**
   * Provide code actions for diagnostics
   */
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] | undefined {
    // Only work with pubspec.yaml files
    if (!document.fileName.endsWith('pubspec.yaml')) {
      return;
    }

    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      // Only handle our diagnostics
      if (diagnostic.source !== 'Moinsen Pubspec Master') {
        continue;
      }

      if (diagnostic.code === 'pubspecMaster.versionConflict') {
        const action = this.createVersionConflictFix(document, diagnostic);
        if (action) {
          actions.push(action);
        }
      } else if (diagnostic.code === 'pubspecMaster.sdkMismatch') {
        const sdkActions = this.createSdkMismatchFixes(document, diagnostic);
        actions.push(...sdkActions);
      }
    }

    return actions;
  }

  /**
   * Create a Quick Fix for a version conflict
   */
  private createVersionConflictFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction | undefined {
    // Extract suggested version from diagnostic
    const suggestion = (diagnostic as unknown as { suggestion?: string }).suggestion;
    if (!suggestion) {
      return undefined;
    }

    // Extract dependency name from message
    const match = diagnostic.message.match(/Version conflict: (\S+)/);
    if (!match) {
      return undefined;
    }
    const dependencyName = match[1];

    const action = new vscode.CodeAction(
      `Update ${dependencyName} to ${suggestion}`,
      vscode.CodeActionKind.QuickFix
    );

    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    // Create edit to update the version
    const edit = new vscode.WorkspaceEdit();
    const line = document.lineAt(diagnostic.range.start.line);
    const lineText = line.text;

    // Find the version constraint in the line
    // Handle formats like: dep_name: ^1.0.0 or dep_name: "^1.0.0"
    const versionPattern = new RegExp(
      `(${this.escapeRegex(dependencyName)}\\s*:\\s*)(\\^?['"]?[0-9][^\\s#]*['"]?)`,
      'i'
    );
    const versionMatch = lineText.match(versionPattern);

    if (versionMatch && versionMatch.index !== undefined) {
      const startPos = versionMatch.index + versionMatch[1].length;
      const endPos = startPos + versionMatch[2].length;

      edit.replace(
        document.uri,
        new vscode.Range(
          diagnostic.range.start.line,
          startPos,
          diagnostic.range.start.line,
          endPos
        ),
        suggestion
      );

      action.edit = edit;
    }

    return action;
  }

  /**
   * Create Quick Fixes for an SDK mismatch
   */
  private createSdkMismatchFixes(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Extract range info from message
    const rangeMatch = diagnostic.message.match(/workspace range: (>=[\d.]+(?:<[\d.]+)?) to (>=[\d.]+(?:<[\d.]+)?)/);
    if (!rangeMatch) {
      return actions;
    }

    const lowestConstraint = rangeMatch[1];
    const highestConstraint = rangeMatch[2];

    // Create action to use highest (most modern)
    const highAction = new vscode.CodeAction(
      `Update SDK to ${highestConstraint} (most modern)`,
      vscode.CodeActionKind.QuickFix
    );
    highAction.diagnostics = [diagnostic];
    highAction.isPreferred = true;

    const highEdit = this.createSdkEdit(document, diagnostic, highestConstraint);
    if (highEdit) {
      highAction.edit = highEdit;
      actions.push(highAction);
    }

    // Create action to use lowest (most compatible)
    if (lowestConstraint !== highestConstraint) {
      const lowAction = new vscode.CodeAction(
        `Update SDK to ${lowestConstraint} (most compatible)`,
        vscode.CodeActionKind.QuickFix
      );
      lowAction.diagnostics = [diagnostic];

      const lowEdit = this.createSdkEdit(document, diagnostic, lowestConstraint);
      if (lowEdit) {
        lowAction.edit = lowEdit;
        actions.push(lowAction);
      }
    }

    return actions;
  }

  /**
   * Create an edit to update the SDK constraint
   */
  private createSdkEdit(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    newConstraint: string
  ): vscode.WorkspaceEdit | undefined {
    const edit = new vscode.WorkspaceEdit();
    const line = document.lineAt(diagnostic.range.start.line);
    const lineText = line.text;

    // Find the SDK constraint - handle both quoted and unquoted
    const sdkPattern = /sdk\s*:\s*(['"]?)(>=[\d.]+(?:\s*<[\d.]+)?)\1/;
    const sdkMatch = lineText.match(sdkPattern);

    if (sdkMatch && sdkMatch.index !== undefined) {
      // Find where the version starts (after "sdk:" and any whitespace/quotes)
      const sdkIndex = lineText.indexOf('sdk');
      const colonIndex = lineText.indexOf(':', sdkIndex);
      const afterColon = lineText.slice(colonIndex + 1);
      const versionStartOffset = afterColon.search(/[>='"\d]/);
      const versionStart = colonIndex + 1 + versionStartOffset;

      // Handle quoted vs unquoted
      const hasQuotes = sdkMatch[1] !== '';
      const newValue = hasQuotes ? `'${newConstraint}'` : newConstraint;

      // Find end of current constraint
      const currentValue = hasQuotes ? `${sdkMatch[1]}${sdkMatch[2]}${sdkMatch[1]}` : sdkMatch[2];
      const versionEnd = versionStart + currentValue.length;

      edit.replace(
        document.uri,
        new vscode.Range(
          diagnostic.range.start.line,
          versionStart,
          diagnostic.range.start.line,
          versionEnd
        ),
        newValue
      );

      return edit;
    }

    return undefined;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
