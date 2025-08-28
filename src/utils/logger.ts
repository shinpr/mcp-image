/**
 * Logger utility for structured logging with sensitive data filtering
 * Provides consistent logging format across the application
 */

/**
 * Log entry structure for consistent formatting
 */
interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  context: string
  message: string
  metadata?: Record<string, unknown>
  error?: string
}

/**
 * Logger class for structured logging with sensitive data protection
 */
export class Logger {
  private readonly sensitivePatterns = [
    /api_?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
  ]

  /**
   * Log an info message
   * @param context Context or module where the log originates
   * @param message Log message
   * @param metadata Optional metadata object
   */
  info(context: string, message: string, metadata?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      context,
      message,
    }

    if (metadata) {
      logEntry.metadata = this.sanitizeMetadata(metadata)
    }

    console.log(JSON.stringify(logEntry))
  }

  /**
   * Log a warning message
   * @param context Context or module where the log originates
   * @param message Log message
   * @param metadata Optional metadata object
   */
  warn(context: string, message: string, metadata?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      context,
      message,
    }

    if (metadata) {
      logEntry.metadata = this.sanitizeMetadata(metadata)
    }

    console.warn(JSON.stringify(logEntry))
  }

  /**
   * Log an error message
   * @param context Context or module where the log originates
   * @param message Log message
   * @param error Optional error object
   * @param metadata Optional metadata object
   */
  error(context: string, message: string, error?: Error, metadata?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      context,
      message,
    }

    if (error) {
      logEntry.error = error.message
    }

    if (metadata) {
      logEntry.metadata = this.sanitizeMetadata(metadata)
    }

    console.error(JSON.stringify(logEntry))
  }

  /**
   * Sanitize metadata by redacting sensitive information
   * @param metadata Metadata object to sanitize
   * @returns Sanitized metadata object
   */
  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(metadata)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value as Record<string, unknown>)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Check if a key contains sensitive information
   * @param key Object key to check
   * @returns True if the key contains sensitive information
   */
  private isSensitiveKey(key: string): boolean {
    return this.sensitivePatterns.some((pattern) => pattern.test(key))
  }
}
