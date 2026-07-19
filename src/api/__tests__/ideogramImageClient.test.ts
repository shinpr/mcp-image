import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import { createIdeogramImageClient } from '../ideogramImageClient'

const mockFetch = vi.fn()

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Response
}

function errorResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
    headers: new Headers(),
  } as unknown as Response
}

function imageResponse(data: string, contentType = 'image/png'): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => {
      const buf = Buffer.from(data)
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    },
    headers: new Headers({ 'content-type': contentType }),
  } as unknown as Response
}

describe('ideogramImageClient', () => {
  const testConfig: Config = {
    imageProvider: 'ideogram',
    geminiApiKey: '',
    openaiApiKey: '',
    ideogramApiKey: 'test-ideogram-api-key-12345',
    imageOutputDir: './output',
    apiTimeout: 30000,
    skipPromptEnhancement: false,
    imageQuality: 'fast',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('createIdeogramImageClient', () => {
    it('should create client with Ideogram API key', () => {
      const result = createIdeogramImageClient(testConfig)
      expect(result.success).toBe(true)
    })

    it('should return error when API key is missing', () => {
      const result = createIdeogramImageClient({ ...testConfig, ideogramApiKey: '' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('IDEOGRAM_API_KEY is not configured')
      }
    })
  })

  describe('IdeogramImageClient.generateImage', () => {
    it('should generate an image successfully via the v4 endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            response_type: 'url',
            created: '2026-01-01T00:00:00Z',
            data: [{ url: 'https://ideogram.ai/api/images/ephemeral/abc.png', prompt: 'a cat' }],
          })
        )
        .mockResolvedValueOnce(imageResponse('mock-ideogram-image-data'))

      const clientResult = createIdeogramImageClient(testConfig)
      expect(clientResult.success).toBe(true)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({ prompt: 'a cat' })

      expect(result.success).toBe(true)
      // First call is the generation request.
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.ideogram.ai/v1/ideogram-v4/generate')
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({ 'Api-Key': 'test-ideogram-api-key-12345' })
      const body = init.body as FormData
      expect(body.get('text_prompt')).toBe('a cat')
      expect(body.get('rendering_speed')).toBe('TURBO')
      // v4 has no `prompt`, `magic_prompt`, or `num_images` fields.
      expect(body.get('prompt')).toBeNull()
      expect(body.get('magic_prompt')).toBeNull()
      expect(body.get('num_images')).toBeNull()

      if (result.success) {
        expect(result.data.imageData).toEqual(Buffer.from('mock-ideogram-image-data'))
        expect(result.data.metadata.model).toBe('ideogram-v4')
        expect(result.data.metadata.provider).toBe('ideogram')
        expect(result.data.metadata.prompt).toBe('a cat')
        expect(result.data.metadata.mimeType).toBe('image/png')
        expect(result.data.metadata.inputImageProvided).toBe(false)
      }
    })

    it('should map quality preset to QUALITY rendering speed', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      await clientResult.data.generateImage({ prompt: 'x', quality: 'quality' })

      const body = mockFetch.mock.calls[0][1].body as FormData
      expect(body.get('rendering_speed')).toBe('QUALITY')
    })

    it('should map balanced quality to DEFAULT rendering speed', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      await clientResult.data.generateImage({ prompt: 'x', quality: 'balanced' })

      const body = mockFetch.mock.calls[0][1].body as FormData
      expect(body.get('rendering_speed')).toBe('DEFAULT')
    })

    it('should use the aspect ratio for orientation only (no aspect_ratio field in v4)', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      // fast quality + landscape orientation
      await clientResult.data.generateImage({ prompt: 'x', aspectRatio: '16:9' })

      const body = mockFetch.mock.calls[0][1].body as FormData
      expect(body.get('resolution')).toBe('2560x1440')
      // v4 does not accept an aspect_ratio field.
      expect(body.get('aspect_ratio')).toBeNull()
    })

    it('should let IMAGE_QUALITY select a larger resolution for the same orientation', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      // Same landscape orientation, different quality presets -> different resolution.
      await clientResult.data.generateImage({ prompt: 'x', aspectRatio: '16:9', quality: 'fast' })
      await clientResult.data.generateImage({
        prompt: 'x',
        aspectRatio: '16:9',
        quality: 'quality',
      })

      const fastBody = mockFetch.mock.calls[0][1].body as FormData
      const qualityBody = mockFetch.mock.calls[2][1].body as FormData
      expect(fastBody.get('resolution')).toBe('2560x1440')
      expect(qualityBody.get('resolution')).toBe('2496x1664')
    })

    it('should pick a portrait resolution for portrait aspect ratios', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      await clientResult.data.generateImage({
        prompt: 'x',
        aspectRatio: '9:16',
        quality: 'balanced',
      })

      const body = mockFetch.mock.calls[0][1].body as FormData
      expect(body.get('resolution')).toBe('1728x2304')
    })

    it('should default to the square resolution when no aspect ratio is provided', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      await clientResult.data.generateImage({ prompt: 'x', quality: 'quality' })

      const body = mockFetch.mock.calls[0][1].body as FormData
      // Square has a single v4 resolution, so the quality preset has no size effect.
      expect(body.get('resolution')).toBe('2048x2048')
    })

    it('should expose the revised prompt when Ideogram rewrites it', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png', prompt: 'a fluffy cat' }] })
        )
        .mockResolvedValueOnce(imageResponse('img'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({ prompt: 'a cat' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.revisedPrompt).toBe('a fluffy cat')
      }
    })

    it('should reject useGoogleSearch', async () => {
      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({
        prompt: 'x',
        useGoogleSearch: true,
      })

      expect(result.success).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('useGoogleSearch')
      }
    })

    it('should reject image-to-image editing requests', async () => {
      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({
        prompt: 'x',
        inputImage: Buffer.from('input').toString('base64'),
        inputImageMimeType: 'image/png',
      })

      expect(result.success).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('Image-to-image editing is not supported')
      }
    })

    it('should return ImageAPIError when the response contains no image URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({ prompt: 'x' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('No image data returned')
      }
    })

    it('should return ImageAPIError with the upstream status on API failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'invalid api key'))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({ prompt: 'x' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('status 401')
      }
    })

    it('should return ImageAPIError when the image download fails', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram.ai/img.png' }] }))
        .mockResolvedValueOnce(errorResponse(404))

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({ prompt: 'x' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(result.error.message).toContain('Failed to download generated image')
      }
    })

    it('should return NetworkError for network failures', async () => {
      const networkError = new Error('ECONNRESET') as Error & { code: string }
      networkError.code = 'ECONNRESET'
      mockFetch.mockRejectedValueOnce(networkError)

      const clientResult = createIdeogramImageClient(testConfig)
      if (!clientResult.success) return

      const result = await clientResult.data.generateImage({ prompt: 'x' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
      }
    })
  })
})
