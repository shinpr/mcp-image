/**
 * Tests for URL Context API integration with combined prompt processing
 * Following TDD Red-Green-Refactor approach for Task-09
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URLExtractor } from '../../business/urlExtractor'
import { Err, Ok, type Result } from '../../types/result'
import { UrlContextClient } from '../urlContextClient'

// Mock text generation client interface
interface TextGenerationClient {
  generateText(prompt: string): Promise<Result<{ text: string }, Error>>
}

describe('UrlContextClient - URL Context Integration (Task-09)', () => {
  let urlContextClient: UrlContextClient
  let mockTextClient: vi.Mocked<TextGenerationClient>

  beforeEach(() => {
    mockTextClient = {
      generateText: vi.fn(),
    }
    urlContextClient = new UrlContextClient(mockTextClient)
  })

  describe('processUrls - Enhanced for combined prompt processing', () => {
    it('should combine URL context with original prompt for image generation', async () => {
      // Arrange
      const originalPrompt = 'Create image of https://example.com with mountain background'
      const urls = URLExtractor.extractUrls(originalPrompt)
      const expectedContextContent =
        'Example.com is a tech company website featuring modern design...'

      mockTextClient.generateText.mockResolvedValue(Ok({ text: expectedContextContent }))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveProperty('contextContent')
        expect(result.data).toHaveProperty('combinedPrompt')
        expect(result.data).toHaveProperty('extractedInfo')
        expect(result.data.contextContent).toBe(expectedContextContent)

        // Combined prompt should include context and clean prompt
        const expectedCombinedPrompt = `Context from URLs (https://example.com):\n${expectedContextContent}\n\nGenerate image: with mountain background`
        expect(result.data.combinedPrompt).toBe(expectedCombinedPrompt)

        expect(result.data.extractedInfo.processedUrls).toBe(1)
      }
    })

    it('should handle multiple URLs in combined prompt processing', async () => {
      // Arrange
      const originalPrompt = 'Create image combining https://site1.com and https://site2.com themes'
      const urls = URLExtractor.extractUrls(originalPrompt)
      const contextContent1 = 'Site1.com: Modern architecture website'
      const contextContent2 = 'Site2.com: Nature photography portfolio'

      // Mock multiple context responses
      mockTextClient.generateText
        .mockResolvedValueOnce(Ok({ text: contextContent1 }))
        .mockResolvedValueOnce(Ok({ text: contextContent2 }))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.combinedPrompt).toContain('Context from URLs')
        expect(result.data.combinedPrompt).toContain('site1.com')
        expect(result.data.combinedPrompt).toContain('site2.com')
        expect(result.data.combinedPrompt).toContain('themes')
        expect(result.data.extractedInfo.processedUrls).toBe(2)
      }
    })

    it('should remove URLs from original prompt in combined result', async () => {
      // Arrange
      const originalPrompt = 'Generate sunset image inspired by https://nature.com'
      const urls = URLExtractor.extractUrls(originalPrompt)
      const contextContent = 'Nature.com: Beautiful landscape photography'

      mockTextClient.generateText.mockResolvedValue(Ok({ text: contextContent }))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should contain the original URL only in the context header, not in the final prompt part
        expect(result.data.combinedPrompt).toContain(
          'Generate image: Generate sunset image inspired by'
        )
        expect(result.data.combinedPrompt).toContain('Context from URLs (https://nature.com)')
        // The final prompt part should not contain the URL
        const promptPart = result.data.combinedPrompt.split('Generate image: ')[1]
        expect(promptPart).not.toContain('https://nature.com')
      }
    })

    it('should handle empty context gracefully', async () => {
      // Arrange
      const originalPrompt = 'Create image of https://empty.com'
      const urls = URLExtractor.extractUrls(originalPrompt)

      mockTextClient.generateText.mockResolvedValue(Ok({ text: '' }))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.combinedPrompt).toContain('Context from URLs')
        expect(result.data.contextContent).toBe('')
        expect(result.data.extractedInfo.processedUrls).toBe(1)
      }
    })

    it('should return URLContextError when API fails', async () => {
      // Arrange
      const originalPrompt = 'Create image of https://fail.com'
      const urls = URLExtractor.extractUrls(originalPrompt)

      mockTextClient.generateText.mockResolvedValue(Err(new Error('API authentication failed')))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('URL context processing failed')
        expect(result.error.message).toContain('API authentication failed')
      }
    })

    it('should preserve original prompt when no URLs are found', async () => {
      // Arrange
      const originalPrompt = 'Create a beautiful sunset image'
      const urls: string[] = []

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.contextContent).toBe('')
        expect(result.data.combinedPrompt).toBe(`Generate image: ${originalPrompt}`)
        expect(result.data.extractedInfo).toEqual({})
      }
    })
  })

  describe('combineContextWithPrompt - URL removal and combination logic', () => {
    it('should properly combine context with URL-cleaned prompt', async () => {
      // Arrange
      const originalPrompt = 'Make https://example.com look like a painting with bright colors'
      const urls = URLExtractor.extractUrls(originalPrompt)
      const contextContent = 'Example.com shows modern web design'

      mockTextClient.generateText.mockResolvedValue(Ok({ text: contextContent }))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        const cleanPrompt = URLExtractor.removeUrls(originalPrompt)
        expect(result.data.combinedPrompt).toContain(contextContent)
        expect(result.data.combinedPrompt).toContain('Context from URLs (https://example.com)')
        // The final prompt part should not contain the URL
        const promptPart = result.data.combinedPrompt.split('Generate image: ')[1]
        expect(promptPart).not.toContain('https://example.com')
      }
    })

    it('should fall back to original prompt when URL removal results in empty string', async () => {
      // Arrange
      const originalPrompt = 'https://example.com'
      const urls = URLExtractor.extractUrls(originalPrompt)
      const contextContent = 'Example.com content'

      mockTextClient.generateText.mockResolvedValue(Ok({ text: contextContent }))

      // Act
      const result = await urlContextClient.processUrls(urls, originalPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should fall back to original prompt when clean prompt is empty
        expect(result.data.combinedPrompt).toContain(originalPrompt)
      }
    })
  })
})
