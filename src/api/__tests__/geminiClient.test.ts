import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorWithCode } from '../../tests/helpers/inspect'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { createGeminiClient } from '../geminiClient'

const mockGeminiClientInstance = {
  models: {
    generateContent: vi.fn(),
  },
}

const mockGoogleGenAI = vi.fn()

// Mock @google/genai: only stub the network-touching GoogleGenAI class, keep
// the rest of the module real (e.g. the ThinkingLevel enum) via importActual.
vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: class {
      models = mockGeminiClientInstance.models
      constructor(...args: unknown[]) {
        mockGoogleGenAI(...args)
      }
    },
  }
})

describe('geminiClient', () => {
  const testConfig: Config = {
    imageProvider: 'gemini',
    geminiApiKey: 'test-api-key-12345',
    openaiApiKey: '',
    imageOutputDir: './output',
    skipPromptEnhancement: false,
    imageQuality: 'fast',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createGeminiClient', () => {
    it('should create client with correct model configuration', () => {
      const result = createGeminiClient(testConfig)

      expect(result.success).toBe(true)
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: testConfig.geminiApiKey })
    })

    it('should return error when API key is invalid', () => {
      mockGoogleGenAI.mockImplementationOnce(() => {
        throw new Error('Invalid API key')
      })

      const result = createGeminiClient(testConfig)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('Failed to initialize Gemini client')
      }
    })
  })

  describe('GeminiClient.generateImage', () => {
    it('should generate image successfully with text prompt only', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate a beautiful landscape',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.model).toBe('gemini-3.1-flash-image')
        expect(result.data.metadata.prompt).toBe('Generate a beautiful landscape')
        expect(result.data.metadata.mimeType).toBe('image/png')
      }
    })

    it('should generate image successfully with input image and prompt', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const inputImageBuffer = Buffer.from('fake-input-image-data')
      const inputImageBase64 = inputImageBuffer.toString('base64')

      const result = await client.generateImage({
        prompt: 'Enhance this image',
        inputImage: inputImageBase64,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.model).toBe('gemini-3.1-flash-image')
        expect(result.data.metadata.prompt).toBe('Enhance this image')
        expect(result.data.metadata.mimeType).toBe('image/jpeg')
      }
    })

    it('should return GeminiAPIError when API returns error', async () => {
      const apiError = new Error('API quota exceeded')
      mockGeminiClientInstance.models.generateContent = vi.fn().mockRejectedValue(apiError)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate image',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toBe('Failed to generate image with Gemini')
        expect(result.error.context?.upstreamMessage).toContain('API quota exceeded')
      }
    })

    it('should return NetworkError for network-related failures', async () => {
      const networkError = errorWithCode('ECONNRESET', 'ECONNRESET')
      mockGeminiClientInstance.models.generateContent = vi.fn().mockRejectedValue(networkError)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate image',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('Network error')
      }
    })

    it('should return GeminiAPIError when response is malformed', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate image',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('No image generated')
      }
    })

    it('should handle prompt feedback blocking with safety reasons', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate violent content',
      })

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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate inappropriate image',
      })

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
        expect(result.error.context?.safetyRatings).toContain('Sexually Explicit (BLOCKED)')
      }
    })

    it('should handle finish reason MAX_TOKENS', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate extremely complex scene with many details',
      })

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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate prohibited content',
      })

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
  })

  describe('GeminiClient.generateImage with aspectRatio', () => {
    it('should call API with imageConfig when aspectRatio is specified', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'test prompt for aspect ratio',
        aspectRatio: '16:9',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.prompt).toBe('test prompt for aspect ratio')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ imageConfig: { aspectRatio: '16:9' } }),
        })
      )
    })

    it('should generate image successfully without aspectRatio', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'test prompt without aspect ratio',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.prompt).toBe('test prompt without aspect ratio')
      }
      const request = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(request.config.imageConfig).toBeUndefined()
    })
  })

  describe('GeminiClient.generateImage with useGoogleSearch', () => {
    it('should generate image successfully with useGoogleSearch enabled', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate current 2025 weather map of Tokyo',
        useGoogleSearch: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.prompt).toBe('Generate current 2025 weather map of Tokyo')
      }

      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.tools).toEqual([
        { googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } } },
      ])
    })

    it('should generate image successfully with useGoogleSearch disabled', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate creative fantasy landscape',
        useGoogleSearch: false,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.prompt).toBe('Generate creative fantasy landscape')
      }

      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.tools).toBeUndefined()
    })

    it('should generate image successfully without useGoogleSearch parameter', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate image without grounding',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.prompt).toBe('Generate image without grounding')
      }

      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.tools).toBeUndefined()
    })

    it('should generate image with combined parameters', async () => {
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

      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'Generate 2025 Japan foodtech industry chaos map',
        useGoogleSearch: true,
        aspectRatio: '16:9',
        imageSize: '4K',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeInstanceOf(Buffer)
        expect(result.data.metadata.prompt).toBe('Generate 2025 Japan foodtech industry chaos map')
      }

      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.tools).toEqual([
        { googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } } },
      ])
      expect(callArgs.config.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '4K' })
    })
  })

  describe('GeminiClient.generateImage with quality presets', () => {
    const mockSuccessResponse = {
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

    it('should use gemini-3.1-flash-image for fast preset (default)', async () => {
      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSuccessResponse)

      const clientResult = createGeminiClient(testConfig) // testConfig has imageQuality: 'fast'
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({ prompt: 'test fast preset' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.model).toBe('gemini-3.1-flash-image')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-flash-image',
          config: expect.not.objectContaining({
            thinkingConfig: expect.anything(),
          }),
        })
      )
    })

    it('should use gemini-3.1-flash-image with thinkingConfig for balanced preset', async () => {
      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSuccessResponse)

      const balancedConfig: Config = { ...testConfig, imageQuality: 'balanced' }
      const clientResult = createGeminiClient(balancedConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({ prompt: 'test balanced preset' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.model).toBe('gemini-3.1-flash-image')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-flash-image',
          config: expect.objectContaining({
            thinkingConfig: { thinkingLevel: 'HIGH' },
          }),
        })
      )
    })

    it('should use gemini-3-pro-image for quality preset', async () => {
      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSuccessResponse)

      const qualityConfig: Config = { ...testConfig, imageQuality: 'quality' }
      const clientResult = createGeminiClient(qualityConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({ prompt: 'test quality preset' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.model).toBe('gemini-3-pro-image')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3-pro-image',
          config: expect.not.objectContaining({
            thinkingConfig: expect.anything(),
          }),
        })
      )
    })

    it('should allow per-request quality override', async () => {
      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSuccessResponse)

      const clientResult = createGeminiClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({
        prompt: 'test per-request override',
        quality: 'quality',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.model).toBe('gemini-3-pro-image')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3-pro-image',
        })
      )
    })

    it('should fall back to constructor default quality when params.quality is undefined', async () => {
      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSuccessResponse)

      const balancedConfig: Config = { ...testConfig, imageQuality: 'balanced' }
      const clientResult = createGeminiClient(balancedConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) {
        return
      }
      const client = clientResult.data

      const result = await client.generateImage({ prompt: 'test default fallback' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.model).toBe('gemini-3.1-flash-image')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-flash-image',
          config: expect.objectContaining({
            thinkingConfig: { thinkingLevel: 'HIGH' },
          }),
        })
      )
    })
  })
})
