import * as path from 'path';
import Mocha from 'mocha';
import * as fs from 'fs';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 60000,
  });

  const testsRoot = path.resolve(__dirname, '.');

  // Find all test files using fs (simpler than glob for single directory)
  const files = fs
    .readdirSync(testsRoot)
    .filter((file) => file.endsWith('.test.js'));

  // Add files to the test suite
  for (const f of files) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  // Run the mocha test
  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
