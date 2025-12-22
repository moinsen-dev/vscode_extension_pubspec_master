import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

/**
 * Test the config merging logic directly
 * Note: ConfigService depends heavily on vscode APIs, so we test the pure functions
 * and file operations here, leaving integration testing for the VS Code test runner.
 */

interface PubspecMasterConfig {
  scan?: {
    excludePatterns?: string[];
    maxDepth?: number;
  };
  dashboard?: {
    refreshOnSave?: boolean;
  };
  cache?: {
    ttlMinutes?: number;
    offlineMaxHours?: number;
  };
  sync?: {
    createBackup?: boolean;
    backupLocation?: string;
    ignoredPackages?: string[];
    ignoredDependencies?: string[];
    analyzeAfterFix?: boolean;
  };
  output?: {
    showTerminal?: boolean;
  };
  versionRules?: {
    [dependencyName: string]: {
      preferredVersion?: string;
      allowedVersions?: string[];
      excludeFromConflictCheck?: boolean;
    };
  };
  packageGroups?: {
    [groupName: string]: string[];
  };
}

/**
 * Remove undefined values from an object (extracted logic)
 */
function removeUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Merge two configurations (source takes precedence over base)
 */
function mergeConfigs(
  base: PubspecMasterConfig,
  source: PubspecMasterConfig
): PubspecMasterConfig {
  const result: PubspecMasterConfig = { ...base };

  if (source.scan) {
    result.scan = {
      ...result.scan,
      ...removeUndefined(source.scan),
    };
  }

  if (source.dashboard) {
    result.dashboard = {
      ...result.dashboard,
      ...removeUndefined(source.dashboard),
    };
  }

  if (source.cache) {
    result.cache = {
      ...result.cache,
      ...removeUndefined(source.cache),
    };
  }

  if (source.sync) {
    result.sync = {
      ...result.sync,
      ...removeUndefined(source.sync),
    };
  }

  if (source.output) {
    result.output = {
      ...result.output,
      ...removeUndefined(source.output),
    };
  }

  if (source.versionRules) {
    result.versionRules = {
      ...result.versionRules,
      ...source.versionRules,
    };
  }

  if (source.packageGroups) {
    result.packageGroups = {
      ...result.packageGroups,
      ...source.packageGroups,
    };
  }

  return result;
}

describe('ConfigService (pure functions)', () => {
  describe('removeUndefined()', () => {
    it('should remove undefined values', () => {
      const obj = {
        a: 1,
        b: undefined,
        c: 'hello',
        d: undefined,
      };

      const result = removeUndefined(obj);

      expect(result).to.deep.equal({ a: 1, c: 'hello' });
    });

    it('should keep null values', () => {
      const obj = {
        a: null,
        b: undefined,
      };

      const result = removeUndefined(obj);

      expect(result).to.deep.equal({ a: null });
    });

    it('should handle empty object', () => {
      const result = removeUndefined({});
      expect(result).to.deep.equal({});
    });

    it('should keep zero and empty string values', () => {
      const obj = {
        a: 0,
        b: '',
        c: undefined,
      };

      const result = removeUndefined(obj);

      expect(result).to.deep.equal({ a: 0, b: '' });
    });
  });

  describe('mergeConfigs()', () => {
    it('should merge empty configs', () => {
      const result = mergeConfigs({}, {});
      expect(result).to.deep.equal({});
    });

    it('should preserve base config when source is empty', () => {
      const base: PubspecMasterConfig = {
        scan: { maxDepth: 10 },
        sync: { createBackup: true },
      };

      const result = mergeConfigs(base, {});

      expect(result.scan?.maxDepth).to.equal(10);
      expect(result.sync?.createBackup).to.be.true;
    });

    it('should override base values with source values', () => {
      const base: PubspecMasterConfig = {
        scan: { maxDepth: 10, excludePatterns: ['**/build/**'] },
      };
      const source: PubspecMasterConfig = {
        scan: { maxDepth: 5 },
      };

      const result = mergeConfigs(base, source);

      expect(result.scan?.maxDepth).to.equal(5);
      // excludePatterns from base should be preserved
      expect(result.scan?.excludePatterns).to.deep.equal(['**/build/**']);
    });

    it('should merge all sections independently', () => {
      const base: PubspecMasterConfig = {
        scan: { maxDepth: 10 },
        cache: { ttlMinutes: 15 },
        sync: { createBackup: true },
      };
      const source: PubspecMasterConfig = {
        cache: { offlineMaxHours: 48 },
        output: { showTerminal: true },
      };

      const result = mergeConfigs(base, source);

      expect(result.scan?.maxDepth).to.equal(10);
      expect(result.cache?.ttlMinutes).to.equal(15);
      expect(result.cache?.offlineMaxHours).to.equal(48);
      expect(result.sync?.createBackup).to.be.true;
      expect(result.output?.showTerminal).to.be.true;
    });

    it('should not apply undefined values from source', () => {
      const base: PubspecMasterConfig = {
        scan: { maxDepth: 10, excludePatterns: ['**/build/**'] },
      };
      const source: PubspecMasterConfig = {
        scan: { maxDepth: undefined, excludePatterns: ['**/node_modules/**'] },
      };

      const result = mergeConfigs(base, source);

      // maxDepth should remain 10 since source has undefined
      expect(result.scan?.maxDepth).to.equal(10);
      // excludePatterns should be overridden with source value
      expect(result.scan?.excludePatterns).to.deep.equal(['**/node_modules/**']);
    });

    it('should merge versionRules by adding new rules', () => {
      const base: PubspecMasterConfig = {
        versionRules: {
          http: { preferredVersion: '^1.0.0' },
        },
      };
      const source: PubspecMasterConfig = {
        versionRules: {
          json: { preferredVersion: '^2.0.0' },
        },
      };

      const result = mergeConfigs(base, source);

      expect(result.versionRules?.http?.preferredVersion).to.equal('^1.0.0');
      expect(result.versionRules?.json?.preferredVersion).to.equal('^2.0.0');
    });

    it('should merge packageGroups by adding new groups', () => {
      const base: PubspecMasterConfig = {
        packageGroups: {
          apps: ['app_mobile'],
        },
      };
      const source: PubspecMasterConfig = {
        packageGroups: {
          core: ['core_utils'],
        },
      };

      const result = mergeConfigs(base, source);

      expect(result.packageGroups?.apps).to.deep.equal(['app_mobile']);
      expect(result.packageGroups?.core).to.deep.equal(['core_utils']);
    });

    it('should override packageGroup with same name from source', () => {
      const base: PubspecMasterConfig = {
        packageGroups: {
          apps: ['old_app'],
        },
      };
      const source: PubspecMasterConfig = {
        packageGroups: {
          apps: ['new_app', 'another_app'],
        },
      };

      const result = mergeConfigs(base, source);

      expect(result.packageGroups?.apps).to.deep.equal(['new_app', 'another_app']);
    });
  });
});

describe('Config file operations', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('config file format', () => {
    it('should parse valid JSON config file', async () => {
      const configContent: PubspecMasterConfig = {
        scan: {
          excludePatterns: ['**/build/**'],
          maxDepth: 5,
        },
        sync: {
          createBackup: true,
        },
      };

      await fs.writeFile(
        path.join(tempDir, '.pubspec-master.json'),
        JSON.stringify(configContent, null, 2)
      );

      const content = await fs.readFile(
        path.join(tempDir, '.pubspec-master.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content) as PubspecMasterConfig;

      expect(parsed.scan?.maxDepth).to.equal(5);
      expect(parsed.scan?.excludePatterns).to.deep.equal(['**/build/**']);
      expect(parsed.sync?.createBackup).to.be.true;
    });

    it('should handle empty config file', async () => {
      await fs.writeFile(path.join(tempDir, '.pubspec-master.json'), '{}');

      const content = await fs.readFile(
        path.join(tempDir, '.pubspec-master.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content) as PubspecMasterConfig;

      expect(parsed).to.deep.equal({});
    });

    it('should handle config with all sections', async () => {
      const fullConfig: PubspecMasterConfig = {
        scan: {
          excludePatterns: ['**/build/**', '**/.dart_tool/**'],
          maxDepth: 10,
        },
        dashboard: {
          refreshOnSave: true,
        },
        cache: {
          ttlMinutes: 30,
          offlineMaxHours: 48,
        },
        sync: {
          createBackup: true,
          backupLocation: '.backup',
          ignoredPackages: ['legacy_pkg'],
          ignoredDependencies: ['deprecated_dep'],
          analyzeAfterFix: true,
        },
        output: {
          showTerminal: false,
        },
        versionRules: {
          http: {
            preferredVersion: '^1.2.0',
            excludeFromConflictCheck: true,
          },
        },
        packageGroups: {
          apps: ['my_app'],
          core: ['core_utils', 'core_models'],
        },
      };

      await fs.writeFile(
        path.join(tempDir, '.pubspec-master.json'),
        JSON.stringify(fullConfig, null, 2)
      );

      const content = await fs.readFile(
        path.join(tempDir, '.pubspec-master.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content) as PubspecMasterConfig;

      expect(parsed.scan?.excludePatterns).to.have.length(2);
      expect(parsed.versionRules?.http?.preferredVersion).to.equal('^1.2.0');
      expect(parsed.packageGroups?.core).to.deep.equal(['core_utils', 'core_models']);
    });
  });

  describe('config file detection', () => {
    it('should detect when config file exists', async () => {
      await fs.writeFile(path.join(tempDir, '.pubspec-master.json'), '{}');

      const exists = await fs
        .access(path.join(tempDir, '.pubspec-master.json'))
        .then(() => true)
        .catch(() => false);

      expect(exists).to.be.true;
    });

    it('should detect when config file does not exist', async () => {
      const exists = await fs
        .access(path.join(tempDir, '.pubspec-master.json'))
        .then(() => true)
        .catch(() => false);

      expect(exists).to.be.false;
    });
  });
});
