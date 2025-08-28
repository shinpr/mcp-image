/**
 * Tests for URL Context API client
 * Following TDD Red-Green-Refactor approach
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '../../types/result'
import { UrlContextClient } from '../urlContextClient'

// Mock text generation client interface
interface TextGenerationClient {
  generateText(prompt: string): Promise<Result<{ text: string }, Error>>
}

describe('UrlContextClient', () => {
  let urlContextClient: UrlContextClient
  let mockTextClient: vi.Mocked<TextGenerationClient>

  beforeEach(() => {
    mockTextClient = {
      generateText: vi.fn(),
    }
    urlContextClient = new UrlContextClient(mockTextClient)
  })

  describe('processUrls', () => {
    it('should successfully process single URL', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Generate image based on this URL'

      // Mock successful response
      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: {
          text: 'URL content processed successfully',
        },
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.success).toBe(true)
        expect(result.data.contextContent).toBeDefined()
        expect(result.data.extractedInfo).toBeDefined()
      }
    })

    it('should successfully process multiple URLs', async () => {
      const urls = ['https://example.com', 'https://test.com']
      const basePrompt = 'Generate image based on these URLs'

      // Mock successful response
      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: {
          text: 'Multiple URLs content processed successfully',
        },
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.success).toBe(true)
        expect(result.data.contextContent).toBeDefined()
        expect(result.data.extractedInfo).toBeDefined()
      }
    })

    it('should handle API failure gracefully', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Generate image based on this URL'

      // Mock API failure
      mockTextClient.generateText.mockResolvedValue({
        success: false,
        error: new Error('API request failed'),
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toContain('URL context processing failed')
      }
    })

    it('should handle network errors', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Generate image based on this URL'

      // Mock network error
      mockTextClient.generateText.mockRejectedValue(new Error('Network error'))

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error)
      }
    })

    it('should handle empty URL array', async () => {
      const urls: string[] = []
      const basePrompt = 'Generate image'

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.success).toBe(true)
        expect(result.data.contextContent).toBe('')
        expect(result.data.extractedInfo).toEqual({})
      }
    })

    it('should limit processing to maximum 10 URLs', async () => {
      const urls = Array.from({ length: 15 }, (_, i) => `https://site${i}.com`)
      const basePrompt = 'Generate image based on these URLs'

      // Mock successful response
      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: {
          text: 'URLs processed successfully',
        },
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      expect(result.success).toBe(true)
      // Should only process first 10 URLs
      expect(mockTextClient.generateText).toHaveBeenCalledWith(expect.stringContaining('site9.com'))
      expect(mockTextClient.generateText).not.toHaveBeenCalledWith(
        expect.stringContaining('site10.com')
      )
    })

    it('should include base prompt in context processing', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Generate a red car image'

      // Mock successful response
      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: {
          text: 'URL content processed successfully',
        },
      })

      await urlContextClient.processUrls(urls, basePrompt)

      expect(mockTextClient.generateText).toHaveBeenCalledWith(expect.stringContaining(basePrompt))
    })
  })

  describe('integration with Result type', () => {
    it('should return Result<UrlContextResponse, Error> type', async () => {
      const urls = ['https://example.com']
      const basePrompt = 'Test prompt'

      mockTextClient.generateText.mockResolvedValue({
        success: true,
        data: { text: 'success' },
      })

      const result = await urlContextClient.processUrls(urls, basePrompt)

      // Type checking - result should be Result type
      expect(typeof result.success).toBe('boolean')
      if (result.success) {
        expect(result.data).toBeDefined()
        expect(typeof result.data.success).toBe('boolean')
        expect(typeof result.data.contextContent).toBe('string')
        expect(typeof result.data.extractedInfo).toBe('object')
      } else {
        expect(result.error).toBeInstanceOf(Error)
      }
    })
  })
})
