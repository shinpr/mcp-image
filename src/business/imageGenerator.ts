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
import { validateBase64Image, validatePrompt } from './inputValidator'

/**
 * Metadata for generated images in the business layer
 */
export interface GenerationMetadata {
  model: 'gemini-2.5-flash-image-preview'
  processingTime: number // milliseconds
  contextMethod: string // URL context detection method used
  timestamp: string
  /** URLs extracted from the prompt (undefined if none) */
  extractedUrls?: string[]
  /** Feature usage metadata */
  features?: {
    blendImages: boolean
    maintainCharacterConsistency: boolean
    useWorldKnowledge: boolean
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
  /** Base64 encoded image data for editing (optional) */
  inputImage?: string
  /** MIME type of the input image */
  inputImageMimeType?: string
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

  constructor(private readonly geminiClient: GeminiClient) {}

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
    const validatedParams = validationResult.data

    // Step 2: Execute API call (URL Context is handled automatically by GeminiClient)
    const apiResult = await this.executeApiCall(params)
    if (!apiResult.success) {
      return Err(apiResult.error)
    }

    // Step 3: Generate metadata and return result
    const processingTime = Math.max(1, Date.now() - startTime)
    const metadata = this.generateMetadata(processingTime, validatedParams)

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
    // Validate prompt
    const promptResult = validatePrompt(params.prompt)
    if (!promptResult.success) {
      return Err(promptResult.error)
    }

    // Validate input image if provided
    if (params.inputImage) {
      const imageResult = validateBase64Image(params.inputImage, params.inputImageMimeType)
      if (!imageResult.success) {
        return Err(imageResult.error)
      }
    }

    // Return validated parameters in GenerateImageParams format
    const validatedParams: GenerateImageParams = {
      prompt: promptResult.data,
      ...(params.inputImage && { inputImage: params.inputImage }),
      ...(params.inputImageMimeType && { inputImageMimeType: params.inputImageMimeType }),
      ...(params.blendImages !== undefined && { blendImages: params.blendImages }),
      ...(params.maintainCharacterConsistency !== undefined && {
        maintainCharacterConsistency: params.maintainCharacterConsistency,
      }),
      ...(params.useWorldKnowledge !== undefined && {
        useWorldKnowledge: params.useWorldKnowledge,
      }),
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
      if (params.inputImage) {
        // Decode base64 image to Buffer
        const cleanedData = params.inputImage.replace(/^data:image\/[a-z]+;base64,/, '')
        apiParams.inputImage = Buffer.from(cleanedData, 'base64')
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
    params: GenerateImageParams
  ): GenerationMetadata {
    // Extract URLs from prompt for metadata tracking
    const URL_PATTERN =
      /https?:\/\/(?:[-\w.])+(?:\.[a-zA-Z]{2,})+(?:\/[-\w._~:\/?#[\]@!$&'()*+,;=]*)?/g
    const extractedUrls = params.prompt.match(URL_PATTERN)

    const metadata: GenerationMetadata = {
      model: this.modelName,
      processingTime,
      contextMethod: extractedUrls && extractedUrls.length > 0 ? 'url_context' : 'prompt_only',
      timestamp: new Date().toISOString(),
    }

    if (extractedUrls && extractedUrls.length > 0) {
      metadata.extractedUrls = [...new Set(extractedUrls)] // Remove duplicates
    }

    // Add features usage information if any features are enabled
    if (params.blendImages || params.maintainCharacterConsistency || params.useWorldKnowledge) {
      metadata.features = {
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
