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

  it('rejects combined inline payloads over 20 MB before calling the SDK', async () => {
    const client = createGeminiClient(testConfig)
    if (!client.success) {
      throw client.error
    }
    const data = Buffer.alloc(8 * 1024 * 1024).toString('base64')
    const result = await client.data.generateImage({
      prompt: 'use both images',
      inputImages: [
        { data, mimeType: 'image/png' },
        { data, mimeType: 'image/jpeg' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain('20 MB')
    }
    expect(mockGeminiClientInstance.models.generateContent).not.toHaveBeenCalled()
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
                      data: 'iVBORw==',
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
        expect(result.data.imageData).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
        expect(result.data.metadata.prompt).toBe('Generate a beautiful landscape')
        expect(result.data.metadata.mimeType).toBe('image/png')
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

    it.each([
      { name: 'empty', candidatesField: { candidates: [] } },
      { name: 'omitted', candidatesField: {} },
    ])(
      'should handle prompt feedback blocking with safety reasons when candidates are $name',
      async ({ candidatesField }) => {
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
            ...candidatesField,
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
      }
    )

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

  describe('GeminiClient.generateImage request options', () => {
    const mockSuccessResponse = {
      response: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'iVBORw==', mimeType: 'image/png' } }],
            },
          },
        ],
      },
    }

    beforeEach(() => {
      mockGeminiClientInstance.models.generateContent = vi
        .fn()
        .mockResolvedValue(mockSuccessResponse)
    })

    it('maps aspectRatio, imageSize and useGoogleSearch into the request config', async () => {
      const clientResult = createGeminiClient(testConfig)
      if (!clientResult.success) {
        throw clientResult.error
      }

      const result = await clientResult.data.generateImage({
        prompt: 'Generate 2025 Japan foodtech industry chaos map',
        useGoogleSearch: true,
        aspectRatio: '16:9',
        imageSize: '4K',
      })

      expect(result.success).toBe(true)
      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.tools).toEqual([
        { googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } } },
      ])
      expect(callArgs.config.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '4K' })
    })

    it('omits imageConfig and tools when no options are given', async () => {
      const clientResult = createGeminiClient(testConfig)
      if (!clientResult.success) {
        throw clientResult.error
      }

      const result = await clientResult.data.generateImage({
        prompt: 'Generate image without options',
      })

      expect(result.success).toBe(true)
      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.imageConfig).toBeUndefined()
      expect(callArgs.config.tools).toBeUndefined()
    })

    it('omits tools when useGoogleSearch is false', async () => {
      const clientResult = createGeminiClient(testConfig)
      if (!clientResult.success) {
        throw clientResult.error
      }

      const result = await clientResult.data.generateImage({
        prompt: 'Generate creative fantasy landscape',
        useGoogleSearch: false,
      })

      expect(result.success).toBe(true)
      const callArgs = vi.mocked(mockGeminiClientInstance.models.generateContent).mock.calls[0][0]
      expect(callArgs.config.tools).toBeUndefined()
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

    it('should use gemini-nano-banana-2.1 with medium thinking for fast preset (default)', async () => {
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
        expect(result.data.metadata.model).toBe('gemini-nano-banana-2.1')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-nano-banana-2.1',
          config: expect.objectContaining({
            thinkingConfig: { thinkingLevel: 'MEDIUM' },
          }),
        })
      )
    })

    it('should use gemini-nano-banana-2.1 with thinkingConfig for balanced preset', async () => {
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
        expect(result.data.metadata.model).toBe('gemini-nano-banana-2.1')
      }
      expect(mockGeminiClientInstance.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-nano-banana-2.1',
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
  })
})
