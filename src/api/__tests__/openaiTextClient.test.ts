import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import { createOpenAITextClient } from '../openaiTextClient'

const mockResponsesCreate = vi.fn()
const mockOpenAI = vi.fn()

vi.mock('openai', () => ({
  default: class {
    responses = {
      create: mockResponsesCreate,
    }

    constructor(...args: any[]) {
      mockOpenAI(...args)
    }
  },
}))

describe('openaiTextClient', () => {
  const testConfig: Config = {
    imageProvider: 'openai',
    geminiApiKey: '',
    openaiApiKey: 'test-openai-api-key-12345',
    imageOutputDir: './output',
    apiTimeout: 30000,
    skipPromptEnhancement: false,
    imageQuality: 'fast',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create client with OpenAI API key', () => {
    const result = createOpenAITextClient(testConfig)

    expect(result.success).toBe(true)
    expect(mockOpenAI).toHaveBeenCalledWith({ apiKey: testConfig.openaiApiKey })
  })

  it('should generate text using OpenAI Responses API', async () => {
    mockResponsesCreate.mockResolvedValue({
      output_text: 'Enhanced prompt with precise lighting and composition',
    })

    const clientResult = createOpenAITextClient(testConfig)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    const result = await clientResult.data.generateText('make a product photo', {
      systemInstruction: 'Enhance image prompts',
      maxTokens: 1000,
      temperature: 0.2,
    })

    expect(result.success).toBe(true)
    expect(mockResponsesCreate).toHaveBeenCalledWith(
      {
        model: 'gpt-4o-mini',
        input: 'make a product photo',
        instructions: 'Enhance image prompts',
        max_output_tokens: 1000,
        temperature: 0.2,
        top_p: 0.95,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    if (result.success) {
      expect(result.data).toBe('Enhanced prompt with precise lighting and composition')
    }
  })

  it('should include input image as a data URL for multimodal prompt enhancement', async () => {
    mockResponsesCreate.mockResolvedValue({
      output_text: 'Enhanced edit prompt preserving original style',
    })

    const clientResult = createOpenAITextClient(testConfig)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    await clientResult.data.generateText('make the lighting warmer', {
      inputImage: Buffer.from('image-bytes').toString('base64'),
      inputImageMimeType: 'image/png',
    })

    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'make the lighting warmer',
              },
              {
                type: 'input_image',
                image_url: `data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}`,
                detail: 'auto',
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('should return ImageAPIError for empty OpenAI text response', async () => {
    mockResponsesCreate.mockResolvedValue({ output_text: '' })

    const clientResult = createOpenAITextClient(testConfig)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    const result = await clientResult.data.generateText('make a product photo')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(result.error.context?.upstreamMessage).toContain('Empty response')
    }
  })

  it('should reject prompts that exceed the 100k character cap', async () => {
    const clientResult = createOpenAITextClient(testConfig)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    const overLimitPrompt = 'a'.repeat(100_001)
    const result = await clientResult.data.generateText(overLimitPrompt)

    expect(result.success).toBe(false)
    expect(mockResponsesCreate).not.toHaveBeenCalled()
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(result.error.message).toContain('Prompt too long')
    }
  })

  it('should accept prompts at the 100k character cap', async () => {
    mockResponsesCreate.mockResolvedValue({ output_text: 'ok' })

    const clientResult = createOpenAITextClient(testConfig)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    const atLimitPrompt = 'a'.repeat(100_000)
    const result = await clientResult.data.generateText(atLimitPrompt)

    expect(result.success).toBe(true)
  })

  it('should return NetworkError for network failures', async () => {
    const networkError = new Error('ECONNRESET') as Error & { code: string }
    networkError.code = 'ECONNRESET'
    mockResponsesCreate.mockRejectedValue(networkError)

    const clientResult = createOpenAITextClient(testConfig)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    const result = await clientResult.data.generateText('make a product photo')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(NetworkError)
    }
  })
})
