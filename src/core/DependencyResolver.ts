import { PubspecInfo, DependencyInfo } from '../types';

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
  name: string;
  version?: string;
  type: 'internal' | 'external';
  packageType?: 'flutter_app' | 'dart_package' | 'flutter_plugin';
  dependencies: string[];
  dependents: string[];
  source: 'pub.dev' | 'path' | 'git' | 'sdk';
  path?: string;
}

/**
 * Edge in the dependency graph
 */
export interface DependencyEdge {
  from: string;
  to: string;
  type: 'direct' | 'dev' | 'transitive';
  constraint?: string;
}

/**
 * Complete dependency graph
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  internalPackages: string[];
  externalPackages: string[];
  cycles: string[][];
}

/**
 * Resolver for building and analyzing dependency graphs
 */
export class DependencyResolver {
  /**
   * Build a dependency graph from parsed pubspec files
   */
  buildGraph(pubspecs: PubspecInfo[]): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const edges: DependencyEdge[] = [];
    const internalPackages: string[] = [];
    const externalPackages: string[] = [];

    // First pass: create nodes for all internal packages
    for (const pubspec of pubspecs) {
      internalPackages.push(pubspec.name);
      nodes.set(pubspec.name, {
        name: pubspec.name,
        version: pubspec.version,
        type: 'internal',
        packageType: pubspec.type,
        dependencies: [],
        dependents: [],
        source: 'path',
        path: pubspec.directory,
      });
    }

    // Second pass: add dependencies and create external nodes
    for (const pubspec of pubspecs) {
      const sourceNode = nodes.get(pubspec.name)!;

      // Process regular dependencies
      for (const [depName, depInfo] of pubspec.dependencies) {
        this.processEdge(
          pubspec.name,
          depName,
          depInfo,
          'direct',
          nodes,
          edges,
          externalPackages,
          sourceNode
        );
      }

      // Process dev dependencies
      for (const [depName, depInfo] of pubspec.devDependencies) {
        this.processEdge(
          pubspec.name,
          depName,
          depInfo,
          'dev',
          nodes,
          edges,
          externalPackages,
          sourceNode
        );
      }
    }

    // Detect cycles
    const cycles = this.detectCycles(nodes, internalPackages);

    return {
      nodes,
      edges,
      internalPackages,
      externalPackages: [...new Set(externalPackages)],
      cycles,
    };
  }

  /**
   * Process a single dependency edge
   */
  private processEdge(
    sourceName: string,
    depName: string,
    depInfo: DependencyInfo,
    edgeType: 'direct' | 'dev',
    nodes: Map<string, DependencyNode>,
    edges: DependencyEdge[],
    externalPackages: string[],
    sourceNode: DependencyNode
  ): void {
    // Add to source node's dependencies
    if (!sourceNode.dependencies.includes(depName)) {
      sourceNode.dependencies.push(depName);
    }

    // Create or update target node
    if (!nodes.has(depName)) {
      externalPackages.push(depName);
      nodes.set(depName, {
        name: depName,
        version: depInfo.constraint,
        type: 'external',
        dependencies: [],
        dependents: [sourceName],
        source: depInfo.source,
      });
    } else {
      const targetNode = nodes.get(depName)!;
      if (!targetNode.dependents.includes(sourceName)) {
        targetNode.dependents.push(sourceName);
      }
    }

    // Add edge
    edges.push({
      from: sourceName,
      to: depName,
      type: edgeType,
      constraint: depInfo.constraint,
    });
  }

  /**
   * Detect cycles in the dependency graph using DFS
   */
  private detectCycles(
    nodes: Map<string, DependencyNode>,
    internalPackages: string[]
  ): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeName: string): void => {
      visited.add(nodeName);
      recursionStack.add(nodeName);
      path.push(nodeName);

      const node = nodes.get(nodeName);
      if (node) {
        for (const dep of node.dependencies) {
          // Only check internal packages for cycles
          if (!internalPackages.includes(dep)) {
            continue;
          }

          if (!visited.has(dep)) {
            dfs(dep);
          } else if (recursionStack.has(dep)) {
            // Found a cycle
            const cycleStart = path.indexOf(dep);
            const cycle = path.slice(cycleStart);
            cycle.push(dep); // Complete the cycle
            cycles.push(cycle);
          }
        }
      }

      path.pop();
      recursionStack.delete(nodeName);
    };

    for (const pkg of internalPackages) {
      if (!visited.has(pkg)) {
        dfs(pkg);
      }
    }

    return cycles;
  }

  /**
   * Find all packages that would be affected by changes to a given package
   */
  findAffectedPackages(
    graph: DependencyGraph,
    changedPackage: string
  ): string[] {
    const affected = new Set<string>();
    const queue = [changedPackage];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = graph.nodes.get(current);

      if (node) {
        for (const dependent of node.dependents) {
          if (!affected.has(dependent)) {
            affected.add(dependent);
            queue.push(dependent);
          }
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Get all transitive dependencies of a package
   */
  getTransitiveDependencies(
    graph: DependencyGraph,
    packageName: string
  ): string[] {
    const transitive = new Set<string>();
    const queue = [packageName];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const node = graph.nodes.get(current);
      if (node) {
        for (const dep of node.dependencies) {
          if (!transitive.has(dep) && dep !== packageName) {
            transitive.add(dep);
            queue.push(dep);
          }
        }
      }
    }

    return Array.from(transitive);
  }

  /**
   * Get dependency depth (longest path from a root package)
   */
  getPackageDepth(graph: DependencyGraph, packageName: string): number {
    const node = graph.nodes.get(packageName);
    if (!node || node.dependents.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const dependent of node.dependents) {
      if (graph.internalPackages.includes(dependent)) {
        const depth = this.getPackageDepth(graph, dependent) + 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }
}
