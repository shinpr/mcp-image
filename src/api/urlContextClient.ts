/**
 * URL Context API client for processing URLs and extracting context
 * Uses @google/genai SDK for URL context processing
 */

import { Err, Ok, type Result } from '../types/result'
import { NetworkError, URLContextError } from '../utils/errors'

/**
 * Response from URL context processing
 */
export interface UrlContextResponse {
  /** Context content extracted from URLs */
  contextContent: string
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

  constructor(private textClient: TextGenerationClient) {}

  /**
   * Process multiple URLs and extract context for image generation
   * @param urls Array of URLs to process
   * @param basePrompt Base prompt for context
   * @returns Result containing URL context response or error
   */
  async processUrls(
    urls: string[],
    basePrompt: string
  ): Promise<Result<UrlContextResponse, URLContextError | NetworkError>> {
    try {
      // Handle empty URL array
      if (urls.length === 0) {
        return Ok({
          contextContent: '',
          extractedInfo: {},
          success: true,
        })
      }

      // Limit URLs to maximum allowed
      const limitedUrls = urls.slice(0, UrlContextClient.MAX_URLS)

      // Create context extraction prompt
      const contextPrompt = this.buildContextPrompt(limitedUrls, basePrompt)

      // Use text generation client to process URLs and extract context
      const result = await this.textClient.generateText(contextPrompt)

      if (!result.success) {
        return Err(
          new URLContextError(
            `URL context processing failed: ${result.error.message}`,
            'Check your network connection and try again, or disable URL context processing'
          )
        )
      }

      // Parse and structure the response
      const contextContent = result.data.text || ''
      const extractedInfo = this.parseExtractedInfo(contextContent)

      return Ok({
        contextContent,
        extractedInfo,
        success: true,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Check if it's a network-related error
      if (this.isNetworkError(error)) {
        return Err(
          new NetworkError(
            `Network error during URL context processing: ${errorMessage}`,
            'Check your internet connection and try again',
            error instanceof Error ? error : undefined
          )
        )
      }

      // Generic URL context error
      return Err(
        new URLContextError(
          `URL context processing error: ${errorMessage}`,
          'Try again with fewer URLs or disable URL context processing'
        )
      )
    }
  }

  /**
   * Build a context extraction prompt for Gemini API
   * @param urls Array of URLs to process
   * @param basePrompt Base prompt for context
   * @returns Formatted prompt for context extraction
   */
  private buildContextPrompt(urls: string[], basePrompt: string): string {
    const urlList = urls.map((url, index) => `${index + 1}. ${url}`).join('\n')

    return `
Please analyze the following URLs and extract relevant context for image generation:

URLs to analyze:
${urlList}

Base prompt: ${basePrompt}

Extract key information that would be relevant for generating an image based on these URLs and the base prompt. Focus on:
- Visual descriptions
- Key concepts or themes
- Relevant details for image creation

Provide a structured response with the extracted context.
`.trim()
  }

  /**
   * Parse extracted information from context content
   * @param contextContent The context content to parse
   * @returns Structured extracted information
   */
  private parseExtractedInfo(contextContent: string): Record<string, unknown> {
    // Enhanced implementation with content analysis
    const wordCount = contextContent.split(/\s+/).filter((word) => word.length > 0).length
    const hasVisualDescriptions =
      /\b(color|image|visual|picture|photo|scene|view|appearance)\b/i.test(contextContent)

    return {
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
}
