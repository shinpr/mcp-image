import * as crypto from 'node:crypto'

interface StructuredLogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  context: string
  message: string
  metadata?: Record<string, unknown>
  traceId?: string
  sessionId?: string
}

const SENSITIVE_PATTERNS = [
  /GEMINI_API_KEY['"]?\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /OPENAI_API_KEY['"]?\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /api[_-]?key[^\s]*['"]?\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /password[^\s]*['"]?\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /bearer\s+([a-zA-Z0-9\-._~+/]+=*)/gi,
  /secret[^\s]*['"]?\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /token[^\s]*['"]?\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /(sk-(?:proj-)?[A-Za-z0-9_-]{16,})/g,
  /\b(?:prompt|(?:input[_-]?)?image(?:[_-]?(?:data|body|content|base64))?|(?:raw|request|response)[_-]?body)['"]?\s*[:=]\s*"([^"]*)"/gi,
  /\b(?:prompt|(?:input[_-]?)?image(?:[_-]?(?:data|body|content|base64))?|(?:raw|request|response)[_-]?body)['"]?\s*[:=]\s*'([^']*)'/gi,
]

const URL_PATTERNS = [/(https?:\/\/[^\s]+)/gi]

const FILTER_PATTERNS = [
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
]

/**
 * Sanitize a string by redacting sensitive information.
 * Exposed at module scope so non-Logger code paths (response builders,
 * error handlers) can sanitize before placing values into caller-visible
 * fields without instantiating a Logger.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeText(input: string): string {
  let sanitized = input

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, group1: string) =>
      match.replace(group1, '[REDACTED]')
    )
  }

  sanitized = sanitized.replace(/\bapi[_-]?key\b/gi, '[REDACTED]')
  sanitized = sanitized.replace(/\bgemini[_-]?api[_-]?key\b/gi, '[REDACTED]')
  sanitized = sanitized.replace(/\b[A-Za-z0-9]{20,}\b/g, '[REDACTED]')

  for (const pattern of URL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[URL_REDACTED]')
  }

  for (const pattern of FILTER_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[FILTERED]')
  }

  return sanitized
}

export class Logger {
  private readonly keyBasedSensitivePatterns = [
    /api[_-]?key/i,
    /gemini[_-]?api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
    /bearer/i,
    /^prompt(?:$|[_-]?(?:text|body|data)$)/i,
    /^(?:input[_-]?)?image(?:$|[_-]?(?:data|body|content|base64)$)/i,
    /^(?:raw|request|response)[_-]?body$/i,
  ]

  private currentTraceId?: string
  private readonly currentSessionId: string

  constructor() {
    this.currentSessionId = Logger.generateId()
  }

  debug(context: string, message: string, metadata?: Record<string, unknown>): void {
    if (process.env['NODE_ENV'] === 'production') {
      return
    }
    this.writeLog('debug', context, message, metadata)
  }

  info(context: string, message: string, metadata?: Record<string, unknown>): void {
    this.writeLog('info', context, message, metadata)
  }

  warn(context: string, message: string, metadata?: Record<string, unknown>): void {
    this.writeLog('warn', context, message, metadata)
  }

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

    const logOutput = JSON.stringify(logEntry)

    // For MCP servers, ALL logs must go to stderr
    // stdout is reserved for JSON-RPC messages only
    console.error(logOutput)
  }

  private sanitizeString(input: string): string {
    return sanitizeText(input)
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(metadata)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value)
      } else if (isPlainRecord(value)) {
        sanitized[key] = this.sanitizeMetadata(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  private isSensitiveKey(key: string): boolean {
    return this.keyBasedSensitivePatterns.some((pattern) => pattern.test(key))
  }

  private static generateId(): string {
    return crypto.randomUUID().substring(0, 8)
  }

  private getCurrentTraceId(): string {
    if (!this.currentTraceId) {
      this.currentTraceId = Logger.generateId()
    }
    return this.currentTraceId
  }

  private getCurrentSessionId(): string {
    return this.currentSessionId
  }
}
