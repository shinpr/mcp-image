/**
 * Orchestration Error Handler - Comprehensive error management system
 * Handles all error scenarios for structured prompt generation orchestration
 * Provides intelligent recovery, fallback strategies, and user-friendly error communication
 */

import type { Result } from '../../types/result'

/**
 * Error severity classification for appropriate response handling
 */
export enum ErrorSeverity {
  RECOVERABLE = 'recoverable', // Can retry or apply fallback
  DEGRADED = 'degraded', // Partial functionality available
  FATAL = 'fatal', // Operation cannot proceed
}

/**
 * Processing stages for error context tracking
 */
export enum ProcessingStage {
  INPUT_VALIDATION = 'input_validation',
  POML_STRUCTURING = 'poml_structuring',
  BEST_PRACTICES = 'best_practices',
  OUTPUT_FORMATTING = 'output_formatting',
  FINALIZATION = 'finalization',
}

/**
 * Recovery actions that can be taken when errors occur
 */
export enum RecoveryAction {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  FAIL_SAFE = 'fail_safe',
}

/**
 * Error context information for comprehensive error handling
 */
export interface ErrorContext {
  operation: string
  stage: ProcessingStage
  sessionId: string
  retryCount: number
  userFacing: boolean
  metadata?: Record<string, unknown>
}

/**
 * Recovery options for error handling strategies
 */
export interface RecoveryOptions {
  maxRetries: number
  retryDelay: number
  enableFallback: boolean
  fallbackStrategy: string
  gracefulDegradation: boolean
}

/**
 * Diagnostic information for error analysis
 */
export interface DiagnosticInfo {
  errorCode: string
  timestamp: Date
  stackTrace?: string
  contextData: Record<string, unknown>
  userAgent?: string
  requestId?: string
}

/**
 * Complete error handling result
 */
export interface ErrorHandlingResult<T> {
  success: boolean
  data?: T
  fallbackApplied: boolean
  userMessage: string
  diagnosticInfo: DiagnosticInfo
  recoveryAction: RecoveryAction
}

/**
 * Network error classification for specific handling
 */
export enum NetworkErrorType {
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  CONNECTION_FAILED = 'connection_failed',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  AUTHENTICATION_FAILED = 'authentication_failed',
  UNKNOWN = 'unknown',
}

/**
 * Network error information
 */
export interface NetworkError extends Error {
  type: NetworkErrorType
  statusCode?: number
  retryAfter?: number
  originalError?: Error
}

/**
 * Recovery result for error handling operations
 */
export interface RecoveryResult {
  action: RecoveryAction
  message: string
  userFacing: boolean
  estimatedRecoveryTime?: number
  additionalData?: Record<string, unknown>
}

/**
 * Validation result for input processing
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  normalizedInput?: unknown
}

/**
 * Individual validation error
 */
export interface ValidationError {
  field: string
  message: string
  severity: ErrorSeverity
  suggestion?: string
  code: string
}

/**
 * Individual validation warning
 */
export interface ValidationWarning {
  field: string
  message: string
  suggestion?: string
  code: string
}

/**
 * Validation schema for input validation
 */
export interface ValidationSchema {
  type: string
  properties?: Record<string, ValidationPropertySchema>
  required?: string[]
  minLength?: number
  maxLength?: number
  pattern?: RegExp
}

/**
 * Property-specific validation schema
 */
export interface ValidationPropertySchema {
  type: string
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  validator?: (value: unknown) => boolean
}

/**
 * Concurrent operation information
 */
export interface ConcurrentOperation {
  id: string
  type: string
  priority: OperationPriority
  startTime: Date
  estimatedDuration: number
  resourceRequirements: ResourceRequirements
}

/**
 * Operation priority levels
 */
export enum OperationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Resource requirements for operations
 */
export interface ResourceRequirements {
  memory: number
  cpu: number
  networkBandwidth: number
  concurrentConnections: number
}

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
  maxMemory: number
  maxCpu: number
  maxNetworkBandwidth: number
  maxConcurrentOperations: number
  maxConcurrentConnections: number
}

/**
 * Main orchestration error handler interface
 */
export interface OrchestrationErrorHandler {
  /**
   * Handle errors with comprehensive recovery strategies
   */
  handleError<T>(
    error: Error,
    context: ErrorContext,
    recoveryOptions?: RecoveryOptions
  ): Promise<ErrorHandlingResult<T>>

  /**
   * Validate input with detailed error reporting
   */
  validateInput(input: unknown, schema: ValidationSchema): Promise<ValidationResult>

  /**
   * Manage resource contention for concurrent operations
   */
  manageResourceContention(operation: ConcurrentOperation): Promise<Result<unknown, Error>>

  /**
   * Handle network-specific errors with intelligent retry
   */
  handleNetworkErrors(networkError: NetworkError, context: ErrorContext): Promise<RecoveryResult>

  /**
   * Classify errors for appropriate handling strategy
   */
  classifyError(error: Error): ErrorSeverity

  /**
   * Generate user-friendly error messages
   */
  generateUserMessage(error: Error, context: ErrorContext): string

  /**
   * Create diagnostic information for debugging
   */
  createDiagnosticInfo(error: Error, context: ErrorContext): DiagnosticInfo
}
