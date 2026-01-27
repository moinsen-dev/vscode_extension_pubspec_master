/**
 * Extension constants
 */
export const EXTENSION_ID = 'pubspec-master';
export const EXTENSION_NAME = 'Moinsen Pubspec Master';

/**
 * View IDs
 */
export const DASHBOARD_VIEW_ID = 'pubspecMaster.dashboard';

/**
 * Command IDs
 */
export const COMMANDS = {
  REFRESH: 'pubspecMaster.refresh',
  PUB_GET_ALL: 'pubspecMaster.pubGetAll',
  PUB_UPGRADE_ALL: 'pubspecMaster.pubUpgradeAll',
  OPEN_PUBSPEC: 'pubspecMaster.openPubspec',
  PUB_GET: 'pubspecMaster.pubGet',
  PUB_UPGRADE: 'pubspecMaster.pubUpgrade',
} as const;

/**
 * Configuration keys
 */
export const CONFIG = {
  SCAN_EXCLUDE_PATTERNS: 'pubspecMaster.scan.excludePatterns',
  SCAN_MAX_DEPTH: 'pubspecMaster.scan.maxDepth',
  DASHBOARD_REFRESH_ON_SAVE: 'pubspecMaster.dashboard.refreshOnSave',
} as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  /** Patterns to exclude when scanning for pubspec.yaml files */
  EXCLUDE_PATTERNS: [
    '**/build/**',
    '**/.dart_tool/**',
    '**/ios/Pods/**',
    '**/android/.gradle/**',
    '**/test/fixtures/**',
  ],
  /** Maximum depth to scan for pubspec.yaml files */
  MAX_DEPTH: 10,
  /** Debounce time for refresh operations */
  REFRESH_DEBOUNCE_MS: 500,
  /** Timeout for pub commands in milliseconds */
  COMMAND_TIMEOUT_MS: 120000,
  /** Directory name for storing backups */
  BACKUP_LOCATION: '.pubspec-master-backup',
  /** Maximum YAML alias count to prevent DoS attacks */
  YAML_MAX_ALIAS_COUNT: 100,
  /** Hours to keep cached data when offline */
  OFFLINE_MAX_HOURS: 24,
  /** Default cache TTL in minutes */
  CACHE_TTL_MINUTES: 15,
} as const;
