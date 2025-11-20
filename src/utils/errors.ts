/**
 * Custom error classes for MCP server
 * Provides specific error types with structured error codes and suggestions
 */

/**
 * Structured error format for consistent error reporting
 */
export interface StructuredError {
  code: string
  message: string
  suggestion: string
  timestamp: string
  context?: Record<string, unknown>
}

/**
 * Result type pattern for explicit error handling
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

/**
 * Base class for all application errors with structured error support
 */
export abstract class BaseError extends Error {
  abstract readonly code: string
  abstract readonly suggestion: string
  readonly timestamp: string
  readonly context: Record<string, unknown> | undefined

  constructor(message: string, context?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.timestamp = new Date().toISOString()
    this.context = context
  }

  toStructuredError(): StructuredError {
    return {
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      timestamp: this.timestamp,
      ...(this.context && { context: this.context }),
    }
  }
}

/**
 * Error for input validation failures
 */
export class InputValidationError extends BaseError {
  readonly code = 'INPUT_VALIDATION_ERROR'

  constructor(
    message: string,
    public readonly suggestion: string
  ) {
    super(message)
  }
}

/**
 * Error for file operation failures with intelligent suggestion system
 */
export class FileOperationError extends BaseError {
  readonly code = 'FILE_OPERATION_ERROR'

  get suggestion(): string {
    const message = this.message.toLowerCase()

    if (
      message.includes('permission') ||
      message.includes('eacces') ||
      message.includes('access denied')
    ) {
      return 'Check file and directory permissions for the output path'
    }
    if (message.includes('space') || message.includes('enospc') || message.includes('disk full')) {
      return 'Free up disk space or choose a different output directory'
    }
    if (
      message.includes('enoent') ||
      message.includes('no such file') ||
      message.includes('not found')
    ) {
      return 'Ensure the output directory exists and is accessible'
    }
    if (
      message.includes('emfile') ||
      message.includes('too many') ||
      message.includes('file descriptor')
    ) {
      return 'Close unused files or restart the application to free file handles'
    }
    if (message.includes('readonly') || message.includes('read-only')) {
      return 'Choose a writable directory for file output'
    }

    return 'Check file system permissions and available disk space'
  }
}

/**
 * Error for Gemini API failures with intelligent suggestion system
 */
export class GeminiAPIError extends BaseError {
  readonly code = 'GEMINI_API_ERROR'
  private customSuggestion?: string

  constructor(
    message: string,
    suggestionOrContext?: string | Record<string, unknown>,
    statusCodeOrContext?: number | Record<string, unknown>
  ) {
    let context: Record<string, unknown> | undefined
    let statusCode: number | undefined

    // Handle backward compatibility with old constructor signature
    if (typeof suggestionOrContext === 'string') {
      // Old signature: (message, suggestion, statusCode?)
      statusCode = typeof statusCodeOrContext === 'number' ? statusCodeOrContext : undefined
    } else {
      // New signature: (message, context?, statusCode?)
      context = suggestionOrContext
      statusCode = typeof statusCodeOrContext === 'number' ? statusCodeOrContext : undefined
    }

    super(message, context)

    if (typeof suggestionOrContext === 'string') {
      this.customSuggestion = suggestionOrContext
    }

    Object.defineProperty(this, 'statusCode', { value: statusCode, writable: false })
  }

  get suggestion(): string {
    // Use custom suggestion if provided (backward compatibility)
    if (this.customSuggestion) {
      return this.customSuggestion
    }

    // Check if suggestion is in context
    if (
      this.context &&
      'suggestion' in this.context &&
      typeof this.context['suggestion'] === 'string'
    ) {
      return this.context['suggestion']
    }

    // Otherwise use intelligent suggestion system
    const message = this.message.toLowerCase()

    if (message.includes('authentication') || message.includes('unauthorized')) {
      return 'Check GEMINI_API_KEY environment variable and ensure it has proper permissions'
    }
    if (message.includes('rate limit') || message.includes('quota') || message.includes('429')) {
      return 'Wait before retrying or upgrade API quota limits'
    }
    if (message.includes('model') || message.includes('access') || message.includes('permission')) {
      return 'Ensure you have access to gemini-3-pro-image-preview-preview model'
    }
    if (message.includes('timeout') || message.includes('503') || message.includes('502')) {
      return 'The service is temporarily unavailable. Please retry after a few moments'
    }
    if (message.includes('payload') || message.includes('request') || message.includes('400')) {
      return 'Check request format and parameters according to API specification'
    }

    return 'Check API configuration and retry the request'
  }
}

/**
 * Error for network-related failures with intelligent suggestion system
 */
export class NetworkError extends BaseError {
  readonly code = 'NETWORK_ERROR'
  private customSuggestion?: string

  constructor(
    message: string,
    suggestionOrContext?: string | Record<string, unknown>,
    causeOrContext?: Error | Record<string, unknown>
  ) {
    let context: Record<string, unknown> | undefined
    let cause: Error | undefined

    // Handle backward compatibility with old constructor signature
    if (typeof suggestionOrContext === 'string') {
      // Old signature: (message, suggestion, cause?)
      cause = causeOrContext instanceof Error ? causeOrContext : undefined
    } else {
      // New signature: (message, context?, cause?)
      context = suggestionOrContext
      cause = causeOrContext instanceof Error ? causeOrContext : undefined
    }

    super(message, context)

    if (typeof suggestionOrContext === 'string') {
      this.customSuggestion = suggestionOrContext
    }

    Object.defineProperty(this, 'cause', { value: cause, writable: false })
  }

  get suggestion(): string {
    // Use custom suggestion if provided (backward compatibility)
    if (this.customSuggestion) {
      return this.customSuggestion
    }

    // Otherwise use intelligent suggestion system
    const message = this.message.toLowerCase()
    const stack = this.stack?.toLowerCase() || ''

    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'Check network connection stability and retry with higher timeout'
    }
    if (message.includes('dns') || message.includes('enotfound') || stack.includes('getaddrinfo')) {
      return 'Check internet connection and DNS settings'
    }
    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return 'Service may be temporarily unavailable, please retry later'
    }
    if (message.includes('econnreset') || message.includes('connection reset')) {
      return 'Network connection was interrupted, please retry'
    }
    if (message.includes('proxy') || message.includes('tunnel')) {
      return 'Check proxy settings and firewall configuration'
    }

    return 'Check network connectivity and firewall settings'
  }
}

/**
 * Error for configuration failures
 */
export class ConfigError extends BaseError {
  readonly code = 'CONFIG_ERROR'

  constructor(
    message: string,
    public readonly suggestion: string
  ) {
    super(message)
  }
}

/**
 * Error for security violations and attacks with intelligent suggestion system
 */
export class SecurityError extends BaseError {
  readonly code = 'SECURITY_ERROR'

  get suggestion(): string {
    const message = this.message.toLowerCase()

    if (message.includes('null byte')) {
      return 'Ensure your request meets security requirements'
    }
    if (message.includes('path') || message.includes('traversal') || message.includes('..')) {
      return 'Use valid file paths within allowed directories only'
    }
    if (
      message.includes('extension') ||
      message.includes('filetype') ||
      message.includes('format')
    ) {
      return 'Use supported file extensions: .png, .jpg, .jpeg, .webp'
    }
    if (message.includes('size') || message.includes('large') || message.includes('limit')) {
      return 'Ensure file size is within allowed limits (max 10MB)'
    }
    if (message.includes('malicious') || message.includes('suspicious')) {
      return 'The request contains potentially harmful content. Please review and try again'
    }

    return 'Ensure your request meets security requirements'
  }
}
