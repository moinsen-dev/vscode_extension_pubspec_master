import * as vscode from 'vscode';
import { PubspecInfo } from '../types';
import { runPubCommandInTerminal, getOutputChannel } from '../utils/processUtils';

/**
 * Run pub upgrade on all packages in the workspace
 *
 * @param getPackages - Function to get the list of packages
 */
export async function pubUpgradeAllCommand(
  getPackages: () => PubspecInfo[]
): Promise<void> {
  const packages = getPackages();

  if (packages.length === 0) {
    vscode.window.showInformationMessage('Moinsen: No packages found in workspace.');
    return;
  }

  // Confirm with user before upgrading
  const confirm = await vscode.window.showWarningMessage(
    `Moinsen: This will run pub upgrade on ${packages.length} package(s). Continue?`,
    { modal: true },
    'Yes',
    'No'
  );

  if (confirm !== 'Yes') {
    return;
  }

  // Show output channel for real-time feedback
  const channel = getOutputChannel();
  channel.show(true); // Show but preserve focus

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Moinsen: Running pub upgrade',
      cancellable: true,
    },
    async (progress, token) => {
      let completed = 0;
      const failed: string[] = [];

      for (const pkg of packages) {
        if (token.isCancellationRequested) {
          vscode.window.showWarningMessage('Moinsen: Pub upgrade cancelled.');
          return;
        }

        progress.report({
          message: `${pkg.name} (${completed + 1}/${packages.length})`,
          increment: 100 / packages.length,
        });

        const isFlutter = pkg.type === 'flutter_app' || pkg.type === 'flutter_plugin';
        const result = await runPubCommandInTerminal(pkg.directory, isFlutter, 'upgrade', pkg.name);

        if (result.exitCode !== 0) {
          failed.push(pkg.name);
        }

        completed++;
      }

      // Summary
      channel.appendLine('\n' + '='.repeat(60));
      channel.appendLine('SUMMARY: Pub Upgrade All');
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
          `Moinsen: Pub upgrade completed for ${packages.length} package(s). See Output for details.`
        );
      } else {
        vscode.window.showWarningMessage(
          `Moinsen: Pub upgrade failed for: ${failed.join(', ')}. See Output for details.`
        );
      }
    }
  );
}
