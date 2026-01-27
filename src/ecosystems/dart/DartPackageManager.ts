import {
  EcosystemType,
  IPackageManager,
  InstallOptions,
  UpdateOptions,
  CommandResult,
} from '../../core/interfaces';
import { runCommand as runProcessCommand, CommandResult as ProcessCommandResult } from '../../utils/processUtils';

/**
 * Convert processUtils CommandResult to interface CommandResult
 */
function convertResult(result: ProcessCommandResult): CommandResult {
  return {
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * Dart/Flutter package manager implementing IPackageManager
 *
 * Provides CLI operations for pub commands (dart pub, flutter pub).
 */
export class DartPackageManager implements IPackageManager {
  readonly ecosystem: EcosystemType = 'dart';
  readonly cliCommand = 'dart';

  private useFlutter = false;

  /**
   * Set whether to use flutter pub instead of dart pub
   */
  setUseFlutter(useFlutter: boolean): void {
    this.useFlutter = useFlutter;
  }

  /**
   * Get the base command (dart or flutter)
   */
  private getBaseCommand(): string {
    return this.useFlutter ? 'flutter' : 'dart';
  }

  /**
   * Check if dart/flutter CLI is available
   */
  async isAvailable(): Promise<boolean> {
    const result = await runProcessCommand(this.getBaseCommand(), ['--version'], process.cwd());
    return result.exitCode === 0;
  }

  /**
   * Get the installed version of dart/flutter
   */
  async getVersion(): Promise<string | null> {
    const result = await runProcessCommand(this.getBaseCommand(), ['--version'], process.cwd());
    if (result.exitCode !== 0) {
      return null;
    }

    // Parse version from output
    // Dart: "Dart SDK version: 3.2.0 (stable) ..."
    // Flutter: "Flutter 3.16.0 ..."
    const match = result.stdout.match(/(?:Dart SDK version:|Flutter)\s*(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Install dependencies (dart pub get / flutter pub get)
   */
  async install(packagePath: string): Promise<CommandResult> {
    const result = await runProcessCommand(this.getBaseCommand(), ['pub', 'get'], packagePath);
    return convertResult(result);
  }

  /**
   * Install a specific package
   */
  async installPackage(
    packagePath: string,
    packageName: string,
    options?: InstallOptions
  ): Promise<CommandResult> {
    const args = ['pub', 'add', packageName];

    if (options?.dev) {
      args.push('--dev');
    }

    if (options?.extraArgs) {
      args.push(...options.extraArgs);
    }

    const result = await runProcessCommand(this.getBaseCommand(), args, packagePath);
    return convertResult(result);
  }

  /**
   * Update all dependencies (dart pub upgrade / flutter pub upgrade)
   */
  async update(packagePath: string, options?: UpdateOptions): Promise<CommandResult> {
    const args = ['pub', 'upgrade'];

    if (options?.extraArgs) {
      args.push(...options.extraArgs);
    }

    const result = await runProcessCommand(this.getBaseCommand(), args, packagePath);
    return convertResult(result);
  }

  /**
   * Update a specific package
   */
  async updatePackage(
    packagePath: string,
    packageName: string,
    options?: UpdateOptions
  ): Promise<CommandResult> {
    const args = ['pub', 'upgrade', packageName];

    if (options?.extraArgs) {
      args.push(...options.extraArgs);
    }

    const result = await runProcessCommand(this.getBaseCommand(), args, packagePath);
    return convertResult(result);
  }

  /**
   * Remove a package
   */
  async removePackage(
    packagePath: string,
    packageName: string
  ): Promise<CommandResult> {
    const result = await runProcessCommand(this.getBaseCommand(), ['pub', 'remove', packageName], packagePath);
    return convertResult(result);
  }

  /**
   * Run a custom pub command
   */
  async runCommand(packagePath: string, args: string[]): Promise<CommandResult> {
    const result = await runProcessCommand(this.getBaseCommand(), args, packagePath);
    return convertResult(result);
  }

  /**
   * Run pub deps to get dependency tree
   */
  async getDependencyTree(packagePath: string): Promise<CommandResult> {
    const result = await runProcessCommand(this.getBaseCommand(), ['pub', 'deps'], packagePath);
    return convertResult(result);
  }

  /**
   * Run pub outdated to check for updates
   */
  async checkOutdated(packagePath: string): Promise<CommandResult> {
    const result = await runProcessCommand(this.getBaseCommand(), ['pub', 'outdated', '--json'], packagePath);
    return convertResult(result);
  }
}
