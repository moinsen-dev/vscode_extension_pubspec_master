/**
 * Shared utilities for multi-ecosystem package management
 *
 * These utilities are ecosystem-agnostic and can be used by all adapters.
 */

// Version comparison utilities
export {
  ParsedVersion,
  compareVersions,
  parseVersion,
  isNewerVersion,
  isOlderVersion,
  versionsEqual,
  extractVersionFromConstraint,
  getMajorVersion,
  getMinorVersion,
  isCaretConstraint,
  isTildeConstraint,
  isRangeConstraint,
  isExactConstraint,
  sortVersions,
  getHighestVersion,
  getLowestVersion,
} from './VersionComparator';

// Dependency graph
export {
  GraphNode,
  GraphEdge,
  DependencyGraphData,
  DependencyGraphBuilder,
  DependencyGraphUtils,
} from './DependencyGraph';

// Conflict detection
export {
  ConflictSeverity,
  VersionConflict,
  SdkMismatch,
  ConflictDetectionResult,
  ConflictDetector,
} from './ConflictDetector';

// Health analysis
export {
  HealthIssueType,
  HealthIssueSeverity,
  RepoHealthMetrics,
  PackageHealthIssue,
  HealthAnalysisConfig,
  HealthAnalysisResult,
  DEFAULT_HEALTH_CONFIG,
  HealthAnalyzer,
} from './HealthAnalyzer';
