import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { parseJsonObject, recordOrEmpty } from '../../tests/helpers/inspect.js'
import { createMCPServer } from '../mcpServer.js'

interface TransportStubs {
  fetch: Mock<(input: unknown, init?: RequestInit) => unknown>
  googleConstructor: Mock
  googleEnhancedText: string
  googleGenerateContent: Mock
  googleTextError: Error | undefined
  openAIConstructorError: Error | undefined
  openAIConstructorOptions: unknown[]
  openAIImageEdit: Mock
  openAIImageGenerate: Mock
  openAIResponsesCreate: Mock
  toFile: Mock
}

const transports: TransportStubs = vi.hoisted(() => ({
  fetch: vi.fn(),
  googleConstructor: vi.fn(),
  googleEnhancedText: '',
  googleGenerateContent: vi.fn(),
  googleTextError: undefined,
  openAIConstructorError: undefined,
  openAIConstructorOptions: [],
  openAIImageEdit: vi.fn(),
  openAIImageGenerate: vi.fn(),
  openAIResponsesCreate: vi.fn(),
  toFile: vi.fn(),
}))

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: class {
      readonly models = {
        generateContent: transports.googleGenerateContent,
      }

      constructor(...args: unknown[]) {
        transports.googleConstructor(...args)
      }
    },
  }
})

vi.mock('openai', () => {
  class OpenAITransportDouble {
    readonly images = {
      edit: transports.openAIImageEdit,
      generate: transports.openAIImageGenerate,
    }

    readonly responses = {
      create: transports.openAIResponsesCreate,
    }

    constructor(options: unknown) {
      transports.openAIConstructorOptions.push(options)
      if (transports.openAIConstructorError) {
        throw transports.openAIConstructorError
      }
    }
  }

  return {
    default: OpenAITransportDouble,
    toFile: transports.toFile,
  }
})

const API_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations'
const ARK_DUMMY_KEY = 'ark-dummy-seedream-integration-key'
const AUTHORIZATION_VALUE = `Bearer ${ARK_DUMMY_KEY}`
const ORIGINAL_PROMPT = 'private-seedream-prompt-marker'
const ENHANCED_PROMPT = 'fixture-enhanced-seedream-prompt'
const RAW_BODY_MARKER = 'private-upstream-body-marker'
const INPUT_IMAGE_MARKER = 'private-input-image-marker'
const FALLBACK_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x47, 0x45, 0x4d, 0x49, 0x4e, 0x49,
])
const TRACKED_ENV = [
  'ARK_API_KEY',
  'GEMINI_API_KEY',
  'IMAGE_OUTPUT_DIR',
  'IMAGE_PROVIDER',
  'IMAGE_QUALITY',
  'NODE_ENV',
  'OPENAI_API_KEY',
  'SKIP_PROMPT_ENHANCEMENT',
] as const

let originalEnv: Partial<Record<(typeof TRACKED_ENV)[number], string>>
const temporaryDirectories = new Set<string>()

function resetTransportDoubles(): void {
  transports.fetch.mockReset()
  transports.googleConstructor.mockReset()
  transports.googleGenerateContent.mockReset()
  transports.openAIImageEdit.mockReset()
  transports.openAIImageGenerate.mockReset()
  transports.openAIResponsesCreate.mockReset()
  transports.toFile.mockReset()
  transports.googleTextError = undefined
  transports.googleEnhancedText = ENHANCED_PROMPT
  transports.openAIConstructorError = undefined
  transports.openAIConstructorOptions.length = 0

  transports.googleGenerateContent.mockImplementation(async (params: { model?: string }) => {
    if (params.model === 'gemini-3.8-flash') {
      if (transports.googleTextError) {
        throw transports.googleTextError
      }
      return { text: transports.googleEnhancedText }
    }

    return {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: FALLBACK_PNG_BYTES.toString('base64'),
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
      modelVersion: 'gemini-fallback-must-not-run',
      responseId: 'gemini-response-sentinel',
    }
  })
  transports.openAIResponsesCreate.mockResolvedValue({
    output_text: ENHANCED_PROMPT,
  })
  transports.toFile.mockResolvedValue({ name: 'fixture.png' })
  transports.fetch.mockImplementation(async () =>
    createSuccessfulImageResponse(FALLBACK_PNG_BYTES, 'default-response-sentinel')
  )
}

function createSuccessfulImageResponse(imageBytes: Buffer, responseSentinel: string): Response {
  return new Response(
    JSON.stringify({
      response_sentinel: responseSentinel,
      data: [
        {
          b64_json: imageBytes.toString('base64'),
          size: '1024x1024',
          output_format: 'png',
        },
      ],
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  )
}

function createPngFixture(sentinel: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(sentinel),
  ])
}

function createJpegFixture(sentinel: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(sentinel)])
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function createOutputDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-image-seedream-'))
  temporaryDirectories.add(directory)
  return directory
}

function configureSeedream(
  outputDirectory: string,
  options: {
    imageQuality?: 'fast' | 'balanced' | 'quality'
    skipPromptEnhancement?: boolean
  } = {}
): void {
  process.env.IMAGE_PROVIDER = 'seedream'
  process.env.ARK_API_KEY = ARK_DUMMY_KEY
  process.env.GEMINI_API_KEY = 'gemini-dummy-integration-key'
  process.env.OPENAI_API_KEY = 'openai-dummy-integration-key'
  process.env.IMAGE_OUTPUT_DIR = outputDirectory
  process.env.IMAGE_QUALITY = options.imageQuality ?? 'fast'
  process.env.SKIP_PROMPT_ENHANCEMENT = String(options.skipPromptEnhancement ?? false)
  process.env.NODE_ENV = 'test'
}

function parsePublicResponse(
  result: Awaited<ReturnType<ReturnType<typeof createMCPServer>['callTool']>>
): Record<string, unknown> {
  const firstContent = result.content.at(0)
  if (firstContent?.type !== 'text') {
    return {}
  }

  return parseJsonObject(firstContent.text, 'public tool response')
}

function observeLastImageRequest(): {
  body: Record<string, unknown>
  headers: Headers
  init: RequestInit | undefined
  url: string
} {
  const lastCall = transports.fetch.mock.calls.at(-1)
  const url = lastCall?.[0]
  const init = lastCall?.[1]
  let body: Record<string, unknown> = {}

  if (typeof init?.body === 'string') {
    try {
      body = parseJsonObject(init.body, 'image request body')
    } catch {
      body = {}
    }
  }

  return {
    body,
    headers: new Headers(init?.headers),
    init,
    url: typeof url === 'string' ? url : '',
  }
}

function capturedLogs(): string {
  return vi
    .mocked(console.error)
    .mock.calls.flatMap((call) => call.map(String))
    .join('\n')
}

type FailureRow = {
  args?: Record<string, unknown>
  deleteArkApiKey?: boolean
  expectedCode: string
  expectedImageCalls: number
  fetchError?: Error
  name: string
  responseFactory?: (responseSentinel: string, imageSentinel: string) => Response
  skipPromptEnhancement?: boolean
}

/**
 * One representative per public failure mapping: configuration, capability preflight,
 * unsupported file input, response contract, and transport. The individual rules are
 * owned by the config, input, and Seedream client unit tests.
 */
function buildFailureRows(): FailureRow[] {
  return [
    {
      name: 'missing-key',
      deleteArkApiKey: true,
      expectedCode: 'CONFIG_ERROR',
      expectedImageCalls: 0,
    },
    {
      name: 'google-search',
      args: { useGoogleSearch: true },
      expectedCode: 'IMAGE_API_ERROR',
      expectedImageCalls: 0,
    },
    {
      name: 'unsupported-editing-input',
      args: { inputImagePaths: '__CREATE_UNSUPPORTED_INPUT__' },
      expectedCode: 'IMAGE_API_ERROR',
      expectedImageCalls: 0,
    },
    {
      name: 'url-only',
      expectedCode: 'IMAGE_API_ERROR',
      expectedImageCalls: 1,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse({
          response_sentinel: responseSentinel,
          image_sentinel: imageSentinel,
          data: [{ url: `https://attacker.invalid/${imageSentinel}.png` }],
        }),
    },
    {
      name: 'network-failure',
      expectedCode: 'NETWORK_ERROR',
      expectedImageCalls: 1,
      skipPromptEnhancement: true,
      fetchError: new TypeError(`fetch failed: ${RAW_BODY_MARKER}`),
    },
  ]
}

const PUBLIC_ERROR_KEYS = ['code', 'details', 'message', 'suggestion', 'timestamp']
const PUBLIC_DETAIL_KEYS = ['provider', 'stage', 'statusCode', 'upstreamMessage']

/** A contained failure exposes only the allow-listed error and detail keys. */
function assertPublicErrorShape(
  result: Awaited<ReturnType<ReturnType<typeof createMCPServer>['callTool']>>,
  row: FailureRow
): void {
  const publicResponse = parsePublicResponse(result)
  const publicError = recordOrEmpty(publicResponse['error'])

  expect.soft(result.isError, row.name).toBe(true)
  expect.soft(publicError['code'], row.name).toBe(row.expectedCode)
  expect.soft(Object.keys(result).sort(), row.name).toEqual(['content', 'isError'])
  expect.soft(Object.keys(publicResponse), row.name).toEqual(['error'])
  expect
    .soft(
      Object.keys(publicError).every((key) => PUBLIC_ERROR_KEYS.includes(key)),
      row.name
    )
    .toBe(true)

  const publicDetails = recordOrEmpty(publicError['details'])
  expect
    .soft(
      Object.keys(publicDetails).every((key) => PUBLIC_DETAIL_KEYS.includes(key)),
      row.name
    )
    .toBe(true)
}

interface RowSentinels {
  responseSentinel: string
  imageSentinel: string
}

/** Arrange the fetch double for one failure row. */
function arrangeFailureTransport(row: FailureRow, sentinels: RowSentinels): void {
  const { responseSentinel, imageSentinel } = sentinels

  if (row.fetchError) {
    transports.fetch.mockRejectedValue(
      new TypeError(`${row.fetchError.message}:${responseSentinel}:${imageSentinel}`)
    )
    return
  }

  if (row.responseFactory) {
    transports.fetch.mockImplementation(async () =>
      row.responseFactory?.(responseSentinel, imageSentinel)
    )
  }
}

/** Tool arguments for one failure row, creating an unsupported input file on demand. */
async function buildFailureArgs(
  row: FailureRow,
  index: number,
  outputDirectory: string,
  requestSentinel: string
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {
    prompt: requestSentinel,
    fileName: `failure-${index}.png`,
    ...row.args,
  }

  if (row.args?.['inputImagePaths'] !== '__CREATE_UNSUPPORTED_INPUT__') {
    return args
  }

  const unsupportedInputPath = join(outputDirectory, 'unsupported.gif')
  await writeFile(unsupportedInputPath, `${INPUT_IMAGE_MARKER}:${row.name}`)
  return { ...args, inputImagePaths: [unsupportedInputPath] }
}

interface SavedPngExpectation {
  outputDirectory: string
  fileName: string
  expectedBytes: Buffer
  expectedModel: string
}

type SupportedRow = {
  args: Record<string, unknown>
  expectedAspectRatio: string
  expectedModel: 'dola-seedream-5-0-pro-260628'
  expectedQuality: 'fast' | 'balanced' | 'quality'
  expectedResolution: '1K' | '2K'
  name: string
  skipPromptEnhancement?: boolean
  textFailure?: boolean
}

/**
 * Representative supported requests through MCP: the default route, an explicit balanced
 * route whose enhancement fails, and an explicit quality 2K route with enhancement skipped.
 * Aspect-ratio, quality, and feature-flag rules are owned by the client and prompt unit tests.
 */
function buildSupportedRows(): SupportedRow[] {
  return [
    {
      name: 'prompt-baseline',
      args: {},
      expectedAspectRatio: '1:1',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'fast',
      expectedResolution: '1K',
    },
    {
      name: 'enhancement-failure-original-fallback',
      args: { aspectRatio: '4:3', quality: 'balanced' },
      expectedAspectRatio: '4:3',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'balanced',
      expectedResolution: '1K',
      textFailure: true,
    },
    {
      name: 'enhancement-skip',
      args: { aspectRatio: '9:16', imageSize: '2K', quality: 'quality' },
      expectedAspectRatio: '9:16',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'quality',
      expectedResolution: '2K',
      skipPromptEnhancement: true,
    },
  ]
}

interface SupportedRowFixture {
  outputDirectory: string
  fileName: string
  requestPrompt: string
  enhancedPrompt: string
  responseSentinel: string
  imageSentinel: string
  expectedImageBytes: Buffer
}

/** Per-row directories, prompts and image bytes, each carrying a unique sentinel. */
async function prepareSupportedRowFixture(
  row: SupportedRow,
  index: number
): Promise<SupportedRowFixture> {
  const imageSentinel = `${row.name}:decoded-image-sentinel`
  const fixture: SupportedRowFixture = {
    outputDirectory: await createOutputDirectory(),
    fileName: `supported-${index}.png`,
    requestPrompt: `${ORIGINAL_PROMPT}:${row.name}:request-body-sentinel`,
    enhancedPrompt: `${ENHANCED_PROMPT}:${row.name}:image-body-sentinel`,
    responseSentinel: `${row.name}:response-body-sentinel`,
    imageSentinel,
    expectedImageBytes: createPngFixture(imageSentinel),
  }

  return fixture
}

/** The exact Seedream image request body one supported row must produce. */
function buildExpectedImageRequest(
  row: SupportedRow,
  finalPrompt: string
): Record<string, unknown> {
  return {
    model: row.expectedModel,
    prompt: finalPrompt,
    size: row.expectedResolution,
    response_format: 'b64_json',
    output_format: 'png',
    stream: false,
    watermark: false,
    optimize_prompt_options: {
      mode: row.expectedQuality === 'fast' ? 'fast' : 'standard',
    },
  }
}

/** Point every transport double at this row's fixtures. */
function arrangeSupportedRow(row: SupportedRow, fixture: SupportedRowFixture): void {
  configureSeedream(fixture.outputDirectory, {
    imageQuality: 'fast',
    skipPromptEnhancement: row.skipPromptEnhancement,
  })
  transports.googleEnhancedText = fixture.enhancedPrompt
  transports.openAIResponsesCreate.mockResolvedValue({ output_text: fixture.enhancedPrompt })
  transports.fetch.mockImplementation(async () =>
    createSuccessfulImageResponse(fixture.expectedImageBytes, fixture.responseSentinel)
  )

  if (!row.textFailure) {
    return
  }

  const enhancementError = new Error('synthetic enhancement failure')
  transports.openAIResponsesCreate.mockRejectedValue(enhancementError)
  transports.googleTextError = enhancementError
}

/** The Seedream text-enhancement request shape and sampling parameters. */
function assertEnhancementRequest(
  textRequest: Record<string, unknown>,
  label: string,
  requestPrompt: string
): void {
  const textInput = typeof textRequest['input'] === 'string' ? textRequest['input'] : ''

  expect
    .soft(Object.keys(textRequest).sort(), label)
    .toEqual([
      'input',
      'instructions',
      'max_output_tokens',
      'model',
      'temperature',
      'thinking',
      'top_p',
    ])
  expect.soft(textRequest['model'], label).toBe('seed-2-0-lite-260428')
  expect.soft(textRequest['thinking'], label).toEqual({ type: 'disabled' })
  expect.soft(textRequest['max_output_tokens'], label).toBe(384)
  expect.soft(textRequest['temperature'], label).toBe(0.7)
  expect.soft(textRequest['top_p'], label).toBe(0.95)
  expect.soft(typeof textRequest['instructions'], label).toBe('string')
  expect.soft(typeof textRequest['input'], label).toBe('string')
  expect.soft(countOccurrences(textInput, requestPrompt), label).toBe(1)
}

/** No secret, prompt or image byte may appear in what the caller can observe. */
function assertNoSensitiveDisclosure(
  label: string,
  observable: string,
  values: Array<string | undefined>
): void {
  for (const value of values) {
    if (!value) {
      continue
    }
    expect.soft(observable, `${label}:${value}`).not.toContain(value)
  }
}

async function assertSavedPng(
  result: Awaited<ReturnType<ReturnType<typeof createMCPServer>['callTool']>>,
  expectation: SavedPngExpectation
): Promise<void> {
  const { outputDirectory, fileName, expectedBytes, expectedModel } = expectation
  const files = await readdir(outputDirectory)
  const expectedPath = join(outputDirectory, fileName)
  const bytes = files[0] ? await readFile(expectedPath) : Buffer.alloc(0)
  const publicResponse = parsePublicResponse(result)

  expect.soft(result.isError).toBe(false)
  expect.soft(Object.keys(result).sort()).toEqual(['content', 'isError'])
  expect.soft(files).toEqual([fileName])
  expect.soft(bytes).toEqual(expectedBytes)
  expect.soft(publicResponse).toEqual({
    type: 'resource',
    resource: {
      uri: `file://${expectedPath}`,
      name: fileName,
      mimeType: 'image/png',
    },
    metadata: {
      model: expectedModel,
      provider: 'seedream',
      processingTime: 0,
      contextMethod: 'structured_prompt',
      timestamp: expect.any(String),
    },
  })
  expect.soft(result).not.toHaveProperty('structuredContent')
  expect.soft(publicResponse).not.toHaveProperty('metadata.prompt')
  expect.soft(JSON.stringify(publicResponse)).not.toContain(ORIGINAL_PROMPT)
  expect.soft(JSON.stringify(publicResponse)).not.toContain(ENHANCED_PROMPT)
}

beforeEach(() => {
  originalEnv = Object.fromEntries(
    TRACKED_ENV.flatMap((name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    })
  )
  resetTransportDoubles()
  vi.stubGlobal('fetch', transports.fetch)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(async () => {
  for (const name of TRACKED_ENV) {
    const value = originalEnv[name]
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { force: true, recursive: true }))
  )
  temporaryDirectories.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Exercises the real MCP orchestration, provider adapters, file persistence, and response builder.
 * Only network transports are replaced with deterministic doubles. The cases cover provider
 * selection and caching, supported request propagation, JPEG output, and failure containment.
 */

describe('BytePlus Seedream integration', () => {
  it('routes Seedream requests and reuses the prompt client through public effects', async () => {
    const skipOutput = await createOutputDirectory()
    configureSeedream(skipOutput, { skipPromptEnhancement: true })
    const skippedServer = createMCPServer()

    expect(await readdir(skipOutput)).toEqual([])

    const skippedFirst = await skippedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'skip-first.png',
    })
    const skippedSecond = await skippedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'skip-second.png',
    })

    expect.soft(transports.googleConstructor).not.toHaveBeenCalled()
    expect.soft(transports.openAIConstructorOptions).toHaveLength(0)
    expect.soft(transports.openAIResponsesCreate).not.toHaveBeenCalled()
    expect.soft(transports.fetch).toHaveBeenCalledTimes(2)
    expect.soft(skippedFirst.isError).toBe(false)
    expect.soft(skippedSecond.isError).toBe(false)
    expect.soft((await readdir(skipOutput)).sort()).toEqual(['skip-first.png', 'skip-second.png'])

    resetTransportDoubles()
    const cachedOutput = await createOutputDirectory()
    configureSeedream(cachedOutput)
    const cachedServer = createMCPServer()

    expect(await readdir(cachedOutput)).toEqual([])

    const cachedFirst = await cachedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'cache-first.png',
    })
    const cachedSecond = await cachedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'cache-second.png',
    })

    expect.soft(transports.googleConstructor).not.toHaveBeenCalled()
    expect.soft(transports.openAIConstructorOptions).toEqual([
      {
        apiKey: ARK_DUMMY_KEY,
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      },
    ])
    expect.soft(transports.openAIResponsesCreate).toHaveBeenCalledTimes(2)
    expect.soft(transports.fetch).toHaveBeenCalledTimes(2)
    expect.soft(cachedFirst.isError).toBe(false)
    expect.soft(cachedSecond.isError).toBe(false)
    expect
      .soft((await readdir(cachedOutput)).sort())
      .toEqual(['cache-first.png', 'cache-second.png'])

    resetTransportDoubles()
    const failureOutput = await createOutputDirectory()
    configureSeedream(failureOutput)
    transports.openAIConstructorError = new Error('synthetic Seedream factory failure')
    const failedServer = createMCPServer()

    expect(await readdir(failureOutput)).toEqual([])

    const failed = await failedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'must-not-exist.png',
    })
    const failedPublicResponse = parsePublicResponse(failed)
    const failureExposure = `${JSON.stringify(failedPublicResponse)}\n${capturedLogs()}`

    expect.soft(failed.isError).toBe(true)
    expect.soft(transports.googleConstructor).not.toHaveBeenCalled()
    expect.soft(transports.openAIConstructorOptions).toHaveLength(1)
    expect.soft(transports.openAIResponsesCreate).not.toHaveBeenCalled()
    expect.soft(transports.fetch).not.toHaveBeenCalled()
    expect
      .soft(recordOrEmpty(failedPublicResponse.error)['message'])
      .toContain('synthetic Seedream factory failure')
    expect.soft(await readdir(failureOutput)).toEqual([])
    expect.soft(failureExposure).not.toContain(ARK_DUMMY_KEY)
    expect.soft(failureExposure).not.toContain(ORIGINAL_PROMPT)
  })

  it('propagates supported effective values to one sanitized PNG file response', async () => {
    const supportedRows = buildSupportedRows()

    for (const [index, row] of supportedRows.entries()) {
      resetTransportDoubles()
      vi.mocked(console.error).mockClear()
      const fixture = await prepareSupportedRowFixture(row, index)
      const {
        outputDirectory,
        fileName,
        requestPrompt,
        enhancedPrompt,
        responseSentinel,
        imageSentinel,
        expectedImageBytes,
      } = fixture

      arrangeSupportedRow(row, fixture)

      const server = createMCPServer()

      expect.soft(await readdir(outputDirectory), row.name).toEqual([])

      const result = await server.callTool('generate_image', {
        prompt: requestPrompt,
        fileName,
        ...row.args,
      })

      const imageRequest = observeLastImageRequest()
      const textRequest = recordOrEmpty(transports.openAIResponsesCreate.mock.calls.at(-1)?.[0])
      const selectedPrompt =
        row.skipPromptEnhancement || row.textFailure ? requestPrompt : enhancedPrompt
      const finalPrompt = `${selectedPrompt}\n\nOutput aspect ratio: ${row.expectedAspectRatio}.`
      const expectedImageRequest = buildExpectedImageRequest(row, finalPrompt)
      const expectedImageKeys = Object.keys(expectedImageRequest).sort()

      expect.soft(transports.googleConstructor, row.name).not.toHaveBeenCalled()
      expect
        .soft(transports.openAIResponsesCreate, row.name)
        .toHaveBeenCalledTimes(row.skipPromptEnhancement ? 0 : 1)
      expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(1)
      expect.soft(imageRequest.url, row.name).toBe(API_ENDPOINT)
      expect.soft(imageRequest.init?.method, row.name).toBe('POST')
      expect.soft(imageRequest.headers.get('authorization'), row.name).toBe(AUTHORIZATION_VALUE)
      expect.soft(Object.keys(imageRequest.body).sort(), row.name).toEqual(expectedImageKeys)
      expect.soft(imageRequest.body, row.name).toEqual(expectedImageRequest)

      if (row.skipPromptEnhancement) {
        expect.soft(textRequest, row.name).toEqual({})
      } else {
        assertEnhancementRequest(textRequest, row.name, requestPrompt)
      }

      await assertSavedPng(result, {
        outputDirectory,
        fileName,
        expectedBytes: expectedImageBytes,
        expectedModel: row.expectedModel,
      })

      const publicAndLogs = `${JSON.stringify(parsePublicResponse(result))}\n${capturedLogs()}`
      assertNoSensitiveDisclosure(row.name, publicAndLogs, [
        ARK_DUMMY_KEY,
        AUTHORIZATION_VALUE,
        requestPrompt,
        enhancedPrompt,
        responseSentinel,
        imageSentinel,
      ])
    }
  })

  it('propagates .jpg through Seedream JPEG wire, bytes, save, and public resource', async () => {
    resetTransportDoubles()
    const outputDirectory = await createOutputDirectory()
    const fileName = 'seedream-native-output.jpg'
    const expectedBytes = createJpegFixture('seedream-jpeg-integration')
    configureSeedream(outputDirectory, { skipPromptEnhancement: true })
    transports.fetch.mockResolvedValue(
      createJsonResponse({
        data: [
          {
            b64_json: expectedBytes.toString('base64'),
            mime_type: 'image/jpeg',
            output_format: 'jpeg',
          },
        ],
      })
    )

    const result = await createMCPServer().callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName,
      quality: 'fast',
    })

    expect.soft(result.isError).toBe(false)
    expect.soft(observeLastImageRequest().body).toMatchObject({
      output_format: 'jpeg',
      response_format: 'b64_json',
    })
    expect.soft(await readFile(join(outputDirectory, fileName))).toEqual(expectedBytes)
    expect.soft(parsePublicResponse(result)).toMatchObject({
      type: 'resource',
      resource: {
        name: fileName,
        mimeType: 'image/jpeg',
      },
      metadata: {
        provider: 'seedream',
      },
    })
  })

  it('contains Seedream failures before the next side effect without disclosure', async () => {
    const failureRows = buildFailureRows()

    for (const [index, row] of failureRows.entries()) {
      resetTransportDoubles()
      vi.mocked(console.error).mockClear()
      const outputDirectory = await createOutputDirectory()
      const requestSentinel = `${ORIGINAL_PROMPT}:${row.name}:request-body-sentinel`
      const responseSentinel = `${row.name}:response-body-sentinel`
      const imageSentinel = `${row.name}:decoded-image-sentinel`
      configureSeedream(outputDirectory, {
        skipPromptEnhancement: row.skipPromptEnhancement,
      })
      if (row.deleteArkApiKey) {
        delete process.env.ARK_API_KEY
      }

      arrangeFailureTransport(row, { responseSentinel, imageSentinel })
      const args = await buildFailureArgs(row, index, outputDirectory, requestSentinel)

      const beforeFiles = await readdir(outputDirectory)
      const server = createMCPServer()
      const result = await server.callTool('generate_image', args)
      const afterFiles = await readdir(outputDirectory)
      const exposed = `${JSON.stringify(parsePublicResponse(result))}\n${capturedLogs()}`

      expect
        .soft(
          beforeFiles.filter((file) => file !== 'unsupported.gif'),
          row.name
        )
        .toEqual([])
      assertPublicErrorShape(result, row)
      expect.soft(transports.googleConstructor, row.name).not.toHaveBeenCalled()
      expect.soft(transports.openAIResponsesCreate, row.name).not.toHaveBeenCalled()
      expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(row.expectedImageCalls)
      expect
        .soft(
          afterFiles.filter((file) => file !== 'unsupported.gif'),
          row.name
        )
        .toEqual([])

      assertNoSensitiveDisclosure(row.name, exposed, [
        ARK_DUMMY_KEY,
        AUTHORIZATION_VALUE,
        requestSentinel,
        INPUT_IMAGE_MARKER,
        RAW_BODY_MARKER,
        responseSentinel,
        imageSentinel,
      ])
    }
  })
})
