import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createGeminiClient } from '../../api/geminiClient.js'
import { createOpenAIImageClient } from '../../api/openaiImageClient.js'
import { createOpenAITextClient } from '../../api/openaiTextClient.js'
import {
  expectDefined,
  expectRecord,
  expectString,
  parseJsonObject,
  parseToolPayload,
  readPath,
} from '../../tests/helpers/inspect'
import { Logger } from '../../utils/logger.js'
import { createMCPServer } from '../mcpServer'

const packageVersion = expectString(
  readPath(
    parseJsonObject(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')),
    'version'
  ),
  'package.json version'
)

const GEMINI_IMAGE_BYTES = Buffer.from('mock-image-data', 'utf-8')

/**
 * The `generateImage` mock of a client produced by a mocked provider factory,
 * verified at runtime rather than asserted over.
 */
function createdImageClientMock(creation: unknown, what: string): Mock {
  const result = expectRecord(expectRecord(creation, what)['value'], `${what} result`)
  const client = expectRecord(result['data'], `${what} client`)
  const generateImage = client['generateImage']
  if (!vi.isMockFunction(generateImage)) {
    throw new Error(`Expected ${what} to expose a mocked generateImage`)
  }
  return generateImage
}

function geminiImageResult(mimeType: string): unknown {
  return {
    success: true,
    data: {
      imageData: GEMINI_IMAGE_BYTES,
      metadata: {
        model: 'gemini-nano-banana-2.1',
        prompt: 'test prompt',
        mimeType,
        timestamp: new Date(),
        inputImageProvided: false,
        processingTime: 1500,
      },
    },
  }
}

vi.mock('../../api/geminiClient', () => {
  return {
    createGeminiClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateImage: vi.fn().mockResolvedValue(geminiImageResult('image/png')),
      }
      return { success: true, data: mockClient }
    }),
  }
})

vi.mock('../../api/openaiImageClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/openaiImageClient.js')>()
  return {
    ...original,
    createOpenAIImageClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateImage: vi.fn().mockImplementation((params) => {
          const mimeType = params.preferredOutputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
          return Promise.resolve({
            success: true,
            data: {
              imageData: Buffer.from('mock-openai-image-data', 'utf-8'),
              metadata: {
                model: 'gpt-image-2',
                provider: 'openai',
                prompt: 'test prompt',
                mimeType,
                timestamp: new Date(),
                inputImageProvided: false,
              },
            },
          })
        }),
      }
      return { success: true, data: mockClient }
    }),
  }
})

vi.mock('../../api/openaiTextClient', () => {
  return {
    createOpenAITextClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateText: vi.fn().mockResolvedValue({
          success: true,
          data: 'Enhanced OpenAI prompt with professional lighting and composition',
        }),
      }
      return { success: true, data: mockClient }
    }),
  }
})

describe('MCP Server', () => {
  let outputDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    await mkdir(resolve('tmp'), { recursive: true })
    outputDir = await mkdtemp(resolve('tmp/mcp-server-'))
    vi.stubEnv('IMAGE_OUTPUT_DIR', outputDir)
    vi.stubEnv('IMAGE_PROVIDER', undefined)
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key-unit-tests')
    vi.stubEnv('OPENAI_API_KEY', undefined)
    vi.stubEnv('ARK_API_KEY', undefined)
    // The Gemini text client is real; keep enhancement off unless a test needs it.
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'true')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(outputDir, { recursive: true, force: true })
  })

  it('should report the package name and version', () => {
    const serverInfo = createMCPServer().getServerInfo()

    expect(serverInfo.name).toBe('mcp-image-server')
    expect(serverInfo.version).toBe(packageVersion)
  })

  it('should register generate_image with its input schema contract', () => {
    const toolsList = createMCPServer().getToolsList()

    expect(toolsList.tools.map(({ name }) => name)).toEqual(['generate_image'])
    const tool = expectDefined(toolsList.tools[0], 'generate_image tool')
    expect(tool.description).toContain('inputImagePaths')

    const schema = tool.inputSchema
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(['prompt'])
    expect(schema.properties).not.toHaveProperty('inputImagePath')
    expect(schema.properties).toMatchObject({
      prompt: { type: 'string' },
      fileName: { type: 'string' },
      inputImagePaths: {
        type: 'array',
        minItems: 1,
        maxItems: 16,
        items: { type: 'string', minLength: 1 },
      },
      blendImages: { type: 'boolean' },
      maintainCharacterConsistency: { type: 'boolean' },
      useWorldKnowledge: { type: 'boolean' },
      useGoogleSearch: { type: 'boolean' },
      purpose: { type: 'string' },
      aspectRatio: {
        type: 'string',
        enum: [
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
        ],
      },
      imageSize: { type: 'string', enum: ['1K', '2K', '4K'] },
      quality: { type: 'string', enum: ['fast', 'balanced', 'quality'] },
      provider: { type: 'string', enum: ['gemini', 'openai', 'seedream'] },
    })

    // Provider routing guidance the calling model relies on.
    const googleSearchDescription = schema.properties?.useGoogleSearch?.description
    expect(googleSearchDescription).toMatch(/Gemini/)
    expect(googleSearchDescription).toMatch(/OpenAI/)
    expect(googleSearchDescription).toMatch(/Seedream/)
    expect(schema.properties?.imageSize?.description).toMatch(/Seedream/)
  })

  it('should handle invalid tool request', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('invalid_tool', {})

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    const responseData = parseToolPayload(result)
    expect(readPath(responseData, 'error', 'code')).toBe('INTERNAL_ERROR')
    expect(readPath(responseData, 'error', 'message')).toContain('Unknown tool: invalid_tool')
    expect(readPath(responseData, 'error', 'suggestion')).toBe('Contact system administrator')
  })

  it('should name an auto-generated file after the generated MIME type', async () => {
    vi.mocked(createGeminiClient).mockImplementationOnce(() => ({
      success: true,
      data: { generateImage: vi.fn().mockResolvedValue(geminiImageResult('image/webp')) },
    }))
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', { prompt: 'test prompt' })

    expect(result.isError).toBe(false)
    const savedFiles = await readdir(outputDir)
    expect(savedFiles).toHaveLength(1)
    expect(expectDefined(savedFiles[0], 'saved file')).toMatch(/\.webp$/)
  })

  it('should correct a recognized extension when it differs from the actual MIME type', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn')
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'my-photo.jpg',
    })

    expect(result.isError).toBe(false)
    expect(readPath(parseToolPayload(result), 'resource', 'name')).toBe('my-photo.png')
    expect(await readFile(resolve(outputDir, 'my-photo.png'))).toEqual(GEMINI_IMAGE_BYTES)
    expect(warnSpy).toHaveBeenCalledWith(
      'mcp-server',
      expect.any(String),
      expect.objectContaining({ requestedExtension: '.jpg', savedExtension: '.png' })
    )
  })

  it('should sanitize filename before reconciling its extension', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: '...my-photo\x00',
    })

    expect(result.isError).toBe(false)
    expect(await readdir(outputDir)).toEqual(['my-photo.png'])
  })

  it('should route image generation through OpenAI provider when configured', async () => {
    vi.stubEnv('IMAGE_PROVIDER', 'openai')
    vi.stubEnv('GEMINI_API_KEY', undefined)
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-api-key-unit-tests')
    vi.stubEnv('SKIP_PROMPT_ENHANCEMENT', 'false')
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    expect(result.isError).toBe(false)
    expect(createGeminiClient).not.toHaveBeenCalled()
    expect(createOpenAIImageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        imageProvider: 'openai',
        openaiApiKey: 'test-openai-api-key-unit-tests',
      })
    )
    expect(createOpenAITextClient).toHaveBeenCalledWith(
      expect.objectContaining({
        openaiApiKey: 'test-openai-api-key-unit-tests',
      })
    )
  })

  it('should keep per-provider clients when calls alternate between providers', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-api-key-unit-tests')
    const mcpServer = createMCPServer()

    const results: Awaited<ReturnType<typeof mcpServer.callTool>>[] = []
    for (const provider of ['gemini', 'openai', 'gemini'] as const) {
      results.push(await mcpServer.callTool('generate_image', { prompt: 'test prompt', provider }))
    }

    expect(
      results.map((result) => readPath(parseToolPayload(result), 'metadata', 'model'))
    ).toEqual(['gemini-nano-banana-2.1', 'gpt-image-2', 'gemini-nano-banana-2.1'])
    // Initialized clients are cached per provider (byteplus-seedream-provider-design AC-13).
    expect(createGeminiClient).toHaveBeenCalledTimes(1)
    expect(createOpenAIImageClient).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      route: 'request provider',
      requestProvider: 'openai' as const,
      configuredDefault: undefined,
      expectedProvider: 'openai',
    },
    {
      route: 'configured default provider',
      requestProvider: undefined,
      configuredDefault: 'seedream' as const,
      expectedProvider: 'seedream',
    },
    {
      route: 'built-in default provider',
      requestProvider: undefined,
      configuredDefault: undefined,
      expectedProvider: 'gemini',
    },
  ])(
    'should guide the caller to configure credentials for the $route',
    async ({ requestProvider, configuredDefault, expectedProvider }) => {
      vi.stubEnv('GEMINI_API_KEY', undefined)
      vi.stubEnv('IMAGE_PROVIDER', configuredDefault)
      const mcpServer = createMCPServer()

      const result = await mcpServer.callTool('generate_image', {
        prompt: 'test prompt',
        ...(requestProvider && { provider: requestProvider }),
      })

      expect(result.isError).toBe(true)
      const error = readPath(parseToolPayload(result), 'error')
      expect(readPath(error, 'code')).toBe('CONFIG_ERROR')
      expect(readPath(error, 'message')).toContain(`"${expectedProvider}"`)
      expect(createGeminiClient).not.toHaveBeenCalled()
      expect(createOpenAIImageClient).not.toHaveBeenCalled()
    }
  )

  it('should pass JPEG preference from fileName to the selected provider', async () => {
    vi.stubEnv('IMAGE_PROVIDER', 'openai')
    vi.stubEnv('GEMINI_API_KEY', undefined)
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-api-key-unit-tests')
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'requested.JPEG',
    })

    expect(result.isError).toBe(false)
    const generateImage = createdImageClientMock(
      vi.mocked(createOpenAIImageClient).mock.results[0],
      'openai image client creation'
    )
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ preferredOutputFormat: 'jpeg' })
    )
  })

  it('should use the provider default for a recognized suffix that cannot select an output format', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'requested.webp',
    })

    expect(result.isError).toBe(false)
    const generateImage = createdImageClientMock(
      vi.mocked(createGeminiClient).mock.results.at(-1),
      'gemini image client creation'
    )
    const imageParams = expectDefined(generateImage.mock.calls[0], 'generateImage call')[0]
    expect(imageParams).not.toHaveProperty('preferredOutputFormat')
    expect(await readdir(outputDir)).toEqual(['requested.png'])
  })
})
