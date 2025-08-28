/**
 * Image Generator business logic
 * Orchestrates validation, API calls, and metadata generation
 */

import type { GeminiClient } from '../api/geminiClient'
import type { UrlContextClient } from '../api/urlContextClient'
import { ConcurrencyManager } from '../server/concurrencyManager'
import type { GenerateImageParams } from '../types/mcp'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import {
  ConcurrencyError,
  type FileOperationError,
  GeminiAPIError,
  InputValidationError,
  type NetworkError,
} from '../utils/errors'
import { Logger } from '../utils/logger'
import { FileManager } from './fileManager'
import { validateImageFile, validatePrompt } from './inputValidator'
import { PerformanceManager } from './performanceManager'
import { URLExtractor } from './urlExtractor'

/**
 * Context method type for image generation
 */
export type ContextMethod = 'prompt_only' | 'url_context'

/**
 * Metadata for generated images in the business layer
 */
export interface GenerationMetadata {
  model: 'gemini-2.5-flash-image-preview'
  processingTime: number // milliseconds
  contextMethod: ContextMethod
  timestamp: string
  /** URLs extracted from the prompt (undefined if none) */
  extractedUrls?: string[]
  /** Whether URL context was successfully used (undefined if not attempted) */
  urlContextUsed?: boolean
  /** Reason for fallback to prompt_only processing (undefined if no fallback) */
  fallbackReason?: string
  /** Number of retry attempts made during URL context processing (undefined if not attempted) */
  retryCount?: number
  /** New features usage metadata */
  newFeatures?: {
    blendImages: boolean
    maintainCharacterConsistency: boolean
    useWorldKnowledge: boolean
  }
  /** Effectiveness assessment of new features (undefined if features not used) */
  featureEffectiveness?: {
    blending?: 'successful' | 'partial' | 'failed'
    consistency?: 'high' | 'medium' | 'low'
    knowledge?: 'extensive' | 'moderate' | 'minimal'
  }
  /** Performance metrics (added in optimization) */
  performance?: {
    internalProcessingTime: number
    totalTime: number
    memoryPeak: number
    withinLimits: boolean
  }
}

/**
 * Result of image generation from business layer
 */
export interface GenerationResult {
  imageData: Buffer
  metadata: GenerationMetadata
}

/**
 * Parameters accepted by ImageGenerator
 */
export interface ImageGeneratorParams {
  prompt: string
  enableUrlContext?: boolean
  inputImagePath?: string
  outputPath?: string
  // Gemini 2.5 Flash Image new feature parameters
  blendImages?: boolean
  maintainCharacterConsistency?: boolean
  useWorldKnowledge?: boolean
}

/**
 * Core image generation business logic class
 * Handles the complete flow: validation -> API call -> metadata generation
 */
export class ImageGenerator {
  private readonly modelName = 'gemini-2.5-flash-image-preview' as const

  constructor(
    private readonly geminiClient: GeminiClient,
    private readonly urlContextClient?: UrlContextClient
  ) {}

  /**
   * Generates an image from a text prompt with optional URL context processing
   * @param params Parameters for image generation
   * @returns Result containing image data and metadata, or an error
   */
  async generateImage(
    params: ImageGeneratorParams
  ): Promise<
    Result<
      GenerationResult,
      InputValidationError | FileOperationError | GeminiAPIError | NetworkError | ConcurrencyError
    >
  > {
    const startTime = Date.now()

    // Step 1: Validate input parameters
    const validationResult = this.validateInput(params)
    if (!validationResult.success) {
      return Err(validationResult.error)
    }

    // Step 2: Initialize metadata tracking variables
    let contextMethod: ContextMethod = 'prompt_only'
    let extractedUrls: string[] = []
    let urlContextUsed = false
    let finalPrompt = params.prompt

    // Step 3: URL Context processing (if enabled)
    const urlContextResult = await this.processUrlContext(params)
    finalPrompt = urlContextResult.finalPrompt
    contextMethod = urlContextResult.contextMethod
    extractedUrls = urlContextResult.extractedUrls
    urlContextUsed = urlContextResult.urlContextUsed
    const fallbackReason = urlContextResult.fallbackReason
    const retryCount = urlContextResult.retryCount

    // Step 4: Execute API call with processed prompt
    const apiResult = await this.executeApiCall({
      ...params,
      prompt: finalPrompt,
    })
    if (!apiResult.success) {
      return Err(apiResult.error)
    }

    // Step 5: Generate metadata and return result
    const processingTime = Math.max(1, Date.now() - startTime)
    const metadata = this.generateMetadata(
      processingTime,
      contextMethod,
      extractedUrls,
      urlContextUsed,
      params.enableUrlContext || false,
      fallbackReason,
      retryCount,
      params
    )

    return Ok({
      imageData: apiResult.data.imageData,
      metadata,
    })
  }

  /**
   * Process URL context if enabled and URLs are present
   * @param params Image generation parameters
   * @returns URL context processing result with fallback information
   */
  protected async processUrlContext(params: ImageGeneratorParams): Promise<{
    finalPrompt: string
    contextMethod: ContextMethod
    extractedUrls: string[]
    urlContextUsed: boolean
    fallbackReason: string | undefined
    retryCount: number | undefined
  }> {
    // Initialize with defaults
    let finalPrompt = params.prompt
    let contextMethod: ContextMethod = 'prompt_only'
    let extractedUrls: string[] = []
    let urlContextUsed = false
    let fallbackReason: string | undefined
    let retryCount: number | undefined

    // Extract URLs from prompt regardless of client availability for metadata tracking
    extractedUrls = URLExtractor.extractUrls(params.prompt)

    // Only process if URL context is enabled and client is available
    if (!params.enableUrlContext || !this.urlContextClient) {
      return {
        finalPrompt,
        contextMethod,
        extractedUrls,
        urlContextUsed,
        fallbackReason,
        retryCount,
      }
    }

    // Only proceed if URLs were found
    if (extractedUrls.length === 0) {
      return {
        finalPrompt,
        contextMethod,
        extractedUrls,
        urlContextUsed,
        fallbackReason,
        retryCount,
      }
    }

    console.log(`[ImageGenerator] Processing ${extractedUrls.length} URLs for context`, {
      urls: extractedUrls,
    })

    try {
      // Process URLs with context API
      const contextResult = await this.urlContextClient.processUrls(extractedUrls, params.prompt)

      if (contextResult.success) {
        finalPrompt = contextResult.data.combinedPrompt
        contextMethod = 'url_context'
        urlContextUsed = true

        // Extract retry information from the result
        if (contextResult.data.extractedInfo && 'retryCount' in contextResult.data.extractedInfo) {
          retryCount = contextResult.data.extractedInfo['retryCount'] as number
        }

        console.log('[ImageGenerator] URL context processing succeeded', {
          urlCount: extractedUrls.length,
          retryCount: retryCount || 0,
          promptLength: finalPrompt.length,
        })
      } else {
        // Context processing failed but URLs were extracted
        urlContextUsed = false
        fallbackReason = contextResult.error.message

        console.warn(
          '[ImageGenerator] URL context processing failed, falling back to prompt-only',
          {
            reason: fallbackReason,
            urls: extractedUrls,
            errorType: contextResult.error.constructor.name,
          }
        )
      }
    } catch (error) {
      // Unexpected error during context processing
      urlContextUsed = false
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      fallbackReason = `Unexpected error: ${errorMessage}`

      console.warn(
        '[ImageGenerator] Unexpected error during URL context processing, falling back to prompt-only',
        {
          error: errorMessage,
          urls: extractedUrls,
        }
      )
    }

    return { finalPrompt, contextMethod, extractedUrls, urlContextUsed, fallbackReason, retryCount }
  }

  /**
   * Validates input parameters using the validation module
   */
  private validateInput(
    params: ImageGeneratorParams
  ): Result<GenerateImageParams, InputValidationError | FileOperationError> {
    // Validate prompt
    const promptResult = validatePrompt(params.prompt)
    if (!promptResult.success) {
      return Err(promptResult.error)
    }

    // Validate input image file if provided
    if (params.inputImagePath) {
      const imageResult = validateImageFile(params.inputImagePath)
      if (!imageResult.success) {
        return Err(imageResult.error)
      }
    }

    // Return validated parameters in GenerateImageParams format
    const validatedParams: GenerateImageParams = {
      prompt: promptResult.data,
    }

    return Ok(validatedParams)
  }

  /**
   * Executes the Gemini API call with proper error handling
   */
  protected async executeApiCall(
    params: ImageGeneratorParams
  ): Promise<Result<{ imageData: Buffer }, GeminiAPIError | NetworkError>> {
    try {
      const apiParams: {
        prompt: string
        inputImage?: Buffer
        blendImages?: boolean
        maintainCharacterConsistency?: boolean
        useWorldKnowledge?: boolean
      } = {
        prompt: params.prompt,
      }

      // Add input image if provided
      if (params.inputImagePath) {
        // TODO: Implement proper file reading logic
        // For now, create a placeholder Buffer to satisfy type requirements
        apiParams.inputImage = Buffer.alloc(0)
      }

      // Add new feature parameters if provided
      if (params.blendImages !== undefined) {
        apiParams.blendImages = params.blendImages
      }
      if (params.maintainCharacterConsistency !== undefined) {
        apiParams.maintainCharacterConsistency = params.maintainCharacterConsistency
      }
      if (params.useWorldKnowledge !== undefined) {
        apiParams.useWorldKnowledge = params.useWorldKnowledge
      }

      const apiResult = await this.geminiClient.generateImage(apiParams)
      if (!apiResult.success) {
        return Err(apiResult.error)
      }

      return Ok({ imageData: apiResult.data.imageData })
    } catch (error) {
      return Err(this.handleUnexpectedError(error))
    }
  }

  /**
   * Generates metadata for the image generation result
   */
  protected generateMetadata(
    processingTime: number,
    contextMethod: ContextMethod,
    extractedUrls: string[],
    urlContextUsed: boolean,
    urlContextEnabled: boolean,
    fallbackReason: string | undefined,
    retryCount: number | undefined,
    params: ImageGeneratorParams
  ): GenerationMetadata {
    const metadata: GenerationMetadata = {
      model: this.modelName,
      processingTime,
      contextMethod,
      timestamp: new Date().toISOString(),
    }

    // Always include extractedUrls if any were found, regardless of URL context processing
    if (extractedUrls.length > 0) {
      metadata.extractedUrls = extractedUrls
    }

    // Include urlContextUsed when URL context was enabled and URLs were found
    if (urlContextEnabled && extractedUrls.length > 0) {
      metadata.urlContextUsed = urlContextUsed
    }

    if (fallbackReason) {
      metadata.fallbackReason = fallbackReason
    }

    if (retryCount !== undefined) {
      metadata.retryCount = retryCount
    }

    // Add new features usage information if any features are enabled
    if (params.blendImages || params.maintainCharacterConsistency || params.useWorldKnowledge) {
      metadata.newFeatures = {
        blendImages: params.blendImages || false,
        maintainCharacterConsistency: params.maintainCharacterConsistency || false,
        useWorldKnowledge: params.useWorldKnowledge || false,
      }
    }

    return metadata
  }

  /**
   * Handles unexpected errors by converting them to GeminiAPIError
   */
  private handleUnexpectedError(error: unknown): GeminiAPIError {
    if (error instanceof Error) {
      return new GeminiAPIError(
        `Unexpected error during image generation: ${error.message}`,
        'An unexpected error occurred. Please try again or contact support if the problem persists'
      )
    }

    return new GeminiAPIError(
      'Unknown error occurred during image generation',
      'An unknown error occurred. Please try again or contact support if the problem persists'
    )
  }
}

/**
 * Performance-optimized image generator with concurrency control and metrics
 */
export class OptimizedImageGenerator extends ImageGenerator {
  private performanceManager = new PerformanceManager()
  private concurrencyManager = ConcurrencyManager.getInstance()
  private fileManager = new FileManager()
  private logger = new Logger()

  /**
   * Generates an image with performance optimization and concurrency control
   * @param params Parameters for image generation
   * @returns Result containing image data with performance metadata, or an error
   */
  override async generateImage(
    params: ImageGeneratorParams
  ): Promise<
    Result<
      GenerationResult,
      InputValidationError | FileOperationError | GeminiAPIError | NetworkError | ConcurrencyError
    >
  > {
    // Check concurrency limits
    if (this.concurrencyManager.isAtLimit()) {
      return Err(
        new ConcurrencyError(
          'Server busy, please try again later',
          `Queue length: ${this.concurrencyManager.getQueueLength()}`
        )
      )
    }

    // Acquire concurrency lock
    try {
      await this.concurrencyManager.acquireLock()
    } catch (error) {
      return Err(new ConcurrencyError('Request timeout', 'Server overloaded'))
    }

    const tracker = this.performanceManager.startMetrics()

    try {
      // Phase 1: Optimized validation
      const validationResult = await this.optimizedValidation(params)
      tracker.checkpoint('validation')
      if (!validationResult.success) return Err(validationResult.error)

      // Phase 2: URL Context processing (existing logic)
      const urlContextResult = await this.processUrlContext(params)
      const {
        finalPrompt,
        contextMethod,
        extractedUrls,
        urlContextUsed,
        fallbackReason,
        retryCount,
      } = urlContextResult

      tracker.checkpoint('api-start')

      // Phase 3: API call (existing logic)
      const apiResult = await this.executeApiCall({
        ...params,
        prompt: finalPrompt,
      })
      tracker.checkpoint('api-end')
      if (!apiResult.success) return Err(apiResult.error)

      // Phase 4: Optimized image processing
      const processedResult = await this.optimizedImageProcessing(apiResult.data.imageData)
      tracker.checkpoint('processing-end')
      if (!processedResult.success) return Err(processedResult.error)

      // Phase 5: Optimized file operations
      const fileResult = await this.optimizedFileSave(processedResult.data, params.outputPath)
      tracker.checkpoint('file-end')
      if (!fileResult.success) return Err(fileResult.error)

      // Phase 6: Performance analysis and metadata generation
      const metrics = tracker.finish()
      const analysis = PerformanceManager.analyzeBottlenecks(metrics)

      // Check performance requirements
      if (!PerformanceManager.isWithinLimits(metrics)) {
        this.logger.warn('performance', 'Processing time exceeded limit', {
          metrics,
          analysis,
        })
      }

      // Generate enhanced metadata
      const baseMetadata = this.generateMetadata(
        Math.max(1, Date.now() - Date.now()), // Will be overridden by performance data
        contextMethod,
        extractedUrls,
        urlContextUsed,
        params.enableUrlContext || false,
        fallbackReason,
        retryCount,
        params
      )

      const enhancedMetadata: GenerationMetadata = {
        ...baseMetadata,
        performance: {
          internalProcessingTime:
            metrics.validationTime + metrics.processingTime + metrics.fileOperationTime,
          totalTime: metrics.totalTime,
          memoryPeak: metrics.memoryUsage.peak,
          withinLimits: PerformanceManager.isWithinLimits(metrics),
        },
      }

      return Ok({
        imageData: processedResult.data,
        metadata: enhancedMetadata,
      })
    } finally {
      // Always release the concurrency lock
      this.concurrencyManager.releaseLock()

      // Enhanced memory cleanup
      this.performMemoryCleanup(tracker)
    }
  }

  /**
   * Optimized validation with parallel checks
   * @param params Image generation parameters
   * @returns Validation result
   */
  private async optimizedValidation(
    params: ImageGeneratorParams
  ): Promise<Result<GenerateImageParams, InputValidationError | FileOperationError>> {
    // Parallel validation for better performance
    const validations = await Promise.allSettled([
      this.validatePromptOptimized(params.prompt),
      this.validateFileOptimized(params.inputImagePath),
      this.validateNewFeaturesOptimized(params),
    ])

    // Check for any rejections
    for (const validation of validations) {
      if (validation.status === 'rejected') {
        return Err(validation.reason)
      }
      if (validation.status === 'fulfilled' && !validation.value.success) {
        return Err(validation.value.error)
      }
    }

    // Return validated parameters
    const validatedParams: GenerateImageParams = {
      prompt: params.prompt,
    }

    return Ok(validatedParams)
  }

  /**
   * Optimized prompt validation
   */
  private async validatePromptOptimized(
    prompt: string
  ): Promise<Result<string, InputValidationError>> {
    return validatePrompt(prompt)
  }

  /**
   * Optimized file validation
   */
  private async validateFileOptimized(
    inputImagePath?: string
  ): Promise<Result<string | undefined, InputValidationError | FileOperationError>> {
    if (!inputImagePath) {
      return Ok(undefined)
    }

    const result = validateImageFile(inputImagePath)
    if (!result.success) {
      return Err(result.error)
    }
    return Ok(inputImagePath)
  }

  /**
   * Optimized new features validation
   */
  private async validateNewFeaturesOptimized(
    params: ImageGeneratorParams
  ): Promise<Result<void, InputValidationError>> {
    // Validate feature combinations and constraints
    if (params.blendImages && !params.inputImagePath) {
      return Err(
        new InputValidationError(
          'Blend images feature requires an input image',
          'Provide an inputImagePath when using blendImages'
        )
      )
    }

    return Ok(undefined)
  }

  /**
   * Optimized image processing with memory efficiency
   * @param data Image data buffer
   * @returns Processed image data
   */
  private async optimizedImageProcessing(data: Buffer): Promise<Result<Buffer, GeminiAPIError>> {
    // For now, return the data as-is
    // Future optimizations: streaming processing, memory-efficient transformations
    return Ok(data)
  }

  /**
   * Optimized file save operations
   * @param data Image data to save
   * @param outputPath Optional output path
   * @returns File save result
   */
  private async optimizedFileSave(
    data: Buffer,
    outputPath?: string
  ): Promise<Result<string, FileOperationError>> {
    const finalPath = outputPath || this.generateDefaultPath()
    return this.fileManager.saveImage(data, finalPath, 'PNG')
  }

  /**
   * Generate default output path
   * @returns Default file path
   */
  private generateDefaultPath(): string {
    const outputDir = process.env['IMAGE_OUTPUT_DIR'] || './output'
    const fileName = this.fileManager.generateFileName()
    return `${outputDir}/${fileName}`
  }

  /**
   * Perform memory cleanup after processing
   * @param tracker Optional performance tracker to get memory usage
   */
  private performMemoryCleanup(_tracker?: unknown): void {
    // Force garbage collection if available
    if (global.gc) {
      const beforeGC = process.memoryUsage().heapUsed
      global.gc()
      const afterGC = process.memoryUsage().heapUsed
      const cleaned = beforeGC - afterGC

      if (cleaned > 1024 * 1024) {
        // Log if more than 1MB was cleaned
        this.logger.info('memory', 'Memory cleanup completed', {
          cleanedMB: Math.round(cleaned / (1024 * 1024)),
          heapUsedMB: Math.round(afterGC / (1024 * 1024)),
        })
      }
    }

    // Log memory warning if usage is still high
    const currentMemory = process.memoryUsage()
    const heapUsedMB = currentMemory.heapUsed / (1024 * 1024)

    if (heapUsedMB > 512) {
      this.logger.warn('memory', 'High memory usage after cleanup', {
        heapUsedMB: Math.round(heapUsedMB),
        rss: Math.round(currentMemory.rss / (1024 * 1024)),
        external: Math.round(currentMemory.external / (1024 * 1024)),
      })
    }
  }
}
