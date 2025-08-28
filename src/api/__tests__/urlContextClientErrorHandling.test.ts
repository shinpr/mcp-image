/**
 * Error handling tests for URL Context API client
 * Testing specific error scenarios for L2 confirmation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, URLContextError } from '../../utils/errors'
import { UrlContextClient } from '../urlContextClient'

// Mock text generation client interface
interface TextGenerationClient {
  generateText(
    prompt: string
  ): Promise<{ success: boolean; data?: { text: string }; error?: Error }>
}

describe('UrlContextClient Error Handling', () => {
  let urlContextClient: UrlContextClient
  let mockTextClient: vi.Mocked<TextGenerationClient>

  beforeEach(() => {
    mockTextClient = {
      generateText: vi.fn(),
    }
    urlContextClient = new UrlContextClient(mockTextClient)
  })

  describe('error type validation', () => {
    it('should return URLContextError for API failures', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Test prompt'

      mockTextClient.generateText.mockResolvedValue({
        success: false,
        error: new Error('API request failed'),
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(URLContextError)
        expect(result.error.code).toBe('URL_CONTEXT_ERROR')
        expect(result.error.suggestion).toContain('network connection')
      }
    })

    it('should return NetworkError for network-related failures', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Test prompt'

      mockTextClient.generateText.mockRejectedValue(
        new Error('ECONNRESET connection reset by peer')
      )

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.code).toBe('NETWORK_ERROR')
        expect(result.error.message).toContain('Network error')
      }
    })

    it('should handle timeout errors as network errors', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Test prompt'

      mockTextClient.generateText.mockRejectedValue(new Error('Request timeout after 30 seconds'))

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('timeout')
      }
    })

    it('should handle DNS resolution errors as network errors', async () => {
      const urls = ['https://nonexistent-domain.com']
      const basePrompt = 'Test prompt'

      mockTextClient.generateText.mockRejectedValue(new Error('ENOTFOUND nonexistent-domain.com'))

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.code).toBe('NETWORK_ERROR')
      }
    })
  })

  describe('graceful fallback scenarios', () => {
    it('should handle empty URL array gracefully', async () => {
      const urls: string[] = []
      const basePrompt = 'Test prompt'

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.success).toBe(true)
        expect(result.data.contextContent).toBe('')
        expect(result.data.extractedInfo).toEqual({})
      }
    })

    it('should limit URL processing to prevent overload', async () => {
      const urls = Array.from({ length: 20 }, (_, i) => `https://site${i}.com`)
      const basePrompt = 'Test prompt'

      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: { text: 'Processed URLs successfully' },
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      expect(mockTextClient.generateText).toHaveBeenCalledTimes(1)

      // Verify only first 10 URLs are processed
      const calledPrompt = mockTextClient.generateText.mock.calls[0][0]
      expect(calledPrompt).toContain('site9.com') // 10th URL (0-indexed)
      expect(calledPrompt).not.toContain('site10.com') // 11th URL should be excluded
    })
  })

  describe('response parsing enhancements', () => {
    it('should provide enhanced content analysis', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Generate image of a red car'

      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: { text: 'This is a visual description with color and image elements' },
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.extractedInfo.hasVisualDescriptions).toBe(true)
        expect(result.data.extractedInfo.wordCount).toBeGreaterThan(0)
        expect(result.data.extractedInfo.contentPreview).toBeDefined()
      }
    })
  })
})
