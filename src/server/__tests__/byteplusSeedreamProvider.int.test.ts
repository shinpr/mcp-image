import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { MAX_IMAGE_SIZE } from '../../business/inputValidator.js'
import { isRecord, parseJsonObject, recordOrEmpty } from '../../tests/helpers/inspect.js'
import { createMCPServer } from '../mcpServer.js'

interface FileSystemStub {
  actualOpen: typeof import('node:fs/promises').open | undefined
  open: Mock
}

const fileSystem: FileSystemStub = vi.hoisted(() => ({
  actualOpen: undefined,
  open: vi.fn(),
}))

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

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  fileSystem.actualOpen = actual.open
  fileSystem.open.mockImplementation(actual.open)
  return {
    ...actual,
    open: fileSystem.open,
  }
})

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
const FEATURE_INSTRUCTIONS = {
  blendImages:
    'MUST describe spatial and visual integration: Multiple visual elements need concrete spatial relationships. Define how elements interact: overlap, reflection, shared lighting, color echo between foreground and background. Clearly describe foreground (X% of frame), midground, and background elements with their relative scales and how they physically interact within the composition.',
  maintainCharacterConsistency:
    'Character consistency is CRITICAL - MUST include distinctive character features: This character needs at least 3 recognizable visual markers that would identify them across different scenes. Include specific details like "distinctive scar", "signature clothing item", "unique hairstyle", or "characteristic accessory". Use words like "signature", "distinctive", "always wears/has" to emphasize these consistent features.',
  useWorldKnowledge:
    'Apply accurate real-world knowledge - MUST incorporate authentic details: Apply accurate real-world knowledge about cultures, locations, or historical elements. Use specific terminology like "traditional [culture] style", "authentic [location] architecture", "typical of [region]", "historically accurate [period]". Be precise about cultural elements, geographical features, and factual details.',
} as const
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
  if (!fileSystem.actualOpen) {
    throw new Error('node:fs/promises.open test delegate is not initialized')
  }
  fileSystem.open.mockReset()
  fileSystem.open.mockImplementation(fileSystem.actualOpen)
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
    if (params.model === 'gemini-2.5-flash') {
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
    arkApiKey?: string
    imageQuality?: 'fast' | 'balanced' | 'quality'
    skipPromptEnhancement?: boolean
  } = {}
): void {
  process.env.IMAGE_PROVIDER = 'seedream'
  process.env.ARK_API_KEY = options.arkApiKey ?? ARK_DUMMY_KEY
  process.env.GEMINI_API_KEY = 'gemini-dummy-integration-key'
  process.env.OPENAI_API_KEY = 'openai-dummy-integration-key'
  process.env.IMAGE_OUTPUT_DIR = outputDirectory
  process.env.IMAGE_QUALITY = options.imageQuality ?? 'fast'
  process.env.SKIP_PROMPT_ENHANCEMENT = String(options.skipPromptEnhancement ?? false)
  process.env.NODE_ENV = 'test'
}

function configureGemini(outputDirectory: string): void {
  process.env.IMAGE_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'gemini-dummy-integration-key'
  process.env.OPENAI_API_KEY = 'openai-dummy-integration-key'
  process.env.ARK_API_KEY = ARK_DUMMY_KEY
  process.env.IMAGE_OUTPUT_DIR = outputDirectory
  process.env.IMAGE_QUALITY = 'fast'
  process.env.SKIP_PROMPT_ENHANCEMENT = 'true'
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

function extractTextInput(request: Record<string, unknown>): string {
  if (typeof request.input === 'string') {
    return request.input
  }
  if (!Array.isArray(request.input)) {
    return ''
  }

  for (const item of request.input) {
    if (!isRecord(item)) {
      continue
    }
    const content = item['content']
    if (!Array.isArray(content)) {
      continue
    }
    const textPart = content.find((part) => isRecord(part) && part['type'] === 'input_text')
    if (isRecord(textPart) && typeof textPart['text'] === 'string') {
      return textPart['text']
    }
  }

  return ''
}

function capturedLogs(): string {
  return vi
    .mocked(console.error)
    .mock.calls.flatMap((call) => call.map(String))
    .join('\n')
}

type FailureRow = {
  args?: Record<string, unknown>
  arkApiKey?: string
  deleteArkApiKey?: boolean
  expectedCode: string
  expectedDecodeCalls: number
  expectedImageCalls: number
  expectedParseCalls: number
  expectedTextCalls: number
  fetchError?: Error
  name: string
  responseFactory?: (responseSentinel: string, imageSentinel: string) => Response
  sensitiveValues?: string[]
  skipPromptEnhancement?: boolean
}

/** Every failure this provider must contain before the next side effect. */
function buildFailureRows(): FailureRow[] {
  return [
    {
      name: 'missing-key',
      deleteArkApiKey: true,
      expectedCode: 'CONFIG_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'empty-key',
      arkApiKey: '   ',
      expectedCode: 'CONFIG_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'google-search',
      args: { useGoogleSearch: true },
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'google-search-string',
      args: { useGoogleSearch: 'private-invalid-google-search-string' },
      expectedCode: 'INPUT_VALIDATION_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      sensitiveValues: ['private-invalid-google-search-string'],
    },
    {
      name: 'google-search-number',
      args: { useGoogleSearch: 8675309 },
      expectedCode: 'INPUT_VALIDATION_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      sensitiveValues: ['8675309'],
    },
    {
      name: 'google-search-null',
      args: { useGoogleSearch: null },
      expectedCode: 'INPUT_VALIDATION_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'google-search-object',
      args: { useGoogleSearch: { marker: 'private-invalid-google-search-object' } },
      expectedCode: 'INPUT_VALIDATION_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      sensitiveValues: ['private-invalid-google-search-object'],
    },
    {
      name: 'fast-pro-4k',
      args: { imageSize: '4K', quality: 'fast' },
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'pro-4k',
      args: { imageSize: '4K', quality: 'quality' },
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'unsupported-editing-input',
      args: { inputImagePath: '__CREATE_UNSUPPORTED_INPUT__' },
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 0,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
    },
    {
      name: 'missing-data',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse({
          response_sentinel: responseSentinel,
          image_sentinel: imageSentinel,
        }),
    },
    {
      name: 'extra-images',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel): Response => {
        const imageBytes = createPngFixture(imageSentinel)
        return createJsonResponse({
          response_sentinel: responseSentinel,
          data: [
            { b64_json: imageBytes.toString('base64'), mime_type: 'image/png' },
            { b64_json: imageBytes.toString('base64'), mime_type: 'image/png' },
          ],
        })
      },
    },
    {
      name: 'url-only',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse({
          response_sentinel: responseSentinel,
          image_sentinel: imageSentinel,
          data: [{ url: `https://attacker.invalid/${imageSentinel}.png` }],
        }),
    },
    {
      name: 'stream-event',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        new Response(
          `data: ${JSON.stringify({
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
            data: [],
          })}\n\n`,
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }
        ),
    },
    {
      name: 'malformed-base64',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel): Response => {
        const validBase64 = createPngFixture(imageSentinel).toString('base64')
        return createJsonResponse({
          response_sentinel: responseSentinel,
          data: [
            {
              b64_json: `${validBase64.slice(0, -1)}*`,
              mime_type: 'image/png',
            },
          ],
        })
      },
    },
    {
      name: 'empty-base64',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse({
          response_sentinel: responseSentinel,
          image_sentinel: imageSentinel,
          data: [{ b64_json: '', mime_type: 'image/png' }],
        }),
    },
    {
      name: 'content-length-over-48-mib',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        new Response(`${responseSentinel}:${imageSentinel}`, {
          status: 200,
          headers: {
            'content-length': String(48 * 1024 * 1024 + 1),
            'content-type': 'application/json',
          },
        }),
    },
    {
      name: 'chunked-body-over-48-mib',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
    },
    {
      name: 'decoded-size-over-32-mib',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse({
          response_sentinel: responseSentinel,
          image_sentinel: imageSentinel,
          data: [
            {
              b64_json: 'A'.repeat(Math.ceil(((32 * 1024 * 1024 + 1) * 4) / 3)),
              mime_type: 'image/png',
            },
          ],
        }),
    },
    {
      name: 'non-png-magic',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 1,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse({
          response_sentinel: responseSentinel,
          data: [
            {
              b64_json: Buffer.from(`not-a-png:${imageSentinel}`).toString('base64'),
              mime_type: 'image/png',
            },
          ],
        }),
    },
    {
      name: 'wrong-mime',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 1,
      expectedImageCalls: 1,
      expectedParseCalls: 1,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel): Response => {
        const imageBytes = createPngFixture(imageSentinel)
        return createJsonResponse({
          response_sentinel: responseSentinel,
          data: [{ b64_json: imageBytes.toString('base64'), mime_type: 'image/jpeg' }],
        })
      },
    },
    {
      name: 'abort-timeout',
      expectedCode: 'NETWORK_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      fetchError: new DOMException('synthetic timeout', 'AbortError'),
    },
    {
      name: 'http-401',
      expectedCode: 'IMAGE_API_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse(
          {
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
            error: { message: RAW_BODY_MARKER },
          },
          401
        ),
    },
    {
      name: 'http-500',
      expectedCode: 'NETWORK_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
      skipPromptEnhancement: true,
      responseFactory: (responseSentinel, imageSentinel) =>
        createJsonResponse(
          {
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
            error: { message: RAW_BODY_MARKER },
          },
          500
        ),
    },
    {
      name: 'network-failure',
      expectedCode: 'NETWORK_ERROR',
      expectedDecodeCalls: 0,
      expectedImageCalls: 1,
      expectedParseCalls: 0,
      expectedTextCalls: 0,
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

  const publicDetails = isRecord(publicError['details']) ? publicError['details'] : undefined
  if (!publicDetails) {
    return
  }
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

/**
 * Arrange the fetch double for one failure row. Returns the stream `cancel`
 * spy when the row streams a body, so the caller can assert it was cancelled.
 */
function arrangeFailureTransport(
  row: FailureRow,
  sentinels: RowSentinels
): ReturnType<typeof vi.fn> | undefined {
  const { responseSentinel, imageSentinel } = sentinels

  if (row.name === 'chunked-body-over-48-mib') {
    const chunkedCancel = vi.fn()
    transports.fetch.mockImplementation(async () =>
      createChunkedResponse(`${responseSentinel}:${imageSentinel}`, chunkedCancel)
    )
    return chunkedCancel
  }

  if (row.fetchError) {
    const message = `${row.fetchError.message}:${responseSentinel}:${imageSentinel}`
    transports.fetch.mockRejectedValue(
      row.fetchError instanceof DOMException
        ? new DOMException(message, row.fetchError.name)
        : new TypeError(message)
    )
    return undefined
  }

  if (row.responseFactory) {
    transports.fetch.mockImplementation(async () =>
      row.responseFactory?.(responseSentinel, imageSentinel)
    )
  }
  return undefined
}

/** A JSON response whose body is streamed past the accepted size limit. */
function createChunkedResponse(marker: string, cancel: () => void): Response {
  let emittedChunks = 0
  const markerChunk = new TextEncoder().encode(marker)
  return new Response(
    new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        if (emittedChunks === 0) {
          controller.enqueue(markerChunk)
          emittedChunks += 1
        } else if (emittedChunks < 50) {
          controller.enqueue(new Uint8Array(1024 * 1024))
          emittedChunks += 1
        } else {
          controller.close()
        }
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
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

  if (row.args?.['inputImagePath'] !== '__CREATE_UNSUPPORTED_INPUT__') {
    return args
  }

  const unsupportedInputPath = join(outputDirectory, 'unsupported.gif')
  await writeFile(unsupportedInputPath, `${INPUT_IMAGE_MARKER}:${row.name}`)
  return { ...args, inputImagePath: unsupportedInputPath }
}

/** The base64 payload this failure row is expected to attempt to decode, if any. */
function expectedDecodePayload(row: FailureRow, imageSentinel: string): string | undefined {
  const pngBase64 = createPngFixture(imageSentinel).toString('base64')
  switch (row.name) {
    case 'extra-images':
    case 'wrong-mime':
      return pngBase64
    case 'malformed-base64':
      return `${pngBase64.slice(0, -1)}*`
    case 'empty-base64':
      return ''
    case 'non-png-magic':
      return Buffer.from(`not-a-png:${imageSentinel}`).toString('base64')
    default:
      return undefined
  }
}

interface SavedPngExpectation {
  outputDirectory: string
  fileName: string
  expectedBytes: Buffer
  expectedModel: string
}

type SupportedRow = {
  args: Record<string, unknown>
  expectedAspectRatio: (typeof ALL_ASPECT_RATIOS)[number]
  expectedModel: 'dola-seedream-5-0-pro-260628'
  expectedQuality: 'fast' | 'balanced' | 'quality'
  expectedResolution: '1K' | '2K'
  inputImage?: boolean
  name: string
  skipPromptEnhancement?: boolean
  textFailure?: boolean
}

/** The full matrix of supported request shapes this provider must honour. */
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
    {
      name: 'fast-route',
      args: { quality: 'fast' },
      expectedAspectRatio: '1:1',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'fast',
      expectedResolution: '1K',
    },
    {
      name: 'balanced-route',
      args: { quality: 'balanced' },
      expectedAspectRatio: '1:1',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'balanced',
      expectedResolution: '1K',
    },
    {
      name: 'quality-request-overrides-captured-fast',
      args: { quality: 'quality' },
      expectedAspectRatio: '1:1',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'quality',
      expectedResolution: '1K',
    },
    {
      name: 'single-input-image',
      args: { quality: 'quality' },
      expectedAspectRatio: '1:1',
      expectedModel: 'dola-seedream-5-0-pro-260628',
      expectedQuality: 'quality',
      expectedResolution: '1K',
      inputImage: true,
    },
    ...ALL_ASPECT_RATIOS.map(
      (aspectRatio): SupportedRow => ({
        name: `aspect-${aspectRatio}`,
        args: { aspectRatio, imageSize: '2K', quality: 'fast' },
        expectedAspectRatio: aspectRatio,
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'fast',
        expectedResolution: '2K',
      })
    ),
    ...['blendImages', 'maintainCharacterConsistency', 'useWorldKnowledge', 'useGoogleSearch'].map(
      (flag): SupportedRow => ({
        name: `false-${flag}`,
        args: { [flag]: false },
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'fast',
        expectedResolution: '1K',
      })
    ),
    ...[
      ['blendImages', true],
      ['maintainCharacterConsistency', true],
      ['useWorldKnowledge', true],
      ['purpose', 'cookbook cover'],
    ].map(
      ([flag, value]): SupportedRow => ({
        name: `prompt-only-${String(flag)}`,
        args: { [String(flag)]: value },
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'fast',
        expectedResolution: '1K',
      })
    ),
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
  inputImageBytes: Buffer | undefined
  inputImagePath: string | undefined
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
    inputImageBytes: undefined,
    inputImagePath: undefined,
  }

  if (row.inputImage) {
    fixture.inputImageBytes = createPngFixture(`${row.name}:input-image-sentinel`)
    fixture.inputImagePath = join(await createOutputDirectory(), `${row.name}-input.png`)
    await writeFile(fixture.inputImagePath, fixture.inputImageBytes)
  }

  return fixture
}

/** The exact Seedream image request body one supported row must produce. */
function buildExpectedImageRequest(
  row: SupportedRow,
  finalPrompt: string,
  inputImageBytes: Buffer | undefined
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
    ...(inputImageBytes && {
      image: `data:image/png;base64,${inputImageBytes.toString('base64')}`,
    }),
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

interface EnhancementExpectation {
  label: string
  requestPrompt: string
  args: Record<string, unknown>
  inputImageBytes: Buffer | undefined
}

/**
 * Every expectation the Seedream text-enhancement request must satisfy for one
 * table row: shape, sampling parameters, feature instructions and image part.
 */
function assertEnhancementRequest(
  textRequest: Record<string, unknown>,
  expectation: EnhancementExpectation
): void {
  const { label, requestPrompt, args, inputImageBytes } = expectation
  const textInput = extractTextInput(textRequest)

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
  expect.soft(countOccurrences(textInput, requestPrompt), label).toBe(1)

  for (const [flag, instruction] of Object.entries(FEATURE_INSTRUCTIONS)) {
    expect.soft(textInput.includes(instruction), `${label}:${flag}`).toBe(args[flag] === true)
  }

  const purpose = typeof args['purpose'] === 'string' ? args['purpose'] : undefined
  const purposeInstruction = purpose
    ? `INTENDED USE: ${purpose}\nTailor the visual style, quality level, and details to match this purpose.`
    : 'INTENDED USE:'
  expect.soft(textInput.includes(purposeInstruction), `${label}:purpose`).toBe(Boolean(purpose))

  if (!inputImageBytes) {
    expect.soft(textRequest['input'], label).toBe(textInput)
    return
  }

  expect.soft(textRequest['input'], label).toEqual([
    {
      role: 'user',
      content: [
        { type: 'input_text', text: textInput },
        {
          type: 'input_image',
          image_url: `data:image/png;base64,${inputImageBytes.toString('base64')}`,
          detail: 'auto',
        },
      ],
    },
  ])
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
 * selection and caching, supported request propagation, bounded file input, and failure containment.
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
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const jsonParseSpy = vi.spyOn(JSON, 'parse')
    const bufferFromSpy = vi.spyOn(Buffer, 'from')
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
        inputImageBytes,
        inputImagePath,
      } = fixture
      const expectedBase64 = expectedImageBytes.toString('base64')

      arrangeSupportedRow(row, fixture)

      const server = createMCPServer()
      const beforeTimeoutCalls = timeoutSpy.mock.calls.length
      const beforeParseCalls = jsonParseSpy.mock.calls.length
      const beforeDecodeCalls = bufferFromSpy.mock.calls.length

      expect.soft(await readdir(outputDirectory), row.name).toEqual([])

      const result = await server.callTool('generate_image', {
        prompt: requestPrompt,
        fileName,
        ...(inputImagePath && { inputImagePath }),
        ...row.args,
      })

      const parseCount = jsonParseSpy.mock.calls
        .slice(beforeParseCalls)
        .filter(([value]) => typeof value === 'string' && value.includes(responseSentinel)).length
      const decodeCount = bufferFromSpy.mock.calls
        .slice(beforeDecodeCalls)
        .filter(([value, encoding]) => value === expectedBase64 && encoding === 'base64').length
      const imageRequest = observeLastImageRequest()
      const textRequest = recordOrEmpty(transports.openAIResponsesCreate.mock.calls.at(-1)?.[0])
      const selectedPrompt =
        row.skipPromptEnhancement || row.textFailure ? requestPrompt : enhancedPrompt
      const finalPrompt = `${selectedPrompt}\n\nOutput aspect ratio: ${row.expectedAspectRatio}.`
      const rowTimeouts = timeoutSpy.mock.calls
        .slice(beforeTimeoutCalls)
        .map(([timeout]) => timeout)
      const expectedImageRequest = buildExpectedImageRequest(row, finalPrompt, inputImageBytes)
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
      expect.soft(rowTimeouts, row.name).toContain(300000)
      expect.soft(parseCount, row.name).toBe(1)
      expect.soft(decodeCount, row.name).toBe(1)

      if (row.skipPromptEnhancement) {
        expect.soft(textRequest, row.name).toEqual({})
      } else {
        assertEnhancementRequest(textRequest, {
          label: row.name,
          requestPrompt,
          args: row.args,
          inputImageBytes,
        })
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
        inputImageBytes?.toString('base64'),
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

  it('bounds file-backed input before base64 and downstream side effects', async () => {
    const inputDirectory = await createOutputDirectory()
    const expectedInputOpenFlags =
      fsConstants.O_RDONLY |
      (typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0) |
      (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)
    const bufferAllocSpy = vi.spyOn(Buffer, 'alloc')
    const bufferToStringSpy = vi.spyOn(Buffer.prototype, 'toString')

    resetTransportDoubles()
    const exactOutputDirectory = await createOutputDirectory()
    const exactInputPath = join(inputDirectory, 'exact-limit.png')
    await writeFile(exactInputPath, Buffer.alloc(MAX_IMAGE_SIZE, 0x61))
    configureGemini(exactOutputDirectory)
    let exactCloseSpy: ReturnType<typeof vi.spyOn> | undefined
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      const handle = await fileSystem.actualOpen(filePath, flags)
      if (filePath.endsWith('/exact-limit.png')) {
        exactCloseSpy = vi.spyOn(handle, 'close')
      }
      return handle
    })
    const exactServer = createMCPServer()
    const beforeExactAllocCalls = bufferAllocSpy.mock.calls.length

    expect.soft(await readdir(exactOutputDirectory), 'exact-limit:before').toEqual([])
    const exactResult = await exactServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'exact-limit-output.png',
      inputImagePath: exactInputPath,
    })
    const exactAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeExactAllocCalls)
      .map(([size]) => size)

    expect.soft(exactResult.isError, 'exact-limit').toBe(false)
    expect
      .soft(
        fileSystem.open.mock.calls.filter(([, flags]) => flags === expectedInputOpenFlags),
        'exact-limit:one input open'
      )
      .toHaveLength(1)
    expect
      .soft(fileSystem.open, 'exact-limit')
      .toHaveBeenCalledWith(expect.stringMatching(/\/exact-limit\.png$/), expectedInputOpenFlags)
    expect.soft(exactCloseSpy, 'exact-limit').toHaveBeenCalledTimes(1)
    expect.soft(exactAllocSizes, 'exact-limit:allocation').toContain(MAX_IMAGE_SIZE + 1)
    expect
      .soft(
        exactAllocSizes.every((size) => size <= MAX_IMAGE_SIZE + 1),
        'exact-limit:ceiling'
      )
      .toBe(true)
    expect.soft(transports.openAIResponsesCreate, 'exact-limit:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'exact-limit:image').toHaveBeenCalledTimes(1)
    expect
      .soft(await readdir(exactOutputDirectory), 'exact-limit:after')
      .toEqual(['exact-limit-output.png'])

    resetTransportDoubles()
    const oversizedOutputDirectory = await createOutputDirectory()
    const oversizedInputPath = join(inputDirectory, 'over-limit.png')
    await writeFile(oversizedInputPath, Buffer.alloc(MAX_IMAGE_SIZE + 1, 0x62))
    configureGemini(oversizedOutputDirectory)
    let oversizedReadSpy: ReturnType<typeof vi.spyOn> | undefined
    let oversizedCloseSpy: ReturnType<typeof vi.spyOn> | undefined
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      const handle = await fileSystem.actualOpen(filePath, flags)
      if (filePath.endsWith('/over-limit.png')) {
        oversizedReadSpy = vi.spyOn(handle, 'read')
        oversizedCloseSpy = vi.spyOn(handle, 'close')
      }
      return handle
    })
    const oversizedServer = createMCPServer()
    const beforeOversizedAllocCalls = bufferAllocSpy.mock.calls.length
    const beforeOversizedBase64Calls = bufferToStringSpy.mock.calls.length

    expect.soft(await readdir(oversizedOutputDirectory), 'over-limit:before').toEqual([])
    const oversizedResult = await oversizedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'over-limit-output.png',
      inputImagePath: oversizedInputPath,
    })
    const oversizedAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeOversizedAllocCalls)
      .map(([size]) => size)
    const oversizedBase64Calls = bufferToStringSpy.mock.calls
      .slice(beforeOversizedBase64Calls)
      .filter(([encoding]) => encoding === 'base64')
    const oversizedError = recordOrEmpty(parsePublicResponse(oversizedResult).error)

    expect.soft(oversizedResult.isError, 'over-limit').toBe(true)
    expect.soft(oversizedError.code, 'over-limit').toBe('INPUT_VALIDATION_ERROR')
    expect.soft(oversizedError.message, 'over-limit').toContain('10.0MB')
    expect.soft(fileSystem.open, 'over-limit').toHaveBeenCalledTimes(1)
    expect.soft(oversizedReadSpy, 'over-limit:read').not.toHaveBeenCalled()
    expect.soft(oversizedCloseSpy, 'over-limit').toHaveBeenCalledTimes(1)
    expect.soft(oversizedAllocSizes, 'over-limit:allocation').toEqual([])
    expect.soft(oversizedBase64Calls, 'over-limit:base64').toEqual([])
    expect.soft(transports.openAIResponsesCreate, 'over-limit:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'over-limit:image').not.toHaveBeenCalled()
    expect.soft(await readdir(oversizedOutputDirectory), 'over-limit:after').toEqual([])

    resetTransportDoubles()
    const growthOutputDirectory = await createOutputDirectory()
    const growthInputPath = join(inputDirectory, 'growth.png')
    await writeFile(growthInputPath, Buffer.from('initial-file'))
    const sanitizedGrowthInputPath = await realpath(growthInputPath)
    configureGemini(growthOutputDirectory)
    let growthObservedBytes = 0
    let growthLargestReadEnd = 0
    const growthClose = vi.fn(async () => undefined)
    const growthRead = vi.fn(
      async (buffer: Buffer, offset: number, length: number, _position: number | null) => {
        const bytesRead = Math.min(length, MAX_IMAGE_SIZE + 1 - growthObservedBytes)
        buffer.fill(0x63, offset, offset + bytesRead)
        growthObservedBytes += bytesRead
        growthLargestReadEnd = Math.max(growthLargestReadEnd, offset + length)
        return { buffer, bytesRead }
      }
    )
    const growthHandle = {
      close: growthClose,
      read: growthRead,
      stat: vi.fn(async () => ({
        isFile: () => true,
        size: MAX_IMAGE_SIZE,
      })),
    }
    // Mock-boundary rationale: simulate only the external growing-file handle/stat/read sequence;
    // path selection, bounded reading, MCP orchestration, transports, saves, and other fs access stay real.
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (filePath === sanitizedGrowthInputPath) {
        return growthHandle
      }
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      return fileSystem.actualOpen(filePath, flags)
    })
    const growthServer = createMCPServer()
    const beforeGrowthAllocCalls = bufferAllocSpy.mock.calls.length
    const beforeGrowthBase64Calls = bufferToStringSpy.mock.calls.length

    expect.soft(await readdir(growthOutputDirectory), 'growth:before').toEqual([])
    const growthResult = await growthServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'growth-output.png',
      inputImagePath: growthInputPath,
    })
    const growthAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeGrowthAllocCalls)
      .map(([size]) => size)
    const growthBase64Calls = bufferToStringSpy.mock.calls
      .slice(beforeGrowthBase64Calls)
      .filter(([encoding]) => encoding === 'base64')
    const growthError = recordOrEmpty(parsePublicResponse(growthResult).error)

    expect.soft(growthResult.isError, 'growth').toBe(true)
    expect.soft(growthError.code, 'growth').toBe('INPUT_VALIDATION_ERROR')
    expect.soft(growthError.message, 'growth').toContain('10.0MB')
    expect.soft(fileSystem.open, 'growth').toHaveBeenCalledTimes(1)
    expect
      .soft(fileSystem.open, 'growth')
      .toHaveBeenCalledWith(sanitizedGrowthInputPath, expectedInputOpenFlags)
    expect.soft(growthHandle.stat, 'growth:stat').toHaveBeenCalledTimes(1)
    expect.soft(growthRead, 'growth:read').toHaveBeenCalled()
    expect.soft(growthObservedBytes, 'growth:observed-bytes').toBe(MAX_IMAGE_SIZE + 1)
    expect
      .soft(growthLargestReadEnd, 'growth:allocation-ceiling')
      .toBeLessThanOrEqual(MAX_IMAGE_SIZE + 1)
    expect.soft(growthAllocSizes, 'growth:allocation').toContain(MAX_IMAGE_SIZE + 1)
    expect
      .soft(
        growthAllocSizes.every((size) => size <= MAX_IMAGE_SIZE + 1),
        'growth:ceiling'
      )
      .toBe(true)
    expect.soft(growthClose, 'growth:close').toHaveBeenCalledTimes(1)
    expect.soft(growthBase64Calls, 'growth:base64').toEqual([])
    expect.soft(transports.openAIResponsesCreate, 'growth:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'growth:image').not.toHaveBeenCalled()
    expect.soft(await readdir(growthOutputDirectory), 'growth:after').toEqual([])

    resetTransportDoubles()
    const nonRegularOutputDirectory = await createOutputDirectory()
    const nonRegularInputPath = join(inputDirectory, 'non-regular.png')
    await mkdir(nonRegularInputPath)
    configureGemini(nonRegularOutputDirectory)
    let nonRegularReadSpy: ReturnType<typeof vi.spyOn> | undefined
    let nonRegularCloseSpy: ReturnType<typeof vi.spyOn> | undefined
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      const handle = await fileSystem.actualOpen(filePath, flags)
      if (filePath.endsWith('/non-regular.png')) {
        nonRegularReadSpy = vi.spyOn(handle, 'read')
        nonRegularCloseSpy = vi.spyOn(handle, 'close')
      }
      return handle
    })
    const nonRegularServer = createMCPServer()
    const beforeNonRegularAllocCalls = bufferAllocSpy.mock.calls.length
    const beforeNonRegularBase64Calls = bufferToStringSpy.mock.calls.length

    expect.soft(await readdir(nonRegularOutputDirectory), 'non-regular:before').toEqual([])
    const nonRegularResult = await nonRegularServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'non-regular-output.png',
      inputImagePath: nonRegularInputPath,
    })
    const nonRegularAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeNonRegularAllocCalls)
      .map(([size]) => size)
    const nonRegularBase64Calls = bufferToStringSpy.mock.calls
      .slice(beforeNonRegularBase64Calls)
      .filter(([encoding]) => encoding === 'base64')
    const nonRegularError = recordOrEmpty(parsePublicResponse(nonRegularResult).error)

    expect.soft(nonRegularResult.isError, 'non-regular').toBe(true)
    expect.soft(nonRegularError.code, 'non-regular').toBe('INPUT_VALIDATION_ERROR')
    expect.soft(fileSystem.open, 'non-regular').toHaveBeenCalledTimes(1)
    expect.soft(nonRegularReadSpy, 'non-regular:read').not.toHaveBeenCalled()
    expect.soft(nonRegularCloseSpy, 'non-regular:close').toHaveBeenCalledTimes(1)
    expect.soft(nonRegularAllocSizes, 'non-regular:allocation').toEqual([])
    expect.soft(nonRegularBase64Calls, 'non-regular:base64').toEqual([])
    expect.soft(transports.openAIResponsesCreate, 'non-regular:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'non-regular:image').not.toHaveBeenCalled()
    expect.soft(await readdir(nonRegularOutputDirectory), 'non-regular:after').toEqual([])

    // Windows does not provide POSIX named FIFOs; Unix-family CI exercises the real FIFO open.
    if (process.platform !== 'win32') {
      resetTransportDoubles()
      const fifoOutputDirectory = await createOutputDirectory()
      const fifoInputPath = join(inputDirectory, 'named-pipe.png')
      await new Promise<void>((resolve, reject) => {
        execFile('/usr/bin/mkfifo', [fifoInputPath], (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
      const sanitizedFifoInputPath = await realpath(fifoInputPath)
      configureGemini(fifoOutputDirectory)
      let fifoCloseSpy: ReturnType<typeof vi.spyOn> | undefined
      fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
        if (!fileSystem.actualOpen) {
          throw new Error('node:fs/promises.open test delegate is not initialized')
        }
        const handle = await fileSystem.actualOpen(filePath, flags)
        if (filePath === sanitizedFifoInputPath) {
          fifoCloseSpy = vi.spyOn(handle, 'close')
        }
        return handle
      })
      const fifoServer = createMCPServer()
      const beforeFifoAllocCalls = bufferAllocSpy.mock.calls.length
      const beforeFifoBase64Calls = bufferToStringSpy.mock.calls.length

      expect.soft(await readdir(fifoOutputDirectory), 'fifo:before').toEqual([])
      const fifoCall = fifoServer.callTool('generate_image', {
        prompt: ORIGINAL_PROMPT,
        fileName: 'fifo-output.png',
        inputImagePath: fifoInputPath,
      })
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined
      const completionState = await Promise.race([
        fifoCall.then(() => 'completed' as const),
        new Promise<'deadline'>((resolve) => {
          deadlineTimer = setTimeout(() => resolve('deadline'), 500)
        }),
      ])
      if (deadlineTimer) {
        clearTimeout(deadlineTimer)
      }

      if (completionState === 'deadline') {
        await Promise.all([
          fifoCall,
          writeFile(fifoInputPath, Buffer.from('unblock-old-reader')).catch(() => undefined),
        ])
      }
      const fifoResult = await fifoCall
      const fifoAllocSizes = bufferAllocSpy.mock.calls
        .slice(beforeFifoAllocCalls)
        .map(([size]) => size)
      const fifoBase64Calls = bufferToStringSpy.mock.calls
        .slice(beforeFifoBase64Calls)
        .filter(([encoding]) => encoding === 'base64')
      const fifoError = recordOrEmpty(parsePublicResponse(fifoResult).error)

      expect.soft(completionState, 'fifo:deadline').toBe('completed')
      expect.soft(fifoResult.isError, 'fifo').toBe(true)
      expect.soft(fifoError.code, 'fifo').toBe('INPUT_VALIDATION_ERROR')
      expect.soft(fileSystem.open, 'fifo').toHaveBeenCalledTimes(1)
      expect
        .soft(fileSystem.open, 'fifo')
        .toHaveBeenCalledWith(sanitizedFifoInputPath, expectedInputOpenFlags)
      expect.soft(fifoCloseSpy, 'fifo:close').toHaveBeenCalledTimes(1)
      expect.soft(fifoAllocSizes, 'fifo:allocation').toEqual([])
      expect.soft(fifoBase64Calls, 'fifo:base64').toEqual([])
      expect.soft(transports.openAIResponsesCreate, 'fifo:text').not.toHaveBeenCalled()
      expect.soft(transports.googleGenerateContent, 'fifo:image').not.toHaveBeenCalled()
      expect.soft(await readdir(fifoOutputDirectory), 'fifo:after').toEqual([])
      await rm(fifoInputPath, { force: true })
    }
  })

  it('contains Seedream failures before the next side effect without disclosure', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const jsonParseSpy = vi.spyOn(JSON, 'parse')
    const bufferFromSpy = vi.spyOn(Buffer, 'from')
    const failureRows = buildFailureRows()

    for (const [index, row] of failureRows.entries()) {
      resetTransportDoubles()
      vi.mocked(console.error).mockClear()
      const outputDirectory = await createOutputDirectory()
      const requestSentinel = `${ORIGINAL_PROMPT}:${row.name}:request-body-sentinel`
      const responseSentinel = `${row.name}:response-body-sentinel`
      const imageSentinel = `${row.name}:decoded-image-sentinel`
      configureSeedream(outputDirectory, {
        arkApiKey: row.arkApiKey,
        skipPromptEnhancement: row.skipPromptEnhancement,
      })
      if (row.deleteArkApiKey) {
        delete process.env.ARK_API_KEY
      }

      const chunkedCancel = arrangeFailureTransport(row, { responseSentinel, imageSentinel })
      const args = await buildFailureArgs(row, index, outputDirectory, requestSentinel)

      const beforeFiles = await readdir(outputDirectory)
      const beforeTimeoutCalls = timeoutSpy.mock.calls.length
      const server = createMCPServer()
      const beforeParseCalls = jsonParseSpy.mock.calls.length
      const beforeDecodeCalls = bufferFromSpy.mock.calls.length
      const result = await server.callTool('generate_image', args)
      const afterFiles = await readdir(outputDirectory)
      const parseCount = jsonParseSpy.mock.calls
        .slice(beforeParseCalls)
        .filter(([value]) => typeof value === 'string' && value.includes(responseSentinel)).length
      const oversizedBase64Length = Math.ceil(((32 * 1024 * 1024 + 1) * 4) / 3)
      const expectedPayload = expectedDecodePayload(row, imageSentinel)
      const decodeCount = bufferFromSpy.mock.calls
        .slice(beforeDecodeCalls)
        .filter(([value, encoding]) => {
          if (encoding !== 'base64' || typeof value !== 'string') {
            return false
          }
          if (row.name === 'decoded-size-over-32-mib') {
            return value.length === oversizedBase64Length && value.startsWith('A')
          }
          return expectedPayload !== undefined && value === expectedPayload
        }).length
      const exposed = `${JSON.stringify(parsePublicResponse(result))}\n${capturedLogs()}`
      const rowTimeouts = timeoutSpy.mock.calls
        .slice(beforeTimeoutCalls)
        .map(([timeout]) => timeout)

      expect
        .soft(
          beforeFiles.filter((file) => file !== 'unsupported.gif'),
          row.name
        )
        .toEqual([])
      assertPublicErrorShape(result, row)
      expect.soft(transports.googleConstructor, row.name).not.toHaveBeenCalled()
      expect
        .soft(transports.openAIResponsesCreate, row.name)
        .toHaveBeenCalledTimes(row.expectedTextCalls)
      expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(row.expectedImageCalls)
      expect.soft(parseCount, row.name).toBe(row.expectedParseCalls)
      expect.soft(decodeCount, row.name).toBe(row.expectedDecodeCalls)
      expect
        .soft(
          afterFiles.filter((file) => file !== 'unsupported.gif'),
          row.name
        )
        .toEqual([])

      if (row.expectedImageCalls === 0) {
        expect.soft(rowTimeouts, row.name).not.toContain(300000)
      } else {
        expect.soft(rowTimeouts, row.name).toContain(300000)
      }
      if (row.name === 'url-only') {
        expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(1)
      }
      if (row.name === 'chunked-body-over-48-mib') {
        expect.soft(chunkedCancel, row.name).toBeDefined()
        expect.soft(chunkedCancel?.mock.calls.length ?? 0, row.name).toBe(1)
      }

      assertNoSensitiveDisclosure(row.name, exposed, [
        ARK_DUMMY_KEY,
        AUTHORIZATION_VALUE,
        requestSentinel,
        INPUT_IMAGE_MARKER,
        RAW_BODY_MARKER,
        responseSentinel,
        imageSentinel,
        ...(row.sensitiveValues ?? []),
      ])
    }
  })
})
