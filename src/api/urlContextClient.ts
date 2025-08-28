/**
 * URL Context API client for processing URLs and extracting context
 * Uses @google/genai SDK for URL context processing
 */

import { URLExtractor } from '../business/urlExtractor'
import { Err, Ok, type Result } from '../types/result'
import { NetworkError, URLContextError } from '../utils/errors'

/**
 * Response from URL context processing
 */
export interface UrlContextResponse {
  /** Context content extracted from URLs */
  contextContent: string
  /** Combined prompt with context and cleaned original prompt */
  combinedPrompt: string
  /** Additional extracted information */
  extractedInfo: Record<string, unknown>
  /** Success flag */
  success: boolean
}

/**
 * Mock interface for text generation (to be replaced with real implementation later)
 */
interface TextGenerationClient {
  generateText(prompt: string): Promise<Result<{ text: string }, Error>>
}

/**
 * Client for processing URLs and extracting context
 * Basic implementation for Phase 2 - will be enhanced in later phases
 */
export class UrlContextClient {
  /**
   * Maximum number of URLs to process (performance consideration)
   */
  private static readonly MAX_URLS = 10

  /**
   * Maximum number of retry attempts
   */
  private readonly MAX_RETRIES = 2

  /**
   * Timeout for URL context processing in milliseconds
   */
  private readonly TIMEOUT_MS = 15000

  constructor(private textClient: TextGenerationClient) {}

  /**
   * Process multiple URLs and extract context for image generation
   * @param urls Array of URLs to process
   * @param originalPrompt Original prompt containing URLs
   * @returns Result containing URL context response with combined prompt or error
   */
  async processUrls(
    urls: string[],
    originalPrompt: string
  ): Promise<Result<UrlContextResponse, URLContextError | NetworkError>> {
    try {
      // Handle empty URL array
      if (urls.length === 0) {
        return Ok({
          contextContent: '',
          combinedPrompt: `Generate image: ${originalPrompt}`,
          extractedInfo: {},
          success: true,
        })
      }

      // Limit URLs to maximum allowed
      const limitedUrls = urls.slice(0, UrlContextClient.MAX_URLS)

      // Use retry mechanism with timeout
      const result = await this.processUrlsWithRetry(limitedUrls, originalPrompt)
      return result
    } catch (error) {
      return Err(this.createProcessingError(error))
    }
  }

  /**
   * Process URLs with retry mechanism and timeout
   * @param urls Array of URLs to process
   * @param originalPrompt Original prompt containing URLs
   * @returns Result containing URL context response with retry information
   */
  async processUrlsWithRetry(
    urls: string[],
    originalPrompt: string
  ): Promise<Result<UrlContextResponse, URLContextError | NetworkError>> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.processUrlsWithTimeout(urls, originalPrompt)
        if (result.success) {
          // Add retry information to extracted info
          const enrichedExtractedInfo = {
            ...result.data.extractedInfo,
            retryCount: attempt,
            finalAttempt: attempt + 1,
            maxRetries: this.MAX_RETRIES,
          }

          return Ok({
            ...result.data,
            extractedInfo: enrichedExtractedInfo,
          })
        }

        lastError = result.error

        // Check if error is retryable
        if (attempt < this.MAX_RETRIES && this.isRetryableError(result.error)) {
          await this.delay(1000 * 2 ** attempt) // Exponential backoff
          continue
        }

        return Err(result.error)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        if (attempt === this.MAX_RETRIES) {
          return Err(
            new URLContextError(
              `Max retries exceeded: ${lastError.message}`,
              'Try again later or check your network connection'
            )
          )
        }

        if (this.isRetryableError(lastError)) {
          await this.delay(1000 * 2 ** attempt) // Exponential backoff
        } else {
          return Err(this.createProcessingError(lastError))
        }
      }
    }

    return Err(
      new URLContextError(
        `Max retries exceeded: ${lastError?.message || 'Unknown error'}`,
        'Check your network connection and try again'
      )
    )
  }

  /**
   * Process URLs with timeout protection
   * @param urls Array of URLs to process
   * @param originalPrompt Original prompt containing URLs
   * @returns Result with timeout protection
   */
  private async processUrlsWithTimeout(
    urls: string[],
    originalPrompt: string
  ): Promise<Result<UrlContextResponse, URLContextError | NetworkError>> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(
          Err(
            new NetworkError(
              'URL context processing timed out',
              'Try reducing the number of URLs or check your network connection'
            )
          )
        )
      }, this.TIMEOUT_MS)

      this.processUrlsCore(urls, originalPrompt)
        .then((result) => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          resolve(Err(this.createProcessingError(error)))
        })
    })
  }

  /**
   * Core URL processing logic without retry/timeout
   * @param urls Array of URLs to process
   * @param originalPrompt Original prompt containing URLs
   * @returns Result containing URL context response
   */
  private async processUrlsCore(
    urls: string[],
    originalPrompt: string
  ): Promise<Result<UrlContextResponse, URLContextError | NetworkError>> {
    // Process all URLs in a single context extraction request
    const contextPrompt = this.buildContextPrompt(urls, originalPrompt)
    const result = await this.textClient.generateText(contextPrompt)

    if (!result.success) {
      return Err(this.createContextError(result.error))
    }

    const contextContent = result.data.text || ''

    // Combine context with original prompt
    const combinedPrompt = this.combineContextWithPrompt([contextContent], originalPrompt, urls)

    const extractedInfo = this.parseExtractedInfo(contextContent, urls.length)

    return Ok({
      contextContent,
      combinedPrompt,
      extractedInfo,
      success: true,
    })
  }

  /**
   * Build a context extraction prompt for Gemini API
   * @param urls Array of URLs to process
   * @param originalPrompt Original prompt containing URLs
   * @returns Formatted prompt for context extraction
   */
  private buildContextPrompt(urls: string[], originalPrompt: string): string {
    const urlList = urls.map((url, index) => `${index + 1}. ${url}`).join('\n')

    return `
Please analyze the following URLs and extract relevant context for image generation:

URLs to analyze:
${urlList}

Original prompt: ${originalPrompt}

Extract key information that would be relevant for generating an image based on these URLs. Focus on:
- Visual descriptions
- Key concepts or themes
- Relevant details for image creation

Provide a concise summary of the most relevant visual information.
`.trim()
  }

  /**
   * Combine URL context with original prompt for image generation
   * @param contextPrompts Array of context content from URLs
   * @param originalPrompt Original prompt containing URLs
   * @param urls Array of processed URLs
   * @returns Combined prompt for image generation
   */
  private combineContextWithPrompt(
    contextPrompts: string[],
    originalPrompt: string,
    urls: string[]
  ): string {
    const cleanPrompt = this.cleanPromptFromUrls(originalPrompt)
    const finalPrompt = cleanPrompt || originalPrompt
    const contextContent = this.formatContextContent(contextPrompts)

    return this.formatCombinedPrompt(urls, contextContent, finalPrompt)
  }

  /**
   * Remove URLs and clean up common action words from prompt
   * @param originalPrompt Original prompt containing URLs
   * @returns Cleaned prompt suitable for final instruction
   */
  private cleanPromptFromUrls(originalPrompt: string): string {
    // Remove URLs from original prompt to get clean instruction
    let cleanPrompt = URLExtractor.removeUrls(originalPrompt).trim()

    // Enhanced cleaning: remove common action words that become awkward after URL removal
    // e.g., "Create image of https://example.com with sunset" -> "with sunset"
    const actionPatterns = [
      /^(create|generate|make)\s+(an?\s+)?(image|picture|photo)\s+(of|from|based\s+on)\s*/i,
      /^(show|display|illustrate)\s*/i,
    ]

    for (const pattern of actionPatterns) {
      cleanPrompt = cleanPrompt.replace(pattern, '').trim()
    }

    return cleanPrompt
  }

  /**
   * Format and clean context content from multiple sources
   * @param contextPrompts Array of raw context content
   * @returns Formatted context content
   */
  private formatContextContent(contextPrompts: string[]): string {
    return contextPrompts.filter((p) => p?.trim()).join('\n\n')
  }

  /**
   * Format the final combined prompt with context and instruction sections
   * @param urls Array of processed URLs
   * @param contextContent Formatted context content
   * @param finalPrompt Final instruction prompt
   * @returns Complete combined prompt
   */
  private formatCombinedPrompt(
    urls: string[],
    contextContent: string,
    finalPrompt: string
  ): string {
    const urlList = urls.join(', ')
    const displayContext = contextContent || '(No specific context extracted)'

    return `Context from URLs (${urlList}):\n${displayContext}\n\nGenerate image: ${finalPrompt}`
  }

  /**
   * Create a standardized context error from API failure
   * @param originalError The original error from text generation
   * @returns Formatted URLContextError
   */
  private createContextError(originalError: Error): URLContextError {
    return new URLContextError(
      `URL context processing failed: ${originalError.message}`,
      'Check your network connection and try again, or disable URL context processing'
    )
  }

  /**
   * Create appropriate error based on error type
   * @param error The original error that occurred
   * @returns Formatted error (NetworkError or URLContextError)
   */
  private createProcessingError(error: unknown): URLContextError | NetworkError {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check if it's a network-related error
    if (this.isNetworkError(error)) {
      return new NetworkError(
        `Network error during URL context processing: ${errorMessage}`,
        'Check your internet connection and try again',
        error instanceof Error ? error : undefined
      )
    }

    // Generic URL context error
    return new URLContextError(
      `URL context processing error: ${errorMessage}`,
      'Try again with fewer URLs or disable URL context processing'
    )
  }

  /**
   * Parse extracted information from context content
   * @param contextContent The context content to parse
   * @param processedUrlCount Number of URLs that were processed
   * @returns Structured extracted information
   */
  private parseExtractedInfo(
    contextContent: string,
    processedUrlCount: number
  ): Record<string, unknown> {
    // Enhanced implementation with content analysis
    const wordCount = contextContent.split(/\s+/).filter((word) => word.length > 0).length
    const hasVisualDescriptions =
      /\b(color|image|visual|picture|photo|scene|view|appearance)\b/i.test(contextContent)

    return {
      processedUrls: processedUrlCount,
      contentLength: contextContent.length,
      wordCount,
      processedAt: new Date().toISOString(),
      hasContent: contextContent.length > 0,
      hasVisualDescriptions,
      contentPreview: contextContent.substring(0, 100) + (contextContent.length > 100 ? '...' : ''),
    }
  }

  /**
   * Check if an error is network-related
   * @param error The error to check
   * @returns True if it's a network error
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const networkErrorCodes = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ENETUNREACH',
      ]
      const networkErrorKeywords = ['network', 'connection', 'timeout', 'unreachable', 'dns']

      return (
        networkErrorCodes.some(
          (code) =>
            error.message.includes(code) || (error as Error & { code?: string }).code === code
        ) || networkErrorKeywords.some((keyword) => error.message.toLowerCase().includes(keyword))
      )
    }
    return false
  }

  /**
   * Check if an error is retryable
   * @param error The error to check
   * @returns True if the error should trigger a retry
   */
  private isRetryableError(error: Error): boolean {
    // Network errors are retryable
    if (this.isNetworkError(error)) {
      return true
    }

    // Rate limit and temporary errors are retryable
    const retryableKeywords = [
      'rate limit',
      'temporary',
      'throttle',
      'service unavailable',
      '503',
      '429',
    ]
    const errorMessage = error.message.toLowerCase()

    return retryableKeywords.some((keyword) => errorMessage.includes(keyword))
  }

  /**
   * Add a delay for exponential backoff
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
