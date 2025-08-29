/**
 * Gemini API client for image generation
 * Integrates with Google's Gemini AI API using the official SDK
 * Supports automatic URL Context processing and feature parameters
 */

import { GoogleGenAI } from '@google/genai'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import type { Config } from '../utils/config'
import { GeminiAPIError, NetworkError } from '../utils/errors'

/**
 * URL pattern for automatic URL detection
 */
const URL_PATTERN = /https?:\/\/(?:[-\w.])+(?:\.[a-zA-Z]{2,})+(?:\/[-\w._~:\/?#[\]@!$&'()*+,;=]*)?/g

/**
 * Basic types for Gemini API responses
 */
interface ContentPart {
  inlineData?: {
    data: string
    mimeType: string
  }
}

interface ResponseContent {
  parts?: ContentPart[]
}

interface ResponseCandidate {
  content?: ResponseContent
}

interface GeminiResponse {
  response: {
    candidates?: ResponseCandidate[]
  }
}

interface GeminiClientInstance {
  models: {
    generateContent(request: {
      model: string
      prompt?: string
      systemInstruction?: string
      config?: {
        [key: string]: unknown
      }
      contents?: unknown[]
    }): Promise<GeminiResponse>
  }
}

interface ErrorWithCode extends Error {
  code?: string
}

/**
 * Metadata for generated images
 */
export interface GeminiGenerationMetadata {
  model: string
  prompt: string
  mimeType: string
  timestamp: Date
  inputImageProvided: boolean
  contextMethod: string
  /** Features usage metadata */
  features?: {
    blendImages: boolean
    maintainCharacterConsistency: boolean
    useWorldKnowledge: boolean
  }
}

/**
 * Parameters for Gemini API image generation (with processed data)
 */
export interface GeminiApiParams {
  prompt: string
  inputImage?: Buffer
  blendImages?: boolean
  maintainCharacterConsistency?: boolean
  useWorldKnowledge?: boolean
}

/**
 * Result of image generation
 */
export interface GeneratedImageResult {
  imageData: Buffer
  metadata: GeminiGenerationMetadata
}

/**
 * Gemini API client interface
 */
export interface GeminiClient {
  generateImage(
    params: GeminiApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | NetworkError>>
}

/**
 * Implementation of Gemini API client
 */
class GeminiClientImpl implements GeminiClient {
  private readonly modelName = 'gemini-2.5-flash-image-preview'

  constructor(private readonly genai: GeminiClientInstance) {}

  async generateImage(
    params: GeminiApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | NetworkError>> {
    try {
      // Enhance prompt with structured parameters for better accuracy
      let enhancedPrompt = params.prompt

      // Convert MCP parameters to structured prompt instructions
      if (params.maintainCharacterConsistency) {
        enhancedPrompt +=
          ' [INSTRUCTION: Maintain exact character appearance, including facial features, hairstyle, clothing, and all physical characteristics consistent throughout the image]'
      }

      if (params.blendImages) {
        enhancedPrompt +=
          ' [INSTRUCTION: Seamlessly blend multiple visual elements into a natural, cohesive composition with smooth transitions]'
      }

      if (params.useWorldKnowledge) {
        enhancedPrompt +=
          ' [INSTRUCTION: Apply accurate real-world knowledge including historical facts, geographical accuracy, cultural contexts, and realistic depictions]'
      }

      // Prepare the request content with enhanced prompt
      const requestContent: unknown[] = [enhancedPrompt]

      // Add input image if provided
      if (params.inputImage) {
        requestContent.push({
          inlineData: {
            data: params.inputImage.toString('base64'),
            mimeType: 'image/jpeg', // Assume JPEG for input images
          },
        })
      }

      // Prepare API configuration
      const config: {
        [key: string]: unknown
      } = {}

      // URL detection is maintained for potential future use
      // Note: urlContext tool has been removed as it's not supported by the model
      this.detectUrls(params.prompt)

      // Note: Feature parameters are now handled via prompt enhancement
      // The Gemini API does not directly support these as config parameters

      // Generate content using Gemini API with official URL Context support
      const response = await this.genai.models.generateContent({
        model: this.modelName,
        contents: requestContent,
        config,
      })

      // Extract image data from response
      if (!response || typeof response !== 'object') {
        return Err(
          new GeminiAPIError(
            'Invalid response from Gemini API',
            'The API returned an unexpected response format'
          )
        )
      }

      // Handle different response structures
      const candidates =
        response.response?.candidates ||
        (response as unknown as { candidates?: unknown[] }).candidates
      if (!candidates || candidates.length === 0) {
        return Err(
          new GeminiAPIError(
            'No image generated by Gemini API',
            'Try rephrasing your prompt or check if the model supports your request type'
          )
        )
      }

      const candidate = candidates[0]
      if (!candidate) {
        return Err(
          new GeminiAPIError(
            'No candidate found in Gemini API response',
            'The API response was malformed. Try again or contact support if the issue persists'
          )
        )
      }
      const parts = (candidate as unknown as { content?: { parts?: unknown[] } }).content?.parts
      if (!parts || parts.length === 0) {
        return Err(
          new GeminiAPIError(
            'No image data in response from Gemini API',
            'The API response was malformed. Try again or contact support if the issue persists'
          )
        )
      }

      // Find the image part with proper type guards
      const imagePart = parts.find((part: unknown) => {
        const p = part as { inlineData?: { data: string; mimeType: string } }
        return p.inlineData?.data
      }) as { inlineData?: { data: string; mimeType: string } } | undefined

      if (!imagePart?.inlineData) {
        return Err(
          new GeminiAPIError(
            'No image data found in Gemini API response',
            'The model may not have generated an image. Try a different prompt'
          )
        )
      }

      // Convert base64 image data to Buffer
      const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
      const mimeType = imagePart.inlineData.mimeType || 'image/png'

      // Create metadata with features information
      const metadata: GeminiGenerationMetadata = {
        model: this.modelName,
        prompt: params.prompt, // Original prompt, not enhanced
        mimeType,
        timestamp: new Date(),
        inputImageProvided: !!params.inputImage,
        contextMethod: 'prompt_only',
      }

      // Add features usage information if any features are specified (including false)
      if (
        params.blendImages !== undefined ||
        params.maintainCharacterConsistency !== undefined ||
        params.useWorldKnowledge !== undefined
      ) {
        metadata.features = {
          blendImages: params.blendImages || false,
          maintainCharacterConsistency: params.maintainCharacterConsistency || false,
          useWorldKnowledge: params.useWorldKnowledge || false,
        }
      }

      return Ok({
        imageData: imageBuffer,
        metadata,
      })
    } catch (error) {
      return this.handleError(error, params.prompt)
    }
  }

  private handleError(
    error: unknown,
    prompt: string
  ): Result<never, GeminiAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check if it's a network error
    if (this.isNetworkError(error)) {
      return Err(
        new NetworkError(
          `Network error during image generation: ${errorMessage}`,
          'Check your internet connection and try again',
          error instanceof Error ? error : undefined
        )
      )
    }

    // Check if it's an API-specific error
    if (this.isAPIError(error)) {
      return Err(
        new GeminiAPIError(
          `Failed to generate image: ${errorMessage}`,
          this.getAPIErrorSuggestion(errorMessage),
          this.extractStatusCode(error)
        )
      )
    }

    // Generic API error
    return Err(
      new GeminiAPIError(
        `Failed to generate image with prompt "${prompt}": ${errorMessage}`,
        'Check your API key, quota, and prompt validity. Try again with a different prompt'
      )
    )
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const networkErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
      return networkErrorCodes.some(
        (code) => error.message.includes(code) || (error as ErrorWithCode).code === code
      )
    }
    return false
  }

  private isAPIError(error: unknown): boolean {
    if (error instanceof Error) {
      const apiErrorKeywords = ['quota', 'rate limit', 'unauthorized', 'forbidden', 'api key']
      return apiErrorKeywords.some((keyword) => error.message.toLowerCase().includes(keyword))
    }
    return false
  }

  private getAPIErrorSuggestion(errorMessage: string): string {
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit')) {
      return 'You have exceeded your API quota or rate limit. Wait before making more requests or upgrade your plan'
    }

    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('api key')) {
      return 'Check that your GEMINI_API_KEY is valid and has the necessary permissions'
    }

    if (lowerMessage.includes('forbidden')) {
      return 'Your API key does not have permission for this operation'
    }

    return 'Check your API configuration and try again'
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'status' in error) {
      return typeof error.status === 'number' ? error.status : undefined
    }
    return undefined
  }

  /**
   * Detect URLs in prompt for automatic URL Context activation
   * @param prompt The prompt text to analyze
   * @returns True if URLs are detected, false otherwise
   */
  private detectUrls(prompt: string): boolean {
    return URL_PATTERN.test(prompt)
  }
}

/**
 * Creates a new Gemini API client
 * @param config Configuration containing API key and other settings
 * @returns Result containing the client or an error
 */
export function createGeminiClient(config: Config): Result<GeminiClient, GeminiAPIError> {
  try {
    const genai = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    }) as unknown as GeminiClientInstance
    return Ok(new GeminiClientImpl(genai))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Err(
      new GeminiAPIError(
        `Failed to initialize Gemini client: ${errorMessage}`,
        'Verify your GEMINI_API_KEY is valid and the @google/genai package is properly installed'
      )
    )
  }
}
