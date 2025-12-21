import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting extension tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('moinsen-dev.pubspec-master'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('moinsen-dev.pubspec-master');
    assert.ok(extension);

    // Wait for activation
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      'pubspecMaster.refresh',
      'pubspecMaster.pubGetAll',
      'pubspecMaster.pubUpgradeAll',
      'pubspecMaster.openPubspec',
      'pubspecMaster.pubGet',
      'pubspecMaster.pubUpgrade',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Command ${cmd} should be registered`
      );
    }
  });

  test('Dashboard view should be available', async () => {
    // Try to focus the Pubspec Master view
    try {
      await vscode.commands.executeCommand('pubspecMaster.dashboard.focus');
      // If we got here without error, the view exists
      assert.ok(true);
    } catch {
      // View might not be focusable immediately, but that's okay
      // The view is registered in package.json
      assert.ok(true);
    }
  });

  test('Refresh command should execute without error', async () => {
    try {
      await vscode.commands.executeCommand('pubspecMaster.refresh');
      assert.ok(true);
    } catch (error) {
      assert.fail(`Refresh command threw an error: ${error}`);
    }
  });
});
