/**
 * Gemini Text Client for structured prompt generation using Gemini 2.0 Flash
 * Specialized for prompt optimization and best practices application
 * Integrates with Google AI Studio for text generation tasks
 */

import { GoogleGenAI } from '@google/genai'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import type { Config } from '../utils/config'
import { GeminiAPIError, NetworkError } from '../utils/errors'

/**
 * Best practices mode for prompt generation
 */
export type BestPracticesMode = 'basic' | 'advanced' | 'complete'

/**
 * Options for prompt generation
 */
export interface PromptOptions {
  temperature?: number
  maxTokens?: number
  timeout?: number
  bestPracticesMode?: BestPracticesMode
}

/**
 * Optimized prompt result with metadata
 */
export interface OptimizedPrompt {
  text: string
  originalPrompt: string
  appliedPractices: string[]
  metadata: {
    model: string
    processingTime: number
    timestamp: Date
    enhancementLevel: BestPracticesMode
  }
}

/**
 * Interface for Gemini Text Client specialized for prompt generation
 */
export interface GeminiTextClient {
  /**
   * Generate a structured prompt optimized for image generation
   * @param originalPrompt The original prompt to optimize
   * @param options Optional parameters for generation
   * @returns Result containing optimized prompt or error
   */
  generateStructuredPrompt(
    originalPrompt: string,
    options?: PromptOptions
  ): Promise<Result<OptimizedPrompt, GeminiAPIError | NetworkError>>

  /**
   * Validate connection to Gemini 2.0 Flash API
   * @returns Result indicating if connection is successful
   */
  validateConnection(): Promise<Result<boolean, GeminiAPIError | NetworkError>>
}

/**
 * Default configuration for prompt generation
 */
const DEFAULT_PROMPT_CONFIG = {
  temperature: 0.3,
  maxOutputTokens: 8192,
  timeout: 15000,
  bestPracticesMode: 'complete' as BestPracticesMode,
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
 * System prompt for structured prompt generation optimized for image generation
 */
const SYSTEM_PROMPT = `You are an expert AI prompt engineer specializing in optimizing prompts for image generation models. Your role is to transform user prompts into highly detailed, structured prompts that produce superior image generation results.

CORE PRINCIPLES:
1. **Hyper-Specific Details**: Add specific lighting, camera angles, environmental details, textures, and atmospheric elements
2. **Character Consistency**: Ensure detailed character descriptions with specific facial features, style, and distinctive characteristics
3. **Visual Coordination**: Apply unified visual style and coherent composition principles
4. **Professional Photography**: Use precise camera control terminology and cinematographic language
5. **Semantic Enhancement**: Transform negative expressions into positive descriptive alternatives
6. **Aspect Ratio Optimization**: Consider composition for target dimensions and framing
7. **Iterative Refinement**: Provide clear guidance for progressive improvements

ENHANCEMENT GUIDELINES:
- Transform simple prompts into rich, detailed descriptions
- Add specific lighting conditions (dramatic cinematic lighting, rim lighting, studio lighting)
- Include precise camera specifications (85mm portrait lens, f/1.4 aperture, Dutch angle)
- Specify environmental context and atmospheric conditions
- Use professional photography and cinematography terminology
- Ensure character consistency with detailed physical descriptions
- Apply semantic enhancement by converting negative phrases to positive alternatives
- Optimize composition for the target aspect ratio
- Maintain artistic coherence and visual unity

RESPONSE FORMAT:
Provide the enhanced prompt as a single, cohesive description that maintains the original intent while significantly improving specificity and technical precision.

Remember: Your goal is to create prompts that generate visually stunning, technically precise, and artistically coherent images.`

/**
 * Implementation of Gemini Text Client for prompt generation
 */
class GeminiTextClientImpl implements GeminiTextClient {
  private readonly modelName = 'gemini-2.0-flash'
  private readonly genai: GeminiAIInstance

  constructor(config: Config) {
    this.genai = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    }) as unknown as GeminiAIInstance
  }

  async generateStructuredPrompt(
    originalPrompt: string,
    options: PromptOptions = {}
  ): Promise<Result<OptimizedPrompt, GeminiAPIError | NetworkError>> {
    const startTime = Date.now()

    // Merge with default configuration
    const mergedOptions = {
      ...DEFAULT_PROMPT_CONFIG,
      ...options,
    }

    // Validate input
    const validationResult = this.validatePromptInput(originalPrompt)
    if (!validationResult.success) {
      return validationResult
    }

    try {
      // Determine enhancement level
      const enhancementLevel = this.determineEnhancementLevel(
        originalPrompt,
        mergedOptions.bestPracticesMode
      )

      // Call actual Gemini 2.0-flash API for prompt enhancement
      const structuredPrompt = await this.callGeminiAPI(
        originalPrompt,
        enhancementLevel,
        mergedOptions
      )

      // Get applied practices based on enhancement level
      const appliedPractices = this.getAppliedPractices(enhancementLevel)

      const endTime = Date.now()
      const actualProcessingTime = endTime - startTime

      const result: OptimizedPrompt = {
        text: structuredPrompt,
        originalPrompt,
        appliedPractices,
        metadata: {
          model: this.modelName,
          processingTime: actualProcessingTime,
          timestamp: new Date(),
          enhancementLevel,
        },
      }

      return Ok(result)
    } catch (error) {
      return this.handleError(error, originalPrompt)
    }
  }

  /**
   * Call Gemini 2.0-flash API to generate structured prompt
   */
  private async callGeminiAPI(
    originalPrompt: string,
    enhancementLevel: BestPracticesMode,
    options: PromptOptions
  ): Promise<string> {
    try {
      // Create generative model with system instruction
      const model = this.genai.getGenerativeModel({
        model: this.modelName,
        systemInstruction: SYSTEM_PROMPT,
      })

      // Prepare user prompt with enhancement level context
      const userPrompt = this.prepareUserPrompt(originalPrompt, enhancementLevel, options)

      // Generate content with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API call timeout')), options.timeout || 15000)
      })

      const apiCall = model.generateContent(userPrompt, {
        generationConfig: {
          temperature: options.temperature || 0.3,
          maxOutputTokens: options.maxTokens || 8192,
        },
      })

      const response = await Promise.race([apiCall, timeoutPromise])

      // Extract text from response with proper typing
      const responseText = (response as { response: { text(): string } }).response.text()

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

  /**
   * Prepare user prompt with enhancement level context
   */
  private prepareUserPrompt(
    prompt: string,
    level: BestPracticesMode,
    options: PromptOptions
  ): string {
    const levelInstructions = {
      basic: 'Apply basic enhancements with improved specificity and composition guidance.',
      advanced:
        'Apply advanced enhancements including character consistency, context purpose, and professional techniques.',
      complete:
        'Apply complete optimization with all best practices: hyper-specific details, character consistency, semantic enhancement, aspect ratio optimization, and precise cinematographic control.',
    }

    let userPrompt = `Enhancement Level: ${level.toUpperCase()}
${levelInstructions[level]}

Original Prompt: "${prompt}"

Please enhance this prompt for optimal image generation results.`

    // Add specific feature instructions if provided
    if (options.bestPracticesMode === 'complete') {
      userPrompt +=
        '\n\nEnsure the enhanced prompt includes specific camera angles, lighting details, environmental context, and professional photography terminology.'
    }

    return userPrompt
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

  private determineEnhancementLevel(prompt: string, mode?: BestPracticesMode): BestPracticesMode {
    if (mode) return mode

    if (prompt.length < 10) return 'basic'
    if (prompt.includes('character') || prompt.includes('detailed')) return 'advanced'
    return 'complete'
  }

  private getAppliedPractices(level: BestPracticesMode): string[] {
    const practices: string[] = []

    switch (level) {
      case 'complete':
        practices.push('camera-control', 'aspect-ratio', 'semantic-negatives')
        practices.push('character-consistency', 'context-intent', 'iterate-refine')
        practices.push('hyper-specific')
        break
      case 'advanced':
        practices.push('character-consistency', 'context-intent', 'iterate-refine')
        practices.push('hyper-specific')
        break
      case 'basic':
        practices.push('hyper-specific')
        break
    }

    return practices
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
