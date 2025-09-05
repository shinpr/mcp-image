/**
 * TwoStageProcessor - Main integration point for 2-stage processing
 * Coordinates structured prompt generation with image generation
 * Implements complete workflow with performance tracking and fallback strategies
 */

import type { GeminiApiParams, GeminiClient } from '../api/geminiClient'
import type {
  OrchestrationOptions,
  OrchestrationResult,
  StructuredPromptOrchestrator,
} from '../business/promptOrchestrator'
import { GenerationMetadataManager } from '../infrastructure/metadata/generationMetadata'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import type {
  ImageGenerationRequest,
  ImageParameters,
  OptimizedParameters,
  ParameterOptimizer,
  ProcessingMetadata,
  TwoStageProcessor,
  TwoStageProcessorOptions,
  TwoStageResult,
} from '../types/twoStageTypes'
import { GeminiAPIError, NetworkError } from '../utils/errors'
import { ParameterOptimizerImpl } from './parameterOptimizer'

/**
 * Default configuration for TwoStageProcessor
 */
const DEFAULT_OPTIONS: TwoStageProcessorOptions = {
  maxProcessingTime: 20000, // 20 seconds
  enableParameterOptimization: true,
  enableMetadataCollection: true,
  fallbackStrategy: 'primary',
  performanceTarget: 20000,
}

/**
 * Implementation of TwoStageProcessor with complete workflow coordination
 */
export class TwoStageProcessorImpl implements TwoStageProcessor {
  private metadataManager: GenerationMetadataManager
  private parameterOptimizer: ParameterOptimizer

  constructor(
    private orchestrator: StructuredPromptOrchestrator,
    private imageClient: GeminiClient,
    private options: TwoStageProcessorOptions = DEFAULT_OPTIONS
  ) {
    this.metadataManager = new GenerationMetadataManager()
    this.parameterOptimizer = new ParameterOptimizerImpl()
  }

  /**
   * Generate image using complete 2-stage workflow
   */
  async generateImageWithStructuredPrompt(
    request: ImageGenerationRequest
  ): Promise<Result<TwoStageResult, GeminiAPIError | NetworkError>> {
    const sessionId = this.metadataManager.createSession(request.originalPrompt)

    // Set up timeout for the entire operation
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new GeminiAPIError(
            '2-stage processing timeout',
            `Exceeded ${this.options.maxProcessingTime}ms limit`
          )
        )
      }, this.options.maxProcessingTime)
    })

    try {
      // Validate configuration before processing
      const configValidation = await this.validateConfiguration()
      if (!configValidation.success) {
        return Err(new GeminiAPIError('Configuration validation failed', 'Check processor setup'))
      }

      // Race the processing against timeout
      const processingResult = await Promise.race([
        this.executeProcessingWorkflow(request, sessionId),
        timeoutPromise,
      ])

      return processingResult
    } catch (error) {
      const apiError =
        error instanceof GeminiAPIError
          ? error
          : new GeminiAPIError(
              `2-stage processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            )

      return await this.handleFallbackScenario(sessionId, request, apiError)
    }
  }

  /**
   * Execute the main processing workflow
   */
  private async executeProcessingWorkflow(
    request: ImageGenerationRequest,
    sessionId: string
  ): Promise<Result<TwoStageResult, GeminiAPIError | NetworkError>> {
    const startTime = Date.now()

    // Stage 1: Generate structured prompt
    const stage1Result = await this.executePromptGenerationStage(sessionId, request)
    if (!stage1Result.success) {
      // Try fallback with original prompt - don't throw here, return the error result
      throw stage1Result.error
    }

    const orchestrationResult = stage1Result.data
    const structuredPrompt = orchestrationResult.structuredPrompt

    // Stage 2: Optimize parameters based on structured prompt
    let optimizedParams: OptimizedParameters
    if (this.options.enableParameterOptimization) {
      const paramResult = await this.optimizeImageParameters(
        structuredPrompt,
        request.imageParameters || {}
      )
      if (!paramResult.success) {
        // Continue with original parameters if optimization fails
        optimizedParams = request.imageParameters || {}
        this.metadataManager.recordOptimization(
          sessionId,
          'parameter optimization failed - using original'
        )
      } else {
        optimizedParams = paramResult.data
        // Record all optimization reasons
        if (optimizedParams.optimizationReasons) {
          for (const reason of optimizedParams.optimizationReasons) {
            this.metadataManager.recordOptimization(sessionId, reason)
          }
        }
      }
    } else {
      optimizedParams = request.imageParameters || {}
    }

    // Stage 3: Generate image with structured prompt
    const stage2Result = await this.executeImageGenerationStage(
      sessionId,
      structuredPrompt,
      optimizedParams
    )
    if (!stage2Result.success) {
      throw stage2Result.error
    }

    // Compile final result
    const processingMetadata = this.metadataManager.completeSession(sessionId)
    if (!processingMetadata) {
      throw new GeminiAPIError('Failed to retrieve processing metadata')
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime

    // Performance monitoring
    if (totalTime > this.options.performanceTarget) {
      console.warn(
        `2-stage processing exceeded target: ${totalTime}ms > ${this.options.performanceTarget}ms`
      )
      this.metadataManager.recordOptimization(
        sessionId,
        `performance target exceeded: ${totalTime}ms`
      )
    }

    const result: TwoStageResult = {
      originalPrompt: request.originalPrompt,
      structuredPrompt,
      generatedImage: stage2Result.data,
      processingMetadata: {
        ...processingMetadata,
        totalProcessingTime: totalTime,
      },
      optimizedParameters: optimizedParams,
      orchestrationResult,
      success: true,
    }

    return Ok(result)
  }

  /**
   * Optimize image parameters based on structured prompt
   */
  async optimizeImageParameters(
    structuredPrompt: string,
    baseParams: ImageParameters
  ): Promise<Result<OptimizedParameters, GeminiAPIError>> {
    try {
      return await this.parameterOptimizer.optimizeForStructuredPrompt(structuredPrompt, baseParams)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Parameter optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Using original parameters as fallback'
        )
      )
    }
  }

  /**
   * Get processing metadata for a session
   */
  getProcessingMetadata(sessionId: string): ProcessingMetadata | undefined {
    return this.metadataManager.getSession(sessionId)
  }

  /**
   * Validate processor configuration
   */
  async validateConfiguration(): Promise<Result<boolean, GeminiAPIError>> {
    try {
      // Validate orchestrator
      const orchestratorValidation = await this.orchestrator.validateConfiguration()
      if (!orchestratorValidation.success) {
        return Err(
          new GeminiAPIError('Orchestrator configuration invalid', 'Check orchestrator setup')
        )
      }

      // Validate required components exist
      if (!this.orchestrator || !this.imageClient) {
        return Err(
          new GeminiAPIError('Required components not available', 'Initialize all dependencies')
        )
      }

      // Validate options
      if (this.options.maxProcessingTime <= 0 || this.options.performanceTarget <= 0) {
        return Err(
          new GeminiAPIError('Invalid timing configuration', 'Set positive timeout values')
        )
      }

      return Ok(true)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }

  /**
   * Execute Stage 1: Structured Prompt Generation
   */
  private async executePromptGenerationStage(
    sessionId: string,
    request: ImageGenerationRequest
  ): Promise<Result<OrchestrationResult, GeminiAPIError>> {
    const stageName = 'Structured Prompt Generation'
    this.metadataManager.recordStage(sessionId, {
      stageName,
      status: 'processing',
      inputData: { originalPrompt: request.originalPrompt, options: request.orchestrationOptions },
    })

    try {
      const orchestrationOptions: OrchestrationOptions = {
        enablePOML: request.orchestrationOptions?.enablePOML ?? true,
        bestPracticesMode: request.orchestrationOptions?.bestPracticesMode ?? 'complete',
        maxProcessingTime: request.orchestrationOptions?.maxProcessingTime ?? 15000, // 15 seconds for prompt generation
        ...request.orchestrationOptions,
      }

      const result = await this.orchestrator.generateStructuredPrompt(
        request.originalPrompt,
        orchestrationOptions
      )

      if (result.success) {
        this.metadataManager.completeStage(sessionId, stageName, result.data)
        return Ok(result.data)
      }
      this.metadataManager.failStage(sessionId, stageName, result.error)
      return Err(result.error)
    } catch (error) {
      const apiError =
        error instanceof GeminiAPIError
          ? error
          : new GeminiAPIError(
              `Prompt generation stage failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            )

      this.metadataManager.failStage(sessionId, stageName, apiError)
      return Err(apiError)
    }
  }

  /**
   * Execute Stage 2: Image Generation
   */
  private async executeImageGenerationStage(
    sessionId: string,
    structuredPrompt: string,
    optimizedParams: OptimizedParameters
  ): Promise<
    Result<import('../api/geminiClient').GeneratedImageResult, GeminiAPIError | NetworkError>
  > {
    const stageName = 'Image Generation'
    this.metadataManager.recordStage(sessionId, {
      stageName,
      status: 'processing',
      inputData: { structuredPrompt, optimizedParams },
    })

    try {
      const imageParams: GeminiApiParams = {
        prompt: structuredPrompt,
        ...(optimizedParams.inputImage && { inputImage: optimizedParams.inputImage }),
        ...(optimizedParams.blendImages && { blendImages: optimizedParams.blendImages }),
        ...(optimizedParams.maintainCharacterConsistency && {
          maintainCharacterConsistency: optimizedParams.maintainCharacterConsistency,
        }),
        ...(optimizedParams.useWorldKnowledge && {
          useWorldKnowledge: optimizedParams.useWorldKnowledge,
        }),
      }

      const result = await this.imageClient.generateImage(imageParams)

      if (result.success) {
        this.metadataManager.completeStage(sessionId, stageName, result.data)
        return Ok(result.data)
      }
      this.metadataManager.failStage(sessionId, stageName, result.error)
      return Err(result.error)
    } catch (error) {
      const apiError =
        error instanceof NetworkError
          ? error
          : error instanceof GeminiAPIError
            ? error
            : new GeminiAPIError(
                `Image generation stage failed: ${error instanceof Error ? error.message : 'Unknown error'}`
              )

      this.metadataManager.failStage(sessionId, stageName, apiError)
      return Err(apiError)
    }
  }

  /**
   * Handle fallback scenario when primary processing fails
   */
  private async handleFallbackScenario(
    sessionId: string,
    request: ImageGenerationRequest,
    error: GeminiAPIError | NetworkError
  ): Promise<Result<TwoStageResult, GeminiAPIError | NetworkError>> {
    this.metadataManager.recordFallback(sessionId)

    const fallbackStageName = 'Fallback Image Generation'
    this.metadataManager.recordStage(sessionId, {
      stageName: fallbackStageName,
      status: 'processing',
      inputData: { originalPrompt: request.originalPrompt, fallbackReason: error.message },
    })

    try {
      // Generate image with original prompt
      const imageParams: GeminiApiParams = {
        prompt: request.originalPrompt,
        ...(request.imageParameters?.inputImage && {
          inputImage: request.imageParameters.inputImage,
        }),
        ...(request.imageParameters?.blendImages && {
          blendImages: request.imageParameters.blendImages,
        }),
        ...(request.imageParameters?.maintainCharacterConsistency && {
          maintainCharacterConsistency: request.imageParameters.maintainCharacterConsistency,
        }),
        ...(request.imageParameters?.useWorldKnowledge && {
          useWorldKnowledge: request.imageParameters.useWorldKnowledge,
        }),
      }

      const fallbackResult = await this.imageClient.generateImage(imageParams)

      if (!fallbackResult.success) {
        this.metadataManager.failStage(sessionId, fallbackStageName, fallbackResult.error)
        return Err(fallbackResult.error)
      }

      this.metadataManager.completeStage(sessionId, fallbackStageName, fallbackResult.data)

      // Create mock orchestration result for fallback
      const fallbackOrchestrationResult: OrchestrationResult = {
        originalPrompt: request.originalPrompt,
        structuredPrompt: request.originalPrompt, // No enhancement in fallback
        processingStages: [],
        appliedStrategies: [
          {
            strategy: 'Fallback',
            applied: true,
            reason: 'Primary processing failed',
            processingTime: 0,
          },
        ],
        metrics: {
          totalProcessingTime: 0,
          stageCount: 0,
          successRate: 0,
          failureCount: 1,
          fallbacksUsed: 1,
          timestamp: new Date(),
        },
      }

      const processingMetadata = this.metadataManager.completeSession(sessionId)
      if (!processingMetadata) {
        return Err(new GeminiAPIError('Failed to retrieve fallback processing metadata'))
      }

      const fallbackResult_final: TwoStageResult = {
        originalPrompt: request.originalPrompt,
        structuredPrompt: request.originalPrompt,
        generatedImage: fallbackResult.data,
        processingMetadata,
        optimizedParameters: request.imageParameters || {},
        orchestrationResult: fallbackOrchestrationResult,
        success: true, // Fallback succeeded
      }

      return Ok(fallbackResult_final)
    } catch (fallbackError) {
      const apiError =
        fallbackError instanceof GeminiAPIError || fallbackError instanceof NetworkError
          ? fallbackError
          : new GeminiAPIError(
              `Fallback processing failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`
            )

      this.metadataManager.failStage(sessionId, fallbackStageName, apiError)
      return Err(apiError)
    }
  }
}

/**
 * Factory for creating TwoStageProcessor instances with dependency injection
 */
export class TwoStageProcessorFactory {
  constructor(
    private orchestrator: StructuredPromptOrchestrator,
    private imageClient: GeminiClient
  ) {}

  /**
   * Create a new TwoStageProcessor instance
   */
  create(options?: Partial<TwoStageProcessorOptions>): TwoStageProcessor {
    const finalOptions: TwoStageProcessorOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
    }

    return new TwoStageProcessorImpl(this.orchestrator, this.imageClient, finalOptions)
  }
}
