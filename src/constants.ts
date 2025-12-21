/**
 * Extension constants
 */
export const EXTENSION_ID = 'pubspec-master';
export const EXTENSION_NAME = 'Pubspec Master';

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
  EXCLUDE_PATTERNS: [
    '**/build/**',
    '**/.dart_tool/**',
    '**/ios/Pods/**',
    '**/android/.gradle/**',
    '**/test/fixtures/**',
  ],
  MAX_DEPTH: 10,
  REFRESH_DEBOUNCE_MS: 500,
  COMMAND_TIMEOUT_MS: 120000,
} as const;
