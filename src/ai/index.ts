/**
 * AI Integration Module
 *
 * Phase 4b: External AI Integration for intelligent dependency analysis
 *
 * Features:
 * - Natural language conflict explanations
 * - Migration strategy generation
 * - Compatibility predictions
 * - Upgrade playbook generation
 *
 * Usage:
 * ```typescript
 * import { createAIService } from './ai';
 *
 * const aiService = createAIService(context);
 * if (await aiService.isAvailable()) {
 *   const explanation = await aiService.explainConflict(conflictContext);
 *   console.log(explanation.summary);
 * }
 * ```
 */

import * as vscode from 'vscode';
import { IAIService, BaseAIService } from './AIService';
import { MockAIService } from './MockAIService';
import { AIProviderType } from './types';

// Re-export types
export * from './types';
export { IAIService, BaseAIService } from './AIService';
export { MockAIService } from './MockAIService';

/**
 * Create an AI service instance based on configuration
 *
 * Factory function that returns the appropriate AI service implementation
 * based on user settings. Falls back to mock service if not configured.
 *
 * @param context - VS Code extension context
 * @returns Configured AI service instance
 */
export function createAIService(context: vscode.ExtensionContext): IAIService {
  const settings = BaseAIService.getSettings();

  if (!settings.enabled) {
    // AI features disabled - return mock service
    return new MockAIService(context);
  }

  switch (settings.provider) {
    case 'claude':
      // TODO: Implement ClaudeAIService when Claude API integration is added
      console.log('Claude AI provider not yet implemented, using mock');
      return new MockAIService(context);

    case 'openai':
      // TODO: Implement OpenAIService when OpenAI API integration is added
      console.log('OpenAI provider not yet implemented, using mock');
      return new MockAIService(context);

    case 'local':
      // TODO: Implement LocalAIService for Ollama/llama.cpp
      console.log('Local AI provider not yet implemented, using mock');
      return new MockAIService(context);

    case 'mock':
    default:
      return new MockAIService(context);
  }
}

/**
 * Check if AI features are configured and available
 *
 * @param context - VS Code extension context
 * @returns True if AI service is ready to use
 */
export async function isAIAvailable(context: vscode.ExtensionContext): Promise<boolean> {
  const service = createAIService(context);
  return service.isAvailable();
}

/**
 * Get the currently configured AI provider type
 *
 * @returns The configured provider type
 */
export function getConfiguredProvider(): AIProviderType {
  const settings = BaseAIService.getSettings();
  return settings.provider;
}

/**
 * VS Code settings schema for AI configuration
 *
 * Add these to package.json contributes.configuration:
 * ```json
 * {
 *   "pubspecMaster.ai.enabled": {
 *     "type": "boolean",
 *     "default": false,
 *     "description": "Enable AI-powered analysis features"
 *   },
 *   "pubspecMaster.ai.provider": {
 *     "type": "string",
 *     "enum": ["claude", "openai", "local", "mock"],
 *     "default": "mock",
 *     "description": "AI provider to use"
 *   },
 *   "pubspecMaster.ai.apiKey": {
 *     "type": "string",
 *     "default": "",
 *     "description": "API key for the AI provider"
 *   },
 *   "pubspecMaster.ai.model": {
 *     "type": "string",
 *     "default": "",
 *     "description": "Model name to use (provider-specific)"
 *   },
 *   "pubspecMaster.ai.cacheResponses": {
 *     "type": "boolean",
 *     "default": true,
 *     "description": "Cache AI responses to reduce API calls"
 *   },
 *   "pubspecMaster.ai.cacheTtlMinutes": {
 *     "type": "number",
 *     "default": 60,
 *     "description": "How long to cache AI responses (in minutes)"
 *   }
 * }
 * ```
 */
