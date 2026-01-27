/**
 * Mock AI Service Implementation
 *
 * Provides realistic-looking responses without calling external APIs.
 * Used for testing and when AI features are not configured.
 */

import * as vscode from 'vscode';
import { BaseAIService } from './AIService';
import {
  ConflictContext,
  ConflictExplanation,
  MigrationContext,
  MigrationStrategy,
  CompatibilityPredictionContext,
  CompatibilityPrediction,
  UpgradePlaybook,
} from './types';

/**
 * Mock AI service that returns template-based responses
 *
 * Useful for:
 * - Testing without API costs
 * - Fallback when AI is not configured
 * - Development and debugging
 */
export class MockAIService extends BaseAIService {
  constructor(context: vscode.ExtensionContext) {
    super(context, { type: 'mock' });
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock is always available
  }

  protected async doExplainConflict(context: ConflictContext): Promise<ConflictExplanation> {
    const packages = context.packages.map(p => p.name).join(', ');
    const versions = context.packages.map(p => `${p.name}: ${p.requiredVersion}`).join(', ');

    return {
      summary: `The package "${context.dependencyName}" has conflicting version requirements across your workspace.`,
      cause: `Multiple packages (${packages}) require different versions of ${context.dependencyName}. ` +
        `The constraints are: ${versions}. These version ranges do not overlap.`,
      impact: `Running "pub get" or "flutter pub get" will fail until this conflict is resolved. ` +
        `This prevents your project from building and running.`,
      resolutionSteps: [
        `Check if a newer version of the packages can use compatible ${context.dependencyName} versions`,
        `Consider updating all packages to their latest versions`,
        `If packages cannot be updated, you may need to use dependency overrides (not recommended for production)`,
        `Contact package maintainers if the conflict persists with latest versions`,
      ],
      confidence: 0.85,
    };
  }

  protected async doGenerateMigrationStrategy(context: MigrationContext): Promise<MigrationStrategy> {
    const majorCurrentVersion = parseInt(context.currentVersion.split('.')[0], 10);
    const majorTargetVersion = parseInt(context.targetVersion.split('.')[0], 10);
    const isMajorUpgrade = majorTargetVersion > majorCurrentVersion;

    const difficulty = isMajorUpgrade ? 'moderate' : 'easy';
    const effortEstimate = isMajorUpgrade
      ? 'May require code changes and testing'
      : 'Should be straightforward with minimal changes';

    const steps = [
      {
        order: 1,
        action: `Update ${context.packageName} version constraint`,
        details: `Change the version in pubspec.yaml from ${context.currentVersion} to ^${context.targetVersion}`,
        optional: false,
      },
      {
        order: 2,
        action: 'Run dependency resolution',
        details: 'Execute "flutter pub get" or "dart pub get" to resolve dependencies',
        optional: false,
      },
      {
        order: 3,
        action: 'Check for deprecation warnings',
        details: 'Run "flutter analyze" or "dart analyze" to identify any deprecated API usage',
        optional: false,
      },
    ];

    if (isMajorUpgrade && context.breakingChanges?.length) {
      steps.push({
        order: 4,
        action: 'Review breaking changes',
        details: `The following breaking changes were identified:\n${context.breakingChanges.join('\n')}`,
        optional: false,
      });
    }

    steps.push({
      order: steps.length + 1,
      action: 'Run tests',
      details: 'Execute your test suite to verify no regressions',
      optional: false,
    });

    return {
      difficulty,
      effortEstimate,
      steps,
      warnings: isMajorUpgrade
        ? [
            'Major version upgrades may contain breaking API changes',
            'Review the package changelog before upgrading',
            'Consider upgrading in a separate branch first',
          ]
        : [
            'Minor/patch upgrades are generally safe but should still be tested',
          ],
      codeChanges: [],
    };
  }

  protected async doPredictCompatibility(
    context: CompatibilityPredictionContext
  ): Promise<CompatibilityPrediction> {
    // Simple heuristic-based prediction
    const issues: CompatibilityPrediction['issues'] = [];

    // Check SDK constraint
    if (context.sdkConstraint) {
      const minSdk = context.sdkConstraint.match(/>=(\d+\.\d+\.\d+)/)?.[1];
      if (minSdk) {
        issues.push({
          severity: 'info',
          description: `Requires Dart SDK ${minSdk} or higher`,
          affectedPackages: [context.packageName],
        });
      }
    }

    return {
      compatible: issues.filter(i => i.severity === 'breaking').length === 0,
      confidence: 0.7,
      issues,
      suggestions: [
        'Run "flutter pub get" to verify compatibility',
        'Check the package changelog for known issues',
      ],
    };
  }

  protected async doGenerateUpgradePlaybook(
    packages: Array<{ name: string; current: string; target: string }>
  ): Promise<UpgradePlaybook> {
    // Sort packages by name for consistent ordering
    const sortedPackages = [...packages].sort((a, b) => a.name.localeCompare(b.name));

    const upgrades = sortedPackages.map((pkg, index) => ({
      packageName: pkg.name,
      from: pkg.current,
      to: pkg.target,
      priority: index + 1,
      dependencies: [],
      notes: `Upgrade ${pkg.name} from ${pkg.current} to ${pkg.target}`,
      risk: 'low' as const,
    }));

    return {
      title: `Upgrade Playbook - ${packages.length} packages`,
      summary: `This playbook covers upgrading ${packages.length} package(s) to their recommended versions.`,
      upgrades,
      preChecklist: [
        'Ensure all changes are committed to version control',
        'Review the changelog for each package being upgraded',
        'Run the existing test suite to establish baseline',
        'Back up pubspec.lock file',
      ],
      postChecklist: [
        'Run "flutter pub get" to resolve dependencies',
        'Run "flutter analyze" to check for deprecations',
        'Run the full test suite',
        'Test the application manually',
        'Commit the updated pubspec.yaml and pubspec.lock',
      ],
      rollbackPlan: [
        'Restore pubspec.yaml from version control',
        'Restore pubspec.lock from backup',
        'Run "flutter pub get" to restore previous state',
        'Verify the application works as before',
      ],
    };
  }
}
