/**
 * Structured Prompt Orchestrator - Coordinates 2-stage processing orchestration
 * Integrates GeminiTextClient, BestPracticesEngine, and POMLTemplateEngine
 * Manages complete structured prompt generation workflow with fallback strategies
 */

import type { BestPracticesMode, GeminiTextClient } from '../api/geminiTextClient'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { GeminiAPIError, InputValidationError } from '../utils/errors'
import type { BestPracticesEngine, BestPracticesOptions } from './bestPracticesEngine'
import type { POMLTemplate, POMLTemplateEngine } from './pomlTemplateEngine'
import { OrchestrationMetrics as PerformanceMonitor } from '../infrastructure/monitoring/OrchestrationMetrics'
import { PerformanceOptimizer } from '../infrastructure/optimization/performanceOptimizer'
import { AlertingSystem } from '../infrastructure/monitoring/alertingSystem'
import {
  ProcessingStage as MonitoringStage,
  FallbackTier,
  type MemoryMetrics,
  type PerformanceReport,
  type CostAnalysis,
  type CurrentMetrics,
  type AlertStatus,
  ReportingPeriod,
} from '../types/performanceTypes'

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

  // Enhanced monitoring methods
  getPerformanceReport(timeRange?: { start: number; end: number }): Promise<PerformanceReport>
  getCostAnalysis(period?: ReportingPeriod): Promise<CostAnalysis>
  getCurrentMetrics(): CurrentMetrics
  getOptimizationRecommendations(): Promise<string[]>
  getAlertStatus(): Promise<AlertStatus[]>
  destroy(): void
}

/**
 * Default orchestration configuration
 */
const DEFAULT_CONFIG: OrchestrationConfig = {
  timeout: 20000,
  enablePOML: true,
  bestPracticesMode: 'complete',
  fallbackStrategy: 'primary',
  maxProcessingTime: 20000,
}

/**
 * StructuredPromptOrchestrator implementation
 * Orchestrates 2-stage processing: POML structuring -> Best practices enhancement
 */
export class StructuredPromptOrchestratorImpl implements StructuredPromptOrchestrator {
  private currentMetrics: OrchestrationMetrics
  private metricsCollector: PerformanceMonitor
  private performanceOptimizer: PerformanceOptimizer
  private alertingSystem: AlertingSystem

  constructor(
    private geminiTextClient: GeminiTextClient,
    private bestPracticesEngine: BestPracticesEngine,
    private pomlTemplateEngine: POMLTemplateEngine,
    private config: OrchestrationConfig = DEFAULT_CONFIG
  ) {
    this.currentMetrics = this.initializeMetrics()

    // Initialize monitoring infrastructure
    this.metricsCollector = new PerformanceMonitor()
    this.performanceOptimizer = new PerformanceOptimizer(this.metricsCollector)
    this.alertingSystem = new AlertingSystem()
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
    const totalProcessingStartTime = Date.now()
    const stages: ProcessingStage[] = []
    const appliedStrategies: StrategyApplication[] = []

    // Record memory usage at start
    const initialMemory: MemoryMetrics = {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
      arrayBuffers: process.memoryUsage().arrayBuffers,
      timestamp: Date.now(),
    }
    this.metricsCollector.recordMemoryUsage('orchestration_start', initialMemory)

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
          return await this.handleFallback(
            originalPrompt,
            stages,
            appliedStrategies,
            stage1Result.error
          )
        }
        structuredPrompt = stage1Result.data
      }

      // Stage 2: Best Practices Enhancement
      const stage2Result = await this.executeStage2(
        structuredPrompt,
        effectiveOptions,
        stages,
        appliedStrategies
      )
      if (!stage2Result.success) {
        return await this.handleFallback(
          originalPrompt,
          stages,
          appliedStrategies,
          stage2Result.error
        )
      }

      // Compile final result
      const endTime = new Date()
      const totalProcessingTime = Date.now() - totalProcessingStartTime
      const metrics = this.calculateMetrics(startTime, endTime, stages)

      // Record comprehensive performance metrics
      this.metricsCollector.recordProcessingTime(
        MonitoringStage.TOTAL_PROCESSING,
        totalProcessingTime
      )

      // Record final memory usage
      const finalMemory: MemoryMetrics = {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        arrayBuffers: process.memoryUsage().arrayBuffers,
        timestamp: Date.now(),
      }
      this.metricsCollector.recordMemoryUsage('orchestration_end', finalMemory)

      // Check alerts for performance issues
      const currentMetrics = this.metricsCollector.getCurrentMetrics()
      await this.alertingSystem.checkAlerts(currentMetrics)

      // Enhanced result with monitoring data
      const result: OrchestrationResult = {
        originalPrompt,
        structuredPrompt: stage2Result.data,
        processingStages: stages,
        appliedStrategies,
        metrics,
      }

      this.currentMetrics = metrics
      return Ok(result)
    } catch (error) {
      const apiError =
        error instanceof GeminiAPIError
          ? error
          : new GeminiAPIError(`Orchestration failed: ${error}`)

      // Record error in monitoring system
      this.metricsCollector.recordError(MonitoringStage.TOTAL_PROCESSING, apiError)

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
      startTime: new Date(),
    }
    stages.push(stage)

    const stageStartTime = Date.now()

    try {
      const basicTemplate: POMLTemplate = {
        id: 'basic-structure-v1',
        name: 'basic-structure',
        structure: {
          role: 'You are an AI assistant specialized in image generation.',
          task: 'Generate high-quality, detailed images based on the provided prompt.',
          context: 'The prompt will be enhanced for optimal image generation results.',
          constraints: {
            quality: 'high',
            style: 'enhanced',
            technical: ['Maintain visual coherence', 'Follow safe content guidelines'],
          },
        },
        features: [], // Empty for basic template
        metadata: {
          version: '1.0',
          author: 'StructuredPromptOrchestrator',
          description: 'Basic template for prompt structuring',
          tags: ['image-generation', 'basic'],
          created: new Date(),
          lastModified: new Date(),
        },
      }

      const pomlResult = await this.pomlTemplateEngine.applyTemplate(prompt, basicTemplate)

      if (!pomlResult.success) {
        stage.status = 'failed'
        stage.endTime = new Date()
        stage.error = new GeminiAPIError('POML template application failed')
        return Err(stage.error) as Result<string, GeminiAPIError>
      }

      stage.status = 'completed'
      stage.endTime = new Date()
      stage.output = pomlResult.data.structuredPrompt

      // Record POML processing performance
      const stageProcessingTime = Date.now() - stageStartTime
      this.metricsCollector.recordProcessingTime(
        MonitoringStage.POML_PROCESSING,
        stageProcessingTime
      )

      appliedStrategies.push({
        strategy: 'POML Structuring',
        applied: true,
        processingTime: stage.endTime.getTime() - stage.startTime.getTime(),
      })

      return Ok(pomlResult.data.structuredPrompt)
    } catch (error) {
      stage.status = 'failed'
      stage.endTime = new Date()
      stage.error = error instanceof Error ? error : new GeminiAPIError('Stage 1 execution failed')

      // Record stage error
      this.metricsCollector.recordError(MonitoringStage.POML_PROCESSING, stage.error)

      return Err(
        stage.error instanceof GeminiAPIError
          ? stage.error
          : new GeminiAPIError(`Stage 1 failed: ${stage.error.message}`)
      )
    }
  }

  /**
   * Execute Stage 2: Best Practices Enhancement
   */
  private async executeStage2(
    prompt: string,
    _options: OrchestrationOptions,
    stages: ProcessingStage[],
    appliedStrategies: StrategyApplication[]
  ): Promise<Result<string, GeminiAPIError>> {
    const stage: ProcessingStage = {
      name: 'Best Practices Enhancement',
      status: 'processing',
      startTime: new Date(),
    }
    stages.push(stage)

    const stageStartTime = Date.now()

    try {
      const bestPracticesOptions: BestPracticesOptions = {
        aspectRatio: '16:9',
        targetStyle: 'enhanced',
        contextIntent: 'image_generation',
      }

      const bestPracticesResult = await this.bestPracticesEngine.applyBestPractices(
        prompt,
        bestPracticesOptions
      )

      if (!bestPracticesResult.success) {
        stage.status = 'failed'
        stage.endTime = new Date()
        stage.error = new GeminiAPIError('Best practices enhancement failed')
        return Err(stage.error) as Result<string, GeminiAPIError>
      }

      stage.status = 'completed'
      stage.endTime = new Date()
      stage.output = bestPracticesResult.data.enhancedPrompt

      // Record best practices processing performance
      const stageProcessingTime = Date.now() - stageStartTime
      this.metricsCollector.recordProcessingTime(
        MonitoringStage.BEST_PRACTICES,
        stageProcessingTime
      )

      appliedStrategies.push({
        strategy: 'Best Practices Enhancement',
        applied: true,
        processingTime: stage.endTime.getTime() - stage.startTime.getTime(),
      })

      return Ok(bestPracticesResult.data.enhancedPrompt)
    } catch (error) {
      stage.status = 'failed'
      stage.endTime = new Date()
      stage.error = error instanceof Error ? error : new GeminiAPIError('Stage 2 execution failed')

      // Record stage error
      this.metricsCollector.recordError(MonitoringStage.BEST_PRACTICES, stage.error)

      return Err(
        stage.error instanceof GeminiAPIError
          ? stage.error
          : new GeminiAPIError(`Stage 2 failed: ${stage.error.message}`)
      )
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
    // Record fallback event
    this.metricsCollector.recordFallbackEvent(FallbackTier.DIRECT_PROMPT, error.message)
    this.metricsCollector.recordError(MonitoringStage.FALLBACK_PROCESSING, error)

    // For now, implement basic fallback - return original with minimal enhancement
    const fallbackStartTime = Date.now()
    const fallbackStage: ProcessingStage = {
      name: 'Fallback Processing',
      status: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      output: originalPrompt,
    }
    stages.push(fallbackStage)

    // Record fallback processing time
    const fallbackProcessingTime = Date.now() - fallbackStartTime
    this.metricsCollector.recordProcessingTime(
      MonitoringStage.FALLBACK_PROCESSING,
      fallbackProcessingTime
    )

    appliedStrategies.push({
      strategy: 'Fallback',
      applied: true,
      reason: 'Primary processing failed',
      processingTime: 0,
    })

    const metrics = this.calculateMetrics(new Date(), new Date(), stages)
    metrics.fallbacksUsed = 1

    const result: OrchestrationResult = {
      originalPrompt,
      structuredPrompt: originalPrompt, // Fallback to original
      processingStages: stages,
      appliedStrategies,
      metrics,
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
      maxProcessingTime: options?.maxProcessingTime ?? this.config.maxProcessingTime,
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
    const completedStages = stages.filter((stage) => stage.status === 'completed').length
    const failedStages = stages.filter((stage) => stage.status === 'failed').length

    return {
      totalProcessingTime,
      stageCount: stages.length,
      successRate: stages.length > 0 ? completedStages / stages.length : 0,
      failureCount: failedStages,
      fallbacksUsed: 0, // Will be updated in fallback scenarios
      timestamp: endTime,
    }
  }

  /**
   * Validate orchestration configuration
   */
  async validateConfiguration(): Promise<Result<boolean, InputValidationError>> {
    try {
      // Validate component availability
      if (!this.geminiTextClient || !this.bestPracticesEngine || !this.pomlTemplateEngine) {
        return Err(
          new InputValidationError(
            'Required components not available',
            'Ensure all components are properly initialized'
          )
        )
      }

      // Validate configuration values
      if (this.config.timeout <= 0 || this.config.maxProcessingTime <= 0) {
        return Err(
          new InputValidationError('Invalid timeout configuration', 'Set positive timeout values')
        )
      }

      return Ok(true)
    } catch (error) {
      return Err(
        new InputValidationError(
          `Configuration validation failed: ${error}`,
          'Check orchestrator configuration parameters'
        )
      )
    }
  }

  /**
   * Get current processing metrics
   */
  getProcessingMetrics(): OrchestrationMetrics {
    return { ...this.currentMetrics }
  }

  /**
   * Get comprehensive performance monitoring data
   */
  async getPerformanceReport(timeRange?: { start: number; end: number }) {
    const defaultTimeRange = {
      start: Date.now() - 3600000, // 1 hour ago
      end: Date.now(),
    }
    return await this.metricsCollector.getPerformanceReport(timeRange || defaultTimeRange)
  }

  /**
   * Get cost analysis report
   */
  async getCostAnalysis(
    period: ReportingPeriod = ReportingPeriod.LAST_HOUR
  ): Promise<CostAnalysis> {
    return await this.metricsCollector.getCostAnalysis(period)
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): CurrentMetrics {
    return this.metricsCollector.getCurrentMetrics()
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<string[]> {
    return await this.performanceOptimizer.getOptimizationRecommendations()
  }

  /**
   * Get alert status
   */
  async getAlertStatus(): Promise<AlertStatus[]> {
    return await this.metricsCollector.getAlertStatus()
  }

  /**
   * Cleanup monitoring resources
   */
  destroy() {
    this.metricsCollector.destroy()
    this.performanceOptimizer.destroy()
    this.alertingSystem.destroy()
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
      timestamp: new Date(),
    }
  }
}
