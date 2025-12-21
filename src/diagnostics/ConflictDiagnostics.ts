import * as vscode from 'vscode';
import * as fs from 'fs';
import { PubspecInfo } from '../types';
import { VersionConflict, SdkMismatch, WorkspaceAnalysis } from '../core/VersionAnalyzer';

/**
 * Manages diagnostics for version conflicts and SDK mismatches
 * in the VS Code Problems panel
 */
export class ConflictDiagnosticProvider implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('pubspecMaster');
    this.disposables.push(this.diagnosticCollection);
  }

  /**
   * Update diagnostics based on the current workspace analysis
   */
  updateDiagnostics(
    packages: PubspecInfo[],
    analysis: WorkspaceAnalysis
  ): void {
    // Clear existing diagnostics
    this.diagnosticCollection.clear();

    // Map of file path to diagnostics
    const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

    // Process version conflicts
    for (const conflict of analysis.conflicts) {
      this.addConflictDiagnostics(conflict, packages, diagnosticsMap);
    }

    // Process SDK mismatches
    for (const mismatch of analysis.sdkMismatches) {
      this.addSdkMismatchDiagnostics(mismatch, packages, diagnosticsMap);
    }

    // Set all diagnostics
    for (const [filePath, diagnostics] of diagnosticsMap) {
      this.diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
    }
  }

  /**
   * Add diagnostics for a version conflict
   */
  private addConflictDiagnostics(
    conflict: VersionConflict,
    packages: PubspecInfo[],
    diagnosticsMap: Map<string, vscode.Diagnostic[]>
  ): void {
    for (const pkg of conflict.packages) {
      const pubspec = packages.find(p => p.name === pkg.packageName);
      if (!pubspec) {continue;}

      const location = this.findDependencyLocation(
        pubspec.path,
        conflict.dependencyName,
        pkg.isDev
      );

      if (!location) {continue;}

      const severity = this.mapSeverity(conflict.severity);
      const message = this.buildConflictMessage(conflict, pkg.constraint);

      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          location.line,
          location.startCol,
          location.line,
          location.endCol
        ),
        message,
        severity
      );

      diagnostic.code = 'pubspecMaster.versionConflict';
      diagnostic.source = 'Pubspec Master';

      // Add related information for other packages with the same conflict
      diagnostic.relatedInformation = conflict.packages
        .filter(p => p.packageName !== pkg.packageName)
        .map(p => {
          const otherPubspec = packages.find(ps => ps.name === p.packageName);
          if (!otherPubspec) {return null;}
          return new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              vscode.Uri.file(otherPubspec.path),
              new vscode.Position(0, 0)
            ),
            `${p.packageName} uses ${p.constraint}`
          );
        })
        .filter((info): info is vscode.DiagnosticRelatedInformation => info !== null);

      // Store the conflict info for quick fix
      if (conflict.suggestedResolution) {
        diagnostic.tags = [];
        (diagnostic as unknown as { suggestion: string }).suggestion = conflict.suggestedResolution;
      }

      if (!diagnosticsMap.has(pubspec.path)) {
        diagnosticsMap.set(pubspec.path, []);
      }
      diagnosticsMap.get(pubspec.path)!.push(diagnostic);
    }
  }

  /**
   * Add diagnostics for an SDK mismatch
   */
  private addSdkMismatchDiagnostics(
    mismatch: SdkMismatch,
    packages: PubspecInfo[],
    diagnosticsMap: Map<string, vscode.Diagnostic[]>
  ): void {
    for (const pkg of mismatch.packages) {
      const pubspec = packages.find(p => p.name === pkg.packageName);
      if (!pubspec) {continue;}

      const location = this.findSdkLocation(pubspec.path);
      if (!location) {continue;}

      const severity = this.mapSeverity(mismatch.severity);
      const isLowest = pkg.constraint === mismatch.lowestConstraint;
      const message = `SDK constraint mismatch: ${pkg.constraint} (workspace range: ${mismatch.lowestConstraint} to ${mismatch.highestConstraint})${isLowest ? ' - consider upgrading' : ''}`;

      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          location.line,
          location.startCol,
          location.line,
          location.endCol
        ),
        message,
        severity
      );

      diagnostic.code = 'pubspecMaster.sdkMismatch';
      diagnostic.source = 'Pubspec Master';

      // Add related information
      diagnostic.relatedInformation = mismatch.packages
        .filter(p => p.packageName !== pkg.packageName)
        .map(p => {
          const otherPubspec = packages.find(ps => ps.name === p.packageName);
          if (!otherPubspec) {return null;}
          return new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              vscode.Uri.file(otherPubspec.path),
              new vscode.Position(0, 0)
            ),
            `${p.packageName} uses SDK ${p.constraint}`
          );
        })
        .filter((info): info is vscode.DiagnosticRelatedInformation => info !== null);

      if (!diagnosticsMap.has(pubspec.path)) {
        diagnosticsMap.set(pubspec.path, []);
      }
      diagnosticsMap.get(pubspec.path)!.push(diagnostic);
    }
  }

  /**
   * Find the line and column of a dependency in a pubspec.yaml file
   */
  private findDependencyLocation(
    filePath: string,
    dependencyName: string,
    isDev: boolean
  ): { line: number; startCol: number; endCol: number } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const sectionName = isDev ? 'dev_dependencies' : 'dependencies';
      let inSection = false;
      let sectionIndent = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Check for section start
        if (trimmed.startsWith(sectionName + ':')) {
          inSection = true;
          sectionIndent = line.length - trimmed.length;
          continue;
        }

        // If in section, look for the dependency
        if (inSection) {
          // Check if we've left the section (new top-level key)
          const currentIndent = line.length - trimmed.length;
          if (trimmed.length > 0 && currentIndent <= sectionIndent && !trimmed.startsWith('#')) {
            inSection = false;
            continue;
          }

          // Look for the dependency name
          const depMatch = trimmed.match(new RegExp(`^${this.escapeRegex(dependencyName)}\\s*:`));
          if (depMatch) {
            const startCol = line.indexOf(dependencyName);
            return {
              line: i,
              startCol,
              endCol: startCol + dependencyName.length,
            };
          }
        }
      }
    } catch {
      // File read error, return null
    }

    return null;
  }

  /**
   * Find the line and column of the SDK constraint in a pubspec.yaml file
   */
  private findSdkLocation(
    filePath: string
  ): { line: number; startCol: number; endCol: number } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      let inEnvironment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        if (trimmed.startsWith('environment:')) {
          inEnvironment = true;
          continue;
        }

        if (inEnvironment) {
          // Check if we've left the environment section
          if (trimmed.length > 0 && !trimmed.startsWith(' ') && !trimmed.startsWith('\t') && !trimmed.startsWith('#')) {
            inEnvironment = false;
            continue;
          }

          // Look for sdk constraint
          const sdkMatch = trimmed.match(/^sdk\s*:\s*(.+)/);
          if (sdkMatch) {
            const startCol = line.indexOf('sdk');
            const constraint = sdkMatch[1].trim();
            return {
              line: i,
              startCol,
              endCol: line.indexOf(constraint) + constraint.length,
            };
          }
        }
      }
    } catch {
      // File read error, return null
    }

    return null;
  }

  /**
   * Map our severity to VS Code DiagnosticSeverity
   */
  private mapSeverity(severity: 'high' | 'medium' | 'low'): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'high':
        return vscode.DiagnosticSeverity.Error;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      case 'low':
        return vscode.DiagnosticSeverity.Information;
    }
  }

  /**
   * Build a user-friendly message for a version conflict
   */
  private buildConflictMessage(conflict: VersionConflict, currentConstraint: string): string {
    const otherConstraints = conflict.packages
      .filter(p => p.constraint !== currentConstraint)
      .map(p => `${p.packageName}: ${p.constraint}`)
      .join(', ');

    let message = `Version conflict: ${conflict.dependencyName} (${currentConstraint}) conflicts with ${otherConstraints}`;

    if (conflict.suggestedResolution) {
      message += `. Suggested: ${conflict.suggestedResolution}`;
    }

    return message;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Clear all diagnostics
   */
  clear(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
