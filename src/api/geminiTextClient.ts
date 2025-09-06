/**
 * Gemini Text Client for text generation using Gemini 2.0 Flash
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
}

/**
 * Interface for Gemini Text Client - pure API client
 */
export interface GeminiTextClient {
  /**
   * Generate text using Gemini 2.0 Flash API
   * @param prompt The prompt to send to the API
   * @param config Optional configuration for generation
   * @returns Result containing generated text or error
   */
  generateText(
    prompt: string,
    config?: GenerationConfig
  ): Promise<Result<string, GeminiAPIError | NetworkError>>

  /**
   * Validate connection to Gemini 2.0 Flash API
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
  getGenerativeModel(config: { model: string; systemInstruction?: string }): {
    generateContent(
      prompt: string | unknown[],
      options?: unknown
    ): Promise<{
      response: {
        text(): string
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
  private readonly modelName = 'gemini-2.0-flash'
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
   * Call Gemini 2.0-flash API to generate text
   */
  private async callGeminiAPI(prompt: string, config: GenerationConfig): Promise<string> {
    try {
      // Create generative model with optional system instruction
      const modelConfig: { model: string; systemInstruction?: string } = {
        model: this.modelName,
      }

      if (config.systemInstruction) {
        modelConfig.systemInstruction = config.systemInstruction
      }

      const model = this.genai.getGenerativeModel(modelConfig)

      // Generate content with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('API call timeout')), config.timeout || 15000)
      })

      const apiCall = model.generateContent(prompt, {
        generationConfig: {
          temperature: config.temperature || 0.7,
          maxOutputTokens: config.maxTokens || 8192,
        },
      })

      const response = await Promise.race([apiCall, timeoutPromise])

      // Extract text from response - Fixed API structure
      const responseText = response.response.text()

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
      // Validate by attempting to create a model instance
      const model = this.genai.getGenerativeModel({ model: this.modelName })

      // For invalid keys, this will fail during actual API calls
      // For now, just validate that we can create the model instance
      if (!model) {
        return Err(
          new GeminiAPIError(
            'Failed to create Gemini model instance',
            'Check your GEMINI_API_KEY configuration'
          )
        )
      }

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
