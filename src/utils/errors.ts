/**
 * Custom error classes for MCP server
 * Provides specific error types with structured error codes and suggestions
 */

/**
 * Base class for all application errors
 */
export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly suggestion: string

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

/**
 * Error for input validation failures
 */
export class InputValidationError extends AppError {
  readonly code = 'INPUT_VALIDATION_ERROR'

  constructor(
    message: string,
    public readonly suggestion: string
  ) {
    super(message)
  }
}

/**
 * Error for file operation failures
 */
export class FileOperationError extends AppError {
  readonly code = 'FILE_OPERATION_ERROR'

  constructor(
    message: string,
    public readonly suggestion: string
  ) {
    super(message)
  }
}

/**
 * Result type for operations that may fail
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }
