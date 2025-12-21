import * as vscode from 'vscode';
import { PubspecInfo } from '../types';
import { runPubCommandInTerminal, getOutputChannel } from '../utils/processUtils';

/**
 * Run pub get on all packages in the workspace
 *
 * @param getPackages - Function to get the list of packages
 */
export async function pubGetAllCommand(
  getPackages: () => PubspecInfo[]
): Promise<void> {
  const packages = getPackages();

  if (packages.length === 0) {
    vscode.window.showInformationMessage('Pubspec Master: No packages found in workspace.');
    return;
  }

  // Show output channel for real-time feedback
  const channel = getOutputChannel();
  channel.show(true); // Show but preserve focus

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Pubspec Master: Running pub get',
      cancellable: true,
    },
    async (progress, token) => {
      let completed = 0;
      const failed: string[] = [];

      for (const pkg of packages) {
        if (token.isCancellationRequested) {
          vscode.window.showWarningMessage('Pubspec Master: Pub get cancelled.');
          return;
        }

        progress.report({
          message: `${pkg.name} (${completed + 1}/${packages.length})`,
          increment: 100 / packages.length,
        });

        const isFlutter = pkg.type === 'flutter_app' || pkg.type === 'flutter_plugin';
        const result = await runPubCommandInTerminal(pkg.directory, isFlutter, 'get', pkg.name);

        if (result.exitCode !== 0) {
          failed.push(pkg.name);
        }

        completed++;
      }

      // Summary
      channel.appendLine('\n' + '='.repeat(60));
      channel.appendLine('SUMMARY: Pub Get All');
      channel.appendLine('='.repeat(60));
      channel.appendLine(`Total packages: ${packages.length}`);
      channel.appendLine(`Successful: ${packages.length - failed.length}`);
      channel.appendLine(`Failed: ${failed.length}`);
      if (failed.length > 0) {
        channel.appendLine(`Failed packages: ${failed.join(', ')}`);
      }
      channel.appendLine('='.repeat(60) + '\n');

      if (failed.length === 0) {
        vscode.window.showInformationMessage(
          `Pubspec Master: Pub get completed for ${packages.length} package(s). See Output for details.`
        );
      } else {
        vscode.window.showWarningMessage(
          `Pubspec Master: Pub get failed for: ${failed.join(', ')}. See Output for details.`
        );
      }
    }
  );
}
