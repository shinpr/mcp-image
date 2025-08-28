/**
 * Comprehensive Error Handler for complete error management
 * Provides error classification, recovery mechanisms, and structured response generation
 */

import type { McpToolResponse } from '../types/mcp'
import type { Result } from '../types/result'
import { Err } from '../types/result'
import {
  BaseError,
  ConcurrencyError,
  FileOperationError,
  GeminiAPIError,
  InternalError,
  NetworkError,
  SecurityError,
  type StructuredError,
  ValidationError,
} from '../utils/errors'
import { Logger } from '../utils/logger'

/**
 * Structured logger interface for error handling
 */
interface StructuredLogger {
  error(context: string, message: string, error: Error, metadata?: Record<string, unknown>): void
  warn(context: string, message: string, metadata?: Record<string, unknown>): void
  info(context: string, message: string, metadata?: Record<string, unknown>): void
}

/**
 * Comprehensive error handler with classification and recovery capabilities
 */
export class ComprehensiveErrorHandler {
  private logger: StructuredLogger

  constructor(logger?: StructuredLogger) {
    this.logger = logger || new Logger()
  }

  /**
   * Handle any error and convert it to a structured BaseError Result
   * @param error Error or unknown value to handle
   * @param context Context string for logging
   * @param operation Operation name for logging
   * @returns Result with structured error
   */
  handleError<T>(error: Error | unknown, context: string, operation: string): Result<T, BaseError> {
    let structuredError: BaseError

    if (error instanceof BaseError) {
      structuredError = error
    } else if (error instanceof Error) {
      structuredError = this.classifyError(error, context)
    } else {
      structuredError = new InternalError(`Unknown error type: ${String(error)}`, {
        originalError: error,
        context,
        operation,
      })
    }

    // Log error with filtered sensitive information
    this.logger.error(context, `${operation} failed`, structuredError, {
      errorCode: structuredError.code,
      suggestion: structuredError.suggestion,
      timestamp: structuredError.timestamp,
      // Don't include full context to avoid logging sensitive data
    })

    return Err(structuredError)
  }

  /**
   * Classify a generic Error into appropriate BaseError subclass
   * @param error Original error to classify
   * @param context Context for additional information
   * @returns Classified BaseError
   */
  private classifyError(error: Error, context: string): BaseError {
    const message = error.message.toLowerCase()
    const stack = error.stack?.toLowerCase() || ''
    const name = error.name.toLowerCase()

    // Create base context for all classified errors
    const baseContext = {
      originalStack: error.stack,
      originalName: error.name,
      context,
    }

    // API related errors
    if (this.isAPIError(message, stack, name)) {
      return new GeminiAPIError(error.message, baseContext)
    }

    // Network related errors
    if (this.isNetworkError(message, stack, name)) {
      return new NetworkError(error.message, baseContext)
    }

    // File operation errors
    if (this.isFileError(message, stack, name)) {
      return new FileOperationError(error.message, baseContext)
    }

    // Concurrency errors
    if (this.isConcurrencyError(message, stack, name)) {
      return new ConcurrencyError(error.message, baseContext)
    }

    // Security errors
    if (this.isSecurityError(message, stack, name)) {
      return new SecurityError(error.message, baseContext)
    }

    // Validation errors
    if (this.isValidationError(message, stack, name)) {
      return new ValidationError(error.message, baseContext)
    }

    // Default to internal error
    return new InternalError(error.message, baseContext)
  }

  /**
   * Check if error is API-related with enhanced pattern matching
   */
  private isAPIError(message: string, stack: string, name: string): boolean {
    const apiIndicators = [
      // Authentication and authorization
      'api',
      'authentication',
      'authorization',
      'auth',
      'unauthorized',
      'forbidden',
      'access_denied',
      'invalid_token',

      // API specific
      'quota',
      'rate limit',
      'rate-limit',
      'ratelimit',
      'gemini',
      'model',
      'endpoint',

      // HTTP status patterns
      '400',
      '401',
      '403',
      '429',
      '500',
      '502',
      '503',
      '504',

      // Request/response patterns
      'request',
      'response',
      'payload',
      'json',
      'parse error',

      // Service specific
      'service unavailable',
      'bad gateway',
      'gateway timeout',
    ]

    return (
      apiIndicators.some(
        (indicator) =>
          message.includes(indicator) ||
          message.includes(indicator.replace(' ', '_')) ||
          message.includes(indicator.replace('_', ' '))
      ) ||
      stack.includes('gemini') ||
      stack.includes('api') ||
      stack.includes('http') ||
      name.includes('api') ||
      name.includes('http')
    )
  }

  /**
   * Check if error is network-related with enhanced pattern matching
   */
  private isNetworkError(message: string, stack: string, name: string): boolean {
    const networkIndicators = [
      // Connection errors
      'network',
      'connection',
      'connect',
      'econnrefused',
      'econnreset',
      'econnaborted',
      'connection refused',
      'connection reset',
      'connection aborted',

      // Timeout errors
      'timeout',
      'etimedout',
      'timed out',
      'request timeout',
      'read timeout',
      'connect timeout',

      // DNS errors
      'dns',
      'enotfound',
      'getaddrinfo',
      'hostname',
      'resolution',
      'dns_probe',

      // Network infrastructure
      'proxy',
      'tunnel',
      'firewall',
      'blocked',
      'unreachable',
      'host unreachable',
      'network unreachable',

      // SSL/TLS errors
      'ssl',
      'tls',
      'certificate',
      'cert',
      'handshake',
      'protocol',

      // Socket errors
      'socket',
      'esocktimedout',
      'eaddrnotavail',
      'enetdown',
      'enetunreach',
      'ehostdown',
      'ehostunreach',

      // HTTP client errors (not server errors which are API)
      'client_error',
      'fetch_error',
      'request_error',
    ]

    return (
      networkIndicators.some(
        (indicator) =>
          message.includes(indicator) ||
          message.includes(indicator.replace(' ', '_')) ||
          message.includes(indicator.replace('_', ' '))
      ) ||
      networkIndicators.some((indicator) => stack.includes(indicator)) ||
      name.includes('network') ||
      name.includes('timeout') ||
      name.includes('dns') ||
      name.includes('socket')
    )
  }

  /**
   * Check if error is file operation related
   */
  private isFileError(message: string, stack: string, name: string): boolean {
    const fileIndicators = [
      'file',
      'directory',
      'permission',
      'eacces',
      'enoent',
      'enospc',
      'emfile',
      'access denied',
      'no such file',
      'disk full',
      'readonly',
      'read-only',
    ]

    return (
      fileIndicators.some((indicator) => message.includes(indicator)) ||
      fileIndicators.some((indicator) => stack.includes(indicator)) ||
      name.includes('file') ||
      name.includes('fs')
    )
  }

  /**
   * Check if error is concurrency-related
   */
  private isConcurrencyError(message: string, stack: string, name: string): boolean {
    const concurrencyIndicators = [
      'concurrent',
      'busy',
      'queue',
      'limit',
      'maximum',
      'overload',
      'throttle',
    ]

    return (
      concurrencyIndicators.some((indicator) => message.includes(indicator)) ||
      concurrencyIndicators.some((indicator) => stack.includes(indicator)) ||
      name.includes('concurrency')
    )
  }

  /**
   * Check if error is security-related
   */
  private isSecurityError(message: string, stack: string, name: string): boolean {
    const securityIndicators = [
      'security',
      'path',
      'traversal',
      'forbidden',
      'unauthorized',
      'malicious',
      'suspicious',
      '..',
      'filetype',
      'extension',
    ]

    return (
      securityIndicators.some((indicator) => message.includes(indicator)) ||
      securityIndicators.some((indicator) => stack.includes(indicator)) ||
      name.includes('security')
    )
  }

  /**
   * Check if error is validation-related
   */
  private isValidationError(message: string, stack: string, name: string): boolean {
    const validationIndicators = [
      'validation',
      'invalid',
      'parameter',
      'argument',
      'format',
      'parse',
      'schema',
      'type',
    ]

    return (
      validationIndicators.some((indicator) => message.includes(indicator)) ||
      validationIndicators.some((indicator) => stack.includes(indicator)) ||
      name.includes('validation') ||
      name.includes('type')
    )
  }

  /**
   * Convert BaseError to MCP tool response format
   * @param error BaseError to convert
   * @returns MCP tool response
   */
  convertToMcpResponse(error: BaseError): McpToolResponse {
    const structuredError: StructuredError = error.toStructuredError()

    // Filter sensitive information from context
    const safeContext = this.sanitizeContext(structuredError.context)
    const safeStructuredError = {
      ...structuredError,
      context: safeContext,
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: safeStructuredError,
          }),
        },
      ],
      isError: true,
    }
  }

  /**
   * Sanitize error context to prevent sensitive information leakage
   * @param context Original context object
   * @returns Sanitized context object
   */
  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined

    const sanitized: Record<string, unknown> = {}
    const sensitiveKeys = [
      'password',
      'token',
      'key',
      'secret',
      'credential',
      'auth',
      'api_key',
      'authorization',
    ]

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase()

      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'string' && value.length > 1000) {
        // Truncate very long strings to prevent log spam
        sanitized[key] = `${value.substring(0, 1000)}...[TRUNCATED]`
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Check if an error is retryable with enhanced retry logic
   * @param error Error to check
   * @returns True if error should be retried
   */
  isRetryableError(error: BaseError): boolean {
    const message = error.message.toLowerCase()

    // Network errors are generally retryable except for permanent failures
    if (error instanceof NetworkError) {
      // Non-retryable network errors (permanent failures)
      const permanentFailures = [
        'dns',
        'enotfound',
        'hostname',
        'certificate',
        'cert',
        'ssl',
        'tls',
        'protocol',
        'handshake',
        'blocked',
        'firewall',
        'access denied',
        'forbidden',
      ]

      const isPermanent = permanentFailures.some((pattern) => message.includes(pattern))
      return !isPermanent
    }

    // API errors - retryable for temporary issues
    if (error instanceof GeminiAPIError) {
      // Retryable API errors (temporary issues)
      const retryablePatterns = [
        'timeout',
        'timed out',
        'rate limit',
        'rate-limit',
        'quota',
        'busy',
        'overload',
        'throttle',
        '429', // Too Many Requests
        '500', // Internal Server Error
        '502', // Bad Gateway
        '503', // Service Unavailable
        '504', // Gateway Timeout
        'service unavailable',
        'bad gateway',
        'gateway timeout',
        'temporarily unavailable',
        'try again',
        'retry',
      ]

      return retryablePatterns.some((pattern) => message.includes(pattern))
    }

    // Concurrency errors are always retryable (just wait and retry)
    if (error instanceof ConcurrencyError) {
      return true
    }

    // File operation errors - some are retryable
    if (error instanceof FileOperationError) {
      // Retryable file errors (temporary issues)
      const retryableFilePatterns = [
        'busy',
        'locked',
        'temporary',
        'emfile', // Too many open files - temporary
        'enfile', // File table overflow - temporary
      ]

      return retryableFilePatterns.some((pattern) => message.includes(pattern))
    }

    // Security and validation errors are never retryable
    if (error instanceof SecurityError || error instanceof ValidationError) {
      return false
    }

    // Internal errors might be retryable if they seem temporary
    if (error instanceof InternalError) {
      const temporaryPatterns = [
        'temporary',
        'transient',
        'momentary',
        'busy',
        'overload',
        'memory',
        'resource',
      ]

      return temporaryPatterns.some((pattern) => message.includes(pattern))
    }

    // Default to not retryable for unknown error types
    return false
  }

  /**
   * Get retry delay in milliseconds with adaptive exponential backoff
   * @param attempt Current attempt number (1-based)
   * @param error Optional error to adapt delay based on error type
   * @param baseDelay Base delay in milliseconds (default: 1000)
   * @returns Delay in milliseconds
   */
  getRetryDelay(attempt: number, error?: BaseError, baseDelay = 1000): number {
    let adjustedBaseDelay = baseDelay

    // Adapt base delay based on error type
    if (error) {
      if (error instanceof NetworkError) {
        // Network errors might need longer delays
        const message = error.message.toLowerCase()
        if (message.includes('timeout') || message.includes('timed out')) {
          adjustedBaseDelay = baseDelay * 2 // Double delay for timeouts
        } else if (message.includes('connection')) {
          adjustedBaseDelay = baseDelay * 1.5 // Increase delay for connection issues
        }
      } else if (error instanceof GeminiAPIError) {
        // API errors might have specific retry requirements
        const message = error.message.toLowerCase()
        if (message.includes('rate limit') || message.includes('quota')) {
          adjustedBaseDelay = baseDelay * 3 // Much longer delay for rate limits
        } else if (message.includes('503') || message.includes('service unavailable')) {
          adjustedBaseDelay = baseDelay * 2 // Longer delay for service unavailable
        }
      } else if (error instanceof ConcurrencyError) {
        // Concurrency errors need shorter delays since it's just queue management
        adjustedBaseDelay = Math.max(500, baseDelay * 0.5)
      } else if (error instanceof FileOperationError) {
        // File operations might need variable delays
        const message = error.message.toLowerCase()
        if (message.includes('locked') || message.includes('busy')) {
          adjustedBaseDelay = baseDelay * 1.5
        }
      }
    }

    // Calculate exponential backoff with cap
    const exponentialDelay = adjustedBaseDelay * 2 ** (attempt - 1)
    const cappedDelay = Math.min(exponentialDelay, 30000) // Cap at 30 seconds

    // Add jitter to prevent thundering herd
    const jitterPercent = 0.1 + Math.random() * 0.2 // 10-30% jitter
    const jitter = cappedDelay * jitterPercent
    const finalDelay = cappedDelay + (Math.random() > 0.5 ? jitter : -jitter)

    return Math.max(100, Math.floor(finalDelay)) // Minimum 100ms delay
  }

  /**
   * Get human-readable retry advice based on error type and attempt
   * @param error Error that occurred
   * @param attempt Current attempt number
   * @param maxAttempts Maximum retry attempts
   * @returns Human-readable retry advice
   */
  getRetryAdvice(error: BaseError, attempt: number, maxAttempts: number): string {
    const remaining = maxAttempts - attempt

    if (remaining <= 0) {
      return `All ${maxAttempts} retry attempts exhausted. ${error.suggestion}`
    }

    let timeAdvice = 'shortly'
    if (error instanceof GeminiAPIError && error.message.toLowerCase().includes('rate limit')) {
      timeAdvice = 'after waiting for rate limit reset'
    } else if (error instanceof NetworkError) {
      timeAdvice = 'when network connectivity improves'
    } else if (error instanceof ConcurrencyError) {
      timeAdvice = 'when server capacity is available'
    }

    return `Attempt ${attempt}/${maxAttempts} failed. Will retry ${timeAdvice} (${remaining} attempts remaining).`
  }
}
