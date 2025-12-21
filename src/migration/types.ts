/**
 * Migration types and interfaces
 */

/**
 * Current workspace state detected by analysis
 */
export type WorkspaceState =
  | 'standalone' // Independent packages, no shared resolution
  | 'pub_workspaces' // Using Dart Pub Workspaces
  | 'melos' // Using Melos
  | 'mixed'; // Partial migration state

/**
 * Migration target options
 */
export type MigrationTarget =
  | 'pub_workspaces' // Migrate to Pub Workspaces
  | 'pub_workspaces_melos' // Pub Workspaces + Melos
  | 'keep_current'; // No migration

/**
 * Result of workspace analysis
 */
export interface WorkspaceAnalysis {
  /** Current detected state */
  currentState: WorkspaceState;
  /** Number of packages found */
  packageCount: number;
  /** Total dependencies across all packages */
  totalDependencies: number;
  /** Whether a root pubspec.yaml exists */
  hasRootPubspec: boolean;
  /** Whether melos.yaml exists */
  hasMelos: boolean;
  /** Detected Dart SDK version (minimum across packages) */
  minSdkVersion: string;
  /** Whether SDK supports Pub Workspaces (3.6+) */
  supportsPubWorkspaces: boolean;
  /** List of packages with their paths */
  packages: PackageInfo[];
  /** Any issues that would prevent migration */
  blockers: MigrationBlocker[];
  /** Warnings that don't block migration */
  warnings: MigrationWarning[];
}

/**
 * Package info for migration
 */
export interface PackageInfo {
  name: string;
  version?: string;
  path: string;
  relativePath: string;
  type: 'flutter_app' | 'dart_package' | 'flutter_plugin';
  sdkConstraint?: string;
  hasResolutionWorkspace: boolean;
  dependencyCount: number;
}

/**
 * Blocker that prevents migration
 */
export interface MigrationBlocker {
  type: 'sdk_too_old' | 'circular_dependency' | 'path_outside_workspace' | 'invalid_pubspec';
  message: string;
  package?: string;
  details?: string;
}

/**
 * Warning that doesn't block migration
 */
export interface MigrationWarning {
  type: 'existing_lockfile' | 'git_dependency' | 'path_dependency_external';
  message: string;
  package?: string;
  details?: string;
}

/**
 * Single file change in migration
 */
export interface FileChange {
  /** Absolute path to file */
  path: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Type of change */
  type: 'create' | 'modify' | 'delete';
  /** Original content (for modify/delete) */
  originalContent?: string;
  /** New content (for create/modify) */
  newContent?: string;
  /** Human-readable description */
  description: string;
}

/**
 * Migration plan with all changes
 */
export interface MigrationPlan {
  /** Target migration type */
  target: MigrationTarget;
  /** All file changes to apply */
  changes: FileChange[];
  /** Commands to run after migration */
  postMigrationCommands: string[];
  /** Estimated impact summary */
  summary: {
    filesToCreate: number;
    filesToModify: number;
    filesToDelete: number;
    packagesToMigrate: number;
  };
}

/**
 * Result of migration execution
 */
export interface MigrationResult {
  /** Whether migration succeeded */
  success: boolean;
  /** Path to backup directory */
  backupPath?: string;
  /** Files that were modified */
  modifiedFiles: string[];
  /** Any errors encountered */
  errors: Array<{ file: string; error: string }>;
  /** Post-migration validation result */
  validation?: {
    pubGetSuccess: boolean;
    analyzeSuccess: boolean;
    issueCount: number;
  };
}

/**
 * Wizard step identifier
 */
export type WizardStepId = 'analyze' | 'select' | 'preview' | 'backup' | 'apply' | 'complete';

/**
 * Wizard step definition
 */
export interface WizardStep {
  id: WizardStepId;
  title: string;
  description: string;
  isComplete: boolean;
  canProceed: boolean;
}

/**
 * Wizard state for webview communication
 */
export interface WizardState {
  currentStep: number;
  steps: WizardStep[];
  analysis?: WorkspaceAnalysis;
  selectedTarget?: MigrationTarget;
  plan?: MigrationPlan;
  isProcessing: boolean;
  error?: string;
}
