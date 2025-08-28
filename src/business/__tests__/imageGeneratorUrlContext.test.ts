/**
 * Tests for ImageGenerator with URL Context integration (Task-09)
 * Following TDD Red-Green-Refactor approach
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeminiClient } from '../../api/geminiClient'
import type { UrlContextClient } from '../../api/urlContextClient'
import { Err, Ok, type Result } from '../../types/result'
import { ImageGenerator } from '../imageGenerator'
import { URLExtractor } from '../urlExtractor'

// Mock validation functions
const mockValidatePrompt = vi.fn()
const mockValidateImageFile = vi.fn()

// Mock the validation module
vi.mock('../inputValidator', () => ({
  validatePrompt: (prompt: string) => mockValidatePrompt(prompt),
  validateImageFile: (filePath: string) => mockValidateImageFile(filePath),
}))

// Mock interfaces
interface MockGeminiClient extends GeminiClient {
  generateImage: vi.MockedFunction<GeminiClient['generateImage']>
}

interface MockUrlContextClient {
  processUrls: vi.MockedFunction<UrlContextClient['processUrls']>
}

describe('ImageGenerator - URL Context Integration (Task-09)', () => {
  let imageGenerator: ImageGenerator
  let mockGeminiClient: MockGeminiClient
  let mockUrlContextClient: MockUrlContextClient

  beforeEach(() => {
    vi.clearAllMocks()

    mockGeminiClient = {
      generateImage: vi.fn(),
    } as MockGeminiClient

    mockUrlContextClient = {
      processUrls: vi.fn(),
    }

    // Mock validation functions to always succeed
    mockValidatePrompt.mockReturnValue(Ok('test prompt'))
    mockValidateImageFile.mockReturnValue(Ok('/path/to/input.jpg'))

    // Create ImageGenerator with both clients
    imageGenerator = new ImageGenerator(
      mockGeminiClient,
      mockUrlContextClient as unknown as UrlContextClient
    )
  })

  describe('generateImage - URL Context enabled', () => {
    it('should process URLs and use combined prompt when enableUrlContext=true', async () => {
      // Arrange
      const params = {
        prompt: 'Create image of https://example.com with mountain background',
        enableUrlContext: true,
      }

      const extractedUrls = ['https://example.com']
      const contextContent = 'Example.com is a tech company website featuring modern design'
      const combinedPrompt = `Context from URLs (https://example.com):\n${contextContent}\n\nGenerate image: with mountain background`

      // Mock URL context processing success
      mockUrlContextClient.processUrls.mockResolvedValue(
        Ok({
          contextContent,
          combinedPrompt,
          extractedInfo: { processedUrls: 1 },
          success: true,
        })
      )

      // Mock successful image generation
      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should use combined prompt for image generation
        expect(mockGeminiClient.generateImage).toHaveBeenCalledWith({
          prompt: combinedPrompt,
          inputImage: undefined,
        })

        // Should record URL context metadata
        expect(result.data.metadata.contextMethod).toBe('url_context')
        expect(result.data.metadata.extractedUrls).toEqual(['https://example.com'])
        expect(result.data.metadata.urlContextUsed).toBe(true)
      }
    })

    it('should fall back to prompt_only when URL context processing fails', async () => {
      // Arrange
      const params = {
        prompt: 'Create image of https://example.com with sunset',
        enableUrlContext: true,
      }

      // Mock URL context processing failure
      mockUrlContextClient.processUrls.mockResolvedValue(Err(new Error('URL context API failed')))

      // Mock successful image generation with fallback
      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should use original prompt as fallback
        expect(mockGeminiClient.generateImage).toHaveBeenCalledWith({
          prompt: params.prompt,
          inputImage: undefined,
        })

        // Should record fallback metadata
        expect(result.data.metadata.contextMethod).toBe('prompt_only')
        expect(result.data.metadata.extractedUrls).toEqual(['https://example.com'])
        expect(result.data.metadata.urlContextUsed).toBe(false)
      }
    })

    it('should handle prompts without URLs when enableUrlContext=true', async () => {
      // Arrange
      const params = {
        prompt: 'Create a beautiful sunset image',
        enableUrlContext: true,
      }

      // Mock successful image generation
      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should use original prompt
        expect(mockGeminiClient.generateImage).toHaveBeenCalledWith({
          prompt: params.prompt,
          inputImage: undefined,
        })

        // Should record prompt_only metadata
        expect(result.data.metadata.contextMethod).toBe('prompt_only')
        expect(result.data.metadata.extractedUrls).toBeUndefined()
        expect(result.data.metadata.urlContextUsed).toBeUndefined()
      }
    })

    it('should work normally when enableUrlContext=false', async () => {
      // Arrange
      const params = {
        prompt: 'Create image of https://example.com',
        enableUrlContext: false,
      }

      // Mock successful image generation
      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should use original prompt without URL processing
        expect(mockGeminiClient.generateImage).toHaveBeenCalledWith({
          prompt: params.prompt,
          inputImage: undefined,
        })

        // Should not call URL context processing
        expect(mockUrlContextClient.processUrls).not.toHaveBeenCalled()

        // Should record prompt_only metadata
        expect(result.data.metadata.contextMethod).toBe('prompt_only')
        // URLs are always extracted for metadata tracking, even when URL context is disabled
        expect(result.data.metadata.extractedUrls).toEqual(['https://example.com'])
        expect(result.data.metadata.urlContextUsed).toBeUndefined()
      }
    })

    it('should work normally when enableUrlContext is undefined', async () => {
      // Arrange
      const params = {
        prompt: 'Create image of https://example.com',
        // enableUrlContext is undefined (default behavior)
      }

      // Mock successful image generation
      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        // Should use original prompt without URL processing
        expect(mockGeminiClient.generateImage).toHaveBeenCalledWith({
          prompt: params.prompt,
          inputImage: undefined,
        })

        // Should not call URL context processing
        expect(mockUrlContextClient.processUrls).not.toHaveBeenCalled()

        // Should record prompt_only metadata (default)
        expect(result.data.metadata.contextMethod).toBe('prompt_only')
        // URLs are always extracted for metadata tracking, even when URL context is disabled/undefined
        expect(result.data.metadata.extractedUrls).toEqual(['https://example.com'])
        expect(result.data.metadata.urlContextUsed).toBeUndefined()
      }
    })
  })

  describe('generateImage - metadata recording', () => {
    it('should record complete metadata when URL context is used successfully', async () => {
      // Arrange
      const params = {
        prompt: 'Create image inspired by https://art.com and https://design.com',
        enableUrlContext: true,
      }

      const extractedUrls = ['https://art.com', 'https://design.com']
      const contextContent = 'Art and design inspiration content'
      const combinedPrompt = 'Context from URLs...\n\nGenerate image: Create image inspired by'

      mockUrlContextClient.processUrls.mockResolvedValue(
        Ok({
          contextContent,
          combinedPrompt,
          extractedInfo: { processedUrls: 2 },
          success: true,
        })
      )

      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        const metadata = result.data.metadata

        expect(metadata.model).toBe('gemini-2.5-flash-image-preview')
        expect(metadata.contextMethod).toBe('url_context')
        expect(metadata.extractedUrls).toEqual(extractedUrls)
        expect(metadata.urlContextUsed).toBe(true)
        expect(metadata.processingTime).toBeGreaterThan(0)
        expect(metadata.timestamp).toBeDefined()
        expect(new Date(metadata.timestamp).getTime()).toBeGreaterThan(0)
      }
    })

    it('should record fallback metadata when URL context fails', async () => {
      // Arrange
      const params = {
        prompt: 'Create image of https://fail.com',
        enableUrlContext: true,
      }

      const extractedUrls = ['https://fail.com']

      mockUrlContextClient.processUrls.mockResolvedValue(Err(new Error('Context API failed')))

      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        const metadata = result.data.metadata

        expect(metadata.contextMethod).toBe('prompt_only')
        expect(metadata.extractedUrls).toEqual(extractedUrls)
        expect(metadata.urlContextUsed).toBe(false)
      }
    })

    it('should not include URL-related metadata when no URLs are present', async () => {
      // Arrange
      const params = {
        prompt: 'Create a simple landscape',
        enableUrlContext: true,
      }

      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        const metadata = result.data.metadata

        expect(metadata.contextMethod).toBe('prompt_only')
        expect(metadata.extractedUrls).toBeUndefined()
        expect(metadata.urlContextUsed).toBeUndefined()
      }
    })
  })

  describe('generateImage - input image support', () => {
    it('should support URL context with input image editing', async () => {
      // Arrange
      const params = {
        prompt: 'Edit this image based on https://style.com',
        inputImagePath: '/path/to/input.jpg',
        enableUrlContext: true,
      }

      const contextContent = 'Style.com shows modern artistic techniques'
      const combinedPrompt = 'Context from URLs...\n\nGenerate image: Edit this image based on'

      mockUrlContextClient.processUrls.mockResolvedValue(
        Ok({
          contextContent,
          combinedPrompt,
          extractedInfo: { processedUrls: 1 },
          success: true,
        })
      )

      mockGeminiClient.generateImage.mockResolvedValue(
        Ok({ imageData: Buffer.from('fake-edited-image-data') })
      )

      // Act
      const result = await imageGenerator.generateImage(params)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(mockGeminiClient.generateImage).toHaveBeenCalledWith({
          prompt: combinedPrompt,
          inputImage: expect.any(Buffer),
        })

        expect(result.data.metadata.contextMethod).toBe('url_context')
        expect(result.data.metadata.urlContextUsed).toBe(true)
      }
    })
  })
})
