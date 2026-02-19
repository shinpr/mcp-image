/**
 * Gemini Text Client for text generation
 * Pure API client for interacting with Google AI Studio
 * Handles text generation without any prompt optimization logic
 */

import { GoogleGenAI } from '@google/genai'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import type { Config } from '../utils/config'
import { GeminiAPIError, NetworkError } from '../utils/errors'

/**
 * Options for text generation
 */
export interface GenerationConfig {
  temperature?: number
  maxTokens?: number
  timeout?: number
  systemInstruction?: string
  inputImage?: string // Optional base64-encoded image for multimodal context
  topP?: number
  topK?: number
}

/**
 * Interface for Gemini Text Client - pure API client
 */
export interface GeminiTextClient {
  /**
   * Generate text using Gemini API
   * @param prompt The prompt to send to the API
   * @param config Optional configuration for generation
   * @returns Result containing generated text or error
   */
  generateText(
    prompt: string,
    config?: GenerationConfig
  ): Promise<Result<string, GeminiAPIError | NetworkError>>

  /**
   * Validate connection to Gemini API
   * @returns Result indicating if connection is successful
   */
  validateConnection(): Promise<Result<boolean, GeminiAPIError | NetworkError>>
}

/**
 * Default configuration for text generation
 */
const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.7,
  maxTokens: 8192,
  timeout: 15000,
} as const

/**
 * Interface for Gemini AI client instance
 */
interface GeminiAIInstance {
  models: {
    generateContent(params: {
      model: string
      contents:
        | string
        | Array<{
            role?: string
            parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>
          }>
      config?: {
        systemInstruction?: string
        temperature?: number
        maxOutputTokens?: number
        topP?: number
        topK?: number
        thinkingConfig?: {
          thinkingBudget: number
        }
      }
    }): Promise<{
      text: string
      response?: {
        text?: () => string
        candidates?: Array<{
          content: {
            parts: Array<{ text: string }>
          }
        }>
      }
    }>
  }
}

/**
 * Implementation of Gemini Text Client - pure API client
 */
class GeminiTextClientImpl implements GeminiTextClient {
  private readonly modelName = 'gemini-2.5-flash'
  private readonly genai: GeminiAIInstance

  constructor(config: Config) {
    this.genai = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    }) as unknown as GeminiAIInstance
  }

  async generateText(
    prompt: string,
    config: GenerationConfig = {}
  ): Promise<Result<string, GeminiAPIError | NetworkError>> {
    // Merge with default configuration
    const mergedConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
    }

    // Validate input
    const validationResult = this.validatePromptInput(prompt)
    if (!validationResult.success) {
      return validationResult
    }

    try {
      // Call Gemini API
      const generatedText = await this.callGeminiAPI(prompt, mergedConfig)
      return Ok(generatedText)
    } catch (error) {
      return this.handleError(error, 'text generation')
    }
  }

  /**
   * Call Gemini API to generate text
   */
  private async callGeminiAPI(prompt: string, config: GenerationConfig): Promise<string> {
    try {
      // Generate content with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('API call timeout')), config.timeout || 15000)
      })

      // Build contents based on whether input image is provided (multimodal support)
      let contents:
        | string
        | Array<{
            role?: string
            parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>
          }>

      if (config.inputImage) {
        // Multimodal request: combine image and text
        contents = [
          {
            parts: [
              {
                inlineData: {
                  data: config.inputImage,
                  mimeType: 'image/jpeg', // Assuming JPEG for simplicity; can be enhanced later
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ]
      } else {
        // Text-only request
        contents = prompt
      }

      // Call Gemini API
      const apiCall = this.genai.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          ...(config.systemInstruction !== undefined && {
            systemInstruction: config.systemInstruction,
          }),
          temperature: config.temperature || 0.7,
          maxOutputTokens: config.maxTokens || 8192,
          topP: config.topP ?? 0.95,
          topK: config.topK ?? 40,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      })

      const response = await Promise.race([apiCall, timeoutPromise])

      // Extract text from response - handling both possible response structures
      let responseText: string
      if (typeof response.text === 'string') {
        responseText = response.text
      } else if (response.response?.text && typeof response.response.text === 'function') {
        responseText = response.response.text()
      } else if (response.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.response.candidates[0].content.parts[0].text
      } else {
        throw new Error('Unable to extract text from API response')
      }

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from Gemini API')
      }

      return responseText.trim()
    } catch (error) {
      // Re-throw with context for proper error handling
      throw new Error(
        `Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async validateConnection(): Promise<Result<boolean, GeminiAPIError | NetworkError>> {
    try {
      // Validate by checking if the models object exists
      if (!this.genai.models) {
        return Err(
          new GeminiAPIError(
            'Failed to access Gemini models',
            'Check your GEMINI_API_KEY configuration'
          )
        )
      }

      // API key validation happens during actual API calls
      return Ok(true)
    } catch (error) {
      return this.handleError(error, 'connection validation')
    }
  }

  private handleError(
    error: unknown,
    context: string
  ): Result<never, GeminiAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check for network errors
    if (this.isNetworkError(error)) {
      return Err(
        new NetworkError(
          `Network error during ${context}: ${errorMessage}`,
          'Check your internet connection and try again'
        )
      )
    }

    // Check for API errors
    if (this.isAPIError(error)) {
      return Err(
        new GeminiAPIError(
          `Failed during ${context}: ${errorMessage}`,
          this.getAPIErrorSuggestion(errorMessage)
        )
      )
    }

    // Generic error
    return Err(
      new GeminiAPIError(
        `Failed during ${context}: ${errorMessage}`,
        'Check your API configuration and try again'
      )
    )
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const networkErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
      return networkErrorCodes.some(
        (code) => error.message.includes(code) || (error as { code?: string }).code === code
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

  /**
   * Validate prompt input before processing
   */
  private validatePromptInput(prompt: string): Result<true, GeminiAPIError> {
    if (!prompt || prompt.trim().length === 0) {
      return Err(
        new GeminiAPIError(
          'Empty prompt provided',
          'Please provide a non-empty prompt for generation'
        )
      )
    }

    if (prompt.length > 100000) {
      return Err(
        new GeminiAPIError(
          'Prompt too long',
          'Please provide a shorter prompt (under 100,000 characters)'
        )
      )
    }

    return Ok(true)
  }
}

/**
 * Creates a new Gemini Text Client for prompt generation
 * @param config Configuration containing API key and settings
 * @returns Result containing the client or an error
 */
export function createGeminiTextClient(config: Config): Result<GeminiTextClient, GeminiAPIError> {
  try {
    return Ok(new GeminiTextClientImpl(config))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Err(
      new GeminiAPIError(
        `Failed to initialize Gemini Text client: ${errorMessage}`,
        'Verify your GEMINI_API_KEY is valid and the @google/genai package is properly installed'
      )
    )
  }
}
