/**
 * AI Service Interface and Base Implementation
 *
 * Provides the contract for AI-powered analysis features.
 * Implementations can use different providers (Claude, OpenAI, local LLM).
 */

import * as vscode from 'vscode';
import {
  AIProviderConfig,
  AIProviderType,
  ConflictContext,
  ConflictExplanation,
  MigrationContext,
  MigrationStrategy,
  CompatibilityPredictionContext,
  CompatibilityPrediction,
  UpgradePlaybook,
  AIInteraction,
} from './types';

/**
 * Abstract AI service interface
 *
 * Defines the contract for all AI analysis operations.
 * Concrete implementations handle provider-specific details.
 */
export interface IAIService {
  /**
   * Check if the AI service is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the current provider type
   */
  getProviderType(): AIProviderType;

  /**
   * Explain a version conflict in plain language
   */
  explainConflict(context: ConflictContext): Promise<ConflictExplanation>;

  /**
   * Generate a migration strategy for a package upgrade
   */
  generateMigrationStrategy(context: MigrationContext): Promise<MigrationStrategy>;

  /**
   * Predict compatibility issues for a potential upgrade
   */
  predictCompatibility(context: CompatibilityPredictionContext): Promise<CompatibilityPrediction>;

  /**
   * Generate a complete upgrade playbook for the workspace
   */
  generateUpgradePlaybook(
    packages: Array<{ name: string; current: string; target: string }>
  ): Promise<UpgradePlaybook>;
}

/**
 * AI Service configuration from VS Code settings
 */
export interface AIServiceSettings {
  /** Whether AI features are enabled */
  enabled: boolean;
  /** Provider to use */
  provider: AIProviderType;
  /** API key (stored securely) */
  apiKey?: string;
  /** Custom endpoint URL */
  endpoint?: string;
  /** Model to use */
  model?: string;
  /** Whether to cache AI responses */
  cacheResponses: boolean;
  /** Cache TTL in minutes */
  cacheTtlMinutes: number;
}

/**
 * Base AI service implementation with caching and logging
 */
export abstract class BaseAIService implements IAIService {
  protected readonly config: AIProviderConfig;
  protected readonly context: vscode.ExtensionContext;
  private readonly interactionLog: AIInteraction[] = [];
  private readonly cache = new Map<string, { result: unknown; expires: number }>();

  constructor(context: vscode.ExtensionContext, config: AIProviderConfig) {
    this.context = context;
    this.config = config;
  }

  abstract isAvailable(): Promise<boolean>;

  getProviderType(): AIProviderType {
    return this.config.type;
  }

  /**
   * Get AI settings from VS Code configuration
   */
  static getSettings(): AIServiceSettings {
    const config = vscode.workspace.getConfiguration('pubspecMaster.ai');
    return {
      enabled: config.get<boolean>('enabled', false),
      provider: config.get<AIProviderType>('provider', 'mock'),
      apiKey: config.get<string>('apiKey'),
      endpoint: config.get<string>('endpoint'),
      model: config.get<string>('model'),
      cacheResponses: config.get<boolean>('cacheResponses', true),
      cacheTtlMinutes: config.get<number>('cacheTtlMinutes', 60),
    };
  }

  /**
   * Template method for conflict explanation
   * Handles caching and logging, delegates to provider implementation
   */
  async explainConflict(context: ConflictContext): Promise<ConflictExplanation> {
    const cacheKey = `conflict:${JSON.stringify(context)}`;
    const cached = this.getFromCache<ConflictExplanation>(cacheKey);
    if (cached) {
      return cached;
    }

    const start = Date.now();
    const result = await this.doExplainConflict(context);
    const latency = Date.now() - start;

    this.logInteraction('conflict', context, result, latency, false);
    this.setCache(cacheKey, result);

    return result;
  }

  /**
   * Provider-specific conflict explanation implementation
   */
  protected abstract doExplainConflict(context: ConflictContext): Promise<ConflictExplanation>;

  /**
   * Template method for migration strategy
   */
  async generateMigrationStrategy(context: MigrationContext): Promise<MigrationStrategy> {
    const cacheKey = `migration:${JSON.stringify(context)}`;
    const cached = this.getFromCache<MigrationStrategy>(cacheKey);
    if (cached) {
      return cached;
    }

    const start = Date.now();
    const result = await this.doGenerateMigrationStrategy(context);
    const latency = Date.now() - start;

    this.logInteraction('migration', context, result, latency, false);
    this.setCache(cacheKey, result);

    return result;
  }

  /**
   * Provider-specific migration strategy implementation
   */
  protected abstract doGenerateMigrationStrategy(context: MigrationContext): Promise<MigrationStrategy>;

  /**
   * Template method for compatibility prediction
   */
  async predictCompatibility(context: CompatibilityPredictionContext): Promise<CompatibilityPrediction> {
    const cacheKey = `compat:${JSON.stringify(context)}`;
    const cached = this.getFromCache<CompatibilityPrediction>(cacheKey);
    if (cached) {
      return cached;
    }

    const start = Date.now();
    const result = await this.doPredictCompatibility(context);
    const latency = Date.now() - start;

    this.logInteraction('compatibility', context, result, latency, false);
    this.setCache(cacheKey, result);

    return result;
  }

  /**
   * Provider-specific compatibility prediction implementation
   */
  protected abstract doPredictCompatibility(
    context: CompatibilityPredictionContext
  ): Promise<CompatibilityPrediction>;

  /**
   * Template method for upgrade playbook
   */
  async generateUpgradePlaybook(
    packages: Array<{ name: string; current: string; target: string }>
  ): Promise<UpgradePlaybook> {
    const cacheKey = `playbook:${JSON.stringify(packages)}`;
    const cached = this.getFromCache<UpgradePlaybook>(cacheKey);
    if (cached) {
      return cached;
    }

    const start = Date.now();
    const result = await this.doGenerateUpgradePlaybook(packages);
    const latency = Date.now() - start;

    this.logInteraction('playbook', packages, result, latency, false);
    this.setCache(cacheKey, result);

    return result;
  }

  /**
   * Provider-specific playbook generation implementation
   */
  protected abstract doGenerateUpgradePlaybook(
    packages: Array<{ name: string; current: string; target: string }>
  ): Promise<UpgradePlaybook>;

  /**
   * Get recent AI interactions for debugging/analysis
   */
  getRecentInteractions(limit = 10): AIInteraction[] {
    return this.interactionLog.slice(-limit);
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.result as T;
  }

  /**
   * Set cache entry with TTL
   */
  private setCache<T>(key: string, result: T): void {
    const settings = BaseAIService.getSettings();
    if (!settings.cacheResponses) {
      return;
    }

    const ttlMs = settings.cacheTtlMinutes * 60 * 1000;
    this.cache.set(key, {
      result,
      expires: Date.now() + ttlMs,
    });
  }

  /**
   * Log an AI interaction
   */
  private logInteraction(
    requestType: AIInteraction['requestType'],
    input: unknown,
    output: unknown,
    latencyMs: number,
    cached: boolean
  ): void {
    this.interactionLog.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      requestType,
      input,
      output,
      provider: this.config.type,
      latencyMs,
      cached,
    });

    // Keep only last 100 interactions
    if (this.interactionLog.length > 100) {
      this.interactionLog.shift();
    }
  }
}
