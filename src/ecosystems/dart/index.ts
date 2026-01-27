import * as vscode from 'vscode';
import { ecosystemRegistry, EcosystemAdapter } from '../../core/EcosystemRegistry';
import { DartPackageParser } from './DartPackageParser';
import { DartRegistryClient } from './DartRegistryClient';
import { DartPackageManager } from './DartPackageManager';
import { DartManifestWriter } from './DartManifestWriter';

// Export all components
export { DartPackageParser } from './DartPackageParser';
export { DartRegistryClient } from './DartRegistryClient';
export { DartPackageManager } from './DartPackageManager';
export { DartManifestWriter } from './DartManifestWriter';

/**
 * Create and register the Dart ecosystem adapter
 *
 * @param context - VS Code extension context
 * @returns The registered adapter
 */
export function registerDartEcosystem(context: vscode.ExtensionContext): EcosystemAdapter {
  const parser = new DartPackageParser();
  const registryClient = new DartRegistryClient(context);
  const packageManager = new DartPackageManager();
  const manifestWriter = new DartManifestWriter();

  const adapter: EcosystemAdapter = {
    type: 'dart',
    displayName: 'Dart/Flutter',
    manifestPatterns: ['**/pubspec.yaml'],
    parser,
    registryClient,
    packageManager,
    manifestWriter,
  };

  ecosystemRegistry.register(adapter);

  return adapter;
}

/**
 * Unregister the Dart ecosystem adapter
 */
export function unregisterDartEcosystem(): void {
  ecosystemRegistry.unregister('dart');
}
