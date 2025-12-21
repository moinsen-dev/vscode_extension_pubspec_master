import { expect } from 'chai';
import * as path from 'path';
import { PubspecParser } from '../../../src/core/PubspecParser';

describe('PubspecParser', () => {
  let parser: PubspecParser;

  beforeEach(() => {
    parser = new PubspecParser();
  });

  describe('parseContent', () => {
    it('should parse a minimal valid pubspec', () => {
      const content = `
name: my_package
environment:
  sdk: ^3.0.0
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.name).to.equal('my_package');
      expect(result.sdkConstraint).to.equal('^3.0.0');
      expect(result.type).to.equal('dart_package');
      expect(result.path).to.equal('/test/pubspec.yaml');
      expect(result.directory).to.equal('/test');
    });

    it('should parse version and description', () => {
      const content = `
name: my_package
version: 1.2.3
description: A test package
environment:
  sdk: ^3.0.0
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.version).to.equal('1.2.3');
      expect(result.description).to.equal('A test package');
    });

    it('should detect Flutter app type', () => {
      const content = `
name: my_app
publish_to: none
environment:
  sdk: ^3.0.0
dependencies:
  flutter:
    sdk: flutter
flutter:
  uses-material-design: true
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.type).to.equal('flutter_app');
    });

    it('should detect Flutter plugin type', () => {
      const content = `
name: my_plugin
environment:
  sdk: ^3.0.0
dependencies:
  flutter:
    sdk: flutter
flutter:
  plugin:
    platforms:
      android:
        package: com.example.my_plugin
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.type).to.equal('flutter_plugin');
    });

    it('should prefer plugin detection over app detection', () => {
      const content = `
name: my_plugin
publish_to: none
environment:
  sdk: ^3.0.0
dependencies:
  flutter:
    sdk: flutter
flutter:
  uses-material-design: true
  plugin:
    platforms:
      android:
        package: com.example.my_plugin
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.type).to.equal('flutter_plugin');
    });

    it('should parse string version constraints', () => {
      const content = `
name: my_package
environment:
  sdk: ^3.0.0
dependencies:
  http: ^1.1.0
  provider: ">=6.0.0 <7.0.0"
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      const http = result.dependencies.get('http');
      expect(http).to.exist;
      expect(http!.name).to.equal('http');
      expect(http!.constraint).to.equal('^1.1.0');
      expect(http!.source).to.equal('pub.dev');

      const provider = result.dependencies.get('provider');
      expect(provider).to.exist;
      expect(provider!.constraint).to.equal('>=6.0.0 <7.0.0');
    });

    it('should parse path dependencies', () => {
      const content = `
name: my_package
dependencies:
  core:
    path: ../core
  shared:
    path: /absolute/path/shared
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      const core = result.dependencies.get('core');
      expect(core).to.exist;
      expect(core!.source).to.equal('path');
      expect(core!.path).to.equal('../core');
      expect(core!.constraint).to.equal('path');

      const shared = result.dependencies.get('shared');
      expect(shared).to.exist;
      expect(shared!.path).to.equal('/absolute/path/shared');
    });

    it('should parse simple git dependencies', () => {
      const content = `
name: my_package
dependencies:
  some_package:
    git: https://github.com/user/repo.git
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      const dep = result.dependencies.get('some_package');
      expect(dep).to.exist;
      expect(dep!.source).to.equal('git');
      expect(dep!.gitUrl).to.equal('https://github.com/user/repo.git');
      expect(dep!.gitRef).to.be.undefined;
    });

    it('should parse git dependencies with ref', () => {
      const content = `
name: my_package
dependencies:
  some_package:
    git:
      url: https://github.com/user/repo.git
      ref: develop
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      const dep = result.dependencies.get('some_package');
      expect(dep).to.exist;
      expect(dep!.source).to.equal('git');
      expect(dep!.gitUrl).to.equal('https://github.com/user/repo.git');
      expect(dep!.gitRef).to.equal('develop');
    });

    it('should parse SDK dependencies', () => {
      const content = `
name: my_package
dependencies:
  flutter:
    sdk: flutter
  flutter_test:
    sdk: flutter
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      const flutter = result.dependencies.get('flutter');
      expect(flutter).to.exist;
      expect(flutter!.source).to.equal('sdk');
      expect(flutter!.constraint).to.equal('flutter');
    });

    it('should parse dev_dependencies', () => {
      const content = `
name: my_package
dependencies:
  http: ^1.1.0
dev_dependencies:
  test: ^1.24.0
  lints: ^3.0.0
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.dependencies.size).to.equal(1);
      expect(result.devDependencies.size).to.equal(2);

      const test = result.devDependencies.get('test');
      expect(test).to.exist;
      expect(test!.constraint).to.equal('^1.24.0');
    });

    it('should detect workspace packages', () => {
      const content = `
name: my_workspace
workspace:
  - app
  - packages/core
  - packages/shared
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.workspacePackages).to.deep.equal([
        'app',
        'packages/core',
        'packages/shared',
      ]);
    });

    it('should detect workspace resolution mode', () => {
      const content = `
name: my_package
resolution: workspace
environment:
  sdk: ^3.6.0
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.isWorkspacePackage).to.be.true;
      expect(result.resolutionMode).to.equal('workspace');
    });

    it('should default to standalone resolution mode', () => {
      const content = `
name: my_package
environment:
  sdk: ^3.0.0
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.isWorkspacePackage).to.be.false;
      expect(result.resolutionMode).to.equal('standalone');
    });

    it('should throw on missing name field', () => {
      const content = `
environment:
  sdk: ^3.0.0
`;
      expect(() => parser.parseContent(content, '/test/pubspec.yaml')).to.throw(
        /Missing or invalid 'name' field/
      );
    });

    it('should throw on empty file', () => {
      const content = '';

      expect(() => parser.parseContent(content, '/test/pubspec.yaml')).to.throw(
        /Empty or invalid pubspec.yaml/
      );
    });

    it('should handle hosted dependencies with version', () => {
      const content = `
name: my_package
dependencies:
  custom_package:
    hosted:
      name: custom_package
      url: https://my-custom-pub.example.com
    version: ^1.0.0
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      const dep = result.dependencies.get('custom_package');
      expect(dep).to.exist;
      expect(dep!.source).to.equal('pub.dev');
      expect(dep!.constraint).to.equal('^1.0.0');
    });

    it('should preserve raw parsed YAML', () => {
      const content = `
name: my_package
version: 1.0.0
custom_field: custom_value
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.raw).to.exist;
      expect(result.raw.custom_field).to.equal('custom_value');
    });

    it('should handle empty dependencies object', () => {
      const content = `
name: my_package
dependencies:
`;
      const result = parser.parseContent(content, '/test/pubspec.yaml');

      expect(result.dependencies.size).to.equal(0);
    });
  });

  describe('parse', () => {
    const fixturesPath = path.resolve(__dirname, '../../fixtures');

    it('should parse a file from disk', async () => {
      const filePath = path.join(fixturesPath, 'single-package/pubspec.yaml');
      const result = await parser.parse(filePath);

      expect(result.name).to.equal('my_dart_package');
      expect(result.type).to.equal('dart_package');
      expect(result.dependencies.has('http')).to.be.true;
    });

    it('should parse a Flutter app from disk', async () => {
      const filePath = path.join(
        fixturesPath,
        'simple-monorepo/app/pubspec.yaml'
      );
      const result = await parser.parse(filePath);

      expect(result.name).to.equal('my_app');
      expect(result.type).to.equal('flutter_app');
      expect(result.isWorkspacePackage).to.be.true;
    });

    it('should parse a Flutter plugin from disk', async () => {
      const filePath = path.join(fixturesPath, 'flutter-plugin/pubspec.yaml');
      const result = await parser.parse(filePath);

      expect(result.name).to.equal('my_flutter_plugin');
      expect(result.type).to.equal('flutter_plugin');
    });

    it('should parse git dependencies from disk', async () => {
      const filePath = path.join(fixturesPath, 'git-deps/pubspec.yaml');
      const result = await parser.parse(filePath);

      expect(result.name).to.equal('git_deps_package');

      const simpleGit = result.dependencies.get('simple_git_dep');
      expect(simpleGit).to.exist;
      expect(simpleGit!.source).to.equal('git');

      const gitWithRef = result.dependencies.get('git_with_ref');
      expect(gitWithRef).to.exist;
      expect(gitWithRef!.gitRef).to.equal('develop');

      const localPackage = result.dependencies.get('local_package');
      expect(localPackage).to.exist;
      expect(localPackage!.source).to.equal('path');
    });

    it('should throw on missing name from disk', async () => {
      const filePath = path.join(
        fixturesPath,
        'malformed-yaml/missing-name/pubspec.yaml'
      );

      try {
        await parser.parse(filePath);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).to.include('Missing or invalid');
      }
    });
  });
});
