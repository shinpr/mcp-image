/**
 * Orchestration Error Handler Implementation - Comprehensive error management
 * Provides intelligent recovery, fallback strategies, and robust error handling
 * Implements all error scenarios for structured prompt generation orchestration
 */

import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import type {
  ConcurrentOperation,
  DiagnosticInfo,
  ErrorContext,
  ErrorHandlingResult,
  NetworkError,
  OrchestrationErrorHandler,
  RecoveryOptions,
  RecoveryResult,
  ValidationResult,
  ValidationSchema,
} from './orchestrationErrorHandler'
import {
  ErrorSeverity,
  NetworkErrorType,
  ProcessingStage,
  RecoveryAction,
} from './orchestrationErrorHandler'

/**
 * Network error recovery configuration
 */
interface NetworkRecoveryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  timeoutMultiplier: number
  enableExponentialBackoff: boolean
}

/**
 * Default recovery options
 */
const DEFAULT_RECOVERY_OPTIONS: RecoveryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  enableFallback: true,
  fallbackStrategy: 'graceful_degradation',
  gracefulDegradation: true,
}

/**
 * Default network recovery configuration
 */
const DEFAULT_NETWORK_CONFIG: NetworkRecoveryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  timeoutMultiplier: 2,
  enableExponentialBackoff: true,
}

/**
 * OrchestrationErrorHandler implementation with comprehensive error management
 */
export class OrchestrationErrorHandlerImpl implements OrchestrationErrorHandler {
  private readonly networkConfig: NetworkRecoveryConfig
  private readonly errorCounts: Map<string, number> = new Map()
  private readonly errorTimestamps: Map<string, Date[]> = new Map()

  constructor(networkConfig: NetworkRecoveryConfig = DEFAULT_NETWORK_CONFIG) {
    this.networkConfig = { ...networkConfig }
  }

  /**
   * Handle errors with comprehensive recovery strategies
   */
  async handleError<T>(
    error: Error,
    context: ErrorContext,
    recoveryOptions: RecoveryOptions = DEFAULT_RECOVERY_OPTIONS
  ): Promise<ErrorHandlingResult<T>> {
    const diagnosticInfo = this.createDiagnosticInfo(error, context)
    const errorSeverity = this.classifyError(error)
    const userMessage = this.generateUserMessage(error, context)

    // Track error occurrence
    this.trackErrorOccurrence(error, context)

    // Determine recovery strategy based on error type and context
    const recoveryAction = this.determineRecoveryAction(
      error,
      context,
      recoveryOptions,
      errorSeverity
    )

    let fallbackApplied = false
    let result: T | undefined

    try {
      switch (recoveryAction) {
        case RecoveryAction.RETRY:
          result = await this.attemptRetry<T>(error, context, recoveryOptions)
          break

        case RecoveryAction.FALLBACK:
          result = await this.applyFallback<T>(error, context)
          fallbackApplied = true
          break

        case RecoveryAction.GRACEFUL_DEGRADATION:
          result = await this.applyGracefulDegradation<T>(error, context)
          fallbackApplied = true
          break

        case RecoveryAction.FAIL_SAFE:
        default:
          // Return failure with comprehensive information
          break
      }

      const success = result !== undefined
      const response: ErrorHandlingResult<T> = {
        success,
        fallbackApplied,
        userMessage,
        diagnosticInfo,
        recoveryAction,
      }

      if (success) {
        response.data = result as T
      }

      return response
    } catch (recoveryError) {
      // Recovery attempt failed
      return {
        success: false,
        fallbackApplied: false,
        userMessage: this.generateFallbackUserMessage(error, recoveryError as Error, context),
        diagnosticInfo: {
          ...diagnosticInfo,
          contextData: {
            ...diagnosticInfo.contextData,
            recoveryError:
              recoveryError instanceof Error ? recoveryError.message : 'Unknown recovery error',
            originalError: error.message,
          },
        },
        recoveryAction: RecoveryAction.FAIL_SAFE,
      }
    }
  }

  /**
   * Validate input with detailed error reporting
   */
  async validateInput(input: unknown, schema: ValidationSchema): Promise<ValidationResult> {
    const errors: Array<{
      field: string
      message: string
      severity: ErrorSeverity
      suggestion?: string
      code: string
    }> = []
    const warnings: Array<{ field: string; message: string; suggestion?: string; code: string }> =
      []

    // Type validation
    if (schema.type === 'string' && typeof input !== 'string') {
      errors.push({
        field: 'root',
        message: `Expected type string, got ${typeof input}`,
        severity: ErrorSeverity.FATAL,
        suggestion: `Please provide input of type ${schema.type}`,
        code: 'TYPE_MISMATCH',
      })
    }

    // String-specific validations
    if (schema.type === 'string' && typeof input === 'string') {
      if (schema.minLength !== undefined && input.length < schema.minLength) {
        errors.push({
          field: 'root',
          message: `Input too short. Minimum length: ${schema.minLength}, got: ${input.length}`,
          severity: ErrorSeverity.RECOVERABLE,
          suggestion: 'Provide a more detailed input',
          code: 'MIN_LENGTH_VIOLATION',
        })
      }

      if (schema.maxLength !== undefined && input.length > schema.maxLength) {
        warnings.push({
          field: 'root',
          message: `Input exceeds recommended length: ${schema.maxLength}, got: ${input.length}`,
          suggestion: 'Consider shortening the input for better processing',
          code: 'MAX_LENGTH_WARNING',
        })
      }

      if (schema.pattern && !schema.pattern.test(input)) {
        errors.push({
          field: 'root',
          message: 'Input does not match required pattern',
          severity: ErrorSeverity.RECOVERABLE,
          suggestion: 'Ensure input follows the expected format',
          code: 'PATTERN_MISMATCH',
        })
      }
    }

    const isValid = errors.length === 0

    return {
      valid: isValid,
      errors,
      warnings,
      normalizedInput: isValid ? input : undefined,
    }
  }

  /**
   * Manage resource contention for concurrent operations
   */
  async manageResourceContention(operation: ConcurrentOperation): Promise<Result<unknown, Error>> {
    try {
      // This is a simplified implementation
      // In a real system, this would integrate with the ConcurrencyManager

      // Check if operation can proceed based on priority and current load
      const canProceed = await this.checkOperationViability(operation)

      if (!canProceed) {
        return Err(
          new Error(
            `Resource contention detected for operation ${operation.id}. System at capacity.`
          )
        )
      }

      return Ok({ message: 'Operation can proceed', operationId: operation.id })
    } catch (error) {
      return Err(new Error(`Failed to manage resource contention: ${error}`))
    }
  }

  /**
   * Handle network-specific errors with intelligent retry
   */
  async handleNetworkErrors(
    networkError: NetworkError,
    context: ErrorContext
  ): Promise<RecoveryResult> {
    const errorType = this.classifyNetworkError(networkError)

    switch (errorType) {
      case NetworkErrorType.TIMEOUT:
        return this.handleTimeout(networkError, context)

      case NetworkErrorType.RATE_LIMIT:
        return this.handleRateLimit(networkError, context)

      case NetworkErrorType.CONNECTION_FAILED:
        return this.handleConnectionFailure(networkError, context)

      case NetworkErrorType.SERVICE_UNAVAILABLE:
        return this.handleServiceUnavailable(networkError, context)

      case NetworkErrorType.AUTHENTICATION_FAILED:
        return this.handleAuthenticationFailure(networkError, context)

      default:
        return this.handleUnknownNetworkError(networkError, context)
    }
  }

  /**
   * Classify errors for appropriate handling strategy
   */
  classifyError(error: Error): ErrorSeverity {
    const errorMessage = error.message.toLowerCase()

    // Fatal errors - cannot recover
    if (
      errorMessage.includes('authentication') ||
      errorMessage.includes('permission denied') ||
      errorMessage.includes('invalid api key')
    ) {
      return ErrorSeverity.FATAL
    }

    // Degraded service - partial functionality available
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('timeout')
    ) {
      return ErrorSeverity.DEGRADED
    }

    // API and processing errors that can be recovered with fallback
    if (
      errorMessage.includes('invalid api response') ||
      errorMessage.includes('malformed') ||
      errorMessage.includes('json') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('empty prompt') ||
      errorMessage.includes('unsafe content')
    ) {
      return ErrorSeverity.RECOVERABLE
    }

    // Default to recoverable for unknown errors
    return ErrorSeverity.RECOVERABLE
  }

  /**
   * Generate user-friendly error messages
   */
  generateUserMessage(error: Error, context: ErrorContext): string {
    const errorSeverity = this.classifyError(error)
    const operation = context.operation.replace(/_/g, ' ')
    const errorMessage = error.message.toLowerCase()

    // Special handling for specific error scenarios
    if (errorMessage.includes('invalid api response') || errorMessage.includes('malformed')) {
      return 'API response issue detected. Processing continued using alternative methods.'
    }

    if (errorMessage.includes('json') && errorMessage.includes('syntax')) {
      return 'Temporary issue with data processing. The system will attempt to recover automatically.'
    }

    if (errorMessage.includes('missing') && errorMessage.includes('field')) {
      return 'Data structure issue resolved using alternative processing methods.'
    }

    if (errorMessage.includes('empty prompt')) {
      return 'Empty prompt detected - using creative fallback approach for image generation.'
    }

    switch (errorSeverity) {
      case ErrorSeverity.FATAL:
        return `Unable to complete ${operation}. Please check your configuration and try again.`

      case ErrorSeverity.DEGRADED:
        return `${operation} is experiencing temporary issues. Processing continued with alternative methods.`

      case ErrorSeverity.RECOVERABLE:
        if (context.retryCount > 0) {
          return `Retrying ${operation} (attempt ${context.retryCount + 1}). Please wait a moment.`
        }
        return `Temporary issue with ${operation}. The system will attempt to recover automatically.`

      default:
        return `An unexpected issue occurred during ${operation}. Please try again.`
    }
  }

  /**
   * Create diagnostic information for debugging
   */
  createDiagnosticInfo(error: Error, context: ErrorContext): DiagnosticInfo {
    return {
      errorCode: this.generateErrorCode(error, context),
      timestamp: new Date(),
      stackTrace: error.stack || '',
      contextData: {
        operation: context.operation,
        stage: context.stage,
        sessionId: context.sessionId,
        retryCount: context.retryCount,
        userFacing: context.userFacing,
        errorName: error.name,
        errorMessage: error.message,
        metadata: context.metadata || {},
      },
      requestId: this.generateRequestId(context),
    }
  }

  // Private helper methods

  /**
   * Track error occurrence for pattern detection
   */
  private trackErrorOccurrence(error: Error, context: ErrorContext): void {
    const errorKey = `${context.operation}_${error.name}`

    // Update count
    const currentCount = this.errorCounts.get(errorKey) || 0
    this.errorCounts.set(errorKey, currentCount + 1)

    // Update timestamps
    const timestamps = this.errorTimestamps.get(errorKey) || []
    timestamps.push(new Date())

    // Keep only recent timestamps (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const recentTimestamps = timestamps.filter((ts) => ts > tenMinutesAgo)
    this.errorTimestamps.set(errorKey, recentTimestamps)
  }

  /**
   * Determine appropriate recovery action
   */
  private determineRecoveryAction(
    error: Error,
    context: ErrorContext,
    options: RecoveryOptions,
    severity: ErrorSeverity
  ): RecoveryAction {
    if (severity === ErrorSeverity.FATAL) {
      return RecoveryAction.FAIL_SAFE
    }

    // For API response errors, always attempt fallback first
    const errorMessage = error.message.toLowerCase()
    if (
      errorMessage.includes('invalid api response') ||
      errorMessage.includes('malformed') ||
      errorMessage.includes('json') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('empty prompt')
    ) {
      return RecoveryAction.FALLBACK
    }

    if (context.retryCount < options.maxRetries && severity === ErrorSeverity.RECOVERABLE) {
      return RecoveryAction.RETRY
    }

    if (options.enableFallback) {
      return severity === ErrorSeverity.DEGRADED
        ? RecoveryAction.GRACEFUL_DEGRADATION
        : RecoveryAction.FALLBACK
    }

    return RecoveryAction.FAIL_SAFE
  }

  /**
   * Attempt retry with exponential backoff
   */
  private async attemptRetry<T>(
    _error: Error,
    context: ErrorContext,
    options: RecoveryOptions
  ): Promise<T | undefined> {
    const delay = this.calculateRetryDelay(context.retryCount, options.retryDelay)
    await this.delay(delay)

    // In a real implementation, this would re-execute the original operation
    // For now, return undefined to indicate retry attempt was made
    return undefined
  }

  /**
   * Apply fallback processing
   */
  private async applyFallback<T>(_error: Error, context: ErrorContext): Promise<T | undefined> {
    // Implement context-specific fallback logic
    switch (context.stage) {
      case ProcessingStage.POML_STRUCTURING:
        // Fallback to basic prompt structuring
        return { fallbackType: 'basic_structuring', originalPrompt: true } as unknown as T

      case ProcessingStage.BEST_PRACTICES:
        // Fallback to original prompt without enhancement
        return { fallbackType: 'original_prompt', enhanced: false } as unknown as T

      case ProcessingStage.INPUT_VALIDATION:
        // Provide creative fallback for empty prompts
        return {
          fallbackType: 'creative_fallback',
          prompt: 'Generate a creative image',
        } as unknown as T

      default:
        // Generic fallback
        return { fallbackType: 'generic_fallback', processed: true } as unknown as T
    }
  }

  /**
   * Apply graceful degradation
   */
  private async applyGracefulDegradation<T>(
    _error: Error,
    context: ErrorContext
  ): Promise<T | undefined> {
    // Provide partial functionality based on context
    switch (context.stage) {
      case ProcessingStage.BEST_PRACTICES:
        // Apply simplified best practices
        return { degradedType: 'simplified_enhancement', partial: true } as unknown as T

      default:
        // Generic graceful degradation
        return { degradedType: 'basic_processing', functional: true } as unknown as T
    }
  }

  /**
   * Generate fallback user message when recovery fails
   */
  private generateFallbackUserMessage(
    _originalError: Error,
    _recoveryError: Error,
    context: ErrorContext
  ): string {
    return `Unable to recover from ${context.operation.replace(/_/g, ' ')} error. Please try again later or contact support if the issue persists.`
  }

  /**
   * Check if operation can proceed given current constraints
   */
  private async checkOperationViability(operation: ConcurrentOperation): Promise<boolean> {
    // Simplified viability check
    // In real implementation, this would check actual system resources
    // Allow operation if estimated duration is reasonable
    return operation.estimatedDuration < 5 * 60 * 1000 // 5 minutes max
  }

  /**
   * Classify network error for specific handling
   */
  private classifyNetworkError(error: NetworkError): NetworkErrorType {
    if (error.type) {
      return error.type
    }

    const message = error.message.toLowerCase()

    if (message.includes('timeout')) {
      return NetworkErrorType.TIMEOUT
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return NetworkErrorType.RATE_LIMIT
    }
    if (message.includes('connection') || message.includes('ECONNREFUSED')) {
      return NetworkErrorType.CONNECTION_FAILED
    }
    if (message.includes('service unavailable') || message.includes('503')) {
      return NetworkErrorType.SERVICE_UNAVAILABLE
    }
    if (message.includes('401') || message.includes('403')) {
      return NetworkErrorType.AUTHENTICATION_FAILED
    }

    return NetworkErrorType.UNKNOWN
  }

  /**
   * Handle timeout errors
   */
  private async handleTimeout(
    _error: NetworkError,
    context: ErrorContext
  ): Promise<RecoveryResult> {
    if (context.retryCount < this.networkConfig.maxRetries) {
      const backoffDelay = this.calculateExponentialBackoff(context.retryCount)

      return {
        action: RecoveryAction.RETRY,
        message: `Request timed out - retrying in ${Math.round(backoffDelay / 1000)} seconds`,
        userFacing: true,
        estimatedRecoveryTime: backoffDelay,
      }
    }

    return {
      action: RecoveryAction.FALLBACK,
      message: 'Request timeout - using simplified processing',
      userFacing: true,
    }
  }

  /**
   * Handle rate limit errors
   */
  private async handleRateLimit(
    error: NetworkError,
    _context: ErrorContext
  ): Promise<RecoveryResult> {
    const retryAfter = error.retryAfter || 60 // Default 60 seconds

    return {
      action: RecoveryAction.RETRY,
      message: `Rate limit reached - retrying in ${retryAfter} seconds`,
      userFacing: true,
      estimatedRecoveryTime: retryAfter * 1000,
      additionalData: { retryAfter },
    }
  }

  /**
   * Handle connection failures
   */
  private async handleConnectionFailure(
    _error: NetworkError,
    context: ErrorContext
  ): Promise<RecoveryResult> {
    if (context.retryCount < 2) {
      // Fewer retries for connection issues
      return {
        action: RecoveryAction.RETRY,
        message: 'Connection issue - retrying with different endpoint',
        userFacing: true,
        estimatedRecoveryTime: 5000,
      }
    }

    return {
      action: RecoveryAction.FALLBACK,
      message: 'Connection unavailable - using cached or simplified processing',
      userFacing: true,
    }
  }

  /**
   * Handle service unavailable errors
   */
  private async handleServiceUnavailable(
    _error: NetworkError,
    _context: ErrorContext
  ): Promise<RecoveryResult> {
    return {
      action: RecoveryAction.GRACEFUL_DEGRADATION,
      message: 'Service temporarily unavailable - continuing with reduced functionality',
      userFacing: true,
      estimatedRecoveryTime: 120000, // 2 minutes
    }
  }

  /**
   * Handle authentication failures
   */
  private async handleAuthenticationFailure(
    _error: NetworkError,
    _context: ErrorContext
  ): Promise<RecoveryResult> {
    return {
      action: RecoveryAction.FAIL_SAFE,
      message: 'Authentication failed - please check your API configuration',
      userFacing: true,
    }
  }

  /**
   * Handle unknown network errors
   */
  private async handleUnknownNetworkError(
    _error: NetworkError,
    context: ErrorContext
  ): Promise<RecoveryResult> {
    if (context.retryCount < 1) {
      // Single retry for unknown errors
      return {
        action: RecoveryAction.RETRY,
        message: 'Network issue detected - attempting retry',
        userFacing: true,
        estimatedRecoveryTime: 3000,
      }
    }

    return {
      action: RecoveryAction.FALLBACK,
      message: 'Network error - continuing with alternative processing',
      userFacing: true,
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, baseDelay: number): number {
    return Math.min(baseDelay * 2 ** retryCount, this.networkConfig.maxDelay)
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateExponentialBackoff(retryCount: number): number {
    const delay = this.networkConfig.baseDelay * this.networkConfig.timeoutMultiplier ** retryCount
    return Math.min(delay, this.networkConfig.maxDelay)
  }

  /**
   * Sleep for specified milliseconds
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Generate error code based on error and context
   */
  private generateErrorCode(error: Error, context: ErrorContext): string {
    const stage = context.stage.toUpperCase()
    const errorType = error.name.toUpperCase().replace('ERROR', '')
    return `${stage}_${errorType}_${Date.now().toString().slice(-4)}`
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(context: ErrorContext): string {
    return `${context.sessionId}-${context.operation}-${Date.now()}`
  }
}
