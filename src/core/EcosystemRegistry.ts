import * as path from 'path';
import {
  EcosystemType,
  IPackageParser,
  IRegistryClient,
  IPackageManager,
  IManifestWriter,
} from './interfaces';

/**
 * Ecosystem adapter bundle containing all components for an ecosystem
 */
export interface EcosystemAdapter {
  /** Unique ecosystem identifier */
  type: EcosystemType;
  /** Human-readable name */
  displayName: string;
  /** Glob patterns for manifest files */
  manifestPatterns: string[];
  /** Parser for manifest files */
  parser: IPackageParser;
  /** Registry client for package info */
  registryClient: IRegistryClient;
  /** Package manager for CLI operations */
  packageManager: IPackageManager;
  /** Writer for manifest modifications */
  manifestWriter: IManifestWriter;
}

/**
 * Result of ecosystem detection
 */
export interface EcosystemDetectionResult {
  /** Detected ecosystem type */
  ecosystem: EcosystemType;
  /** Confidence level (0-1) */
  confidence: number;
  /** File that triggered detection */
  detectedFile: string;
}

/**
 * Central registry for ecosystem adapters
 *
 * Manages all ecosystem adapters and provides methods for:
 * - Registering new ecosystems
 * - Detecting ecosystem from file paths
 * - Getting appropriate adapters for files
 */
export class EcosystemRegistry {
  private static instance: EcosystemRegistry;
  private adapters: Map<EcosystemType, EcosystemAdapter> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): EcosystemRegistry {
    if (!EcosystemRegistry.instance) {
      EcosystemRegistry.instance = new EcosystemRegistry();
    }
    return EcosystemRegistry.instance;
  }

  /**
   * Register an ecosystem adapter
   *
   * @param adapter - The ecosystem adapter to register
   * @throws Error if adapter for this ecosystem already exists
   */
  register(adapter: EcosystemAdapter): void {
    if (this.adapters.has(adapter.type)) {
      throw new Error(`Ecosystem adapter for '${adapter.type}' is already registered`);
    }
    this.adapters.set(adapter.type, adapter);
  }

  /**
   * Unregister an ecosystem adapter
   *
   * @param type - The ecosystem type to unregister
   */
  unregister(type: EcosystemType): void {
    this.adapters.delete(type);
  }

  /**
   * Get an ecosystem adapter by type
   *
   * @param type - The ecosystem type
   * @returns The adapter or undefined if not found
   */
  getAdapter(type: EcosystemType): EcosystemAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Get all registered ecosystem types
   */
  getRegisteredEcosystems(): EcosystemType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): EcosystemAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all manifest patterns across all ecosystems
   */
  getAllManifestPatterns(): string[] {
    const patterns: string[] = [];
    for (const adapter of this.adapters.values()) {
      patterns.push(...adapter.manifestPatterns);
    }
    return patterns;
  }

  /**
   * Detect ecosystem from a file path
   *
   * @param filePath - Path to check
   * @returns Ecosystem type or undefined if not recognized
   */
  detectEcosystemFromPath(filePath: string): EcosystemType | undefined {
    const fileName = path.basename(filePath);
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const adapter of this.adapters.values()) {
      if (this.matchesManifestPatterns(normalizedPath, fileName, adapter.manifestPatterns)) {
        return adapter.type;
      }
    }

    return undefined;
  }

  /**
   * Get the adapter that can parse a specific file
   *
   * @param filePath - Path to the manifest file
   * @returns The adapter or undefined if no adapter can handle this file
   */
  getAdapterForFile(filePath: string): EcosystemAdapter | undefined {
    const ecosystem = this.detectEcosystemFromPath(filePath);
    return ecosystem ? this.adapters.get(ecosystem) : undefined;
  }

  /**
   * Get the parser for a specific file
   *
   * @param filePath - Path to the manifest file
   * @returns The parser or undefined if no parser can handle this file
   */
  getParserForFile(filePath: string): IPackageParser | undefined {
    const adapter = this.getAdapterForFile(filePath);
    return adapter?.parser;
  }

  /**
   * Detect all ecosystems present in a directory
   *
   * @param manifestFiles - List of manifest file paths found in the directory
   * @returns Detection results sorted by confidence
   */
  detectEcosystems(manifestFiles: string[]): EcosystemDetectionResult[] {
    const results: EcosystemDetectionResult[] = [];
    const seenEcosystems = new Set<EcosystemType>();

    for (const filePath of manifestFiles) {
      const ecosystem = this.detectEcosystemFromPath(filePath);
      if (ecosystem && !seenEcosystems.has(ecosystem)) {
        seenEcosystems.add(ecosystem);
        results.push({
          ecosystem,
          confidence: 1.0, // Direct file match is high confidence
          detectedFile: filePath,
        });
      }
    }

    // Sort by ecosystem name for consistent ordering
    return results.sort((a, b) => a.ecosystem.localeCompare(b.ecosystem));
  }

  /**
   * Check if a file matches any of the manifest patterns
   */
  private matchesManifestPatterns(
    normalizedPath: string,
    fileName: string,
    patterns: string[]
  ): boolean {
    for (const pattern of patterns) {
      // Simple pattern matching (supports **/filename and filename)
      if (pattern.startsWith('**/')) {
        const patternFileName = pattern.substring(3);
        if (fileName === patternFileName) {
          return true;
        }
      } else if (pattern === fileName) {
        return true;
      } else if (normalizedPath.endsWith(pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all registered adapters (useful for testing)
   */
  clear(): void {
    this.adapters.clear();
  }

  /**
   * Check if an ecosystem is registered
   */
  isRegistered(type: EcosystemType): boolean {
    return this.adapters.has(type);
  }

  /**
   * Get display name for an ecosystem
   */
  getDisplayName(type: EcosystemType): string {
    const adapter = this.adapters.get(type);
    return adapter?.displayName ?? type;
  }
}

// Export singleton instance
export const ecosystemRegistry = EcosystemRegistry.getInstance();
