/**
 * Image Generator business logic
 * Orchestrates validation, API calls, and metadata generation
 */

import type { GeminiClient } from '../api/geminiClient'
import type { UrlContextClient } from '../api/urlContextClient'
import type { GenerateImageParams } from '../types/mcp'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import {
  type FileOperationError,
  GeminiAPIError,
  type InputValidationError,
  type NetworkError,
} from '../utils/errors'
import { validateImageFile, validatePrompt } from './inputValidator'
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
      InputValidationError | FileOperationError | GeminiAPIError | NetworkError
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
      params.enableUrlContext || false
    )

    return Ok({
      imageData: apiResult.data.imageData,
      metadata,
    })
  }

  /**
   * Process URL context if enabled and URLs are present
   * @param params Image generation parameters
   * @returns URL context processing result
   */
  private async processUrlContext(params: ImageGeneratorParams): Promise<{
    finalPrompt: string
    contextMethod: ContextMethod
    extractedUrls: string[]
    urlContextUsed: boolean
  }> {
    // Initialize with defaults
    let finalPrompt = params.prompt
    let contextMethod: ContextMethod = 'prompt_only'
    let extractedUrls: string[] = []
    let urlContextUsed = false

    // Only process if URL context is enabled and client is available
    if (!params.enableUrlContext || !this.urlContextClient) {
      return { finalPrompt, contextMethod, extractedUrls, urlContextUsed }
    }

    // Extract URLs from prompt
    extractedUrls = URLExtractor.extractUrls(params.prompt)

    // Only proceed if URLs were found
    if (extractedUrls.length === 0) {
      return { finalPrompt, contextMethod, extractedUrls, urlContextUsed }
    }

    try {
      // Process URLs with context API
      const contextResult = await this.urlContextClient.processUrls(extractedUrls, params.prompt)

      if (contextResult.success) {
        finalPrompt = contextResult.data.combinedPrompt
        contextMethod = 'url_context'
        urlContextUsed = true
      } else {
        // Context processing failed but URLs were extracted
        urlContextUsed = false
        // Log the error but continue with fallback
        console.warn('URL context processing failed:', contextResult.error.message)
      }
    } catch (error) {
      // Unexpected error during context processing
      urlContextUsed = false
      console.warn('Unexpected error during URL context processing:', error)
    }

    return { finalPrompt, contextMethod, extractedUrls, urlContextUsed }
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
  private async executeApiCall(
    params: ImageGeneratorParams
  ): Promise<Result<{ imageData: Buffer }, GeminiAPIError | NetworkError>> {
    try {
      const apiParams: { prompt: string; inputImage?: Buffer } = {
        prompt: params.prompt,
      }

      // Add input image if provided
      if (params.inputImagePath) {
        // TODO: Implement proper file reading logic
        // For now, create a placeholder Buffer to satisfy type requirements
        apiParams.inputImage = Buffer.alloc(0)
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
  private generateMetadata(
    processingTime: number,
    contextMethod: ContextMethod,
    extractedUrls: string[],
    urlContextUsed: boolean,
    urlContextEnabled: boolean
  ): GenerationMetadata {
    const metadata: GenerationMetadata = {
      model: this.modelName,
      processingTime,
      contextMethod,
      timestamp: new Date().toISOString(),
    }

    if (extractedUrls.length > 0) {
      metadata.extractedUrls = extractedUrls
    }

    if (urlContextEnabled && extractedUrls.length > 0) {
      metadata.urlContextUsed = urlContextUsed
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
