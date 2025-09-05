/**
 * Structured Prompt Orchestrator - Coordinates 2-stage processing orchestration
 * Integrates GeminiTextClient, BestPracticesEngine, and POMLTemplateEngine
 * Manages complete structured prompt generation workflow with fallback strategies
 */

import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import type { GeminiTextClient, BestPracticesMode, OptimizedPrompt } from '../api/geminiTextClient'
import type { BestPracticesEngine, BestPracticesOptions, BestPracticesResult } from './bestPracticesEngine'
import type { POMLTemplateEngine, POMLOptions, POMLResult } from './pomlTemplateEngine'
import { GeminiAPIError, InputValidationError } from '../utils/errors'

/**
 * Orchestration configuration for processing pipeline
 */
export interface OrchestrationConfig {
  timeout: number
  enablePOML: boolean
  bestPracticesMode: BestPracticesMode
  fallbackStrategy: FallbackStrategy
  maxProcessingTime: number
}

/**
 * Options for orchestration processing
 */
export interface OrchestrationOptions {
  enablePOML?: boolean
  bestPracticesMode?: BestPracticesMode
  fallbackStrategy?: FallbackStrategy
  maxProcessingTime?: number
}

/**
 * Fallback strategies for error recovery
 */
export type FallbackStrategy = 'primary' | 'secondary' | 'tertiary'

/**
 * Individual processing stage information
 */
export interface ProcessingStage {
  name: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  error?: Error
  output?: string
}

/**
 * Strategy application details
 */
export interface StrategyApplication {
  strategy: string
  applied: boolean
  reason?: string
  processingTime: number
}

/**
 * Orchestration processing metrics
 */
export interface OrchestrationMetrics {
  totalProcessingTime: number
  stageCount: number
  successRate: number
  failureCount: number
  fallbacksUsed: number
  timestamp: Date
}

/**
 * Complete orchestration result with all metadata
 */
export interface OrchestrationResult {
  originalPrompt: string
  structuredPrompt: string
  processingStages: ProcessingStage[]
  appliedStrategies: StrategyApplication[]
  metrics: OrchestrationMetrics
}

/**
 * StructuredPromptOrchestrator interface for coordinating processing workflow
 */
export interface StructuredPromptOrchestrator {
  generateStructuredPrompt(
    originalPrompt: string,
    options?: OrchestrationOptions
  ): Promise<Result<OrchestrationResult, GeminiAPIError>>
  
  validateConfiguration(): Promise<Result<boolean, InputValidationError>>
  getProcessingMetrics(): OrchestrationMetrics
}

/**
 * Default orchestration configuration
 */
const DEFAULT_CONFIG: OrchestrationConfig = {
  timeout: 20000,
  enablePOML: true,
  bestPracticesMode: 'complete',
  fallbackStrategy: 'primary',
  maxProcessingTime: 20000
}

/**
 * StructuredPromptOrchestrator implementation
 * Orchestrates 2-stage processing: POML structuring -> Best practices enhancement
 */
export class StructuredPromptOrchestratorImpl implements StructuredPromptOrchestrator {
  private currentMetrics: OrchestrationMetrics

  constructor(
    private geminiTextClient: GeminiTextClient,
    private bestPracticesEngine: BestPracticesEngine,
    private pomlTemplateEngine: POMLTemplateEngine,
    private config: OrchestrationConfig = DEFAULT_CONFIG
  ) {
    this.currentMetrics = this.initializeMetrics()
  }

  /**
   * Generate structured prompt through 2-stage orchestration
   * Stage 1: POML template structuring
   * Stage 2: Best practices enhancement
   */
  async generateStructuredPrompt(
    originalPrompt: string,
    options?: OrchestrationOptions
  ): Promise<Result<OrchestrationResult, GeminiAPIError>> {
    const startTime = new Date()
    const stages: ProcessingStage[] = []
    const appliedStrategies: StrategyApplication[] = []
    
    try {
      // Validate input
      if (!originalPrompt || originalPrompt.trim().length === 0) {
        return Err(new GeminiAPIError('Original prompt cannot be empty'))
      }

      // Merge options with default config
      const effectiveOptions = this.mergeOptions(options)
      
      let structuredPrompt = originalPrompt
      
      // Stage 1: POML Template Structuring (if enabled)
      if (effectiveOptions.enablePOML) {
        const stage1Result = await this.executeStage1(originalPrompt, stages, appliedStrategies)
        if (!stage1Result.success) {
          return await this.handleFallback(originalPrompt, stages, appliedStrategies, stage1Result.error)
        }
        structuredPrompt = stage1Result.data
      }
      
      // Stage 2: Best Practices Enhancement
      const stage2Result = await this.executeStage2(structuredPrompt, effectiveOptions, stages, appliedStrategies)
      if (!stage2Result.success) {
        return await this.handleFallback(originalPrompt, stages, appliedStrategies, stage2Result.error)
      }
      
      // Compile final result
      const endTime = new Date()
      const metrics = this.calculateMetrics(startTime, endTime, stages)
      
      const result: OrchestrationResult = {
        originalPrompt,
        structuredPrompt: stage2Result.data,
        processingStages: stages,
        appliedStrategies,
        metrics
      }
      
      this.currentMetrics = metrics
      return Ok(result)
      
    } catch (error) {
      const apiError = error instanceof GeminiAPIError ? error : new GeminiAPIError(`Orchestration failed: ${error}`)
      return await this.handleFallback(originalPrompt, stages, appliedStrategies, apiError)
    }
  }

  /**
   * Execute Stage 1: POML Template Structuring
   */
  private async executeStage1(
    prompt: string,
    stages: ProcessingStage[],
    appliedStrategies: StrategyApplication[]
  ): Promise<Result<string, GeminiAPIError>> {
    const stage: ProcessingStage = {
      name: 'POML Template Structuring',
      status: 'processing',
      startTime: new Date()
    }
    stages.push(stage)

    try {
      const pomlOptions: POMLOptions = {
        templateType: 'basic',
        enabledFeatures: ['role', 'task', 'context', 'constraints']
      }
      
      const pomlResult = await this.pomlTemplateEngine.applyTemplate(prompt, pomlOptions)
      
      if (!pomlResult.success) {
        stage.status = 'failed'
        stage.endTime = new Date()
        stage.error = new GeminiAPIError('POML template application failed')
        return Err(stage.error)
      }
      
      stage.status = 'completed'
      stage.endTime = new Date()
      stage.output = pomlResult.data.structuredPrompt
      
      appliedStrategies.push({
        strategy: 'POML Structuring',
        applied: true,
        processingTime: stage.endTime.getTime() - stage.startTime.getTime()
      })
      
      return Ok(pomlResult.data.structuredPrompt)
      
    } catch (error) {
      stage.status = 'failed'
      stage.endTime = new Date()
      stage.error = error instanceof Error ? error : new GeminiAPIError('Stage 1 execution failed')
      return Err(stage.error instanceof GeminiAPIError ? stage.error : new GeminiAPIError(`Stage 1 failed: ${stage.error.message}`))
    }
  }

  /**
   * Execute Stage 2: Best Practices Enhancement
   */
  private async executeStage2(
    prompt: string,
    options: OrchestrationOptions,
    stages: ProcessingStage[],
    appliedStrategies: StrategyApplication[]
  ): Promise<Result<string, GeminiAPIError>> {
    const stage: ProcessingStage = {
      name: 'Best Practices Enhancement',
      status: 'processing',
      startTime: new Date()
    }
    stages.push(stage)

    try {
      const bestPracticesOptions: BestPracticesOptions = {
        enabledPractices: undefined, // Use all practices for specified mode
        aspectRatio: '16:9',
        targetStyle: 'enhanced',
        contextIntent: 'image_generation'
      }
      
      const bestPracticesResult = await this.bestPracticesEngine.enhancePrompt(prompt, bestPracticesOptions)
      
      if (!bestPracticesResult.success) {
        stage.status = 'failed'
        stage.endTime = new Date()
        stage.error = new GeminiAPIError('Best practices enhancement failed')
        return Err(stage.error)
      }
      
      stage.status = 'completed'
      stage.endTime = new Date()
      stage.output = bestPracticesResult.data.enhancedPrompt
      
      appliedStrategies.push({
        strategy: 'Best Practices Enhancement',
        applied: true,
        processingTime: stage.endTime.getTime() - stage.startTime.getTime()
      })
      
      return Ok(bestPracticesResult.data.enhancedPrompt)
      
    } catch (error) {
      stage.status = 'failed'
      stage.endTime = new Date()
      stage.error = error instanceof Error ? error : new GeminiAPIError('Stage 2 execution failed')
      return Err(stage.error instanceof GeminiAPIError ? stage.error : new GeminiAPIError(`Stage 2 failed: ${stage.error.message}`))
    }
  }

  /**
   * Handle fallback strategies when stages fail
   */
  private async handleFallback(
    originalPrompt: string,
    stages: ProcessingStage[],
    appliedStrategies: StrategyApplication[],
    error: GeminiAPIError
  ): Promise<Result<OrchestrationResult, GeminiAPIError>> {
    // For now, implement basic fallback - return original with minimal enhancement
    const fallbackStage: ProcessingStage = {
      name: 'Fallback Processing',
      status: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      output: originalPrompt
    }
    stages.push(fallbackStage)

    appliedStrategies.push({
      strategy: 'Fallback',
      applied: true,
      reason: 'Primary processing failed',
      processingTime: 0
    })

    const metrics = this.calculateMetrics(new Date(), new Date(), stages)
    metrics.fallbacksUsed = 1

    const result: OrchestrationResult = {
      originalPrompt,
      structuredPrompt: originalPrompt, // Fallback to original
      processingStages: stages,
      appliedStrategies,
      metrics
    }

    return Ok(result)
  }

  /**
   * Merge options with configuration defaults
   */
  private mergeOptions(options?: OrchestrationOptions): OrchestrationOptions {
    return {
      enablePOML: options?.enablePOML ?? this.config.enablePOML,
      bestPracticesMode: options?.bestPracticesMode ?? this.config.bestPracticesMode,
      fallbackStrategy: options?.fallbackStrategy ?? this.config.fallbackStrategy,
      maxProcessingTime: options?.maxProcessingTime ?? this.config.maxProcessingTime
    }
  }

  /**
   * Calculate processing metrics
   */
  private calculateMetrics(
    startTime: Date,
    endTime: Date,
    stages: ProcessingStage[]
  ): OrchestrationMetrics {
    const totalProcessingTime = endTime.getTime() - startTime.getTime()
    const completedStages = stages.filter(stage => stage.status === 'completed').length
    const failedStages = stages.filter(stage => stage.status === 'failed').length
    
    return {
      totalProcessingTime,
      stageCount: stages.length,
      successRate: stages.length > 0 ? completedStages / stages.length : 0,
      failureCount: failedStages,
      fallbacksUsed: 0, // Will be updated in fallback scenarios
      timestamp: endTime
    }
  }

  /**
   * Validate orchestration configuration
   */
  async validateConfiguration(): Promise<Result<boolean, InputValidationError>> {
    try {
      // Validate component availability
      if (!this.geminiTextClient || !this.bestPracticesEngine || !this.pomlTemplateEngine) {
        return Err(new InputValidationError('Required components not available', 'Ensure all components are properly initialized'))
      }

      // Validate configuration values
      if (this.config.timeout <= 0 || this.config.maxProcessingTime <= 0) {
        return Err(new InputValidationError('Invalid timeout configuration', 'Set positive timeout values'))
      }

      return Ok(true)
    } catch (error) {
      return Err(new InputValidationError(`Configuration validation failed: ${error}`, 'Check orchestrator configuration parameters'))
    }
  }

  /**
   * Get current processing metrics
   */
  getProcessingMetrics(): OrchestrationMetrics {
    return { ...this.currentMetrics }
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics(): OrchestrationMetrics {
    return {
      totalProcessingTime: 0,
      stageCount: 0,
      successRate: 0,
      failureCount: 0,
      fallbacksUsed: 0,
      timestamp: new Date()
    }
  }
}