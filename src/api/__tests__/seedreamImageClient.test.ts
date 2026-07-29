import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, getConfig } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import type { ImageApiParams, ImageClient } from '../imageClient'
import { createSeedreamImageClient, validateSeedreamCapabilities } from '../seedreamImageClient'

const API_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations'
const DUMMY_API_KEY = 'ark-dummy-seedream-image-key'
const WRAPPED_DUMMY_API_KEY = ` \t${DUMMY_API_KEY}\n `
const PRIVATE_PROMPT = 'private-seedream-image-prompt'
const RAW_BODY_MARKER = 'private-upstream-body-marker'
const MIB = 1024 * 1024
const MAX_RESPONSE_BYTES = 48 * MIB
const MAX_DECODED_BYTES = 32 * MIB
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x69, 0x78, 0x74, 0x75, 0x72, 0x65,
])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x66, 0x69, 0x78, 0x74, 0x75, 0x72, 0x65])
const PRIVATE_INPUT_IMAGE = PNG_BYTES.toString('base64')
const ALL_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const

const testConfig: Config = {
  imageProvider: 'seedream',
  geminiApiKey: '',
  openaiApiKey: '',
  arkApiKey: DUMMY_API_KEY,
  imageOutputDir: './output',
  apiTimeout: 30000,
  skipPromptEnhancement: false,
  imageQuality: 'fast',
}

const fetchMock = vi.fn<typeof fetch>()

function successfulResponse(bytes = PNG_BYTES): Response {
  return jsonResponse({
    data: [
      {
        b64_json: bytes.toString('base64'),
        size: '1024x1024',
        output_format: 'png',
      },
    ],
  })
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createClient(config: Config = testConfig): ImageClient {
  const result = createSeedreamImageClient(config)
  expect(result.success).toBe(true)
  if (!result.success) {
    throw result.error
  }
  return result.data
}

function readRequest(callIndex = -1): {
  body: Record<string, unknown>
  headers: Headers
  init: RequestInit
  url: string
} {
  const [url, rawInit] = fetchMock.mock.calls.at(callIndex) ?? []
  const init = rawInit ?? {}
  expect(typeof init.body).toBe('string')
  return {
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
    headers: new Headers(init.headers),
    init,
    url: String(url),
  }
}

function disclosedError(error: ImageAPIError | NetworkError): string {
  return JSON.stringify({
    code: error.code,
    context: error.context,
    message: error.message,
    suggestion: error.suggestion,
  })
}

function stubSeedreamEnvironment(): void {
  vi.stubEnv('IMAGE_PROVIDER', 'seedream')
  vi.stubEnv('GEMINI_API_KEY', 'gemini-dummy-seedream-image-key')
  vi.stubEnv('OPENAI_API_KEY', 'openai-dummy-seedream-image-key')
  vi.stubEnv('ARK_API_KEY', WRAPPED_DUMMY_API_KEY)
  vi.stubEnv('IMAGE_OUTPUT_DIR', './output')
  vi.stubEnv('IMAGE_QUALITY', 'fast')
  vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
  vi.stubEnv('NODE_ENV', 'test')
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(successfulResponse())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('seedreamImageClient', () => {
  it('uses the configuration-normalized environment key in direct HTTP Authorization', async () => {
    stubSeedreamEnvironment()
    const configResult = getConfig()
    expect(configResult.success).toBe(true)
    if (!configResult.success) {
      throw configResult.error
    }
    expect(configResult.data.arkApiKey).toBe(DUMMY_API_KEY)

    const result = await createClient(configResult.data).generateImage({
      prompt: PRIVATE_PROMPT,
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readRequest().headers.get('authorization')).toBe(`Bearer ${DUMMY_API_KEY}`)
  })

  it.each([
    {
      name: 'fast default',
      quality: 'fast' as const,
      imageSize: undefined,
      model: 'dola-seedream-5-0-pro-260628',
      size: '1K',
      optimizer: 'fast' as const,
    },
    {
      name: 'balanced default',
      quality: 'balanced' as const,
      imageSize: undefined,
      model: 'dola-seedream-5-0-pro-260628',
      size: '1K',
      optimizer: 'standard' as const,
    },
    {
      name: 'balanced 2K override',
      quality: 'balanced' as const,
      imageSize: '2K' as const,
      model: 'dola-seedream-5-0-pro-260628',
      size: '2K',
      optimizer: 'standard' as const,
    },
    {
      name: 'quality default',
      quality: 'quality' as const,
      imageSize: undefined,
      model: 'dola-seedream-5-0-pro-260628',
      size: '1K',
      optimizer: 'standard' as const,
    },
    {
      name: 'quality 2K override',
      quality: 'quality' as const,
      imageSize: '2K' as const,
      model: 'dola-seedream-5-0-pro-260628',
      size: '2K',
      optimizer: 'standard' as const,
    },
  ])('routes and serializes the exact $name request', async (row) => {
    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      quality: row.quality,
      ...(row.imageSize && { imageSize: row.imageSize }),
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const request = readRequest()
    const expectedBody = {
      model: row.model,
      prompt: `${PRIVATE_PROMPT}\n\nOutput aspect ratio: 1:1.`,
      size: row.size,
      response_format: 'b64_json',
      output_format: 'png',
      stream: false,
      watermark: false,
      optimize_prompt_options: { mode: row.optimizer },
    }

    expect(request.url).toBe(API_ENDPOINT)
    expect(request.init.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe(`Bearer ${DUMMY_API_KEY}`)
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.body).toEqual(expectedBody)
    expect(Object.hasOwn(request.body, 'sequential_image_generation')).toBe(false)
    expect(Object.hasOwn(request.body, 'reasoning_effort')).toBe(false)
    expect(Object.hasOwn(request.body, 'thinking')).toBe(false)

    if (result.success) {
      expect(result.data).toEqual({
        imageData: PNG_BYTES,
        metadata: {
          model: row.model,
          provider: 'seedream',
          prompt: `${PRIVATE_PROMPT}\n\nOutput aspect ratio: 1:1.`,
          mimeType: 'image/png',
          timestamp: expect.any(Date),
          inputImageProvided: false,
        },
      })
    }
  })

  it('uses request quality before captured default quality', async () => {
    const client = createClient({ ...testConfig, imageQuality: 'fast' })

    const result = await client.generateImage({
      prompt: PRIVATE_PROMPT,
      quality: 'quality',
    })

    expect(result.success).toBe(true)
    expect(readRequest().body).toMatchObject({
      model: 'dola-seedream-5-0-pro-260628',
      size: '1K',
      optimize_prompt_options: { mode: 'standard' },
    })
  })

  it('uses one unchanged Method 1 suffix rule for all 14 aspect ratios', async () => {
    const client = createClient()

    for (const aspectRatio of ALL_ASPECT_RATIOS) {
      fetchMock.mockResolvedValueOnce(successfulResponse())

      const result = await client.generateImage({
        prompt: PRIVATE_PROMPT,
        quality: 'fast',
        imageSize: '2K',
        aspectRatio,
      })

      expect(result.success, aspectRatio).toBe(true)
      const body = readRequest().body
      expect(body.size, aspectRatio).toBe('2K')
      expect(body.prompt, aspectRatio).toBe(
        `${PRIVATE_PROMPT}\n\nOutput aspect ratio: ${aspectRatio}.`
      )
      expect(String(body.prompt), aspectRatio).not.toMatch(/\d+x\d+/)
    }

    expect(fetchMock).toHaveBeenCalledTimes(ALL_ASPECT_RATIOS.length)
  })

  it('serializes one supported input image as a data URI', async () => {
    const inputImage = PNG_BYTES.toString('base64')

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      inputImage,
      inputImageMimeType: 'image/png',
    })

    expect(result.success).toBe(true)
    expect(readRequest().body.image).toBe(`data:image/png;base64,${inputImage}`)
    if (result.success) {
      expect(result.data.metadata.inputImageProvided).toBe(true)
    }
  })

  it('requests and validates JPEG output for generation', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            b64_json: JPEG_BYTES.toString('base64'),
            mime_type: 'image/jpeg',
            output_format: 'jpeg',
          },
        ],
      })
    )

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      preferredOutputFormat: 'jpeg',
    })

    expect(result.success).toBe(true)
    expect(readRequest().body.output_format).toBe('jpeg')
    if (result.success) {
      expect(result.data.imageData).toEqual(JPEG_BYTES)
      expect(result.data.metadata.mimeType).toBe('image/jpeg')
    }
  })

  it('requests JPEG output for editing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ b64_json: JPEG_BYTES.toString('base64') }],
      })
    )

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      inputImage: PRIVATE_INPUT_IMAGE,
      inputImageMimeType: 'image/png',
      preferredOutputFormat: 'jpeg',
    })

    expect(result.success).toBe(true)
    expect(readRequest().body).toMatchObject({
      output_format: 'jpeg',
      image: `data:image/png;base64,${PRIVATE_INPUT_IMAGE}`,
    })
  })

  it.each([
    {
      name: 'Google Search',
      params: { useGoogleSearch: true },
    },
    {
      name: 'fast Pro 4K',
      params: { quality: 'fast', imageSize: '4K' },
    },
    {
      name: 'balanced Pro 4K',
      params: { quality: 'balanced', imageSize: '4K' },
    },
    {
      name: 'quality Pro 4K',
      params: { quality: 'quality', imageSize: '4K' },
    },
    {
      name: 'input image without MIME',
      params: { inputImage: PNG_BYTES.toString('base64') },
    },
    {
      name: 'MIME without input image',
      params: { inputImageMimeType: 'image/png' },
    },
    {
      name: 'unsupported editing MIME',
      params: {
        inputImage: PNG_BYTES.toString('base64'),
        inputImageMimeType: 'image/gif',
      },
    },
    {
      name: 'malformed editing base64',
      params: { inputImage: '***', inputImageMimeType: 'image/png' },
    },
    {
      name: 'unknown quality',
      params: { quality: 'unknown' },
    },
    {
      name: 'unknown aspect ratio',
      params: { aspectRatio: '3:1' },
    },
  ])('rejects unsupported $name before transport without coercion', async ({ params }) => {
    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      ...(params as ImageApiParams),
    })

    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(disclosedError(result.error)).not.toContain(PRIVATE_PROMPT)
    }
  })

  it('exports provider-neutral capability preflight for orchestration', () => {
    expect(
      validateSeedreamCapabilities(
        {
          quality: 'quality',
          imageSize: '2K',
          aspectRatio: '21:9',
        },
        'fast'
      )
    ).toEqual({ success: true, data: undefined })

    const rejected = validateSeedreamCapabilities({ useGoogleSearch: true }, 'fast')
    expect(rejected.success).toBe(false)
  })

  it.each([
    {
      name: 'missing data',
      response: () => jsonResponse({}),
    },
    {
      name: 'extra images',
      response: () =>
        jsonResponse({
          data: [
            { b64_json: PNG_BYTES.toString('base64'), mime_type: 'image/png' },
            { b64_json: PNG_BYTES.toString('base64'), mime_type: 'image/png' },
          ],
        }),
    },
    {
      name: 'URL-only data',
      response: () => jsonResponse({ data: [{ url: 'https://attacker.invalid/image.png' }] }),
    },
    {
      name: 'URL plus base64 data',
      response: () =>
        jsonResponse({
          data: [
            {
              b64_json: PNG_BYTES.toString('base64'),
              mime_type: 'image/png',
              url: 'https://attacker.invalid/image.png',
            },
          ],
        }),
    },
    {
      name: 'stream property plus base64 data',
      response: () =>
        jsonResponse({
          data: [
            {
              b64_json: PNG_BYTES.toString('base64'),
              mime_type: 'image/png',
              stream: false,
            },
          ],
        }),
    },
    {
      name: 'malformed base64',
      response: () => jsonResponse({ data: [{ b64_json: '***', mime_type: 'image/png' }] }),
    },
    {
      name: 'empty base64',
      response: () => jsonResponse({ data: [{ b64_json: '', mime_type: 'image/png' }] }),
    },
    {
      name: 'non-PNG bytes',
      response: () =>
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from('not a png').toString('base64'),
              mime_type: 'image/png',
            },
          ],
        }),
    },
    {
      name: 'non-PNG MIME',
      response: () =>
        jsonResponse({
          data: [{ b64_json: PNG_BYTES.toString('base64'), mime_type: 'image/jpeg' }],
        }),
    },
    {
      name: 'non-PNG output format',
      response: () =>
        jsonResponse({
          data: [{ b64_json: PNG_BYTES.toString('base64'), output_format: 'jpeg' }],
        }),
    },
  ])('rejects $name without returning image bytes', async ({ response }) => {
    fetchMock.mockResolvedValueOnce(response())

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(disclosedError(result.error)).not.toContain(PRIVATE_PROMPT)
    }
  })

  it.each([
    {
      name: 'missing body',
      response: () =>
        new Response(null, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
    {
      name: 'malformed JSON',
      response: () =>
        new Response('{"data":', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
  ])('normalizes a $name response as a sanitized contract failure', async ({ response }) => {
    fetchMock.mockResolvedValueOnce(response())

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      inputImage: PRIVATE_INPUT_IMAGE,
      inputImageMimeType: 'image/png',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      const disclosed = disclosedError(result.error)
      expect(disclosed).not.toContain(DUMMY_API_KEY)
      expect(disclosed).not.toContain(PRIVATE_PROMPT)
      expect(disclosed).not.toContain(PRIVATE_INPUT_IMAGE)
    }
  })

  it('rejects a streaming event shape before JSON parsing', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    fetchMock.mockResolvedValueOnce(
      new Response(`data: ${JSON.stringify({ data: [] })}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    )

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(parseSpy).not.toHaveBeenCalled()
  })

  it('rejects an oversized numeric Content-Length before reading or parsing and cancels the body', async () => {
    const cancel = vi.fn()
    const parseSpy = vi.spyOn(JSON, 'parse')
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new TextEncoder().encode('must not be parsed'))
      },
    })
    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: {
          'content-length': String(MAX_RESPONSE_BYTES + 1),
          'content-type': 'application/json',
        },
      })
    )

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(parseSpy).not.toHaveBeenCalled()
  })

  it('counts a chunked body, cancels immediately after 48 MiB, and never parses it', async () => {
    const cancel = vi.fn()
    const parseSpy = vi.spyOn(JSON, 'parse')
    let chunk = 0
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        if (chunk === 0) {
          controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES))
        } else if (chunk === 1) {
          controller.enqueue(new Uint8Array(1))
        }
        chunk += 1
      },
    })
    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(parseSpy).not.toHaveBeenCalled()
  })

  it('rejects decoded data above 32 MiB before Buffer base64 decode', async () => {
    const decodedSize = MAX_DECODED_BYTES + 1
    const padding = (3 - (decodedSize % 3)) % 3
    const encodedLength = Math.ceil(decodedSize / 3) * 4
    const oversizedBase64 = `${'A'.repeat(encodedLength - padding)}${'='.repeat(padding)}`
    const bufferFromSpy = vi.spyOn(Buffer, 'from')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ b64_json: oversizedBase64, mime_type: 'image/png' }],
      })
    )

    const result = await createClient().generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(false)
    expect(
      bufferFromSpy.mock.calls.filter(
        ([value, encoding]) => value === oversizedBase64 && encoding === 'base64'
      )
    ).toHaveLength(0)
  })

  it('constructs the image AbortSignal from the fixed 300000 ms timeout only', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    const result = await createClient({
      ...testConfig,
      apiTimeout: 1,
    }).generateImage({ prompt: PRIVATE_PROMPT })

    expect(result.success).toBe(true)
    expect(timeoutSpy).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledWith(300000)
    expect(timeoutSpy).not.toHaveBeenCalledWith(1)
    expect(timeoutSpy).not.toHaveBeenCalledWith(30000)
  })

  it('rejects missing or whitespace auth during factory preflight', () => {
    for (const arkApiKey of ['', '   ']) {
      const result = createSeedreamImageClient({ ...testConfig, arkApiKey })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ImageAPIError)
        expect(disclosedError(result.error)).not.toContain(DUMMY_API_KEY)
      }
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'HTTP 401',
      response: () =>
        jsonResponse({ error: { message: `${RAW_BODY_MARKER}:${PRIVATE_PROMPT}` } }, 401),
      errorType: ImageAPIError,
    },
    {
      name: 'HTTP 429',
      response: () =>
        jsonResponse({ error: { message: `${RAW_BODY_MARKER}:${PRIVATE_PROMPT}` } }, 429),
      errorType: ImageAPIError,
    },
    {
      name: 'HTTP 500',
      response: () =>
        jsonResponse({ error: { message: `${RAW_BODY_MARKER}:${PRIVATE_PROMPT}` } }, 500),
      errorType: NetworkError,
    },
  ])('normalizes and sanitizes $name without reading its upstream body', async (row) => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const parseSpy = vi.spyOn(JSON, 'parse')
    fetchMock.mockResolvedValueOnce(row.response())

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      inputImage: PRIVATE_INPUT_IMAGE,
      inputImageMimeType: 'image/png',
    })

    expect(result.success).toBe(false)
    expect(parseSpy).not.toHaveBeenCalled()
    expect(consoleSpy).not.toHaveBeenCalled()
    if (!result.success) {
      expect(result.error).toBeInstanceOf(row.errorType)
      const disclosed = disclosedError(result.error)
      expect(disclosed).not.toContain(DUMMY_API_KEY)
      expect(disclosed).not.toContain(PRIVATE_PROMPT)
      expect(disclosed).not.toContain(PRIVATE_INPUT_IMAGE)
      expect(disclosed).not.toContain(RAW_BODY_MARKER)
    }
  })

  it.each([
    {
      name: 'network',
      error: new TypeError(`fetch failed: ${RAW_BODY_MARKER}:${PRIVATE_PROMPT}`),
      expectedMessage: 'Network error',
    },
    {
      name: 'abort',
      error: new DOMException(`${RAW_BODY_MARKER}:${PRIVATE_PROMPT}`, 'AbortError'),
      expectedMessage: 'Timeout',
    },
    {
      name: 'timeout',
      error: new DOMException(`${RAW_BODY_MARKER}:${PRIVATE_PROMPT}`, 'TimeoutError'),
      expectedMessage: 'Timeout',
    },
  ])('normalizes and sanitizes a $name failure', async (row) => {
    fetchMock.mockRejectedValueOnce(row.error)

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      inputImage: PRIVATE_INPUT_IMAGE,
      inputImageMimeType: 'image/png',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(NetworkError)
      expect(result.error.message).toContain(row.expectedMessage)
      const disclosed = disclosedError(result.error)
      expect(disclosed).not.toContain(DUMMY_API_KEY)
      expect(disclosed).not.toContain(PRIVATE_PROMPT)
      expect(disclosed).not.toContain(PRIVATE_INPUT_IMAGE)
      expect(disclosed).not.toContain(RAW_BODY_MARKER)
    }
  })

  it('sanitizes a parsed contract failure without disclosing the upstream payload', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        marker: `${RAW_BODY_MARKER}:${PRIVATE_PROMPT}:${DUMMY_API_KEY}`,
        data: [],
      })
    )

    const result = await createClient().generateImage({
      prompt: PRIVATE_PROMPT,
      inputImage: PRIVATE_INPUT_IMAGE,
      inputImageMimeType: 'image/png',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      const disclosed = disclosedError(result.error)
      expect(disclosed).not.toContain(DUMMY_API_KEY)
      expect(disclosed).not.toContain(PRIVATE_PROMPT)
      expect(disclosed).not.toContain(PRIVATE_INPUT_IMAGE)
      expect(disclosed).not.toContain(RAW_BODY_MARKER)
    }
  })
})
