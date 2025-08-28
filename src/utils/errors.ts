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
 * Error for Gemini API failures
 */
export class GeminiAPIError extends AppError {
  readonly code = 'GEMINI_API_ERROR'

  constructor(
    message: string,
    public readonly suggestion: string,
    public readonly statusCode?: number
  ) {
    super(message)
  }
}

/**
 * Error for network-related failures
 */
export class NetworkError extends AppError {
  readonly code = 'NETWORK_ERROR'

  constructor(
    message: string,
    public readonly suggestion: string,
    public readonly cause?: Error
  ) {
    super(message)
  }
}

/**
 * Error for configuration failures
 */
export class ConfigError extends AppError {
  readonly code = 'CONFIG_ERROR'

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
