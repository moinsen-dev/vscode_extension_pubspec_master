/**
 * AI Integration Types for Pubspec Master
 *
 * Phase 4b: External AI Integration Architecture
 *
 * This module defines the interfaces for AI-powered features:
 * - Natural language conflict explanations
 * - Migration strategy recommendations
 * - Compatibility predictions from changelogs
 * - Upgrade playbook generation
 */

/**
 * Supported AI providers
 * Designed to support multiple backends for flexibility
 */
export type AIProviderType =
  | 'claude'       // Anthropic Claude API
  | 'openai'       // OpenAI GPT API
  | 'local'        // Local LLM (Ollama, llama.cpp)
  | 'mock';        // For testing

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  type: AIProviderType;
  /** API key for cloud providers */
  apiKey?: string;
  /** API endpoint (for local or custom deployments) */
  endpoint?: string;
  /** Model name/ID to use */
  model?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Temperature for response randomness (0-1) */
  temperature?: number;
}

/**
 * Context about a version conflict for AI analysis
 */
export interface ConflictContext {
  /** The dependency with conflicting versions */
  dependencyName: string;
  /** Packages involved in the conflict */
  packages: Array<{
    name: string;
    requiredVersion: string;
    isDev: boolean;
  }>;
  /** Latest available version on pub.dev */
  latestVersion?: string;
  /** Package description from pub.dev */
  packageDescription?: string;
  /** Changelog excerpts (if available) */
  changelogExcerpts?: string[];
}

/**
 * AI-generated explanation of a conflict
 */
export interface ConflictExplanation {
  /** Plain English summary of the conflict */
  summary: string;
  /** Why this conflict occurred */
  cause: string;
  /** Impact if left unresolved */
  impact: string;
  /** Recommended resolution steps */
  resolutionSteps: string[];
  /** Confidence level of the analysis (0-1) */
  confidence: number;
}

/**
 * Context for migration analysis
 */
export interface MigrationContext {
  /** Package being upgraded */
  packageName: string;
  /** Current version in use */
  currentVersion: string;
  /** Target version for migration */
  targetVersion: string;
  /** Breaking changes from changelog (if available) */
  breakingChanges?: string[];
  /** Code snippets that use this package */
  usageExamples?: string[];
  /** User's SDK version */
  installedSdk?: string;
}

/**
 * AI-generated migration strategy
 */
export interface MigrationStrategy {
  /** Overall difficulty assessment */
  difficulty: 'trivial' | 'easy' | 'moderate' | 'complex' | 'major';
  /** Estimated effort description */
  effortEstimate: string;
  /** Step-by-step migration guide */
  steps: MigrationStep[];
  /** Potential issues to watch for */
  warnings: string[];
  /** Code transformation suggestions */
  codeChanges?: CodeChange[];
}

/**
 * Single step in a migration process
 */
export interface MigrationStep {
  /** Step number */
  order: number;
  /** Action to take */
  action: string;
  /** Detailed instructions */
  details: string;
  /** Whether this step is optional */
  optional: boolean;
}

/**
 * Suggested code change for migration
 */
export interface CodeChange {
  /** Type of change */
  type: 'replace' | 'add' | 'remove' | 'refactor';
  /** Pattern to find (regex or literal) */
  pattern?: string;
  /** Replacement text or new code */
  replacement?: string;
  /** Explanation of the change */
  reason: string;
}

/**
 * Context for compatibility prediction
 */
export interface CompatibilityPredictionContext {
  /** Package to analyze */
  packageName: string;
  /** Version being considered */
  version: string;
  /** Current dependencies in workspace */
  existingDependencies: Array<{
    name: string;
    version: string;
  }>;
  /** SDK constraint of the version */
  sdkConstraint?: string;
}

/**
 * AI prediction of compatibility issues
 */
export interface CompatibilityPrediction {
  /** Overall compatibility assessment */
  compatible: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Potential issues identified */
  issues: CompatibilityIssue[];
  /** Suggestions to resolve issues */
  suggestions: string[];
}

/**
 * Individual compatibility issue
 */
export interface CompatibilityIssue {
  /** Severity of the issue */
  severity: 'breaking' | 'warning' | 'info';
  /** Description of the issue */
  description: string;
  /** Affected packages */
  affectedPackages: string[];
  /** Possible workaround */
  workaround?: string;
}

/**
 * Complete upgrade playbook for a workspace
 */
export interface UpgradePlaybook {
  /** Playbook title */
  title: string;
  /** Overall summary */
  summary: string;
  /** Ordered list of upgrades */
  upgrades: PlaybookUpgrade[];
  /** Pre-upgrade checklist */
  preChecklist: string[];
  /** Post-upgrade verification steps */
  postChecklist: string[];
  /** Rollback instructions */
  rollbackPlan: string[];
}

/**
 * Single upgrade in a playbook
 */
export interface PlaybookUpgrade {
  /** Package to upgrade */
  packageName: string;
  /** Current version */
  from: string;
  /** Target version */
  to: string;
  /** Priority in the sequence */
  priority: number;
  /** Dependencies that must be upgraded first */
  dependencies: string[];
  /** Migration notes */
  notes: string;
  /** Risk level */
  risk: 'low' | 'medium' | 'high';
}

/**
 * Request/response pair for AI interaction logging
 */
export interface AIInteraction {
  /** Unique interaction ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Type of request */
  requestType: 'conflict' | 'migration' | 'compatibility' | 'playbook';
  /** Input context (sanitized) */
  input: unknown;
  /** AI response */
  output: unknown;
  /** Provider used */
  provider: AIProviderType;
  /** Latency in ms */
  latencyMs: number;
  /** Whether the response was cached */
  cached: boolean;
}
