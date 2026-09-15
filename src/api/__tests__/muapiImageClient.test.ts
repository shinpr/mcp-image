import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import type { ImageClient } from '../imageClient'
import {
  createMuapiImageClient,
  MUAPI_IMAGE_ENDPOINT,
  MUAPI_IMAGE_MODEL,
  validateMuapiCapabilities,
} from '../muapiImageClient'

const DUMMY_API_KEY = 'muapi-dummy-image-key'
const PRIVATE_PROMPT = 'private muapi prompt'
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x69, 0x78, 0x74, 0x75, 0x72, 0x65,
])

const testConfig: Config = {
  imageProvider: 'muapi',
  geminiApiKey: '',
  openaiApiKey: '',
  arkApiKey: '',
  muapiApiKey: DUMMY_API_KEY,
  imageOutputDir: './output',
  skipPromptEnhancement: false,
  imageQuality: 'fast',
}

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function createClient(config: Config = testConfig): ImageClient {
  const result = createMuapiImageClient(config)
  expect(result.success).toBe(true)
  if (!result.success) {
    throw result.error
  }
  return result.data
}

function stubSuccessfulGeneration(): void {
  fetchMock.mockImplementation(async (url) => {
    if (String(url) === MUAPI_IMAGE_ENDPOINT) {
      return jsonResponse({ data: [{ url: 'https://cdn.muapi.ai/images/result.png' }] })
    }
    return new Response(PNG_BYTES, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  stubSuccessfulGeneration()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('muapiImageClient', () => {
  it('requires a MuAPI API key before creating the client', () => {
    const result = createMuapiImageClient({ ...testConfig, muapiApiKey: '  ' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(result.error.suggestion).toContain('MUAPI_API_KEY')
    }
  })

  it('sends the documented OpenAI-compatible request and downloads the returned URL', async () => {
    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      aspectRatio: '16:9',
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [generationUrl, generationInit] = fetchMock.mock.calls[0] ?? []
    expect(String(generationUrl)).toBe(MUAPI_IMAGE_ENDPOINT)
    expect(generationInit?.method).toBe('POST')
    expect(new Headers(generationInit?.headers).get('authorization')).toBe(
      `Bearer ${DUMMY_API_KEY}`
    )
    expect(JSON.parse(String(generationInit?.body))).toEqual({
      model: MUAPI_IMAGE_MODEL,
      prompt: PRIVATE_PROMPT,
      n: 1,
      size: '1792x1024',
    })

    const [downloadUrl, downloadInit] = fetchMock.mock.calls[1] ?? []
    expect(String(downloadUrl)).toBe('https://cdn.muapi.ai/images/result.png')
    expect(downloadInit?.redirect).toBe('error')
    expect(downloadInit?.headers).toBeUndefined()
    if (result.success) {
      expect(result.data.imageData).toEqual(PNG_BYTES)
      expect(result.data.metadata).toMatchObject({
        model: MUAPI_IMAGE_MODEL,
        provider: 'muapi',
        prompt: PRIVATE_PROMPT,
        mimeType: 'image/png',
        inputImageProvided: false,
      })
    }
  })

  it.each([
    ['1:1', '1024x1024'],
    ['16:9', '1792x1024'],
    ['9:16', '1024x1792'],
  ] as const)('maps the supported %s aspect ratio to %s', async (aspectRatio, size) => {
    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT, aspectRatio })

    expect(result.success).toBe(true)
    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toMatchObject({ size })
  })

  it.each([
    { name: 'unsupported aspect ratio', aspectRatio: '4:3' },
    { name: '2K output', imageSize: '2K' },
    { name: '4K output', imageSize: '4K' },
    { name: 'editing input', inputImage: 'aW1hZ2U=', inputImageMimeType: 'image/png' },
    { name: 'Google Search', useGoogleSearch: true },
  ])('rejects $name before transport', async (params) => {
    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT, ...params })

    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(result.error.message).not.toContain(PRIVATE_PROMPT)
    }
  })

  it('rejects a non-HTTPS result without downloading it', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ data: [{ url: 'http://cdn.muapi.ai/images/result.png' }] })
    )

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (!result.success) {
      expect(result.error.message).toContain('non-HTTPS')
    }
  })

  it('rejects a non-image download response', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === MUAPI_IMAGE_ENDPOINT) {
        return jsonResponse({ data: [{ url: 'https://cdn.muapi.ai/images/result.png' }] })
      }
      return new Response('not an image', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    })

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    if (!result.success) {
      expect(result.error.message).toContain('content type')
    }
  })

  it('bounds the downloaded image before buffering it', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === MUAPI_IMAGE_ENDPOINT) {
        return jsonResponse({ data: [{ url: 'https://cdn.muapi.ai/images/result.png' }] })
      }
      return new Response(PNG_BYTES, {
        status: 200,
        headers: {
          'content-length': String(32 * 1024 * 1024 + 1),
          'content-type': 'image/png',
        },
      })
    })

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('normalizes upstream HTTP and network failures without exposing response bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ secret: 'private upstream body' }, 401))
    const rejected = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(rejected.success).toBe(false)
    if (!rejected.success) {
      expect(rejected.error).toBeInstanceOf(ImageAPIError)
      expect(rejected.error.statusCode).toBe(401)
      expect(rejected.error.message).not.toContain('private upstream body')
    }

    fetchMock.mockReset().mockRejectedValue(new TypeError('network failed'))
    const network = await createClient().generateImage({ prompt: PRIVATE_PROMPT })
    expect(network.success).toBe(false)
    if (!network.success) {
      expect(network.error).toBeInstanceOf(NetworkError)
    }
  })

  it('exports capability validation for orchestration', () => {
    expect(validateMuapiCapabilities({ aspectRatio: '9:16', imageSize: '1K' })).toEqual({
      success: true,
      data: undefined,
    })
    expect(validateMuapiCapabilities({ aspectRatio: '21:9' })).toMatchObject({ success: false })
  })
})
