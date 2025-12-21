import { PubspecInfo, PubspecParseError } from './pubspec';

/**
 * Result of workspace scanning
 */
export interface WorkspaceScanResult {
  /** Root workspace pubspec if exists (has workspace: [...]) */
  rootPubspec?: PubspecInfo;

  /** All discovered packages */
  packages: PubspecInfo[];

  /** Files that failed to parse */
  parseErrors: PubspecParseError[];

  /** Whether this appears to be a monorepo (multiple packages) */
  isMonorepo: boolean;

  /** Whether Pub Workspaces are configured */
  usesPubWorkspaces: boolean;

  /** Whether Melos is configured (melos.yaml exists) */
  usesMelos: boolean;

  /** Total scan time in milliseconds */
  scanDurationMs: number;
}

/**
 * File change event for watcher
 */
export interface FileChangeEvent {
  /** Type of change */
  type: 'created' | 'changed' | 'deleted';
  /** Absolute path to the changed file */
  path: string;
}
