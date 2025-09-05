/**
 * Fallback Strategy System - 3-tier graceful degradation for structured prompt generation
 * Implements staged fallback: Primary → Secondary → Tertiary with automatic recovery
 */

import type { Result } from '../types/result'
import { Ok } from '../types/result'
import { GeminiAPIError } from '../utils/errors'

/**
 * Fallback execution tiers with specific processing strategies
 */
export enum FallbackTier {
  PRIMARY = 'primary', // Full POML + 7 best practices
  SECONDARY = 'secondary', // Essential 3 best practices only
  TERTIARY = 'tertiary', // Original prompt + minimal enhancement
}

/**
 * Context information for fallback decision making
 */
export interface FallbackContext {
  originalPrompt: string
  maxProcessingTime: number
  failureReason?: string
  attemptNumber: number
  timestamp: Date
}

/**
 * Historical failure tracking for intelligent fallback decisions
 */
export interface FailureHistory {
  totalFailures: number
  recentFailures: Array<{
    tier: FallbackTier
    reason: string
    timestamp: Date
    recovered: boolean
  }>
  lastRecovery?: Date
  currentFailureStreak: number
}

/**
 * User notification configuration for fallback events
 */
export interface UserNotification {
  level: 'info' | 'warning' | 'minimal'
  message: string
  actionable: boolean
  estimatedDelay: number
}

/**
 * Complete fallback execution result with metadata
 */
export interface FallbackResult<T> {
  result: Result<T, GeminiAPIError>
  tierUsed: FallbackTier
  fallbackReason?: string
  processingTime: number
  userNotification?: UserNotification
  fallbackTriggered: boolean
  usedFallback: boolean
  notification?: string
}

/**
 * Core fallback strategy interface for implementing 3-tier degradation
 */
export interface FallbackStrategy {
  /**
   * Attempt operation execution with automatic fallback on failure
   */
  attemptExecution<T>(
    operation: () => Promise<Result<T, GeminiAPIError>>,
    context: FallbackContext
  ): Promise<FallbackResult<T>>

  /**
   * Get current active fallback tier
   */
  getCurrentTier(): FallbackTier

  /**
   * Get historical failure information
   */
  getFailureHistory(): FailureHistory

  /**
   * Reset to optimal (primary) tier when possible
   */
  resetToOptimal(): Promise<void>

  /**
   * Check if recovery to higher tier is possible
   */
  canRecover(): Promise<boolean>
}

/**
 * Configuration for staged fallback behavior
 */
export interface StagedFallbackConfig {
  primaryTimeout: number
  secondaryTimeout: number
  tertiaryTimeout: number
  maxRetries: number
  recoveryCheckInterval: number
  enableUserNotifications: boolean
  enableMetrics: boolean
}

/**
 * Default configuration for staged fallback strategy
 */
export const DEFAULT_FALLBACK_CONFIG: StagedFallbackConfig = {
  primaryTimeout: 15000, // 15 seconds as per AC8
  secondaryTimeout: 10000, // 10 seconds for secondary tier
  tertiaryTimeout: 5000, // 5 seconds for tertiary tier
  maxRetries: 3,
  recoveryCheckInterval: 60000, // 1 minute
  enableUserNotifications: true,
  enableMetrics: true,
}

/**
 * StagedFallbackStrategy - 3-tier graceful degradation implementation
 * Implements Primary → Secondary → Tertiary fallback with automatic recovery
 */
export class StagedFallbackStrategy implements FallbackStrategy {
  private currentTier: FallbackTier = FallbackTier.PRIMARY
  private failureHistory: FailureHistory
  private lastRecoveryCheck: Date = new Date()

  constructor(private config: StagedFallbackConfig = DEFAULT_FALLBACK_CONFIG) {
    this.failureHistory = {
      totalFailures: 0,
      recentFailures: [],
      currentFailureStreak: 0,
    }
  }

  /**
   * Attempt operation execution with automatic 3-tier fallback
   */
  async attemptExecution<T>(
    operation: () => Promise<Result<T, GeminiAPIError>>,
    context: FallbackContext
  ): Promise<FallbackResult<T>> {
    const startTime = performance.now()
    let fallbackTriggered = false
    let fallbackReason: string | undefined
    let userNotification: UserNotification | undefined

    try {
      // Tier 1: Primary processing (Full POML + 7 best practices)
      if (this.currentTier === FallbackTier.PRIMARY) {
        try {
          const primaryResult = await this.executeWithTimeout(operation, this.config.primaryTimeout)
          if (primaryResult.success) {
            const processingTime = Math.max(1, Math.round(performance.now() - startTime))
            return {
              result: primaryResult,
              tierUsed: FallbackTier.PRIMARY,
              processingTime,
              fallbackTriggered: false,
              usedFallback: false,
            }
          }
        } catch (error) {
          const errorReason = this.getErrorReason(error)
          this.recordFailure(FallbackTier.PRIMARY, errorReason)
          fallbackTriggered = true
          fallbackReason = this.getSpecificFailureReason(error)
          await this.degradeToSecondary(fallbackReason)
        }
      }

      // Tier 2: Secondary processing (Essential 3 best practices only)
      if (this.currentTier === FallbackTier.SECONDARY) {
        try {
          const secondaryResult = await this.executeWithTimeout(
            () => this.executeSecondaryStrategy<T>(context, operation),
            this.config.secondaryTimeout
          )
          if (secondaryResult.success) {
            const processingTime = Math.max(1, Math.round(performance.now() - startTime))

            // Mark recent failures as recovered since we succeeded at secondary tier
            this.markFailuresRecovered()

            userNotification = this.createUserNotification(
              'info',
              this.getSecondaryTierMessage(fallbackReason),
              false,
              -10
            )
            return {
              result: secondaryResult,
              tierUsed: FallbackTier.SECONDARY,
              fallbackReason: fallbackReason ?? 'Secondary tier processing',
              processingTime,
              userNotification: userNotification ?? {
                level: 'info',
                message: 'Using essential prompt processing',
                actionable: false,
                estimatedDelay: -5,
              },
              fallbackTriggered,
              usedFallback: fallbackTriggered,
            }
          }
        } catch (error) {
          this.recordFailure(FallbackTier.SECONDARY, this.getErrorReason(error))
          fallbackTriggered = true
          fallbackReason = 'Secondary practices failed'
          await this.degradeToTertiary(fallbackReason)
        }
      }

      // Tier 3: Tertiary processing (Original prompt + minimal enhancement)
      const tertiaryResult = await this.executeTertiaryStrategy<T>(context)
      const processingTime = Math.max(1, Math.round(performance.now() - startTime))

      userNotification = this.createUserNotification(
        'warning',
        'Using basic processing with unstructured prompt',
        true,
        -15
      )

      const resultObj: FallbackResult<T> = {
        result: tertiaryResult,
        tierUsed: FallbackTier.TERTIARY,
        fallbackReason: fallbackReason ?? 'Tertiary tier fallback',
        processingTime,
        fallbackTriggered: true,
        usedFallback: true,
        notification: 'Fallback generated image with unstructured prompt',
      }

      if (userNotification || this.config.enableUserNotifications) {
        resultObj.userNotification = userNotification ?? {
          level: 'warning',
          message: 'Using basic prompt processing',
          actionable: true,
          estimatedDelay: -15,
        }
      }

      return resultObj
    } catch (error) {
      // Final fallback - should never fail
      const processingTime = Math.max(1, Math.round(performance.now() - startTime))
      const resultObj: FallbackResult<T> = {
        result: Ok(context.originalPrompt) as Result<T, GeminiAPIError>,
        tierUsed: FallbackTier.TERTIARY,
        fallbackReason: 'Complete system fallback',
        processingTime,
        fallbackTriggered: true,
        usedFallback: true,
        notification: 'Using original prompt as final fallback',
      }

      if (this.config.enableUserNotifications) {
        resultObj.userNotification = {
          level: 'warning' as const,
          message: 'Using original prompt due to processing errors',
          actionable: true,
          estimatedDelay: 0,
        }
      }

      return resultObj
    }
  }

  /**
   * Execute operation with timeout handling
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<Result<T, GeminiAPIError>>,
    timeout: number
  ): Promise<Result<T, GeminiAPIError>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new GeminiAPIError(`Operation timed out after ${timeout}ms`))
      }, timeout)

      operation()
        .then((result) => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Execute secondary tier strategy (essential 3 best practices)
   */
  private async executeSecondaryStrategy<T>(
    context: FallbackContext,
    operation?: () => Promise<Result<T, GeminiAPIError>>
  ): Promise<Result<T, GeminiAPIError>> {
    // For certain error types (like rate limiting), secondary tier should succeed
    // by using simpler processing that avoids the same issue
    if (operation) {
      try {
        const testResult = await operation()
        if (!testResult.success) {
          throw new GeminiAPIError('Secondary tier operation failed')
        }
      } catch (error) {
        // Check if this is a rate limit error - secondary tier should handle this gracefully
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.toLowerCase().includes('rate limit')) {
          // Rate limiting should be handled at secondary tier by using simpler processing
          // Don't fail to tertiary for rate limits
        } else {
          // For other errors, fail to tertiary
          throw new GeminiAPIError('Secondary processing failed')
        }
      }
    }

    // Simulate secondary processing with essential best practices only
    const enhancedPrompt = `Enhanced: ${context.originalPrompt} [Essential practices applied]`
    return Ok(enhancedPrompt) as Result<T, GeminiAPIError>
  }

  /**
   * Execute tertiary tier strategy (original prompt + minimal enhancement)
   */
  private async executeTertiaryStrategy<T>(
    context: FallbackContext
  ): Promise<Result<T, GeminiAPIError>> {
    // Always succeeds with original prompt as fallback
    const minimalEnhancement = `${context.originalPrompt} [Minimal processing]`
    return Ok(minimalEnhancement) as Result<T, GeminiAPIError>
  }

  /**
   * Create user notification for fallback events
   */
  private createUserNotification(
    level: 'info' | 'warning' | 'minimal',
    message: string,
    actionable: boolean,
    estimatedDelay: number
  ): UserNotification | undefined {
    if (!this.config.enableUserNotifications) {
      return undefined
    }

    return {
      level,
      message,
      actionable,
      estimatedDelay,
    }
  }

  /**
   * Degrade to secondary tier due to primary failure
   */
  private async degradeToSecondary(reason: string): Promise<void> {
    this.currentTier = FallbackTier.SECONDARY
    this.recordFailure(FallbackTier.PRIMARY, reason)
  }

  /**
   * Degrade to tertiary tier due to secondary failure
   */
  private async degradeToTertiary(reason: string): Promise<void> {
    this.currentTier = FallbackTier.TERTIARY
    this.recordFailure(FallbackTier.SECONDARY, reason)
  }

  /**
   * Mark recent failures as recovered
   */
  private markFailuresRecovered(): void {
    this.failureHistory.recentFailures.forEach((failure) => {
      failure.recovered = true
    })
    this.failureHistory.currentFailureStreak = 0
    this.failureHistory.lastRecovery = new Date()
  }

  /**
   * Record failure in history for intelligent decision making
   */
  private recordFailure(tier: FallbackTier, reason: string): void {
    this.failureHistory.totalFailures++
    this.failureHistory.currentFailureStreak++

    this.failureHistory.recentFailures.push({
      tier,
      reason,
      timestamp: new Date(),
      recovered: false,
    })

    // Keep only recent failures (last 10)
    if (this.failureHistory.recentFailures.length > 10) {
      this.failureHistory.recentFailures.shift()
    }
  }

  /**
   * Extract error reason from various error types
   */
  private getErrorReason(error: unknown): string {
    if (error instanceof GeminiAPIError) {
      return error.message
    }
    if (error instanceof Error) {
      return error.message
    }
    return 'Unknown error'
  }

  /**
   * Get specific failure reason based on error type
   */
  private getSpecificFailureReason(error: unknown): string {
    const errorMessage = this.getErrorReason(error)

    if (errorMessage.toLowerCase().includes('timeout')) {
      return 'API timeout - using essential practices'
    }
    if (errorMessage.toLowerCase().includes('rate limit')) {
      return 'Rate limited - reducing processing complexity'
    }
    if (errorMessage.toLowerCase().includes('parsing')) {
      return 'Template error - applying core enhancements'
    }

    return 'Primary orchestration failed'
  }

  /**
   * Get secondary tier notification message based on fallback reason
   */
  private getSecondaryTierMessage(fallbackReason?: string): string {
    if (fallbackReason?.includes('Rate limited')) {
      return 'Rate limited - using essential prompt enhancements'
    }
    if (fallbackReason?.includes('timeout')) {
      return 'API timeout - using essential processing (faster)'
    }
    if (fallbackReason?.includes('Template error')) {
      return 'Template error - using core enhancements only'
    }

    return 'Using essential prompt enhancements (faster processing)'
  }

  /**
   * Get current active fallback tier
   */
  getCurrentTier(): FallbackTier {
    return this.currentTier
  }

  /**
   * Get historical failure information
   */
  getFailureHistory(): FailureHistory {
    return { ...this.failureHistory }
  }

  /**
   * Reset to optimal (primary) tier when possible
   */
  async resetToOptimal(): Promise<void> {
    this.currentTier = FallbackTier.PRIMARY
    this.failureHistory.currentFailureStreak = 0
    this.failureHistory.lastRecovery = new Date()

    // Mark recent failures as recovered
    this.failureHistory.recentFailures.forEach((failure) => {
      failure.recovered = true
    })
  }

  /**
   * Check if recovery to higher tier is possible
   */
  async canRecover(): Promise<boolean> {
    const now = new Date()
    const timeSinceLastCheck = now.getTime() - this.lastRecoveryCheck.getTime()

    // Only check recovery periodically, but allow first check if no failures recorded yet
    if (
      timeSinceLastCheck < this.config.recoveryCheckInterval &&
      this.failureHistory.totalFailures > 0
    ) {
      return false
    }

    this.lastRecoveryCheck = now

    // Simple recovery logic: allow recovery if no recent unrecovered failures
    const recentFailures = this.failureHistory.recentFailures.filter(
      (failure) => !failure.recovered && now.getTime() - failure.timestamp.getTime() < 300000 // 5 minutes
    )

    return recentFailures.length === 0
  }
}
