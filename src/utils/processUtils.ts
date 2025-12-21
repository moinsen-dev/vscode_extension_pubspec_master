import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

// Shared output channel for logging
let outputChannel: vscode.OutputChannel | undefined;

/**
 * Get or create the shared output channel
 */
export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Pubspec Master');
  }
  return outputChannel;
}

/**
 * Result of running a shell command
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Get the appropriate pub command for a package
 *
 * @param isFlutter - Whether this is a Flutter package/app
 * @returns Command and arguments to run
 */
export function getPubCommand(isFlutter: boolean): { command: string; args: string[] } {
  if (isFlutter) {
    return { command: 'flutter', args: ['pub'] };
  }
  return { command: 'dart', args: ['pub'] };
}

/**
 * Run pub get for a package
 *
 * @param packagePath - Directory containing pubspec.yaml
 * @param isFlutter - Whether this is a Flutter package/app
 * @returns Command result
 */
export async function runPubGet(
  packagePath: string,
  isFlutter: boolean
): Promise<CommandResult> {
  const { command, args } = getPubCommand(isFlutter);

  try {
    const { stdout, stderr } = await execFileAsync(command, [...args, 'get'], {
      cwd: packagePath,
      timeout: 120000, // 2 minute timeout
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Unknown error',
      exitCode: err.code || 1,
    };
  }
}

/**
 * Run pub upgrade for a package
 *
 * @param packagePath - Directory containing pubspec.yaml
 * @param isFlutter - Whether this is a Flutter package/app
 * @returns Command result
 */
export async function runPubUpgrade(
  packagePath: string,
  isFlutter: boolean
): Promise<CommandResult> {
  const { command, args } = getPubCommand(isFlutter);

  try {
    const { stdout, stderr } = await execFileAsync(command, [...args, 'upgrade'], {
      cwd: packagePath,
      timeout: 120000, // 2 minute timeout
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Unknown error',
      exitCode: err.code || 1,
    };
  }
}

/**
 * Run a pub command in the integrated terminal with visible output
 *
 * @param packagePath - Directory containing pubspec.yaml
 * @param isFlutter - Whether this is a Flutter package/app
 * @param action - The pub action to run (get, upgrade)
 * @param packageName - Name of the package (for terminal title)
 * @returns Promise that resolves when command completes with exit code
 */
export async function runPubCommandInTerminal(
  packagePath: string,
  isFlutter: boolean,
  action: 'get' | 'upgrade',
  packageName: string
): Promise<CommandResult> {
  const { command, args } = getPubCommand(isFlutter);
  const fullArgs = [...args, action];
  const cmdString = `${command} ${fullArgs.join(' ')}`;
  const channel = getOutputChannel();

  // Log to output channel
  channel.appendLine(`\n${'='.repeat(60)}`);
  channel.appendLine(`[${new Date().toLocaleTimeString()}] Running: ${cmdString}`);
  channel.appendLine(`Package: ${packageName}`);
  channel.appendLine(`Path: ${packagePath}`);
  channel.appendLine('='.repeat(60));

  return new Promise((resolve) => {
    const child = spawn(command, fullArgs, {
      cwd: packagePath,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      channel.append(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      channel.append(text);
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      channel.appendLine(`\n[${new Date().toLocaleTimeString()}] Command finished with exit code: ${exitCode}`);
      channel.appendLine('-'.repeat(60));

      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });

    child.on('error', (err) => {
      channel.appendLine(`\n[ERROR] ${err.message}`);
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

/**
 * Run a generic shell command
 *
 * @param command - Command to run
 * @param args - Command arguments
 * @param cwd - Working directory
 * @returns Promise with command result
 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

/**
 * Run flutter analyze in the workspace
 *
 * @param workspacePath - Root workspace directory
 * @returns Promise with analyze result
 */
export async function runFlutterAnalyze(
  workspacePath: string
): Promise<CommandResult> {
  const channel = getOutputChannel();

  channel.appendLine(`\n${'='.repeat(60)}`);
  channel.appendLine(`[${new Date().toLocaleTimeString()}] Running: flutter analyze`);
  channel.appendLine(`Path: ${workspacePath}`);
  channel.appendLine('='.repeat(60));
  channel.show(true); // Show output channel, preserve focus

  return new Promise((resolve) => {
    const child = spawn('flutter', ['analyze'], {
      cwd: workspacePath,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      channel.append(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      channel.append(text);
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      channel.appendLine(`\n[${new Date().toLocaleTimeString()}] Analyze finished with exit code: ${exitCode}`);

      if (exitCode === 0) {
        channel.appendLine('No issues found!');
      } else {
        channel.appendLine('Issues were found. Review the output above.');
      }
      channel.appendLine('-'.repeat(60));

      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });

    child.on('error', (err) => {
      channel.appendLine(`\n[ERROR] ${err.message}`);
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}
