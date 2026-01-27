/**
 * Error with additional context for debugging and user-friendly messages
 */
export class ErrorWithContext extends Error {
  /** The operation that was being performed when the error occurred */
  public readonly operation: string;
  /** The file path related to the error, if any */
  public readonly filePath?: string;
  /** Additional context data */
  public readonly context: Record<string, unknown>;
  /** The original error that caused this error, if any */
  public readonly cause?: Error;

  constructor(
    message: string,
    options: {
      operation: string;
      filePath?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'ErrorWithContext';
    this.operation = options.operation;
    this.filePath = options.filePath;
    this.context = options.context ?? {};
    this.cause = options.cause;

    // Maintain proper stack trace for where our error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrorWithContext);
    }
  }

  /**
   * Get a user-friendly error message including context
   */
  getUserMessage(): string {
    let msg = this.message;

    if (this.filePath) {
      msg += `\n  File: ${this.filePath}`;
    }

    if (this.operation) {
      msg += `\n  Operation: ${this.operation}`;
    }

    return msg;
  }

  /**
   * Get a detailed error message for logging
   */
  getDetailedMessage(): string {
    let msg = this.getUserMessage();

    if (Object.keys(this.context).length > 0) {
      msg += `\n  Context: ${JSON.stringify(this.context, null, 2)}`;
    }

    if (this.cause) {
      msg += `\n  Caused by: ${this.cause.message}`;
    }

    return msg;
  }

  /**
   * Convert to a plain object for logging or serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      operation: this.operation,
      filePath: this.filePath,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/**
 * Wrap an error with context information
 *
 * @param error - The original error
 * @param operation - The operation that was being performed
 * @param filePath - Optional file path related to the error
 * @param context - Optional additional context
 * @returns ErrorWithContext
 */
export function wrapError(
  error: unknown,
  operation: string,
  filePath?: string,
  context?: Record<string, unknown>
): ErrorWithContext {
  const originalError = error instanceof Error ? error : new Error(String(error));

  return new ErrorWithContext(originalError.message, {
    operation,
    filePath,
    context,
    cause: originalError,
  });
}

/**
 * Type guard to check if an error is ErrorWithContext
 */
export function isErrorWithContext(error: unknown): error is ErrorWithContext {
  return error instanceof ErrorWithContext;
}
