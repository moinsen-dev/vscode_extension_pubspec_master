import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

/**
 * Template variables for webview HTML
 */
export interface TemplateVariables {
  /** CSP nonce for inline scripts */
  nonce: string;
  /** VS Code CSP source for styles and scripts */
  cspSource: string;
  /** Additional variables for template substitution */
  [key: string]: string;
}

/**
 * Generate a cryptographically random nonce for CSP
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Load a template file and substitute variables
 *
 * Variables in the template should be in the format: {{variableName}}
 *
 * @param extensionUri - The extension's URI
 * @param templatePath - Relative path to the template from the extension root
 * @param variables - Variables to substitute
 * @returns The processed template content
 */
export async function loadTemplate(
  extensionUri: vscode.Uri,
  templatePath: string,
  variables: TemplateVariables
): Promise<string> {
  const templateUri = vscode.Uri.joinPath(extensionUri, templatePath);
  const templateContent = await fs.readFile(templateUri.fsPath, 'utf-8');

  return processTemplate(templateContent, variables);
}

/**
 * Process a template string with variable substitution
 *
 * @param template - The template string
 * @param variables - Variables to substitute
 * @returns The processed template
 */
export function processTemplate(
  template: string,
  variables: TemplateVariables
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => variables[key] ?? match
  );
}

/**
 * Create standard template variables for a webview panel
 *
 * @param webview - The webview to create variables for
 * @returns Template variables object
 */
export function createWebviewVariables(webview: vscode.Webview): TemplateVariables {
  return {
    nonce: generateNonce(),
    cspSource: webview.cspSource,
  };
}
