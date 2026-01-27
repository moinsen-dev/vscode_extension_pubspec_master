import { EcosystemType, IPackageInfo, IDependencyInfo } from '../interfaces';

/**
 * Node in the dependency graph (ecosystem-agnostic)
 */
export interface GraphNode {
  /** Package name */
  name: string;
  /** Package version (if known) */
  version?: string;
  /** Whether this is a workspace package or external dependency */
  type: 'internal' | 'external';
  /** Ecosystem this package belongs to */
  ecosystem: EcosystemType;
  /** Package type within ecosystem (e.g., 'flutter_app', 'npm_module') */
  packageType?: string;
  /** Names of packages this node depends on */
  dependencies: string[];
  /** Names of packages that depend on this node */
  dependents: string[];
  /** Source of the dependency */
  source: 'registry' | 'path' | 'git' | 'sdk' | 'url';
  /** Path for local packages */
  path?: string;
}

/**
 * Edge in the dependency graph
 */
export interface GraphEdge {
  /** Source package name */
  from: string;
  /** Target package name */
  to: string;
  /** Type of dependency relationship */
  type: 'production' | 'development' | 'transitive';
  /** Version constraint */
  constraint?: string;
}

/**
 * Complete dependency graph (ecosystem-agnostic)
 */
export interface DependencyGraphData {
  /** All nodes in the graph */
  nodes: Map<string, GraphNode>;
  /** All edges in the graph */
  edges: GraphEdge[];
  /** Names of workspace packages */
  internalPackages: string[];
  /** Names of external dependencies */
  externalPackages: string[];
  /** Detected circular dependencies */
  cycles: string[][];
  /** Ecosystems present in the graph */
  ecosystems: EcosystemType[];
}

/**
 * Builder for creating ecosystem-agnostic dependency graphs
 */
export class DependencyGraphBuilder {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private internalPackages: string[] = [];
  private externalPackages: string[] = [];
  private ecosystems = new Set<EcosystemType>();

  /**
   * Add a workspace package to the graph
   */
  addPackage(pkg: IPackageInfo): void {
    this.internalPackages.push(pkg.name);
    this.ecosystems.add(pkg.ecosystem);

    this.nodes.set(pkg.name, {
      name: pkg.name,
      version: pkg.version,
      type: 'internal',
      ecosystem: pkg.ecosystem,
      packageType: pkg.packageType,
      dependencies: [],
      dependents: [],
      source: 'path',
      path: pkg.directory,
    });
  }

  /**
   * Process dependencies for a package
   */
  processPackageDependencies(pkg: IPackageInfo): void {
    const sourceNode = this.nodes.get(pkg.name);
    if (!sourceNode) {
      return;
    }

    // Process production dependencies
    for (const [depName, depInfo] of pkg.dependencies) {
      this.processEdge(pkg.name, depName, depInfo, 'production', sourceNode, pkg.ecosystem);
    }

    // Process development dependencies
    for (const [depName, depInfo] of pkg.devDependencies) {
      this.processEdge(pkg.name, depName, depInfo, 'development', sourceNode, pkg.ecosystem);
    }
  }

  /**
   * Process a single dependency edge
   */
  private processEdge(
    sourceName: string,
    depName: string,
    depInfo: IDependencyInfo,
    edgeType: 'production' | 'development',
    sourceNode: GraphNode,
    ecosystem: EcosystemType
  ): void {
    // Add to source node's dependencies
    if (!sourceNode.dependencies.includes(depName)) {
      sourceNode.dependencies.push(depName);
    }

    // Create or update target node
    if (!this.nodes.has(depName)) {
      this.externalPackages.push(depName);
      this.nodes.set(depName, {
        name: depName,
        version: depInfo.constraint,
        type: 'external',
        ecosystem, // Assume same ecosystem as dependent
        dependencies: [],
        dependents: [sourceName],
        source: depInfo.source,
      });
    } else {
      const targetNode = this.nodes.get(depName)!;
      if (!targetNode.dependents.includes(sourceName)) {
        targetNode.dependents.push(sourceName);
      }
    }

    // Add edge
    this.edges.push({
      from: sourceName,
      to: depName,
      type: edgeType,
      constraint: depInfo.constraint,
    });
  }

  /**
   * Build the final graph
   */
  build(): DependencyGraphData {
    const cycles = this.detectCycles();

    return {
      nodes: this.nodes,
      edges: this.edges,
      internalPackages: this.internalPackages,
      externalPackages: [...new Set(this.externalPackages)],
      cycles,
      ecosystems: Array.from(this.ecosystems),
    };
  }

  /**
   * Detect cycles in the graph using DFS
   */
  private detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeName: string): void => {
      visited.add(nodeName);
      recursionStack.add(nodeName);
      path.push(nodeName);

      const node = this.nodes.get(nodeName);
      if (node) {
        for (const dep of node.dependencies) {
          // Only check internal packages for cycles
          if (!this.internalPackages.includes(dep)) {
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

    for (const pkg of this.internalPackages) {
      if (!visited.has(pkg)) {
        dfs(pkg);
      }
    }

    return cycles;
  }
}

/**
 * Utility functions for working with dependency graphs
 */
export class DependencyGraphUtils {
  /**
   * Find all packages affected by changes to a given package
   */
  static findAffectedPackages(graph: DependencyGraphData, changedPackage: string): string[] {
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
  static getTransitiveDependencies(graph: DependencyGraphData, packageName: string): string[] {
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
  static getPackageDepth(graph: DependencyGraphData, packageName: string): number {
    const node = graph.nodes.get(packageName);
    if (!node || node.dependents.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const dependent of node.dependents) {
      if (graph.internalPackages.includes(dependent)) {
        const depth = DependencyGraphUtils.getPackageDepth(graph, dependent) + 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }

  /**
   * Filter graph to a specific ecosystem
   */
  static filterByEcosystem(graph: DependencyGraphData, ecosystem: EcosystemType): DependencyGraphData {
    const filteredNodes = new Map<string, GraphNode>();
    const filteredEdges: GraphEdge[] = [];
    const filteredInternal: string[] = [];
    const filteredExternal: string[] = [];

    for (const [name, node] of graph.nodes) {
      if (node.ecosystem === ecosystem) {
        filteredNodes.set(name, node);
        if (node.type === 'internal') {
          filteredInternal.push(name);
        } else {
          filteredExternal.push(name);
        }
      }
    }

    for (const edge of graph.edges) {
      if (filteredNodes.has(edge.from) && filteredNodes.has(edge.to)) {
        filteredEdges.push(edge);
      }
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      internalPackages: filteredInternal,
      externalPackages: filteredExternal,
      cycles: graph.cycles.filter((cycle) => cycle.every((p) => filteredNodes.has(p))),
      ecosystems: [ecosystem],
    };
  }
}
