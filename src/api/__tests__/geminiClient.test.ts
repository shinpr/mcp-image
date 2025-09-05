import type { GenerativeModel } from '@google/genai'
import { type MockedFunction, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { createGeminiClient } from '../geminiClient'

// Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}))

// Mock the Gemini client instance structure
const mockGeminiClientInstance = {
  models: {
    generateContent: vi.fn(),
  },
}

const { GoogleGenAI } = await import('@google/genai')
const mockGoogleGenAI = vi.mocked(GoogleGenAI) as MockedFunction<typeof GoogleGenAI>

describe('geminiClient', () => {
  const testConfig: Config = {
    geminiApiKey: 'test-api-key-12345',
    imageOutputDir: './output',
    apiTimeout: 30000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGoogleGenAI.mockReturnValue(mockGeminiClientInstance as any)
  })

  describe('createGeminiClient', () => {
    it('should create client with correct model configuration', () => {
      // Act
      const result = createGeminiClient(testConfig)

      // Assert
      expect(result.success).toBe(true)
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: testConfig.geminiApiKey })
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

      mockGeminiClientInstance.models.generateContent = vi.fn().mockResolvedValue(mockResponse)

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

      mockGeminiClientInstance.models.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      const inputImageBuffer = Buffer.from('fake-input-image-data')
      const inputImageBase64 = inputImageBuffer.toString('base64')

      // Act
      const result = await client.generateImage({
        prompt: 'Enhance this image',
        inputImage: inputImageBase64,
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.model).toBe('gemini-2.5-flash-image-preview')
        expect(result.data.metadata.prompt).toBe('Enhance this image')
        expect(result.data.metadata.mimeType).toBe('image/jpeg')
      }

      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: inputImageBase64,
                  mimeType: 'image/jpeg',
                },
              },
              {
                text: 'Enhance this image',
              },
            ],
          },
        ],
        config: {},
      })
    })

    it('should return GeminiAPIError when API returns error', async () => {
      // Arrange
      const apiError = new Error('API quota exceeded')
      mockGeminiClientInstance.models.generateContent = vi.fn().mockRejectedValue(apiError)

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
      mockGeminiClientInstance.models.generateContent = vi.fn().mockRejectedValue(networkError)

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

      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockMalformedResponse)

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

    it('should generate image with feature parameters (without processing)', async () => {
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
                      mimeType: 'image/png',
                    },
                  },
                ],
              },
            },
          ],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act - feature parameters are passed but not processed by GeminiClient
      const result = await client.generateImage({
        prompt: 'Generate character with blending',
        blendImages: true,
        maintainCharacterConsistency: true,
        useWorldKnowledge: false,
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.model).toBe('gemini-2.5-flash-image-preview')
        expect(result.data.metadata.features).toEqual({
          blendImages: true,
          maintainCharacterConsistency: true,
          useWorldKnowledge: false,
        })
      }

      // Verify API was called with original prompt (no enhancement at GeminiClient level)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate character with blending',
              },
            ],
          },
        ],
        config: {},
      })
    })

    it('should generate image with some features enabled (parameters tracked only)', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-world-knowledge-image',
                      mimeType: 'image/webp',
                    },
                  },
                ],
              },
            },
          ],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate factually accurate historical scene',
        useWorldKnowledge: true,
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.features).toEqual({
          blendImages: false,
          maintainCharacterConsistency: false,
          useWorldKnowledge: true,
        })
      }

      // Verify API was called with original prompt (no processing at GeminiClient level)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate factually accurate historical scene',
              },
            ],
          },
        ],
        config: {},
      })
    })

    it('should generate image without new features when not specified', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-standard-image',
                      mimeType: 'image/png',
                    },
                  },
                ],
              },
            },
          ],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate simple landscape',
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.features).toBeUndefined()
      }

      // Verify API was called without generation config
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate simple landscape',
              },
            ],
          },
        ],
        config: {},
      })
    })

    it('should generate image with features and input image (parameters tracked only)', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-blended-image',
                      mimeType: 'image/jpeg',
                    },
                  },
                ],
              },
            },
          ],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi.fn().mockResolvedValue(mockResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      const inputBuffer = Buffer.from('test-image-data')
      const inputBase64 = inputBuffer.toString('base64')

      // Act
      const result = await client.generateImage({
        prompt: 'Blend this character with fantasy elements',
        inputImage: inputBase64,
        blendImages: true,
        maintainCharacterConsistency: true,
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.inputImageProvided).toBe(true)
        expect(result.data.metadata.features).toEqual({
          blendImages: true,
          maintainCharacterConsistency: true,
          useWorldKnowledge: false,
        })
      }

      // Verify API was called with input image and original prompt (no processing at GeminiClient level)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: inputBase64,
                  mimeType: 'image/jpeg',
                },
              },
              {
                text: 'Blend this character with fantasy elements',
              },
            ],
          },
        ],
        config: {},
      })
    })
  })
})
