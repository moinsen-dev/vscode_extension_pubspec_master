import { expect } from 'chai';
import { DependencyResolver } from '../../../src/core/DependencyResolver';
import { PubspecInfo, DependencyInfo } from '../../../src/types';

/**
 * Helper function to create a minimal PubspecInfo for testing
 */
function createPubspec(
  name: string,
  options: {
    version?: string;
    type?: 'flutter_app' | 'dart_package' | 'flutter_plugin';
    dependencies?: Map<string, DependencyInfo>;
    devDependencies?: Map<string, DependencyInfo>;
  } = {}
): PubspecInfo {
  return {
    name,
    version: options.version ?? '1.0.0',
    type: options.type ?? 'dart_package',
    directory: `/workspace/${name}`,
    path: `/workspace/${name}/pubspec.yaml`,
    dependencies: options.dependencies ?? new Map(),
    devDependencies: options.devDependencies ?? new Map(),
    sdkConstraint: '>=3.0.0 <4.0.0',
    resolutionMode: 'standalone',
    isWorkspacePackage: false,
    raw: {},
  };
}

/**
 * Helper function to create a DependencyInfo
 */
function createDep(
  depName: string,
  constraint: string,
  source: 'pub.dev' | 'path' | 'git' | 'sdk' = 'pub.dev'
): DependencyInfo {
  return { name: depName, constraint, source };
}

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  describe('buildGraph()', () => {
    it('should return empty graph for no packages', () => {
      const graph = resolver.buildGraph([]);

      expect(graph.nodes.size).to.equal(0);
      expect(graph.edges).to.have.length(0);
      expect(graph.internalPackages).to.have.length(0);
      expect(graph.externalPackages).to.have.length(0);
      expect(graph.cycles).to.have.length(0);
    });

    it('should create nodes for internal packages', () => {
      const pubspecs = [
        createPubspec('app_core'),
        createPubspec('app_ui'),
      ];

      const graph = resolver.buildGraph(pubspecs);

      expect(graph.nodes.size).to.equal(2);
      expect(graph.internalPackages).to.deep.equal(['app_core', 'app_ui']);

      const coreNode = graph.nodes.get('app_core');
      expect(coreNode).to.exist;
      expect(coreNode!.type).to.equal('internal');
      expect(coreNode!.source).to.equal('path');
    });

    it('should preserve package metadata in nodes', () => {
      const pubspecs = [
        createPubspec('my_app', {
          version: '2.5.0',
          type: 'flutter_app',
        }),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const node = graph.nodes.get('my_app');

      expect(node!.version).to.equal('2.5.0');
      expect(node!.packageType).to.equal('flutter_app');
      expect(node!.path).to.equal('/workspace/my_app');
    });

    it('should create edges for direct dependencies', () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
        ['json_annotation', createDep('json_annotation', '^4.8.0')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      expect(graph.edges).to.have.length(2);
      expect(graph.edges[0].from).to.equal('app');
      expect(graph.edges[0].to).to.equal('http');
      expect(graph.edges[0].type).to.equal('direct');
      expect(graph.edges[0].constraint).to.equal('^1.0.0');
    });

    it('should create edges for dev dependencies', () => {
      const devDeps = new Map<string, DependencyInfo>([
        ['test', createDep('test', '^1.24.0')],
        ['mockito', createDep('mockito', '^5.4.0')],
      ]);

      const pubspecs = [createPubspec('app', { devDependencies: devDeps })];
      const graph = resolver.buildGraph(pubspecs);

      expect(graph.edges).to.have.length(2);
      expect(graph.edges[0].type).to.equal('dev');
      expect(graph.edges[1].type).to.equal('dev');
    });

    it('should create external nodes for pub.dev dependencies', () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0', 'pub.dev')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      expect(graph.externalPackages).to.include('http');

      const httpNode = graph.nodes.get('http');
      expect(httpNode).to.exist;
      expect(httpNode!.type).to.equal('external');
      expect(httpNode!.source).to.equal('pub.dev');
      expect(httpNode!.version).to.equal('^1.0.0');
    });

    it('should track dependents correctly', () => {
      const deps = new Map<string, DependencyInfo>([
        ['shared_utils', createDep('shared_utils', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app_a', { dependencies: deps }),
        createPubspec('app_b', { dependencies: deps }),
        createPubspec('shared_utils'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const sharedNode = graph.nodes.get('shared_utils');

      expect(sharedNode!.dependents).to.include('app_a');
      expect(sharedNode!.dependents).to.include('app_b');
      expect(sharedNode!.dependents).to.have.length(2);
    });

    it('should track dependencies correctly', () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
        ['json_annotation', createDep('json_annotation', '^4.0.0')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);
      const appNode = graph.nodes.get('app');

      expect(appNode!.dependencies).to.include('http');
      expect(appNode!.dependencies).to.include('json_annotation');
      expect(appNode!.dependencies).to.have.length(2);
    });

    it('should deduplicate external packages', () => {
      const depsA = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
      ]);
      const depsB = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.1.0')],
      ]);

      const pubspecs = [
        createPubspec('app_a', { dependencies: depsA }),
        createPubspec('app_b', { dependencies: depsB }),
      ];

      const graph = resolver.buildGraph(pubspecs);

      // http should only appear once in external packages
      expect(graph.externalPackages.filter((p) => p === 'http')).to.have.length(1);
    });

    it('should handle internal path dependencies', () => {
      const depsApp = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);

      // core should be internal, not external
      expect(graph.internalPackages).to.include('core');
      expect(graph.externalPackages).to.not.include('core');

      const coreNode = graph.nodes.get('core');
      expect(coreNode!.type).to.equal('internal');
    });

    it('should handle git dependencies', () => {
      const deps = new Map<string, DependencyInfo>([
        ['custom_package', createDep('custom_package', 'main', 'git')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      const gitNode = graph.nodes.get('custom_package');
      expect(gitNode).to.exist;
      expect(gitNode!.source).to.equal('git');
      expect(gitNode!.type).to.equal('external');
    });

    it('should handle sdk dependencies', () => {
      const deps = new Map<string, DependencyInfo>([
        ['flutter', createDep('flutter', 'flutter', 'sdk')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      const sdkNode = graph.nodes.get('flutter');
      expect(sdkNode).to.exist;
      expect(sdkNode!.source).to.equal('sdk');
    });
  });

  describe('detectCycles()', () => {
    it('should detect no cycles in acyclic graph', () => {
      // app -> core -> utils (linear chain)
      const depsApp = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);
      const depsCore = new Map<string, DependencyInfo>([
        ['utils', createDep('utils', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('core', { dependencies: depsCore }),
        createPubspec('utils'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      expect(graph.cycles).to.have.length(0);
    });

    it('should detect simple two-node cycle', () => {
      // a -> b -> a
      const depsA = new Map<string, DependencyInfo>([
        ['b', createDep('b', 'any', 'path')],
      ]);
      const depsB = new Map<string, DependencyInfo>([
        ['a', createDep('a', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('a', { dependencies: depsA }),
        createPubspec('b', { dependencies: depsB }),
      ];

      const graph = resolver.buildGraph(pubspecs);
      expect(graph.cycles.length).to.be.greaterThan(0);

      // Check the cycle contains both packages
      const cycle = graph.cycles[0];
      expect(cycle).to.include('a');
      expect(cycle).to.include('b');
    });

    it('should detect three-node cycle', () => {
      // a -> b -> c -> a
      const depsA = new Map<string, DependencyInfo>([
        ['b', createDep('b', 'any', 'path')],
      ]);
      const depsB = new Map<string, DependencyInfo>([
        ['c', createDep('c', 'any', 'path')],
      ]);
      const depsC = new Map<string, DependencyInfo>([
        ['a', createDep('a', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('a', { dependencies: depsA }),
        createPubspec('b', { dependencies: depsB }),
        createPubspec('c', { dependencies: depsC }),
      ];

      const graph = resolver.buildGraph(pubspecs);
      expect(graph.cycles.length).to.be.greaterThan(0);

      // Verify cycle contains all three packages
      const allCycleNodes = graph.cycles.flat();
      expect(allCycleNodes).to.include('a');
      expect(allCycleNodes).to.include('b');
      expect(allCycleNodes).to.include('c');
    });

    it('should not report cycles involving external packages only', () => {
      // Only internal packages should be checked for cycles
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0', 'pub.dev')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      expect(graph.cycles).to.have.length(0);
    });

    it('should handle self-referential dependency', () => {
      // Package depending on itself (weird but possible in pubspec)
      const deps = new Map<string, DependencyInfo>([
        ['app', createDep('app', 'any', 'path')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      // Should detect self-cycle
      expect(graph.cycles.length).to.be.greaterThan(0);
    });
  });

  describe('findAffectedPackages()', () => {
    it('should return empty array when package has no dependents', () => {
      const pubspecs = [createPubspec('isolated_pkg')];
      const graph = resolver.buildGraph(pubspecs);

      const affected = resolver.findAffectedPackages(graph, 'isolated_pkg');
      expect(affected).to.have.length(0);
    });

    it('should find direct dependents', () => {
      const deps = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: deps }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const affected = resolver.findAffectedPackages(graph, 'core');

      expect(affected).to.include('app');
    });

    it('should find transitive dependents', () => {
      // app -> feature -> core
      const depsApp = new Map<string, DependencyInfo>([
        ['feature', createDep('feature', 'any', 'path')],
      ]);
      const depsFeature = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('feature', { dependencies: depsFeature }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const affected = resolver.findAffectedPackages(graph, 'core');

      expect(affected).to.include('feature');
      expect(affected).to.include('app');
    });

    it('should handle diamond dependencies', () => {
      //     app
      //    /   \
      // feat_a  feat_b
      //    \   /
      //     core
      const depsApp = new Map<string, DependencyInfo>([
        ['feat_a', createDep('feat_a', 'any', 'path')],
        ['feat_b', createDep('feat_b', 'any', 'path')],
      ]);
      const depsFeatA = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);
      const depsFeatB = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('feat_a', { dependencies: depsFeatA }),
        createPubspec('feat_b', { dependencies: depsFeatB }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const affected = resolver.findAffectedPackages(graph, 'core');

      expect(affected).to.include('feat_a');
      expect(affected).to.include('feat_b');
      expect(affected).to.include('app');
      // Each package should appear only once
      expect(affected.filter((p) => p === 'app')).to.have.length(1);
    });

    it('should return empty for non-existent package', () => {
      const pubspecs = [createPubspec('app')];
      const graph = resolver.buildGraph(pubspecs);

      const affected = resolver.findAffectedPackages(graph, 'non_existent');
      expect(affected).to.have.length(0);
    });
  });

  describe('getTransitiveDependencies()', () => {
    it('should return empty array when package has no dependencies', () => {
      const pubspecs = [createPubspec('app')];
      const graph = resolver.buildGraph(pubspecs);

      const transitive = resolver.getTransitiveDependencies(graph, 'app');
      expect(transitive).to.have.length(0);
    });

    it('should find direct dependencies', () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
        ['json', createDep('json', '^1.0.0')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      const transitive = resolver.getTransitiveDependencies(graph, 'app');
      expect(transitive).to.include('http');
      expect(transitive).to.include('json');
    });

    it('should find transitive dependencies through internal packages', () => {
      // app -> feature -> core
      const depsApp = new Map<string, DependencyInfo>([
        ['feature', createDep('feature', 'any', 'path')],
      ]);
      const depsFeature = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('feature', { dependencies: depsFeature }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const transitive = resolver.getTransitiveDependencies(graph, 'app');

      expect(transitive).to.include('feature');
      expect(transitive).to.include('core');
    });

    it('should not include the package itself', () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      const transitive = resolver.getTransitiveDependencies(graph, 'app');
      expect(transitive).to.not.include('app');
    });

    it('should handle cycles without infinite loop', () => {
      // a -> b -> a (cycle)
      const depsA = new Map<string, DependencyInfo>([
        ['b', createDep('b', 'any', 'path')],
      ]);
      const depsB = new Map<string, DependencyInfo>([
        ['a', createDep('a', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('a', { dependencies: depsA }),
        createPubspec('b', { dependencies: depsB }),
      ];

      const graph = resolver.buildGraph(pubspecs);

      // Should complete without hanging
      const transitive = resolver.getTransitiveDependencies(graph, 'a');
      expect(transitive).to.include('b');
    });

    it('should deduplicate dependencies', () => {
      // app -> [feat_a, feat_b] -> core (diamond)
      const depsApp = new Map<string, DependencyInfo>([
        ['feat_a', createDep('feat_a', 'any', 'path')],
        ['feat_b', createDep('feat_b', 'any', 'path')],
      ]);
      const depsFeat = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('feat_a', { dependencies: depsFeat }),
        createPubspec('feat_b', { dependencies: depsFeat }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const transitive = resolver.getTransitiveDependencies(graph, 'app');

      // core should only appear once
      expect(transitive.filter((d) => d === 'core')).to.have.length(1);
    });

    it('should return empty for non-existent package', () => {
      const pubspecs = [createPubspec('app')];
      const graph = resolver.buildGraph(pubspecs);

      const transitive = resolver.getTransitiveDependencies(graph, 'non_existent');
      expect(transitive).to.have.length(0);
    });
  });

  describe('getPackageDepth()', () => {
    it('should return 0 for package with no dependents', () => {
      const pubspecs = [createPubspec('root_app')];
      const graph = resolver.buildGraph(pubspecs);

      const depth = resolver.getPackageDepth(graph, 'root_app');
      expect(depth).to.equal(0);
    });

    it('should return 1 for direct dependency of a root package', () => {
      const deps = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: deps }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const depth = resolver.getPackageDepth(graph, 'core');

      expect(depth).to.equal(1);
    });

    it('should return correct depth for deeply nested package', () => {
      // app -> layer1 -> layer2 -> layer3 -> core
      const depsApp = new Map<string, DependencyInfo>([
        ['layer1', createDep('layer1', 'any', 'path')],
      ]);
      const depsL1 = new Map<string, DependencyInfo>([
        ['layer2', createDep('layer2', 'any', 'path')],
      ]);
      const depsL2 = new Map<string, DependencyInfo>([
        ['layer3', createDep('layer3', 'any', 'path')],
      ]);
      const depsL3 = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('layer1', { dependencies: depsL1 }),
        createPubspec('layer2', { dependencies: depsL2 }),
        createPubspec('layer3', { dependencies: depsL3 }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const depth = resolver.getPackageDepth(graph, 'core');

      expect(depth).to.equal(4);
    });

    it('should return max depth when package has multiple paths', () => {
      // app -> layer1 -> core (depth 2)
      // app -> core (depth 1)
      // Should return 2 (the longer path)
      const depsApp = new Map<string, DependencyInfo>([
        ['layer1', createDep('layer1', 'any', 'path')],
        ['core', createDep('core', 'any', 'path')],
      ]);
      const depsL1 = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('layer1', { dependencies: depsL1 }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);
      const depth = resolver.getPackageDepth(graph, 'core');

      expect(depth).to.equal(2);
    });

    it('should calculate depth for external packages based on internal dependents', () => {
      const deps = new Map<string, DependencyInfo>([
        ['http', createDep('http', '^1.0.0')],
      ]);

      const pubspecs = [createPubspec('app', { dependencies: deps })];
      const graph = resolver.buildGraph(pubspecs);

      // http is external, but its dependent 'app' is internal
      // So depth is calculated as 1 (app depends on http, app has no dependents)
      const depth = resolver.getPackageDepth(graph, 'http');
      expect(depth).to.equal(1);
    });

    it('should return 0 for non-existent package', () => {
      const pubspecs = [createPubspec('app')];
      const graph = resolver.buildGraph(pubspecs);

      const depth = resolver.getPackageDepth(graph, 'non_existent');
      expect(depth).to.equal(0);
    });
  });

  describe('complex graph scenarios', () => {
    it('should handle large graph with many packages', () => {
      const pubspecs: PubspecInfo[] = [];

      // Create 20 packages with interconnections
      for (let i = 0; i < 20; i++) {
        const deps = new Map<string, DependencyInfo>();

        // Each package depends on packages with lower indices
        for (let j = 0; j < i && j < 3; j++) {
          deps.set(`pkg_${j}`, createDep(`pkg_${j}`, 'any', 'path'));
        }

        pubspecs.push(createPubspec(`pkg_${i}`, { dependencies: deps }));
      }

      const graph = resolver.buildGraph(pubspecs);

      expect(graph.internalPackages).to.have.length(20);
      expect(graph.cycles).to.have.length(0); // No cycles in this structure
    });

    it('should handle mixed internal and external dependencies', () => {
      const depsApp = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
        ['http', createDep('http', '^1.0.0', 'pub.dev')],
        ['custom_pkg', createDep('custom_pkg', 'main', 'git')],
      ]);

      const depsCore = new Map<string, DependencyInfo>([
        ['json_annotation', createDep('json_annotation', '^4.0.0', 'pub.dev')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: depsApp }),
        createPubspec('core', { dependencies: depsCore }),
      ];

      const graph = resolver.buildGraph(pubspecs);

      expect(graph.internalPackages).to.deep.equal(['app', 'core']);
      expect(graph.externalPackages).to.include('http');
      expect(graph.externalPackages).to.include('custom_pkg');
      expect(graph.externalPackages).to.include('json_annotation');
    });

    it('should correctly identify all edge types in complex graph', () => {
      const deps = new Map<string, DependencyInfo>([
        ['core', createDep('core', 'any', 'path')],
      ]);
      const devDeps = new Map<string, DependencyInfo>([
        ['test', createDep('test', '^1.0.0')],
      ]);

      const pubspecs = [
        createPubspec('app', { dependencies: deps, devDependencies: devDeps }),
        createPubspec('core'),
      ];

      const graph = resolver.buildGraph(pubspecs);

      const directEdge = graph.edges.find((e) => e.from === 'app' && e.to === 'core');
      const devEdge = graph.edges.find((e) => e.from === 'app' && e.to === 'test');

      expect(directEdge).to.exist;
      expect(directEdge!.type).to.equal('direct');

      expect(devEdge).to.exist;
      expect(devEdge!.type).to.equal('dev');
    });
  });
});
