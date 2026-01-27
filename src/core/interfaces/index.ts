/**
 * Core interfaces for multi-ecosystem package management
 *
 * These interfaces define the contracts that each ecosystem adapter
 * must implement to integrate with the extension.
 */

// Base types
export {
  EcosystemType,
  DependencySource,
  CommandResult,
  VersionCheckRequest,
  VersionCheckResult,
  RegistryPackageInfo,
} from './types';

// Package information
export {
  IDependencyInfo,
  IPackageInfo,
  createEmptyPackageInfo,
} from './IPackageInfo';

// Package parser
export { IPackageParser } from './IPackageParser';

// Registry client
export { IRegistryClient } from './IRegistryClient';

// Package manager
export {
  InstallOptions,
  UpdateOptions,
  IPackageManager,
} from './IPackageManager';

// Manifest writer
export {
  WriteOptions,
  WriteResult,
  IManifestWriter,
} from './IManifestWriter';
