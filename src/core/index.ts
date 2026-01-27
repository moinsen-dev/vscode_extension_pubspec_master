export { PubspecParser } from './PubspecParser';
export { WorkspaceScanner } from './WorkspaceScanner';
export { DependencyResolver } from './DependencyResolver';
export type {
  DependencyNode,
  DependencyEdge,
  DependencyGraph,
} from './DependencyResolver';
export { VersionAnalyzer } from './VersionAnalyzer';
export type {
  VersionConflict,
  SdkMismatch,
  OutdatedPackage,
  WorkspaceAnalysis,
} from './VersionAnalyzer';
export { validatePubspec, PubspecValidationError } from './PubspecValidator';
export type { ValidationResult } from './PubspecValidator';
export { SdkVersionService } from './SdkVersionService';
export type { InstalledSdkVersions } from './SdkVersionService';
export { CompatibilityAnalyzer } from './CompatibilityAnalyzer';
export type {
  CompatibilityCheckResult,
  CompatibilitySummary,
} from './CompatibilityAnalyzer';
export { ConstraintSolver } from './ConstraintSolver';
export type {
  SemanticVersion,
  VersionRange,
  IntersectionResult,
  ConstraintAnalysis,
} from './ConstraintSolver';
export { ResolutionSimulator } from './ResolutionSimulator';
export type {
  PackageConstraint,
  AggregatedConstraints,
  ResolutionConflict,
  ResolutionReport,
} from './ResolutionSimulator';
export { VersionScorer, DEFAULT_WEIGHTS } from './scoring';
export type {
  VersionScore,
  VersionScoreComponents,
  ScoringWeights,
} from './scoring';
export { RecommendationEngine } from './RecommendationEngine';
export type {
  DependencyRecommendation,
  PrioritizedRecommendation,
  RecommendationReport,
  RecommendationPriority,
  UpgradeAction,
} from './RecommendationEngine';
