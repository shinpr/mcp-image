import type { GenerativeModel } from '@google/genai'
import { type MockedFunction, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { createGeminiClient } from '../geminiClient'

// Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}))

// Mock the GenerativeModel
const mockGenerativeModel = {
  generateContent: vi.fn(),
} as unknown as GenerativeModel

const mockGoogleAI = {
  getGenerativeModel: vi.fn().mockReturnValue(mockGenerativeModel),
}

const mockGoogleGenAI = vi.mocked(
  await import('@google/genai').then((m) => m.GoogleGenAI)
) as MockedFunction<typeof import('@google/genai').GoogleGenAI>

describe('geminiClient', () => {
  const testConfig: Config = {
    geminiApiKey: 'test-api-key-12345',
    imageOutputDir: './output',
    apiTimeout: 30000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGoogleGenAI.mockReturnValue(mockGoogleAI)
  })

  describe('createGeminiClient', () => {
    it('should create client with correct model configuration', () => {
      // Act
      const result = createGeminiClient(testConfig)

      // Assert
      expect(result.success).toBe(true)
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: testConfig.geminiApiKey })
      if (result.success) {
        expect(mockGoogleAI.getGenerativeModel).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash-image-preview',
        })
      }
    })

    it('should return error when API key is invalid', () => {
      // Arrange
      mockGoogleGenAI.mockImplementation(() => {
        throw new Error('Invalid API key')
      })

      // Act
      const result = createGeminiClient(testConfig)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('Failed to initialize Gemini client')
      }
    })
  })

  describe('GeminiClient.generateImage', () => {
    it('should generate image successfully with text prompt only', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-image-data',
                      mimeType: 'image/png',
                    },
                  },
                ],
              },
            },
          ],
        },
      }

      mockGenerativeModel.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate a beautiful landscape',
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.model).toBe('gemini-2.5-flash-image-preview')
        expect(result.data.metadata.prompt).toBe('Generate a beautiful landscape')
        expect(result.data.metadata.mimeType).toBe('image/png')
      }
    })

    it('should generate image successfully with input image and prompt', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-enhanced-image-data',
                      mimeType: 'image/jpeg',
                    },
                  },
                ],
              },
            },
          ],
        },
      }

      mockGenerativeModel.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      const inputImageBuffer = Buffer.from('fake-input-image-data')

      // Act
      const result = await client.generateImage({
        prompt: 'Enhance this image',
        inputImage: inputImageBuffer,
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.model).toBe('gemini-2.5-flash-image-preview')
        expect(result.data.metadata.prompt).toBe('Enhance this image')
        expect(result.data.metadata.mimeType).toBe('image/jpeg')
      }

      expect(mockGenerativeModel.generateContent).toHaveBeenCalledWith([
        'Enhance this image',
        {
          inlineData: {
            data: inputImageBuffer.toString('base64'),
            mimeType: 'image/jpeg',
          },
        },
      ])
    })

    it('should return GeminiAPIError when API returns error', async () => {
      // Arrange
      const apiError = new Error('API quota exceeded')
      mockGenerativeModel.generateContent = vi.fn().mockRejectedValue(apiError)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate image',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('Failed to generate image')
        expect(result.error.message).toContain('API quota exceeded')
      }
    })

    it('should return NetworkError for network-related failures', async () => {
      // Arrange
      const networkError = new Error('ECONNRESET') as Error & { code: string }
      networkError.code = 'ECONNRESET'
      mockGenerativeModel.generateContent = vi.fn().mockRejectedValue(networkError)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate image',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('Network error')
      }
    })

    it('should return GeminiAPIError when response is malformed', async () => {
      // Arrange
      const mockMalformedResponse = {
        response: {
          candidates: [], // Empty candidates
        },
      }

      mockGenerativeModel.generateContent = vi.fn().mockResolvedValue(mockMalformedResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate image',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('No image generated')
      }
    })
  })
})
