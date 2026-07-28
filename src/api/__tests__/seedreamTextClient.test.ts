import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import { createSeedreamTextClient } from '../seedreamTextClient'

const MODELARK_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
const DUMMY_API_KEY = 'ark-dummy-seedream-text-key'
const PRIVATE_PROMPT = 'private-seedream-text-prompt'

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

function successfulResponse(outputText: string): Response {
  return new Response(JSON.stringify({ output_text: outputText }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function readSerializedBody(init: RequestInit | undefined): Record<string, unknown> {
  expect(typeof init?.body).toBe('string')
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

function createClient() {
  const clientResult = createSeedreamTextClient(testConfig)
  expect(clientResult.success).toBe(true)
  if (!clientResult.success) {
    throw clientResult.error
  }
  return clientResult.data
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('seedreamTextClient', () => {
  it('serializes the pinned Responses request through the installed SDK and returns exact text', async () => {
    const enhancedPrompt = '  fixture enhanced prompt\n'
    const transport = vi.fn<typeof fetch>().mockResolvedValue(successfulResponse(enhancedPrompt))
    vi.stubGlobal('fetch', transport)
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    const result = await createClient().generateText(PRIVATE_PROMPT, {
      systemInstruction: 'Enhance image prompts',
      maxTokens: 1000,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
    })

    expect(result).toEqual({ success: true, data: enhancedPrompt })
    expect(transport).toHaveBeenCalledTimes(1)

    const [url, init] = transport.mock.calls[0]
    const body = readSerializedBody(init)

    expect(String(url)).toBe(`${MODELARK_BASE_URL}/responses`)
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${DUMMY_API_KEY}`)
    expect(body).toEqual({
      model: 'seed-2-0-lite-260428',
      input: PRIVATE_PROMPT,
      instructions: 'Enhance image prompts',
      max_output_tokens: 1000,
      temperature: 0.2,
      top_p: 0.9,
      thinking: { type: 'disabled' },
    })
    expect(Object.hasOwn(body, 'extra_body')).toBe(false)
    expect(Object.hasOwn(body, 'topK')).toBe(false)
    expect(JSON.stringify(body)).not.toContain(DUMMY_API_KEY)
    expect(timeoutSpy).toHaveBeenCalledWith(30000)
  })

  it('preserves multimodal TextClient input without provider-native prompt fields', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse('enhanced edit prompt'))
    vi.stubGlobal('fetch', transport)
    const encodedImage = Buffer.from('fixture-image-bytes').toString('base64')

    const result = await createClient().generateText(PRIVATE_PROMPT, {
      inputImage: encodedImage,
      inputImageMimeType: 'image/png',
    })

    expect(result).toEqual({ success: true, data: 'enhanced edit prompt' })
    const body = readSerializedBody(transport.mock.calls[0]?.[1])
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: PRIVATE_PROMPT },
          {
            type: 'input_image',
            image_url: `data:image/png;base64,${encodedImage}`,
            detail: 'auto',
          },
        ],
      },
    ])
    expect(Object.hasOwn(body, 'extra_body')).toBe(false)
  })

  it('validates the local Responses connection without external I/O', async () => {
    const transport = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', transport)

    const result = await createClient().validateConnection()

    expect(result).toEqual({ success: true, data: true })
    expect(transport).not.toHaveBeenCalled()
  })

  it('normalizes SDK status errors without disclosing secrets, prompts, or upstream bodies', async () => {
    const rawBodyMarker = 'private-upstream-response-body'
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: `${rawBodyMarker} ${PRIVATE_PROMPT} ${DUMMY_API_KEY}`,
            type: 'authentication_error',
          },
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    )
    vi.stubGlobal('fetch', transport)

    const result = await createClient().generateText(PRIVATE_PROMPT)

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error).toBeInstanceOf(ImageAPIError)
    expect((result.error as ImageAPIError & { statusCode?: number }).statusCode).toBe(401)

    const disclosed = JSON.stringify({
      message: result.error.message,
      suggestion: result.error.suggestion,
      context: result.error.context,
    })
    expect(disclosed).not.toContain(DUMMY_API_KEY)
    expect(disclosed).not.toContain(PRIVATE_PROMPT)
    expect(disclosed).not.toContain(rawBodyMarker)
  })

  it('normalizes an SDK abort as a sanitized NetworkError', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          })
        })
    )
    vi.stubGlobal('fetch', transport)

    const result = await createClient().generateText(PRIVATE_PROMPT, { timeout: 1 })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error).toBeInstanceOf(NetworkError)
    const disclosed = JSON.stringify({
      message: result.error.message,
      suggestion: result.error.suggestion,
      context: result.error.context,
    })
    expect(disclosed).not.toContain(DUMMY_API_KEY)
    expect(disclosed).not.toContain(PRIVATE_PROMPT)
  })
})
