/**
 * Type definitions for MCP orchestration integration
 * Extends existing MCP types with structured prompt generation capabilities
 */

import type { OrchestrationResult } from '../business/promptOrchestrator'

// Orchestration params no longer needed - always enabled by default

/**
 * Orchestration configuration for MCP server
 */
export interface MCPOrchestrationConfig {
  /**
   * Orchestration processing mode
   * - full: POML + all 7 best practices
   * - essential: POML + essential 3 practices
   * - minimal: best practices only, no POML
   */
  orchestrationMode: 'full' | 'essential' | 'minimal'

  /**
   * Enable progress notifications during orchestration
   */
  progressNotifications: boolean

  /**
   * Fallback behavior when orchestration fails
   */
  fallbackBehavior: FallbackBehavior
}

/**
 * Fallback behavior options
 */
export type FallbackBehavior =
  | 'graceful' // Continue with original prompt
  | 'retry' // Attempt orchestration once more
  | 'fail' // Return error if orchestration fails

/**
 * Orchestration status information
 */
export interface OrchestrationStatus {
  /**
   * Whether orchestration is currently enabled
   */
  enabled: boolean

  /**
   * Current orchestration mode
   */
  mode: MCPOrchestrationConfig['orchestrationMode']

  /**
   * Processing statistics
   */
  statistics: {
    /**
     * Total orchestration attempts
     */
    totalAttempts: number

    /**
     * Successful orchestrations
     */
    successfulAttempts: number

    /**
     * Failed orchestrations
     */
    failedAttempts: number

    /**
     * Average processing time in milliseconds
     */
    averageProcessingTime: number
  }

  /**
   * Last orchestration result (if any)
   */
  lastResult?: OrchestrationResult
}

/**
 * MCP tool call result with orchestration metadata
 */
export interface MCPOrchestrationResult {
  /**
   * Standard MCP content array
   */
  content: Array<{
    type: 'text' | 'image'
    text?: string
    data?: string
    mimeType?: string
  }>

  /**
   * Whether structured prompt was used
   */
  usedStructuredPrompt: boolean

  /**
   * Orchestration result details (if structured prompt was used)
   */
  orchestrationResult?: OrchestrationResult

  /**
   * Processing metadata
   */
  metadata: {
    /**
     * Total processing time including orchestration
     */
    totalProcessingTime: number

    /**
     * Time spent on orchestration (if applicable)
     */
    orchestrationTime?: number

    /**
     * Time spent on image generation
     */
    imageGenerationTime: number

    /**
     * Whether fallback was used
     */
    fallbackUsed: boolean
  }
}

/**
 * Progress notification stages for orchestration
 */
export enum OrchestrationProgressStage {
  STARTING = 'starting',
  POML_PROCESSING = 'poml_processing',
  BEST_PRACTICES_APPLYING = 'best_practices_applying',
  ORCHESTRATION_COMPLETE = 'orchestration_complete',
  IMAGE_GENERATION_STARTING = 'image_generation_starting',
  IMAGE_GENERATION_COMPLETE = 'image_generation_complete',
}

/**
 * Progress notification message for orchestration stages
 */
export interface OrchestrationProgressMessage {
  stage: OrchestrationProgressStage
  message: string
  progress: number
  total: number
}

/**
 * Default orchestration configuration
 */
export const DEFAULT_ORCHESTRATION_CONFIG: MCPOrchestrationConfig = {
  orchestrationMode: 'full',
  progressNotifications: true,
  fallbackBehavior: 'graceful',
}
