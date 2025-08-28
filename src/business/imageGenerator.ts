/**
 * Image Generator business logic
 * Orchestrates validation, API calls, and metadata generation
 */

import type { GeminiClient } from '../api/geminiClient'
import type { GenerateImageParams } from '../types/mcp'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import {
  type FileOperationError,
  GeminiAPIError,
  type InputValidationError,
  type NetworkError,
} from '../utils/errors'
import { validateGenerateImageParams } from './inputValidator'

/**
 * Metadata for generated images in the business layer
 */
export interface GenerationMetadata {
  model: 'gemini-2.5-flash-image-preview'
  processingTime: number // milliseconds
  contextMethod: 'prompt_only' | 'url_context' // Phase 2 will add url_context
  timestamp: string
  // Phase 2 extensions: extractedUrls?, urlContextUsed?
  // Phase 3 extensions: other metadata
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
  // Phase 2 will add URL context support
}

/**
 * Core image generation business logic class
 * Handles the complete flow: validation -> API call -> metadata generation
 */
export class ImageGenerator {
  private readonly modelName = 'gemini-2.5-flash-image-preview' as const

  constructor(private readonly geminiClient: GeminiClient) {}

  /**
   * Generates an image from a text prompt
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

    // Step 2: Execute API call with error handling
    const apiResult = await this.executeApiCall(params)
    if (!apiResult.success) {
      return Err(apiResult.error)
    }

    // Step 3: Generate metadata and return result
    const processingTime = Date.now() - startTime
    const metadata = this.generateMetadata(processingTime)

    return Ok({
      imageData: apiResult.data.imageData,
      metadata,
    })
  }

  /**
   * Validates input parameters using the validation module
   */
  private validateInput(
    params: ImageGeneratorParams
  ): Result<GenerateImageParams, InputValidationError | FileOperationError> {
    const validationParams: GenerateImageParams = {
      prompt: params.prompt,
    }
    const result = validateGenerateImageParams(validationParams)
    return result
  }

  /**
   * Executes the Gemini API call with proper error handling
   */
  private async executeApiCall(
    params: ImageGeneratorParams
  ): Promise<Result<{ imageData: Buffer }, GeminiAPIError | NetworkError>> {
    try {
      const apiParams = {
        prompt: params.prompt,
        // Phase 1: prompt-only generation (no input image)
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
  private generateMetadata(processingTime: number): GenerationMetadata {
    return {
      model: this.modelName,
      processingTime,
      contextMethod: 'prompt_only', // Phase 1 only supports prompt-only generation
      timestamp: new Date().toISOString(),
    }
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
