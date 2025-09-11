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
 * Gemini API response types with safety and blocking information
 */

// Enums for Gemini API response statuses
type FinishReason =
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'LANGUAGE'
  | 'IMAGE_SAFETY'
  | 'MALFORMED_FUNCTION_CALL'
  | 'OTHER'

type BlockReason =
  | 'BLOCKED_REASON_UNSPECIFIED'
  | 'SAFETY'
  | 'OTHER'
  | 'BLOCKLIST'
  | 'PROHIBITED_CONTENT'
  | 'IMAGE_SAFETY'

type HarmCategory =
  | 'HARM_CATEGORY_UNSPECIFIED'
  | 'HARM_CATEGORY_DEROGATORY'
  | 'HARM_CATEGORY_TOXICITY'
  | 'HARM_CATEGORY_VIOLENCE'
  | 'HARM_CATEGORY_SEXUAL'
  | 'HARM_CATEGORY_MEDICAL'
  | 'HARM_CATEGORY_DANGEROUS'
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'

interface SafetyRating {
  category: HarmCategory
  probability: string
  blocked?: boolean
}

interface ContentPart {
  inlineData?: {
    data: string
    mimeType: string
  }
  text?: string
}

interface ResponseContent {
  parts?: ContentPart[]
}

interface PromptFeedback {
  blockReason?: BlockReason
  blockReasonMessage?: string
  safetyRatings?: SafetyRating[]
}

interface ResponseCandidate {
  content?: ResponseContent
  finishReason?: FinishReason
  safetyRatings?: SafetyRating[]
}

interface GeminiResponse {
  response: {
    candidates?: ResponseCandidate[]
    promptFeedback?: PromptFeedback
  }
}

interface GeminiClientInstance {
  models: {
    generateContent(params: {
      model: string
      contents: unknown[] | string
      systemInstruction?: string
      generationConfig?: {
        [key: string]: unknown
      }
    }): Promise<unknown> // Response is unknown, we'll validate with type guards
  }
}

/**
 * Type guards for safe type checking
 */
function isGeminiResponse(obj: unknown): obj is GeminiResponse {
  if (!obj || typeof obj !== 'object') return false
  const candidate = obj as Record<string, unknown>
  return (
    'response' in candidate &&
    candidate['response'] !== null &&
    typeof candidate['response'] === 'object'
  )
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
}

/**
 * Parameters for Gemini API image generation
 */
export interface GeminiApiParams {
  prompt: string
  inputImage?: string
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
      // Prepare the request content with proper structure for multimodal input
      const requestContent: unknown[] = []

      // Structure the contents properly for image generation/editing
      if (params.inputImage) {
        // For image editing: provide image first, then text instructions
        requestContent.push({
          parts: [
            {
              inlineData: {
                data: params.inputImage,
                mimeType: 'image/jpeg', // TODO: Dynamic MIME type support
              },
            },
            {
              text: params.prompt,
            },
          ],
        })
      } else {
        // For text-to-image: provide only text prompt
        requestContent.push({
          parts: [
            {
              text: params.prompt,
            },
          ],
        })
      }

      // Generate content using Gemini API (@google/genai v1.17.0+)
      const rawResponse = await this.genai.models.generateContent({
        model: this.modelName,
        contents: requestContent,
      })

      // Validate response structure with type guard
      if (!isGeminiResponse(rawResponse)) {
        return Err(
          new GeminiAPIError(
            'Invalid response structure from Gemini API',
            'The API returned an unexpected response format',
            { responseType: typeof rawResponse }
          )
        )
      }

      const response = rawResponse as GeminiResponse

      // Check for prompt feedback (content filtering before generation)
      const promptFeedback = response.response?.promptFeedback
      if (promptFeedback?.blockReason) {
        const blockReason = promptFeedback.blockReason
        const blockMessage = this.getBlockReasonMessage(blockReason)
        const safetyDetails = this.formatSafetyRatings(promptFeedback.safetyRatings)

        return Err(
          new GeminiAPIError(
            `Image generation blocked: ${promptFeedback.blockReasonMessage || blockMessage}`,
            {
              blockReason: blockReason,
              safetyRatings: safetyDetails,
              stage: 'prompt_analysis',
              suggestion: this.getBlockReasonSuggestion(blockReason),
            }
          )
        )
      }

      // Check for candidates
      const candidates = response.response?.candidates
      if (!candidates || candidates.length === 0) {
        // No candidates usually means the prompt was blocked
        return Err(
          new GeminiAPIError('No image generated: Content may have been filtered', {
            stage: 'generation',
            candidatesCount: 0,
            suggestion: 'Try rephrasing your prompt to avoid potentially sensitive content',
          })
        )
      }

      const candidate = candidates[0]
      if (!candidate) {
        return Err(
          new GeminiAPIError('No valid candidate in response', {
            stage: 'candidate_extraction',
            suggestion: 'The API response was incomplete. Please try again',
          })
        )
      }

      // Check finish reason for generation issues
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        const finishMessage = this.getFinishReasonMessage(candidate.finishReason)
        const finishSuggestion = this.getFinishReasonSuggestion(candidate.finishReason)
        const safetyDetails = this.formatSafetyRatings(candidate.safetyRatings)

        return Err(
          new GeminiAPIError(`Image generation stopped: ${finishMessage}`, {
            finishReason: candidate.finishReason,
            safetyRatings: safetyDetails,
            stage: 'generation_stopped',
            suggestion: finishSuggestion,
          })
        )
      }
      const parts = candidate.content?.parts
      if (!parts || parts.length === 0) {
        return Err(
          new GeminiAPIError('No content parts in response', {
            stage: 'content_extraction',
            suggestion: 'The generation was incomplete. Please try again',
          })
        )
      }

      // Find the image part
      const imagePart = parts.find((part) => part.inlineData?.data)

      if (!imagePart?.inlineData) {
        // Check if there are text parts (might indicate an error message)
        const textParts = parts.filter((part) => part.text).map((part) => part.text)
        const errorContext =
          textParts.length > 0
            ? { textResponse: textParts.join(' '), stage: 'image_extraction' }
            : { stage: 'image_extraction' }

        return Err(
          new GeminiAPIError('No image data in response', {
            ...errorContext,
            suggestion:
              'The model returned text instead of an image. Try a more specific image generation prompt',
          })
        )
      }

      // Convert base64 image data to Buffer
      const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
      const mimeType = imagePart.inlineData.mimeType || 'image/png'

      // Create simplified metadata
      const metadata: GeminiGenerationMetadata = {
        model: this.modelName,
        prompt: params.prompt,
        mimeType,
        timestamp: new Date(),
        inputImageProvided: !!params.inputImage,
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

  private getBlockReasonMessage(blockReason: BlockReason): string {
    switch (blockReason) {
      case 'SAFETY':
        return 'Content was blocked due to safety concerns'
      case 'PROHIBITED_CONTENT':
        return 'The prompt contains prohibited content'
      case 'IMAGE_SAFETY':
        return 'Image generation blocked for safety reasons'
      case 'BLOCKLIST':
        return 'Content contains blocked terms'
      case 'OTHER':
        return 'Content was blocked for other reasons'
      default:
        return 'Content was blocked'
    }
  }

  private getBlockReasonSuggestion(blockReason: BlockReason): string {
    switch (blockReason) {
      case 'SAFETY':
      case 'IMAGE_SAFETY':
        return 'Rephrase your prompt to avoid potentially harmful or sensitive content'
      case 'PROHIBITED_CONTENT':
        return 'Remove any prohibited content from your prompt and try again'
      case 'BLOCKLIST':
        return 'Avoid using specific terms that may be restricted'
      case 'OTHER':
        return 'Try a different prompt or contact support if the issue persists'
      default:
        return 'Modify your prompt and try again'
    }
  }

  private getFinishReasonMessage(finishReason: FinishReason): string {
    switch (finishReason) {
      case 'SAFETY':
        return 'Generation stopped due to safety concerns'
      case 'IMAGE_SAFETY':
        return 'Image generation stopped for safety reasons'
      case 'MAX_TOKENS':
        return 'Maximum token limit reached'
      case 'RECITATION':
        return 'Generation stopped to prevent recitation'
      case 'LANGUAGE':
        return 'Unsupported language detected'
      case 'MALFORMED_FUNCTION_CALL':
        return 'Invalid function call detected'
      case 'OTHER':
        return 'Generation stopped for other reasons'
      default:
        return 'Generation stopped unexpectedly'
    }
  }

  private getFinishReasonSuggestion(finishReason: FinishReason): string {
    switch (finishReason) {
      case 'SAFETY':
      case 'IMAGE_SAFETY':
        return 'Modify your prompt to avoid content that may violate safety guidelines'
      case 'MAX_TOKENS':
        return 'Try a shorter or simpler prompt'
      case 'RECITATION':
        return 'Avoid requesting copyrighted or memorized content'
      case 'LANGUAGE':
        return 'Use a supported language (English recommended for best results)'
      case 'MALFORMED_FUNCTION_CALL':
        return 'Check your prompt format and try again'
      case 'OTHER':
        return 'Try rephrasing your prompt or contact support'
      default:
        return 'Please try again with a different prompt'
    }
  }

  private formatSafetyRatings(ratings?: SafetyRating[]): string | undefined {
    if (!ratings || ratings.length === 0) return undefined

    const blockedRatings = ratings.filter((r) => r.blocked)
    if (blockedRatings.length === 0) {
      return ratings
        .map((r) => `${this.formatHarmCategory(r.category)}: ${r.probability}`)
        .join(', ')
    }

    return blockedRatings.map((r) => `${this.formatHarmCategory(r.category)} (BLOCKED)`).join(', ')
  }

  private formatHarmCategory(category: HarmCategory): string {
    const categoryMap: Record<HarmCategory, string> = {
      HARM_CATEGORY_UNSPECIFIED: 'Unspecified',
      HARM_CATEGORY_DEROGATORY: 'Derogatory',
      HARM_CATEGORY_TOXICITY: 'Toxicity',
      HARM_CATEGORY_VIOLENCE: 'Violence',
      HARM_CATEGORY_SEXUAL: 'Sexual',
      HARM_CATEGORY_MEDICAL: 'Medical',
      HARM_CATEGORY_DANGEROUS: 'Dangerous',
      HARM_CATEGORY_HARASSMENT: 'Harassment',
      HARM_CATEGORY_HATE_SPEECH: 'Hate Speech',
      HARM_CATEGORY_SEXUALLY_EXPLICIT: 'Sexually Explicit',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'Dangerous Content',
    }
    return categoryMap[category] || category
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
