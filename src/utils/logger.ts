/**
 * Logger utility for structured logging with sensitive data filtering
 * Provides consistent logging format across the application
 */

import * as crypto from 'node:crypto'

/**
 * Log entry structure for consistent formatting
 */
interface StructuredLogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  context: string
  message: string
  metadata?: Record<string, unknown>
  traceId?: string
  sessionId?: string
}

/**
 * Logger class for structured logging with sensitive data protection
 */
export class Logger {
  private readonly sensitivePatterns = [
    /GEMINI_API_KEY=([^\s]+)/gi,
    /api[_-]?key[^\s]*[:=]\s*([^\s]+)/gi,
    /password[^\s]*[:=]\s*([^\s]+)/gi,
    /bearer\s+([a-zA-Z0-9\-._~+/]+=*)/gi,
    /secret[^\s]*[:=]\s*([^\s]+)/gi,
    /token[^\s]*[:=]\s*([^\s]+)/gi,
  ]

  private readonly urlPatterns = [
    /(https?:\/\/[^\s]+)/gi, // URLs - separate to handle differently
  ]

  private readonly filterPatterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, // Emails
  ]

  private readonly keyBasedSensitivePatterns = [
    /api[_-]?key/i,
    /gemini[_-]?api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
    /bearer/i,
  ]

  private currentTraceId?: string
  private currentSessionId?: string

  constructor() {
    // Initialize session ID once per logger instance
    this.currentSessionId = this.generateId()
  }

  /**
   * Log a debug message (only in development mode)
   * @param context Context or module where the log originates
   * @param message Log message
   * @param metadata Optional metadata object
   */
  debug(context: string, message: string, metadata?: Record<string, unknown>): void {
    if (process.env['NODE_ENV'] === 'production') return
    this.writeLog('debug', context, message, metadata)
  }

  /**
   * Log an info message
   * @param context Context or module where the log originates
   * @param message Log message
   * @param metadata Optional metadata object
   */
  info(context: string, message: string, metadata?: Record<string, unknown>): void {
    this.writeLog('info', context, message, metadata)
  }

  /**
   * Log a warning message
   * @param context Context or module where the log originates
   * @param message Log message
   * @param metadata Optional metadata object
   */
  warn(context: string, message: string, metadata?: Record<string, unknown>): void {
    this.writeLog('warn', context, message, metadata)
  }

  /**
   * Log an error message
   * @param context Context or module where the log originates
   * @param message Log message
   * @param error Optional error object
   * @param metadata Optional metadata object
   */
  error(context: string, message: string, error?: Error, metadata?: Record<string, unknown>): void {
    const enhancedMetadata = {
      ...metadata,
      ...(error && {
        errorName: error.name,
        errorMessage: this.sanitizeString(error.message),
        errorStack: process.env['NODE_ENV'] !== 'production' ? error.stack : undefined,
      }),
    }
    this.writeLog('error', context, message, enhancedMetadata)
  }

  /**
   * Core log writing method with structured format
   */
  private writeLog(
    level: StructuredLogEntry['level'],
    context: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: this.sanitizeString(message),
      ...(metadata && { metadata: this.sanitizeMetadata(metadata) }),
      traceId: this.getCurrentTraceId(),
      sessionId: this.getCurrentSessionId(),
    }

    // JSON format structured log output
    const logOutput = JSON.stringify(logEntry)

    // For MCP servers, ALL logs must go to stderr
    // stdout is reserved for JSON-RPC messages only
    console.error(logOutput)
  }

  /**
   * Sanitize string content by redacting sensitive information
   * @param input String to sanitize
   * @returns Sanitized string
   */
  private sanitizeString(input: string): string {
    let sanitized = input

    // Redact sensitive data patterns (API keys, passwords, etc.)
    for (const pattern of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, (match, group1) => match.replace(group1, '[REDACTED]'))
    }

    // Additional broad filter for API key-like strings in text
    // Remove any reference to API key terms even in plain text
    sanitized = sanitized.replace(/\bapi[_-]?key\b/gi, '[REDACTED]')
    sanitized = sanitized.replace(/\bgemini[_-]?api[_-]?key\b/gi, '[REDACTED]')

    // Remove long alphanumeric strings that might be API keys or secrets
    sanitized = sanitized.replace(/\b[A-Za-z0-9]{20,}\b/g, '[REDACTED]')

    // Redact URLs with specific label
    for (const pattern of this.urlPatterns) {
      sanitized = sanitized.replace(pattern, '[URL_REDACTED]')
    }

    // Filter personal information patterns
    for (const pattern of this.filterPatterns) {
      sanitized = sanitized.replace(pattern, '[FILTERED]')
    }

    return sanitized
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
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value)
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
    return this.keyBasedSensitivePatterns.some((pattern) => pattern.test(key))
  }

  /**
   * Generate unique ID for trace/session tracking
   */
  private generateId(): string {
    return crypto.randomUUID().substring(0, 8)
  }

  /**
   * Get or generate current trace ID
   */
  private getCurrentTraceId(): string {
    if (!this.currentTraceId) {
      this.currentTraceId = this.generateId()
    }
    return this.currentTraceId
  }

  /**
   * Get current session ID
   */
  private getCurrentSessionId(): string {
    return this.currentSessionId!
  }
}
