import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Performance benchmarks for Pubspec Master
 *
 * Target performance metrics:
 * - Initial scan (10 packages): <500ms
 * - Initial scan (50 packages): <2s
 * - Graph render (50 nodes): <100ms
 * - Dashboard refresh: <200ms
 *
 * Run with: npx ts-node test/performance/benchmarks.ts
 */

// Performance targets in milliseconds
const TARGETS = {
  SCAN_10_PACKAGES: 500,
  SCAN_50_PACKAGES: 2000,
  PARSE_PUBSPEC: 10,
  BUILD_GRAPH_50: 100,
  DETECT_CONFLICTS: 50,
  ANALYZE_MIGRATION: 100,
};

interface BenchmarkResult {
  name: string;
  duration: number;
  target: number;
  passed: boolean;
  iterations: number;
}

const results: BenchmarkResult[] = [];

/**
 * Run a benchmark function multiple times and measure average duration
 */
async function benchmark(
  name: string,
  target: number,
  iterations: number,
  fn: () => Promise<void>
): Promise<BenchmarkResult> {
  // Warm-up run
  await fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const end = performance.now();

  const duration = (end - start) / iterations;
  const passed = duration <= target;

  const result: BenchmarkResult = {
    name,
    duration: Math.round(duration * 100) / 100,
    target,
    passed,
    iterations,
  };

  results.push(result);

  const status = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(
    `${color}${status}\x1b[0m ${name}: ${result.duration}ms (target: ${target}ms)`
  );

  return result;
}

/**
 * Benchmark: Parse a single pubspec.yaml file
 */
async function benchmarkParsePubspec(): Promise<void> {
  const fixtureDir = path.join(__dirname, '../fixtures/simple-monorepo');
  const pubspecPath = path.join(fixtureDir, 'pubspec.yaml');

  await benchmark('Parse single pubspec.yaml', TARGETS.PARSE_PUBSPEC, 100, async () => {
    const content = await fs.readFile(pubspecPath, 'utf-8');
    // Simple YAML-like parsing simulation (real parsing uses yaml package)
    const lines = content.split('\n');
    const parsed: Record<string, unknown> = {};
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        parsed[match[1]] = match[2] || {};
      }
    }
  });
}

/**
 * Benchmark: Scan simple monorepo (4 packages)
 */
async function benchmarkScanSimpleMonorepo(): Promise<void> {
  const fixtureDir = path.join(__dirname, '../fixtures/simple-monorepo');

  await benchmark('Scan simple monorepo (4 packages)', TARGETS.SCAN_10_PACKAGES, 20, async () => {
    // Simulate workspace scanning
    const findPubspecs = async (dir: string): Promise<string[]> => {
      const results: string[] = [];
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          results.push(...(await findPubspecs(fullPath)));
        } else if (entry.name === 'pubspec.yaml') {
          results.push(fullPath);
        }
      }
      return results;
    };

    const pubspecs = await findPubspecs(fixtureDir);
    // Read each pubspec
    for (const p of pubspecs) {
      await fs.readFile(p, 'utf-8');
    }
  });
}

/**
 * Benchmark: Scan large monorepo (53 packages)
 */
async function benchmarkScanLargeMonorepo(): Promise<void> {
  const fixtureDir = path.join(__dirname, '../fixtures/large-monorepo');

  await benchmark('Scan large monorepo (53 packages)', TARGETS.SCAN_50_PACKAGES, 10, async () => {
    const findPubspecs = async (dir: string): Promise<string[]> => {
      const results: string[] = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            results.push(...(await findPubspecs(fullPath)));
          } else if (entry.name === 'pubspec.yaml') {
            results.push(fullPath);
          }
        }
      } catch {
        // Directory may not exist in some test scenarios
      }
      return results;
    };

    const pubspecs = await findPubspecs(fixtureDir);
    // Read each pubspec
    for (const p of pubspecs) {
      await fs.readFile(p, 'utf-8');
    }
  });
}

/**
 * Benchmark: Build dependency graph from 50 nodes
 */
async function benchmarkBuildGraph(): Promise<void> {
  // Simulate graph building with 50 nodes
  interface Node {
    id: string;
    dependencies: string[];
  }

  const nodes: Node[] = [];
  for (let i = 0; i < 50; i++) {
    const deps: string[] = [];
    // Each node depends on 0-3 previous nodes
    const numDeps = Math.min(i, Math.floor(Math.random() * 4));
    for (let j = 0; j < numDeps; j++) {
      deps.push(`pkg_${Math.floor(Math.random() * i)}`);
    }
    nodes.push({ id: `pkg_${i}`, dependencies: deps });
  }

  await benchmark('Build dependency graph (50 nodes)', TARGETS.BUILD_GRAPH_50, 100, async () => {
    // Build adjacency list
    const graph = new Map<string, Set<string>>();
    const reverseGraph = new Map<string, Set<string>>();

    for (const node of nodes) {
      if (!graph.has(node.id)) {
        graph.set(node.id, new Set());
      }
      if (!reverseGraph.has(node.id)) {
        reverseGraph.set(node.id, new Set());
      }

      for (const dep of node.dependencies) {
        graph.get(node.id)!.add(dep);

        if (!reverseGraph.has(dep)) {
          reverseGraph.set(dep, new Set());
        }
        reverseGraph.get(dep)!.add(node.id);
      }
    }

    // Calculate transitive dependencies for each node
    const calculateTransitive = (nodeId: string): Set<string> => {
      const visited = new Set<string>();
      const stack = [nodeId];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) {continue;}
        visited.add(current);

        const deps = graph.get(current);
        if (deps) {
          for (const dep of deps) {
            if (!visited.has(dep)) {
              stack.push(dep);
            }
          }
        }
      }

      visited.delete(nodeId);
      return visited;
    };

    // Calculate for all nodes
    for (const node of nodes) {
      calculateTransitive(node.id);
    }
  });
}

/**
 * Benchmark: Detect version conflicts
 */
async function benchmarkDetectConflicts(): Promise<void> {
  // Simulate version conflict detection across packages
  interface PackageDep {
    package: string;
    dep: string;
    version: string;
  }

  const deps: PackageDep[] = [];
  const packages = ['app_a', 'app_b', 'app_c', 'lib_1', 'lib_2'];
  const dependencies = ['http', 'provider', 'dio', 'json', 'path'];

  for (const pkg of packages) {
    for (const dep of dependencies) {
      deps.push({
        package: pkg,
        dep,
        version: `^${Math.floor(Math.random() * 3)}.${Math.floor(Math.random() * 10)}.0`,
      });
    }
  }

  await benchmark('Detect version conflicts', TARGETS.DETECT_CONFLICTS, 100, async () => {
    // Group by dependency
    const byDep = new Map<string, PackageDep[]>();
    for (const d of deps) {
      if (!byDep.has(d.dep)) {
        byDep.set(d.dep, []);
      }
      byDep.get(d.dep)!.push(d);
    }

    // Find conflicts (different versions of same dep)
    const conflicts: Array<{ dep: string; versions: string[] }> = [];
    for (const [dep, pkgDeps] of byDep) {
      const versions = new Set(pkgDeps.map((d) => d.version));
      if (versions.size > 1) {
        conflicts.push({ dep, versions: Array.from(versions) });
      }
    }
  });
}

/**
 * Benchmark: Analyze migration readiness
 */
async function benchmarkMigrationAnalysis(): Promise<void> {
  const fixtureDir = path.join(__dirname, '../fixtures/conflict-workspace');

  await benchmark('Analyze migration readiness', TARGETS.ANALYZE_MIGRATION, 50, async () => {
    // Check for root pubspec
    let hasRootPubspec = false;
    try {
      await fs.access(path.join(fixtureDir, 'pubspec.yaml'));
      hasRootPubspec = true;
    } catch {
      // No root pubspec
    }

    // Check for melos.yaml
    let hasMelos = false;
    try {
      await fs.access(path.join(fixtureDir, 'melos.yaml'));
      hasMelos = true;
    } catch {
      // No melos
    }

    // Scan for packages
    const packagesDir = path.join(fixtureDir, 'packages');
    let packageCount = 0;
    try {
      const entries = await fs.readdir(packagesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            await fs.access(path.join(packagesDir, entry.name, 'pubspec.yaml'));
            packageCount++;
          } catch {
            // Not a package
          }
        }
      }
    } catch {
      // No packages dir
    }

    // Simulate analysis result
    const analysis = {
      hasRootPubspec,
      hasMelos,
      packageCount,
      state: hasMelos ? 'melos' : hasRootPubspec ? 'pub_workspaces' : 'standalone',
    };

    // Use the analysis to prevent unused variable warning
    if (!analysis) {
      throw new Error('Analysis failed');
    }
  });
}

/**
 * Print summary of all benchmarks
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`\nResults: ${passed}/${total} passed\n`);

  console.log('| Benchmark | Duration | Target | Status |');
  console.log('|-----------|----------|--------|--------|');

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(
      `| ${result.name.padEnd(35)} | ${(result.duration + 'ms').padEnd(8)} | ${(result.target + 'ms').padEnd(6)} | ${status} |`
    );
  }

  console.log('\n' + '='.repeat(60));

  if (passed === total) {
    console.log('\x1b[32mAll benchmarks passed!\x1b[0m');
  } else {
    console.log(
      `\x1b[31m${total - passed} benchmark(s) failed to meet target.\x1b[0m`
    );
    process.exitCode = 1;
  }
}

/**
 * Main benchmark runner
 */
async function main(): Promise<void> {
  console.log('Pubspec Master Performance Benchmarks');
  console.log('=====================================\n');

  try {
    await benchmarkParsePubspec();
    await benchmarkScanSimpleMonorepo();
    await benchmarkScanLargeMonorepo();
    await benchmarkBuildGraph();
    await benchmarkDetectConflicts();
    await benchmarkMigrationAnalysis();
  } catch (error) {
    console.error('Benchmark error:', error);
    process.exitCode = 1;
  }

  printSummary();
}

// Run benchmarks
main();
