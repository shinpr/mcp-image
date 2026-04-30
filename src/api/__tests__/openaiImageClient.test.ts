import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import { createOpenAIImageClient } from '../openaiImageClient'

const mockGenerate = vi.fn()
const mockEdit = vi.fn()
const mockOpenAI = vi.fn()
const mockToFile = vi.fn()

vi.mock('openai', () => ({
  default: class {
    images = {
      generate: mockGenerate,
      edit: mockEdit,
    }

    constructor(...args: any[]) {
      mockOpenAI(...args)
    }
  },
  toFile: (...args: any[]) => mockToFile(...args),
}))

describe('openaiImageClient', () => {
  const testConfig: Config = {
    imageProvider: 'openai',
    geminiApiKey: '',
    openaiApiKey: 'test-openai-api-key-12345',
    openaiImageModel: 'gpt-image-2',
    openaiTextModel: 'gpt-5.2',
    imageOutputDir: './output',
    apiTimeout: 30000,
    skipPromptEnhancement: false,
    imageQuality: 'fast',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockToFile.mockResolvedValue({ name: 'input.png', type: 'image/png' })
  })

  describe('createOpenAIImageClient', () => {
    it('should create client with OpenAI API key', () => {
      const result = createOpenAIImageClient(testConfig)

      expect(result.success).toBe(true)
      expect(mockOpenAI).toHaveBeenCalledWith({ apiKey: testConfig.openaiApiKey })
    })

    it('should return error when SDK initialization fails', () => {
      mockOpenAI.mockImplementationOnce(() => {
        throw new Error('Invalid API key')
      })

      const result = createOpenAIImageClient(testConfig)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('Failed to initialize OpenAI image client')
      }
    })
  })

  describe('OpenAIImageClient.generateImage', () => {
    it('should generate image successfully with gpt-image-2', async () => {
      mockGenerate.mockResolvedValue({
        data: [
          {
            b64_json: Buffer.from('mock-openai-image-data').toString('base64'),
          },
        ],
      })

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({
        prompt: 'Generate a beautiful landscape',
      })

      expect(result.success).toBe(true)
      expect(mockGenerate).toHaveBeenCalledWith({
        model: 'gpt-image-2',
        prompt: 'Generate a beautiful landscape',
        n: 1,
        output_format: 'png',
        quality: 'low',
        size: '1024x1024',
      })
      if (result.success) {
        expect(result.data.imageData).toEqual(Buffer.from('mock-openai-image-data'))
        expect(result.data.metadata.model).toBe('gpt-image-2')
        expect(result.data.metadata.provider).toBe('openai')
        expect(result.data.metadata.prompt).toBe('Generate a beautiful landscape')
        expect(result.data.metadata.mimeType).toBe('image/png')
      }
    })

    it('should edit image successfully with input image data', async () => {
      mockEdit.mockResolvedValue({
        data: [
          {
            b64_json: Buffer.from('mock-openai-edited-image-data').toString('base64'),
          },
        ],
      })

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      const inputImage = Buffer.from('input-image-data').toString('base64')
      const result = await clientResult.data.generateImage({
        prompt: 'Make this image warmer',
        inputImage,
        inputImageMimeType: 'image/png',
      })

      expect(result.success).toBe(true)
      expect(mockToFile).toHaveBeenCalledWith(Buffer.from('input-image-data'), 'input.png', {
        type: 'image/png',
      })
      expect(mockEdit).toHaveBeenCalledWith({
        model: 'gpt-image-2',
        prompt: 'Make this image warmer',
        image: { name: 'input.png', type: 'image/png' },
        n: 1,
        output_format: 'png',
        quality: 'low',
        size: '1024x1024',
      })
    })

    it('should map balanced quality to medium OpenAI quality', async () => {
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: Buffer.from('mock-openai-image-data').toString('base64') }],
      })

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      await clientResult.data.generateImage({
        prompt: 'Generate an image',
        quality: 'balanced',
      })

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'medium',
        })
      )
    })

    it('should map quality preset to high OpenAI quality', async () => {
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: Buffer.from('mock-openai-image-data').toString('base64') }],
      })

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      await clientResult.data.generateImage({
        prompt: 'Generate an image',
        quality: 'quality',
      })

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'high',
        })
      )
    })

    it('should map aspect ratio to closest OpenAI size', async () => {
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: Buffer.from('mock-openai-image-data').toString('base64') }],
      })

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      await clientResult.data.generateImage({
        prompt: 'Generate a landscape image',
        aspectRatio: '16:9',
      })

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          size: '1536x1024',
        })
      )
    })

    it('should return ImageAPIError when response has no base64 image data', async () => {
      mockGenerate.mockResolvedValue({
        data: [{}],
      })

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({
        prompt: 'Generate image',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('No image data returned')
      }
    })

    it('should return NetworkError for network failures', async () => {
      const networkError = new Error('ECONNRESET') as Error & { code: string }
      networkError.code = 'ECONNRESET'
      mockGenerate.mockRejectedValue(networkError)

      const clientResult = createOpenAIImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({
        prompt: 'Generate image',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
      }
    })
  })
})
