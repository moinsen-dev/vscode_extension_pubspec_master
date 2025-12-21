import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the test runner script
    const extensionTestsPath = path.resolve(__dirname, './integration/index');

    // The path to the workspace to open during tests
    // Use the source test fixtures, not compiled output
    const testWorkspacePath = path.resolve(
      __dirname,
      '../../test/fixtures/simple-monorepo'
    );

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspacePath, '--disable-extensions'],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
