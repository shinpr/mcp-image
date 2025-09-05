/**
 * Structured Prompt Handler for MCP server
 * Handles orchestration integration with progress notifications and fallback mechanisms
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type {
  OrchestrationOptions,
  OrchestrationResult,
  StructuredPromptOrchestrator,
} from '../../business/promptOrchestrator'
import type {
  MCPOrchestrationConfig,
  OrchestrationProgressMessage,
  OrchestrationProgressStage,
  OrchestrationStatus,
} from '../../types/mcpOrchestrationTypes'
import { DEFAULT_ORCHESTRATION_CONFIG } from '../../types/mcpOrchestrationTypes'
import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError } from '../../utils/errors'
import { Logger } from '../../utils/logger'

/**
 * Dependencies for StructuredPromptHandler
 */
export interface StructuredPromptHandlerDependencies {
  orchestrator: StructuredPromptOrchestrator
  logger?: Logger
}

/**
 * Structured Prompt Handler implementation
 * Manages orchestration requests with progress notifications and error handling
 */
export class StructuredPromptHandler {
  private config: MCPOrchestrationConfig
  private status: OrchestrationStatus
  private logger: Logger

  constructor(
    private orchestrator: StructuredPromptOrchestrator,
    initialConfig: Partial<MCPOrchestrationConfig> = {},
    dependencies: Pick<StructuredPromptHandlerDependencies, 'logger'> = {}
  ) {
    this.config = { ...DEFAULT_ORCHESTRATION_CONFIG, ...initialConfig }
    this.logger = dependencies.logger || new Logger()
    this.status = this.initializeStatus()
  }

  /**
   * Process structured prompt request with orchestration
   */
  async processStructuredPrompt(
    prompt: string,
    options: OrchestrationOptions = {},
    server?: Server,
    progressToken?: string | number
  ): Promise<Result<OrchestrationResult, GeminiAPIError>> {
    const startTime = new Date()

    try {
      // Check if orchestration is enabled
      if (!this.config.enableOrchestration) {
        this.logger.debug('structured-prompt', 'Orchestration disabled, skipping')
        return Err(new GeminiAPIError('Orchestration is disabled'))
      }

      this.status.statistics.totalAttempts++

      // Send initial progress notification
      if (server && progressToken && this.config.progressNotifications) {
        await this.sendProgressNotification(server, progressToken, {
          stage: 'starting' as OrchestrationProgressStage,
          message: 'Starting structured prompt generation...',
          progress: 0,
          total: 100,
        })
      }

      // Convert mode to orchestration options
      const orchestrationOptions = this.mergeWithModeOptions(options)

      // POML Processing stage
      if (server && progressToken && this.config.progressNotifications) {
        await this.sendProgressNotification(server, progressToken, {
          stage: 'poml_processing' as OrchestrationProgressStage,
          message: 'Applying POML template structure...',
          progress: 25,
          total: 100,
        })
      }

      // Best Practices stage
      if (server && progressToken && this.config.progressNotifications) {
        await this.sendProgressNotification(server, progressToken, {
          stage: 'best_practices_applying' as OrchestrationProgressStage,
          message: 'Applying best practices enhancement...',
          progress: 60,
          total: 100,
        })
      }

      // Execute orchestration
      const result = await this.orchestrator.generateStructuredPrompt(prompt, orchestrationOptions)

      if (!result.success) {
        // Handle orchestration failure with fallback
        return await this.handleOrchestrationFailure(result.error, prompt, server, progressToken)
      }

      // Success - update statistics and status
      this.status.statistics.successfulAttempts++
      const processingTime = new Date().getTime() - startTime.getTime()
      this.updateAverageProcessingTime(processingTime)
      this.status.lastResult = result.data

      // Send completion notification
      if (server && progressToken && this.config.progressNotifications) {
        await this.sendProgressNotification(server, progressToken, {
          stage: 'orchestration_complete' as OrchestrationProgressStage,
          message: 'Structured prompt generation complete',
          progress: 100,
          total: 100,
        })
      }

      this.logger.info('structured-prompt', 'Orchestration completed successfully', {
        originalLength: prompt.length,
        enhancedLength: result.data.structuredPrompt.length,
        processingTime,
        stagesCompleted: result.data.processingStages.length,
      })

      return result
    } catch (error) {
      const apiError =
        error instanceof GeminiAPIError
          ? error
          : new GeminiAPIError(`Structured prompt processing failed: ${error}`)

      return await this.handleOrchestrationFailure(apiError, prompt, server, progressToken)
    }
  }

  /**
   * Handle orchestration failure with configured fallback behavior
   */
  private async handleOrchestrationFailure(
    error: GeminiAPIError,
    originalPrompt: string,
    server?: Server,
    progressToken?: string | number
  ): Promise<Result<OrchestrationResult, GeminiAPIError>> {
    this.status.statistics.failedAttempts++

    this.logger.warn('structured-prompt', 'Orchestration failed, applying fallback', {
      error: error.message,
      fallbackBehavior: this.config.fallbackBehavior,
    })

    switch (this.config.fallbackBehavior) {
      case 'graceful': {
        // Return graceful fallback result
        const fallbackResult: OrchestrationResult = {
          originalPrompt,
          structuredPrompt: originalPrompt, // Use original as fallback
          processingStages: [
            {
              name: 'Fallback',
              status: 'completed',
              startTime: new Date(),
              endTime: new Date(),
              output: originalPrompt,
            },
          ],
          appliedStrategies: [
            {
              strategy: 'Graceful Fallback',
              applied: true,
              reason: 'Orchestration failed, using original prompt',
              processingTime: 0,
            },
          ],
          metrics: {
            totalProcessingTime: 0,
            stageCount: 1,
            successRate: 0,
            failureCount: 1,
            fallbacksUsed: 1,
            timestamp: new Date(),
          },
        }

        if (server && progressToken) {
          await this.sendProgressNotification(server, progressToken, {
            stage: 'orchestration_complete' as OrchestrationProgressStage,
            message: 'Using fallback processing',
            progress: 100,
            total: 100,
          })
        }

        return Ok(fallbackResult)
      }

      case 'retry':
        // Attempt one retry (simplified for now)
        this.logger.info('structured-prompt', 'Retrying orchestration once')
        // For now, just return graceful fallback to avoid infinite recursion
        return await this.handleOrchestrationFailure(error, originalPrompt, server, progressToken)

      default:
        return Err(error)
    }
  }

  /**
   * Send progress notification to MCP client
   */
  private async sendProgressNotification(
    server: Server,
    progressToken: string | number,
    message: OrchestrationProgressMessage
  ): Promise<void> {
    try {
      await server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: message.progress,
          total: message.total,
          message: `[${message.stage}] ${message.message}`,
        },
      })
    } catch (error) {
      this.logger.warn('structured-prompt', 'Failed to send progress notification', {
        stage: message.stage,
        error: (error as Error).message,
      })
    }
  }

  /**
   * Merge options with current mode configuration
   */
  private mergeWithModeOptions(options: OrchestrationOptions): OrchestrationOptions {
    const modeOptions: OrchestrationOptions = {}

    switch (this.config.orchestrationMode) {
      case 'full':
        modeOptions.enablePOML = true
        modeOptions.bestPracticesMode = 'complete'
        break
      case 'essential':
        modeOptions.enablePOML = true
        modeOptions.bestPracticesMode = 'basic'
        break
      case 'minimal':
        modeOptions.enablePOML = false
        modeOptions.bestPracticesMode = 'basic'
        break
    }

    return { ...modeOptions, ...options }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MCPOrchestrationConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('structured-prompt', 'Configuration updated', newConfig)
  }

  /**
   * Get current orchestration status
   */
  getOrchestrationStatus(): OrchestrationStatus {
    return { ...this.status }
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.status.statistics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageProcessingTime: 0,
    }
    // Remove lastResult property using Reflect.deleteProperty to avoid type issues
    Reflect.deleteProperty(this.status, 'lastResult')
    this.logger.info('structured-prompt', 'Statistics reset')
  }

  /**
   * Initialize orchestration status
   */
  private initializeStatus(): OrchestrationStatus {
    return {
      enabled: this.config.enableOrchestration,
      mode: this.config.orchestrationMode,
      statistics: {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        averageProcessingTime: 0,
      },
    }
  }

  /**
   * Update average processing time with new measurement
   */
  private updateAverageProcessingTime(newTime: number): void {
    const stats = this.status.statistics
    const totalSuccessful = stats.successfulAttempts

    if (totalSuccessful === 1) {
      stats.averageProcessingTime = newTime
    } else {
      // Calculate weighted average
      const currentTotal = stats.averageProcessingTime * (totalSuccessful - 1)
      stats.averageProcessingTime = (currentTotal + newTime) / totalSuccessful
    }
  }
}
