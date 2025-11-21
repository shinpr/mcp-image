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
        expect(result.data.metadata.model).toBe('gemini-3-pro-image-preview')
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
        expect(result.data.metadata.model).toBe('gemini-3-pro-image-preview')
        expect(result.data.metadata.prompt).toBe('Enhance this image')
        expect(result.data.metadata.mimeType).toBe('image/jpeg')
      }

      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
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
        config: {
          responseModalities: ['IMAGE'],
        },
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

    it('should handle prompt feedback blocking with safety reasons', async () => {
      // Arrange
      const mockBlockedResponse = {
        response: {
          promptFeedback: {
            blockReason: 'SAFETY',
            blockReasonMessage: 'The prompt was blocked due to safety reasons',
            safetyRatings: [
              {
                category: 'HARM_CATEGORY_VIOLENCE',
                probability: 'HIGH',
                blocked: true,
              },
            ],
          },
          candidates: [],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockBlockedResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate violent content',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('Image generation blocked')
        expect(result.error.message).toContain('safety reasons')
        expect(result.error.suggestion).toContain('Rephrase your prompt')
        expect(result.error.context).toMatchObject({
          blockReason: 'SAFETY',
          stage: 'prompt_analysis',
        })
      }
    })

    it('should handle finish reason SAFETY with detailed information', async () => {
      // Arrange
      const mockSafetyStoppedResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [], // No image parts due to safety stop
              },
              finishReason: 'IMAGE_SAFETY',
              safetyRatings: [
                {
                  category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                  probability: 'HIGH',
                  blocked: true,
                },
                {
                  category: 'HARM_CATEGORY_VIOLENCE',
                  probability: 'MEDIUM',
                  blocked: false,
                },
              ],
            },
          ],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSafetyStoppedResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate inappropriate image',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('Image generation stopped')
        expect(result.error.message).toContain('safety reasons')
        expect(result.error.suggestion).toContain('Modify your prompt')
        expect(result.error.context).toMatchObject({
          finishReason: 'IMAGE_SAFETY',
          stage: 'generation_stopped',
        })
        // Safety ratings should be formatted
        expect(result.error.context?.safetyRatings).toContain('Sexually Explicit (BLOCKED)')
      }
    })

    it('should handle finish reason MAX_TOKENS', async () => {
      // Arrange
      const mockMaxTokensResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [], // No image due to token limit
              },
              finishReason: 'MAX_TOKENS',
            },
          ],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockMaxTokensResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate extremely complex scene with many details',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('Maximum token limit reached')
        expect(result.error.suggestion).toContain('shorter or simpler prompt')
        expect(result.error.context).toMatchObject({
          finishReason: 'MAX_TOKENS',
          stage: 'generation_stopped',
        })
      }
    })

    it('should handle prohibited content blocking', async () => {
      // Arrange
      const mockProhibitedResponse = {
        response: {
          promptFeedback: {
            blockReason: 'PROHIBITED_CONTENT',
            blockReasonMessage: 'The prompt contains prohibited content',
          },
          candidates: [],
        },
      }

      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockProhibitedResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) return
      const client = clientResult.data

      // Act
      const result = await client.generateImage({
        prompt: 'Generate prohibited content',
      })

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('prohibited content')
        expect(result.error.suggestion).toContain('Remove any prohibited content')
        expect(result.error.context).toMatchObject({
          blockReason: 'PROHIBITED_CONTENT',
          stage: 'prompt_analysis',
        })
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
        expect(result.data.metadata.model).toBe('gemini-3-pro-image-preview')
        // Features are passed to the API but not stored in metadata
        expect(result.data.metadata.prompt).toBe('Generate character with blending')
      }

      // Verify API was called with original prompt (no enhancement at GeminiClient level)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate character with blending',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
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
        // Features are passed to the API but not stored in metadata
        expect(result.data.metadata.prompt).toBe('Generate factually accurate historical scene')
        expect(result.data.metadata.model).toBe('gemini-3-pro-image-preview')
      }

      // Verify API was called with original prompt (no processing at GeminiClient level)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate factually accurate historical scene',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
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
        // Features not specified - standard metadata only
        expect(result.data.metadata.prompt).toBe('Generate simple landscape')
        expect(result.data.metadata.model).toBe('gemini-3-pro-image-preview')
      }

      // Verify API was called with config
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate simple landscape',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
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
        // Features are passed to the API but not stored in metadata
        expect(result.data.metadata.prompt).toBe('Blend this character with fantasy elements')
        expect(result.data.metadata.model).toBe('gemini-3-pro-image-preview')
      }

      // Verify API was called with input image and original prompt (no processing at GeminiClient level)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
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
        config: {
          responseModalities: ['IMAGE'],
        },
      })
    })
  })

  describe('GeminiClient.generateImage with aspectRatio', () => {
    it('should call API with imageConfig when aspectRatio is specified', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-image-data-16-9',
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
        prompt: 'test prompt for aspect ratio',
        aspectRatio: '16:9',
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'test prompt for aspect ratio',
              },
            ],
          },
        ],
        config: {
          imageConfig: { aspectRatio: '16:9' },
          responseModalities: ['IMAGE'],
        },
      })
    })

    it('should use default when aspectRatio is not specified', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-default-image',
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
        prompt: 'test prompt without aspect ratio',
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'test prompt without aspect ratio',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
      })
      // Verify imageConfig.aspectRatio is not included
      const callArgs = (mockGeminiClientInstance.models.generateContent as any).mock.calls[0][0]
      expect(callArgs.config.imageConfig).toBeUndefined()
    })

    it('should include responseModalities: ["IMAGE"] in API call with aspectRatio', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-image-data-21-9',
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
        prompt: 'test prompt with 21:9 aspect ratio',
        aspectRatio: '21:9',
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'test prompt with 21:9 aspect ratio',
              },
            ],
          },
        ],
        config: {
          imageConfig: { aspectRatio: '21:9' },
          responseModalities: ['IMAGE'],
        },
      })
    })
  })

  describe('GeminiClient.generateImage with useGoogleSearch', () => {
    it('should call API with tools parameter when useGoogleSearch is true', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-grounded-image-data',
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
        prompt: 'Generate current 2025 weather map of Tokyo',
        useGoogleSearch: true,
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate current 2025 weather map of Tokyo',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
        tools: [{ googleSearch: {} }],
      })
    })

    it('should not include tools parameter when useGoogleSearch is false', async () => {
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
        prompt: 'Generate creative fantasy landscape',
        useGoogleSearch: false,
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate creative fantasy landscape',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
      })

      // Verify tools parameter is not included
      const callArgs = (mockGeminiClientInstance.models.generateContent as any).mock.calls[0][0]
      expect(callArgs.tools).toBeUndefined()
    })

    it('should not include tools parameter when useGoogleSearch is undefined', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-default-image',
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
        prompt: 'Generate image without grounding',
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate image without grounding',
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
      })

      // Verify tools parameter is not included
      const callArgs = (mockGeminiClientInstance.models.generateContent as any).mock.calls[0][0]
      expect(callArgs.tools).toBeUndefined()
    })

    it('should combine useGoogleSearch with aspectRatio and imageSize', async () => {
      // Arrange
      const mockResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'base64-grounded-4k-image',
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
        prompt: 'Generate 2025 Japan foodtech industry chaos map',
        useGoogleSearch: true,
        aspectRatio: '16:9',
        imageSize: '4K',
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            parts: [
              {
                text: 'Generate 2025 Japan foodtech industry chaos map',
              },
            ],
          },
        ],
        config: {
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '4K',
          },
          responseModalities: ['IMAGE'],
        },
        tools: [{ googleSearch: {} }],
      })
    })
  })
})
