import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Config, getConfig } from '../../utils/config'
import { ImageAPIError, NetworkError } from '../../utils/errors'
import { createSeedreamTextClient } from '../seedreamTextClient'

const MODELARK_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
const DUMMY_API_KEY = 'ark-dummy-seedream-text-key'
const WRAPPED_DUMMY_API_KEY = ` \t${DUMMY_API_KEY}\n `
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

function stubSeedreamEnvironment(): void {
  vi.stubEnv('IMAGE_PROVIDER', 'seedream')
  vi.stubEnv('GEMINI_API_KEY', 'gemini-dummy-seedream-text-key')
  vi.stubEnv('OPENAI_API_KEY', 'openai-dummy-seedream-text-key')
  vi.stubEnv('ARK_API_KEY', WRAPPED_DUMMY_API_KEY)
  vi.stubEnv('IMAGE_OUTPUT_DIR', './output')
  vi.stubEnv('IMAGE_QUALITY', 'fast')
  vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
  vi.stubEnv('NODE_ENV', 'test')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('seedreamTextClient', () => {
  it('uses the configuration-normalized environment key in SDK Authorization', async () => {
    stubSeedreamEnvironment()
    const configResult = getConfig()
    expect(configResult.success).toBe(true)
    if (!configResult.success) {
      throw configResult.error
    }
    expect(configResult.data.arkApiKey).toBe(DUMMY_API_KEY)

    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse('normalized authorization response'))
    vi.stubGlobal('fetch', transport)
    const clientResult = createSeedreamTextClient(configResult.data)
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) {
      throw clientResult.error
    }

    const result = await clientResult.data.generateText(PRIVATE_PROMPT)

    expect(result).toEqual({ success: true, data: 'normalized authorization response' })
    expect(transport).toHaveBeenCalledTimes(1)
    const [, init] = transport.mock.calls[0]
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${DUMMY_API_KEY}`)
  })

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

    expect(result).toEqual({ success: true, data: enhancedPrompt.trim() })
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

  it('rejects a partial prompt when Responses reports max-output-token truncation', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: 'partial enhanced prompt',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )
    vi.stubGlobal('fetch', transport)

    const result = await createClient().generateText(PRIVATE_PROMPT, { maxTokens: 384 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ImageAPIError)
      expect(result.error.message).toContain('incomplete')
    }
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
