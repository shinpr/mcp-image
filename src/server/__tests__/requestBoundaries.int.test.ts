import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it.each([
    {},
    { prompt: 123 },
    { prompt: '   ' },
    { prompt: 'test', imageSize: '8K' },
    { prompt: 'test', imageSize: null },
    { prompt: 'test', purpose: { x: 1 } },
    { prompt: 'test', fileName: 42 },
    { prompt: 'test', inputImagePath: null },
    { prompt: 'test', aspectRatio: '' },
    { prompt: 'test', imageSize: { toString: null } },
  ])('rejects invalid arguments before any provider request: %j', async (args) => {
    const result = await client.callTool({ name: 'generate_image', arguments: args })
    expect(result.isError).toBe(true)
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text).error.code).toBe(
      'INPUT_VALIDATION_ERROR'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await readdir(outputDir)).toEqual([])
  })

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

  it('preserves the complete original prompt when Gemini enhancement is truncated', async () => {
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            { content: { parts: [{ text: 'partial enhancement' }] }, finishReason: 'MAX_TOKENS' },
          ],
        })
      )
      .mockImplementation(async () => imageResponse('gemini'))
    const result = await client.callTool({
      name: 'generate_image',
      arguments: {
        provider: 'gemini',
        prompt: 'complete original instructions',
        fileName: 'fallback.png',
      },
    })
    expect(result.isError).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const imageRequest = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    expect(imageRequest.contents[0].parts[0].text).toBe('complete original instructions')
    expect(await readFile(resolve(outputDir, 'fallback.png'))).toEqual(PNG)
  })

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
    const error = JSON.parse((result.content as Array<{ text: string }>)[0]!.text).error
    expect(result.isError).toBe(true)
    expect(error.suggestion).toContain('Rephrase')
    expect(error.details.stage).toBe('prompt_analysis')
  })

  it.each([401, 429, 503])(
    'preserves Seedream HTTP %i without exposing the response body',
    async (status) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'private upstream body' }, status))
      const result = await client.callTool({
        name: 'generate_image',
        arguments: { provider: 'seedream', prompt: 'private prompt' },
      })
      const text = (result.content as Array<{ text: string }>)[0]!.text
      expect(result.isError).toBe(true)
      expect(JSON.parse(text).error.details.statusCode).toBe(status)
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
    const uri = JSON.parse((result.content as Array<{ text: string }>)[0]!.text).resource.uri
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
      expect(
        JSON.parse((result.content as Array<{ text: string }>)[0]!.text).error.details.statusCode
      ).toBe(503)
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
  ) {
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
      if (String(url) === 'data:,') return new Response('')
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
            ...(inputImagePath && { inputImagePath }),
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
      await execution.mock.results[0]!.value
      expect(forwarded).toBe(true)
      const apiCalls = fetchMock.mock.calls.filter(([url]) => String(url) !== 'data:,')
      expect(apiCalls).toHaveLength(1)
      if (inputImagePath) expect(String(apiCalls[0]![0])).toMatch(/\/images\/edits$/)
      expect(await readdir(outputDir)).toEqual(inputImagePath ? ['input.png'] : [])
    } finally {
      release()
      await call
      await execution.mock.results[0]?.value
    }
  }
})
