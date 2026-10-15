import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectArray,
  expectDefined,
  expectRecord,
  expectString,
  firstContentText,
  parseJsonObject,
  parseToolPayload,
  readPath,
} from '../../tests/helpers/inspect'
import { MAX_INPUT_IMAGES, type ReferenceImage } from '../../types/image.js'
import type { ImageProvider } from '../../types/mcp.js'
import { MCPServerImpl } from '../mcpServer.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=',
  'base64'
)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  })
}

function imageResponse(provider: ImageProvider): Response {
  return jsonResponse(
    provider === 'gemini'
      ? {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } }],
              },
              finishReason: 'STOP',
            },
          ],
        }
      : { data: [{ b64_json: PNG.toString('base64') }] }
  )
}

function textResponse(provider: ImageProvider): Response {
  return jsonResponse(
    provider === 'gemini'
      ? {
          candidates: [{ content: { parts: [{ text: 'enhanced prompt' }] }, finishReason: 'STOP' }],
        }
      : {
          id: 'test-response',
          object: 'response',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'enhanced prompt', annotations: [] }],
            },
          ],
        }
  )
}

function serializedBody(call: Parameters<typeof fetch>): Record<string, unknown> {
  return parseJsonObject(expectString(call[1]?.body, 'request body'), 'request JSON')
}

function assertTextReferences(
  provider: ImageProvider,
  call: Parameters<typeof fetch>,
  images: ReferenceImage[]
): void {
  const body = serializedBody(call)
  if (provider === 'gemini') {
    const parts = expectArray(
      readPath(expectArray(body['contents'], 'contents')[0], 'parts'),
      'text parts'
    )
    expect(parts.filter((part) => readPath(part, 'inlineData'))).toEqual(
      images.map((inlineData) => ({ inlineData }))
    )
    return
  }
  const content = expectArray(
    readPath(expectArray(body['input'], 'text input')[0], 'content'),
    'text content'
  )
  expect(content.filter((part) => readPath(part, 'type') === 'input_image')).toEqual(
    images.map(({ data, mimeType }) => ({
      type: 'input_image',
      image_url: `data:${mimeType};base64,${data}`,
      detail: 'auto',
    }))
  )
}

async function assertImageReferences(
  provider: ImageProvider,
  call: Parameters<typeof fetch>,
  images: ReferenceImage[],
  prompt: string
): Promise<void> {
  if (provider === 'openai') {
    expect(String(call[0])).toMatch(/\/images\/edits$/)
    const body = call[1]?.body
    expect(body).toBeInstanceOf(FormData)
    if (!(body instanceof FormData)) {
      throw new Error('Expected multipart image request')
    }
    const files = body.getAll('image[]')
    expect(files).toHaveLength(images.length)
    for (const [index, file] of files.entries()) {
      if (!(file instanceof File)) {
        throw new Error('Expected an uploaded image file')
      }
      const image = expectDefined(images[index], 'expected reference')
      expect(file.type).toBe(image.mimeType)
      expect(Buffer.from(await file.arrayBuffer())).toEqual(Buffer.from(image.data, 'base64'))
    }
    expect(body.get('prompt')).toBe(prompt)
    return
  }
  const body = serializedBody(call)
  if (provider === 'gemini') {
    const parts = expectArray(
      readPath(expectArray(body['contents'], 'contents')[0], 'parts'),
      'image parts'
    )
    expect(parts).toEqual([...images.map((inlineData) => ({ inlineData })), { text: prompt }])
    return
  }
  const dataUris = images.map(({ data, mimeType }) => `data:${mimeType};base64,${data}`)
  expect(body['image']).toEqual(images.length === 1 ? dataUris[0] : dataUris)
  expect(body['prompt']).toBe(`${prompt}\n\nOutput aspect ratio: 1:1.`)
}

function truncatedTextResponse(provider: ImageProvider): Response {
  return jsonResponse(
    provider === 'gemini'
      ? { candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }] }
      : {
          id: 'truncated',
          object: 'response',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [],
        }
  )
}

describe('request and output boundaries', () => {
  let outputDir: string
  let impl: MCPServerImpl
  let server: ReturnType<MCPServerImpl['initialize']>
  let client: Client
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await mkdir(resolve('tmp'), { recursive: true })
    outputDir = await mkdtemp(resolve('tmp/request-boundaries-'))
    vi.stubEnv('IMAGE_OUTPUT_DIR', outputDir)
    vi.stubEnv('IMAGE_PROVIDER', 'openai')
    vi.stubEnv('IMAGE_QUALITY', 'fast')
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key')
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    vi.stubEnv('ARK_API_KEY', 'test-ark-key')
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'true')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockReset().mockImplementation(async () => imageResponse('openai'))
    vi.stubGlobal('fetch', fetchMock)
    impl = new MCPServerImpl()
    server = impl.initialize()
    client = new Client({ name: 'boundary-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  })

  afterEach(async () => {
    await client.close()
    await server.close()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    await rm(outputDir, { recursive: true, force: true })
  })

  // Representatives only: each rule is owned by inputValidator.test.ts.
  it.each([
    {},
    { prompt: 'test', inputImagePath: '/old/image.png' },
    { prompt: 'test', inputImagePaths: ['relative.png'] },
  ])('rejects invalid arguments before any provider request: %j', async (args) => {
    const result = await client.callTool({ name: 'generate_image', arguments: args })
    expect(result.isError).toBe(true)
    expect(readPath(parseToolPayload(result), 'error', 'code')).toBe('INPUT_VALIDATION_ERROR')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await readdir(outputDir)).toEqual([])
  })

  async function writeReferences(): Promise<{ paths: string[]; references: ReferenceImage[] }> {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01])
    const firstPath = resolve(outputDir, 'first.png')
    const secondPath = resolve(outputDir, 'second.jpg')
    await writeFile(firstPath, PNG)
    await writeFile(secondPath, jpeg)
    return {
      paths: [firstPath, secondPath],
      references: [
        { data: PNG.toString('base64'), mimeType: 'image/png' },
        { data: jpeg.toString('base64'), mimeType: 'image/jpeg' },
      ],
    }
  }

  /** Serve one enhancement response (when given), then image responses; return API calls. */
  function serveProvider(
    provider: ImageProvider,
    enhancement?: (provider: ImageProvider) => Response
  ): () => Parameters<typeof fetch>[] {
    let requests = 0
    fetchMock.mockReset().mockImplementation(async (url) => {
      // The installed OpenAI SDK checks FormData support with a local data URL.
      if (String(url) === 'data:,') {
        return new Response('')
      }
      requests += 1
      return enhancement && requests === 1 ? enhancement(provider) : imageResponse(provider)
    })
    return () => fetchMock.mock.calls.filter(([url]) => String(url) !== 'data:,')
  }

  const PROVIDERS = ['gemini', 'openai', 'seedream'] as const
  const ENHANCED_MODES = [
    {
      mode: 'enhanced, two references',
      count: 2,
      enhancement: textResponse,
      imagePrompt: 'enhanced prompt',
    },
    {
      mode: 'enhanced, one reference',
      count: 1,
      enhancement: textResponse,
      imagePrompt: 'enhanced prompt',
    },
    {
      mode: 'truncated enhancement, two references',
      count: 2,
      enhancement: truncatedTextResponse,
      imagePrompt: 'use the supplied references',
    },
  ] as const

  it.each(PROVIDERS.flatMap((provider) => ENHANCED_MODES.map((mode) => ({ provider, ...mode }))))(
    'passes every reference in order through $provider enhancement and image transport ($mode)',
    async ({ provider, count, enhancement, imagePrompt }) => {
      vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
      const { paths, references } = await writeReferences()
      const apiCalls = serveProvider(provider, enhancement)

      const result = await client.callTool({
        name: 'generate_image',
        arguments: {
          provider,
          prompt: 'use the supplied references',
          inputImagePaths: paths.slice(0, count),
        },
      })

      expect(result.isError).toBe(false)
      const calls = apiCalls()
      expect(calls).toHaveLength(2)
      const images = references.slice(0, count)
      assertTextReferences(provider, expectDefined(calls[0], 'text request'), images)
      await assertImageReferences(
        provider,
        expectDefined(calls[1], 'image request'),
        images,
        imagePrompt
      )
      const uri = expectString(readPath(parseToolPayload(result), 'resource', 'uri'), 'image URI')
      expect(await readFile(fileURLToPath(uri))).toEqual(PNG)
    }
  )

  it.each(PROVIDERS)(
    'passes every reference in order through the %s image transport without enhancement',
    async (provider) => {
      const { paths, references } = await writeReferences()
      const apiCalls = serveProvider(provider)

      const result = await client.callTool({
        name: 'generate_image',
        arguments: { provider, prompt: 'use the supplied references', inputImagePaths: paths },
      })

      expect(result.isError).toBe(false)
      const calls = apiCalls()
      expect(calls).toHaveLength(1)
      await assertImageReferences(
        provider,
        expectDefined(calls[0], 'image request'),
        references,
        'use the supplied references'
      )
      const uri = expectString(readPath(parseToolPayload(result), 'resource', 'uri'), 'image URI')
      expect(await readFile(fileURLToPath(uri))).toEqual(PNG)
    }
  )

  it.each(PROVIDERS)(
    'rejects more references than %s accepts before any provider request',
    async (provider) => {
      vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
      const firstPath = resolve(outputDir, 'first.png')
      await writeFile(firstPath, PNG)

      const result = await client.callTool({
        name: 'generate_image',
        arguments: {
          provider,
          prompt: 'test',
          inputImagePaths: Array.from({ length: MAX_INPUT_IMAGES[provider] + 1 }, () => firstPath),
        },
      })

      expect(result.isError).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('identifies a missing second reference before any provider request', async () => {
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
    const firstPath = resolve(outputDir, 'first.png')
    await writeFile(firstPath, PNG)

    const result = await client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'test',
        inputImagePaths: [firstPath, resolve(outputDir, 'missing.png')],
      },
    })

    expect(result.isError).toBe(true)
    expect(firstContentText(result)).toContain('Input image 2')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['gemini', 'openai', 'seedream'] as const)(
    'rejects an unreadable second reference before %s enhancement',
    async (provider) => {
      vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
      const firstPath = resolve(outputDir, 'first.png')
      const secondPath = resolve(outputDir, 'directory.png')
      await writeFile(firstPath, PNG)
      await mkdir(secondPath)
      const result = await client.callTool({
        name: 'generate_image',
        arguments: { provider, prompt: 'test', inputImagePaths: [firstPath, secondPath] },
      })
      expect(result.isError).toBe(true)
      expect(firstContentText(result)).toContain('Input image 2')
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it.each([{ useGoogleSearch: true }, { aspectRatio: '8:1' }, { fileName: 'draft..png' }])(
    'preflights deterministic failures before enhancement: %j',
    async (options) => {
      vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
      const result = await client.callTool({
        name: 'generate_image',
        arguments: { prompt: 'test', ...options },
      })
      expect(result.isError).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await readdir(outputDir)).toEqual([])
    }
  )

  it('does not save a Gemini response that decodes to an empty buffer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ inlineData: { data: '!!!', mimeType: 'image/png' } }] },
            finishReason: 'STOP',
          },
        ],
      })
    )
    const result = await client.callTool({
      name: 'generate_image',
      arguments: { provider: 'gemini', prompt: 'test' },
    })
    expect(result.isError).toBe(true)
    expect(await readdir(outputDir)).toEqual([])
  })

  it('identifies Gemini prompt blocking when candidates are omitted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }))
    const result = await client.callTool({
      name: 'generate_image',
      arguments: { provider: 'gemini', prompt: 'test' },
    })
    const error = expectRecord(readPath(parseToolPayload(result), 'error'), 'error payload')
    expect(result.isError).toBe(true)
    expect(expectString(error['suggestion'], 'error suggestion')).toContain('Rephrase')
    expect(readPath(error, 'details', 'stage')).toBe('prompt_analysis')
  })

  it.each([401, 503])(
    'preserves Seedream HTTP %i without exposing the response body',
    async (status) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'private upstream body' }, status))
      const result = await client.callTool({
        name: 'generate_image',
        arguments: { provider: 'seedream', prompt: 'private prompt' },
      })
      const text = firstContentText(result)
      expect(result.isError).toBe(true)
      expect(readPath(parseJsonObject(text), 'error', 'details', 'statusCode')).toBe(status)
      expect(text).not.toContain('private')
      expect(await readdir(outputDir)).toEqual([])
    }
  )

  it('returns a URI that resolves to the exact saved special-character filename', async () => {
    const fileName = '画像 #1?50%.png'
    const result = await client.callTool({
      name: 'generate_image',
      arguments: { prompt: 'test', fileName },
    })
    expect(result.isError).toBe(false)
    const uri = expectString(readPath(parseToolPayload(result), 'resource', 'uri'), 'resource uri')
    expect(fileURLToPath(uri)).toBe(resolve(outputDir, fileName))
    expect(await readFile(fileURLToPath(uri))).toEqual(PNG)
  })

  it.each(['gemini', 'openai'] as const)(
    'preserves %s HTTP status in public errors',
    async (provider) => {
      fetchMock.mockImplementation(async () =>
        jsonResponse(
          { error: { code: 503, message: 'Service unavailable', status: 'UNAVAILABLE' } },
          503
        )
      )
      const result = await client.callTool({
        name: 'generate_image',
        arguments: { provider, prompt: 'test' },
      })
      expect(result.isError).toBe(true)
      expect(readPath(parseToolPayload(result), 'error', 'details', 'statusCode')).toBe(503)
    }
  )

  it('still replaces an ordinary output file without retaining its old trailing bytes', async () => {
    const outputPath = resolve(outputDir, 'existing.png')
    await writeFile(outputPath, Buffer.alloc(512))
    const result = await client.callTool({
      name: 'generate_image',
      arguments: { prompt: 'test', fileName: 'existing.png' },
    })
    expect(result.isError).toBe(false)
    expect(await readFile(outputPath)).toEqual(PNG)
  })

  it('leaves a symlink target unchanged when saving a generated image', async () => {
    const target = resolve(outputDir, 'original.txt')
    await writeFile(target, 'original content')
    await symlink(target, resolve(outputDir, 'output.png'))
    const result = await client.callTool({
      name: 'generate_image',
      arguments: { prompt: 'test', fileName: 'output.png' },
    })
    expect(result.isError).toBe(true)
    expect(await readFile(target, 'utf8')).toBe('original content')
  })

  it.each(['gemini', 'openai', 'seedream'] as const)(
    'propagates cancellation during %s enhancement without fallback or saving',
    async (provider) => {
      await checkCancellation(provider, 'text')
    }
  )

  it.each(['gemini', 'openai', 'seedream'] as const)(
    'propagates cancellation during %s generation and does not save a late response',
    async (provider) => {
      await checkCancellation(provider, 'image')
    }
  )

  it('propagates cancellation to the OpenAI editing endpoint', async () => {
    const inputImagePath = resolve(outputDir, 'input.png')
    await writeFile(inputImagePath, PNG)
    await checkCancellation('openai', 'image', inputImagePath)
  })

  async function checkCancellation(
    provider: ImageProvider,
    stage: 'text' | 'image',
    inputImagePath?: string
  ): Promise<void> {
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', String(stage !== 'text'))
    let release!: () => void
    let started!: () => void
    let upstreamSignal: AbortSignal | null | undefined
    const held = new Promise<void>((done) => {
      release = done
    })
    const entered = new Promise<void>((done) => {
      started = done
    })
    fetchMock.mockImplementation(async (url, options) => {
      // The installed OpenAI SDK checks FormData support with a local data URL.
      if (String(url) === 'data:,') {
        return new Response('')
      }
      upstreamSignal = options?.signal
      started()
      await held
      return stage === 'text' ? textResponse(provider) : imageResponse(provider)
    })
    const execution = vi.spyOn(impl, 'callTool')
    const controller = new AbortController()
    const call = client
      .callTool(
        {
          name: 'generate_image',
          arguments: {
            provider,
            prompt: 'test',
            fileName: 'cancelled.png',
            ...(inputImagePath && { inputImagePaths: [inputImagePath] }),
          },
        },
        CallToolResultSchema,
        { signal: controller.signal }
      )
      .catch((error: unknown) => error)
    try {
      await entered
      controller.abort()
      expect(await call).toBeInstanceOf(Error)
      // Let the in-memory transport deliver notifications/cancelled.
      await new Promise<void>((done) => setImmediate(done))
      const forwarded = upstreamSignal?.aborted
      release()
      await expectDefined(execution.mock.results[0], 'first execution result').value
      expect(forwarded).toBe(true)
      const apiCalls = fetchMock.mock.calls.filter(([url]) => String(url) !== 'data:,')
      expect(apiCalls).toHaveLength(1)
      if (inputImagePath) {
        expect(String(expectDefined(apiCalls[0], 'first api call')[0])).toMatch(/\/images\/edits$/)
      }
      expect(await readdir(outputDir)).toEqual(inputImagePath ? ['input.png'] : [])
    } finally {
      release()
      await call
      await execution.mock.results[0]?.value
    }
  }
})
