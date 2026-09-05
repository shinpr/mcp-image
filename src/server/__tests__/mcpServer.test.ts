import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateFileName, saveImage } from '../../business/fileManager.js'
import { Logger } from '../../utils/logger.js'
import { createMCPServer, MCPServerImpl } from '../mcpServer'

const packageVersion = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version

vi.mock('../../api/geminiClient', () => {
  return {
    createGeminiClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            imageData: Buffer.from('mock-image-data', 'utf-8'),
            metadata: {
              model: 'gemini-3.1-flash-image',
              prompt: 'test prompt',
              mimeType: 'image/png',
              timestamp: new Date(),
              inputImageProvided: false,
              processingTime: 1500,
            },
          },
        }),
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

vi.mock('../../business/fileManager', () => {
  return {
    saveImage: vi.fn().mockResolvedValue({
      success: true,
      data: './test-output/test-image.png',
    }),
    generateFileName: vi.fn().mockImplementation((mimeType?: string) => {
      if (mimeType === 'image/jpeg') return 'test-image.jpg'
      if (mimeType === 'image/webp') return 'test-image.webp'
      return 'test-image.png'
    }),
  }
})

vi.mock('../../business/responseBuilder', () => {
  return {
    buildSuccessResponse: vi.fn().mockReturnValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'resource',
            resource: {
              uri: 'file://./test-output/test-image.png',
              name: 'test-image.png',
              mimeType: 'image/png',
            },
            metadata: {
              model: 'gemini-3.1-flash-image',
              prompt: 'test prompt',
              mimeType: 'image/png',
              timestamp: new Date().toISOString(),
              inputImageProvided: false,
              processingTime: 1500,
            },
          }),
        },
      ],
      isError: false,
    }),
    buildErrorResponse: vi.fn().mockImplementation((error, unknownFallback) => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                code: error.code || unknownFallback?.code || 'UNKNOWN_ERROR',
                message:
                  error.message ||
                  'Prompt must be between 1 and 4000 characters. Current length: 0',
                suggestion:
                  error.suggestion ||
                  unknownFallback?.suggestion ||
                  'Please try again or contact support if the problem persists',
              },
            }),
          },
        ],
        isError: true,
      }
    }),
  }
})

describe('MCP Server', () => {
  let originalApiKey: string | undefined
  let originalArkApiKey: string | undefined
  let originalImageProvider: string | undefined
  let originalOpenAIApiKey: string | undefined
  let originalSkipPromptEnhancement: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalApiKey = process.env.GEMINI_API_KEY
    originalArkApiKey = process.env.ARK_API_KEY
    originalImageProvider = process.env.IMAGE_PROVIDER
    originalOpenAIApiKey = process.env.OPENAI_API_KEY
    originalSkipPromptEnhancement = process.env.SKIP_PROMPT_ENHANCEMENT
    delete process.env.IMAGE_PROVIDER
    process.env.GEMINI_API_KEY = 'test-api-key-unit-tests'
    delete process.env.OPENAI_API_KEY
    delete process.env.ARK_API_KEY
    delete process.env.SKIP_PROMPT_ENHANCEMENT
    process.env.IMAGE_OUTPUT_DIR = './test-output'
  })

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey
    } else {
      delete process.env.GEMINI_API_KEY
    }
    if (originalImageProvider !== undefined) {
      process.env.IMAGE_PROVIDER = originalImageProvider
    } else {
      delete process.env.IMAGE_PROVIDER
    }
    if (originalOpenAIApiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAIApiKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
    if (originalArkApiKey !== undefined) {
      process.env.ARK_API_KEY = originalArkApiKey
    } else {
      delete process.env.ARK_API_KEY
    }
    if (originalSkipPromptEnhancement !== undefined) {
      process.env.SKIP_PROMPT_ENHANCEMENT = originalSkipPromptEnhancement
    } else {
      delete process.env.SKIP_PROMPT_ENHANCEMENT
    }
  })
  it('should create MCP server instance', async () => {
    const mcpServer = createMCPServer()

    expect(mcpServer).toBeInstanceOf(MCPServerImpl)

    const serverInfo = mcpServer.getServerInfo()
    expect(serverInfo.name).toBe('mcp-image-server')
    expect(serverInfo.version).toBe(packageVersion)
  })

  it('should register generate_image tool', async () => {
    const mcpServer = createMCPServer()

    const toolsList = mcpServer.getToolsList()

    expect(toolsList.tools).toHaveLength(1)
    expect(toolsList.tools[0].name).toBe('generate_image')
    expect(toolsList.tools[0].description).toMatch(/generate a new image/i)
    expect(toolsList.tools[0].description).toMatch(/edit an existing image/i)
    expect(toolsList.tools[0].description).toContain('inputImagePath')
    expect(toolsList.tools[0].description).toMatch(/file resource/i)

    const schema = toolsList.tools[0].inputSchema
    expect(schema.type).toBe('object')
    expect(schema.properties).toHaveProperty('prompt')
    expect(schema.properties?.prompt?.type).toBe('string')
    expect(schema.properties?.prompt?.description).toMatch(/generate|edit/i)
    expect(schema.properties?.prompt?.description).toMatch(/subject/i)
    expect(schema.properties?.prompt?.description).toMatch(/context/i)
    expect(schema.properties?.prompt?.description).toMatch(/visual style/i)
    expect(schema.properties).toHaveProperty('fileName')
    const fileNameDescription = schema.properties?.fileName?.description
    expect(fileNameDescription).toContain('.png')
    expect(fileNameDescription).toContain('.jpg')
    expect(fileNameDescription).toContain('.jpeg')
    expect(fileNameDescription).toMatch(/OpenAI/)
    expect(fileNameDescription).toMatch(/Seedream/)
    expect(fileNameDescription).toMatch(/output format/i)
    expect(fileNameDescription).toMatch(/omit|default/i)

    const googleSearchDescription = schema.properties?.useGoogleSearch?.description
    expect(googleSearchDescription).toMatch(/Gemini/)
    expect(googleSearchDescription).toMatch(/OpenAI/)
    expect(googleSearchDescription).toMatch(/Seedream/)
    expect(googleSearchDescription).toMatch(/current|time-sensitive/i)
    expect(googleSearchDescription).toMatch(/omit|false/i)

    const imageSizeDescription = schema.properties?.imageSize?.description
    expect(imageSizeDescription).toMatch(/1K/)
    expect(imageSizeDescription).toMatch(/2K/)
    expect(imageSizeDescription).toMatch(/4K/)
    expect(imageSizeDescription).toMatch(/default/i)
    expect(imageSizeDescription).toMatch(/Seedream/)

    const qualityDescription = schema.properties?.quality?.description
    expect(qualityDescription).toMatch(/user requests/i)
    expect(qualityDescription).toMatch(/omit|default/i)
    expect(qualityDescription).toMatch(/fast/)
    expect(qualityDescription).toMatch(/balanced/)
    expect(qualityDescription).toMatch(/quality/)
    expect(qualityDescription).toMatch(/speed/)
    expect(qualityDescription).toMatch(/detail/)
    expect(qualityDescription).toMatch(/fidelity/)
    expect(schema.required).toEqual(['prompt'])
    expect(schema.properties.aspectRatio.enum).toEqual([
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
    ])
    expect(schema.properties.imageSize.enum).toEqual(['1K', '2K', '4K'])
    expect(schema.properties.quality.enum).toEqual(['fast', 'balanced', 'quality'])
    expect(schema.properties.provider.enum).toEqual(['gemini', 'openai', 'seedream'])
  })

  it('should return file URI when no fileName is specified', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('type', 'resource')
    expect(responseData).toHaveProperty('resource')
    expect(responseData.resource.uri).toMatch(/^file:\/\//)
    expect(responseData.resource.name).toBe('test-image.png')
    expect(responseData.resource.mimeType).toBe('image/png')
    expect(responseData).toHaveProperty('metadata')
    expect(responseData.metadata.model).toBe('gemini-3.1-flash-image')
  })

  it('should save to file when fileName is specified', async () => {
    const mcpServer = createMCPServer()
    const testFileName = 'test-image.png'

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: testFileName,
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('type', 'resource')
    expect(responseData).toHaveProperty('resource')
    expect(responseData.resource.uri).toBe('file://./test-output/test-image.png')
    expect(responseData.resource.name).toBe('test-image.png')
    expect(responseData.resource.mimeType).toBe('image/png')
    expect(responseData).toHaveProperty('metadata')
    expect(responseData.metadata.model).toBe('gemini-3.1-flash-image')
  })

  it('should handle invalid tool request', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('invalid_tool', {})

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('error')
    expect(responseData.error.code).toBe('INTERNAL_ERROR')
    expect(responseData.error.message).toContain('Unknown tool: invalid_tool')
    expect(responseData.error.suggestion).toBe('Contact system administrator')
  })

  it('should pass mimeType to generateFileName for auto-generated filenames', async () => {
    const mcpServer = createMCPServer()

    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    expect(generateFileName).toHaveBeenCalledWith('image/png')
  })

  it('should append extension to user-provided filename without extension', async () => {
    const mcpServer = createMCPServer()

    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'my-photo',
    })

    const saveImageCall = vi.mocked(saveImage).mock.calls[0]
    const savedPath = saveImageCall[1] as string
    expect(savedPath).toMatch(/my-photo\.png$/)
  })

  it('should preserve a user-provided extension when it matches the actual MIME type', async () => {
    process.env.IMAGE_PROVIDER = 'openai'
    delete process.env.GEMINI_API_KEY
    process.env.OPENAI_API_KEY = 'test-openai-api-key-unit-tests'
    const mcpServer = createMCPServer()

    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'my-photo.jpg',
    })

    const saveImageCall = vi.mocked(saveImage).mock.calls[0]
    const savedPath = saveImageCall[1] as string
    expect(savedPath).toMatch(/my-photo\.jpg$/)
  })

  it('should correct a recognized extension when it differs from the actual MIME type', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn')

    try {
      const mcpServer = createMCPServer()

      await mcpServer.callTool('generate_image', {
        prompt: 'test prompt',
        fileName: 'my-photo.jpg',
      })

      const savedPath = vi.mocked(saveImage).mock.calls[0][1]
      expect(savedPath).toMatch(/my-photo\.png$/)
      expect(warnSpy).toHaveBeenCalledWith(
        'mcp-server',
        'Output filename extension corrected to match generated MIME type',
        {
          requestedExtension: '.jpg',
          savedExtension: '.png',
          mimeType: 'image/png',
        }
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('should sanitize filename before reconciling its extension', async () => {
    const mcpServer = createMCPServer()

    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: '...my-photo\x00',
    })

    const saveImageCall = vi.mocked(saveImage).mock.calls[0]
    const savedPath = saveImageCall[1] as string
    expect(savedPath).toMatch(/my-photo\.png$/)
  })

  it('should validate prompt parameter', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: '',
    })

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('error')
    expect(responseData.error.code).toBe('INPUT_VALIDATION_ERROR')
    expect(responseData.error.message).toContain('1 and 4000 characters')
    expect(responseData.error.suggestion).toContain('descriptive prompt')
  })

  it('should route image generation through OpenAI provider when configured', async () => {
    process.env.IMAGE_PROVIDER = 'openai'
    delete process.env.GEMINI_API_KEY
    process.env.OPENAI_API_KEY = 'test-openai-api-key-unit-tests'
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    expect(result.isError).toBe(false)

    const { createGeminiClient } = await import('../../api/geminiClient')
    const { createOpenAIImageClient } = await import('../../api/openaiImageClient')
    const { createOpenAITextClient } = await import('../../api/openaiTextClient')

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

  it('should route image generation through the provider requested in the tool call', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key-unit-tests'
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      provider: 'openai',
    })

    expect(result.isError).toBe(false)

    const { createGeminiClient } = await import('../../api/geminiClient')
    const { createOpenAIImageClient } = await import('../../api/openaiImageClient')
    const { createOpenAITextClient } = await import('../../api/openaiTextClient')

    expect(createGeminiClient).not.toHaveBeenCalled()
    expect(createOpenAIImageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        openaiApiKey: 'test-openai-api-key-unit-tests',
      })
    )
    expect(createOpenAITextClient).toHaveBeenCalledWith(
      expect.objectContaining({
        openaiApiKey: 'test-openai-api-key-unit-tests',
      })
    )
  })

  it('should build fresh clients when a later call requests another provider', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-api-key-unit-tests'
    process.env.SKIP_PROMPT_ENHANCEMENT = 'true'
    const mcpServer = createMCPServer()

    const geminiResult = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      provider: 'gemini',
    })
    const openaiResult = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      provider: 'openai',
    })
    const cachedGeminiResult = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      provider: 'gemini',
    })

    expect(geminiResult.isError).toBe(false)
    expect(openaiResult.isError).toBe(false)
    expect(cachedGeminiResult.isError).toBe(false)

    const { createGeminiClient } = await import('../../api/geminiClient')
    const { createOpenAIImageClient } = await import('../../api/openaiImageClient')

    expect(createOpenAIImageClient).toHaveBeenCalledTimes(1)
    expect(createGeminiClient).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      route: 'request provider',
      requestProvider: 'openai' as const,
      configuredDefault: undefined,
      expectedProvider: 'openai',
      expectedEnvironmentVariable: 'OPENAI_API_KEY',
    },
    {
      route: 'configured default provider',
      requestProvider: undefined,
      configuredDefault: 'seedream' as const,
      expectedProvider: 'seedream',
      expectedEnvironmentVariable: 'ARK_API_KEY',
    },
    {
      route: 'built-in default provider',
      requestProvider: undefined,
      configuredDefault: undefined,
      expectedProvider: 'gemini',
      expectedEnvironmentVariable: 'GEMINI_API_KEY',
    },
  ])(
    'should guide the caller to configure credentials for the $route',
    async ({
      requestProvider,
      configuredDefault,
      expectedProvider,
      expectedEnvironmentVariable,
    }) => {
      delete process.env.GEMINI_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.ARK_API_KEY
      if (configuredDefault) {
        process.env.IMAGE_PROVIDER = configuredDefault
      } else {
        delete process.env.IMAGE_PROVIDER
      }
      const mcpServer = createMCPServer()

      const result = await mcpServer.callTool('generate_image', {
        prompt: 'test prompt',
        ...(requestProvider && { provider: requestProvider }),
      })

      expect(result.isError).toBe(true)
      const responseData = JSON.parse(result.content[0].text)
      expect(responseData.error.code).toBe('CONFIG_ERROR')
      expect(responseData.error.message).toContain(`"${expectedProvider}"`)
      expect(responseData.error.suggestion).toContain(expectedEnvironmentVariable)
      expect(responseData.error.suggestion).toContain(
        `retry generate_image with provider "${expectedProvider}"`
      )

      if (expectedProvider === 'openai') {
        const { createOpenAIImageClient } = await import('../../api/openaiImageClient')
        expect(createOpenAIImageClient).not.toHaveBeenCalled()
      }
    }
  )

  it('should pass JPEG preference from fileName to the selected provider', async () => {
    process.env.IMAGE_PROVIDER = 'openai'
    delete process.env.GEMINI_API_KEY
    process.env.OPENAI_API_KEY = 'test-openai-api-key-unit-tests'
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'requested.JPEG',
    })

    expect(result.isError).toBe(false)
    const { createOpenAIImageClient } = await import('../../api/openaiImageClient')
    const imageClient = (createOpenAIImageClient as ReturnType<typeof vi.fn>).mock.results[0].value
      .data
    expect(imageClient.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ preferredOutputFormat: 'jpeg' })
    )
  })

  it.each([
    ['banner.v2', 'banner.v2.png'],
    ['my.photo', 'my.photo.png'],
    ['2026.07.29-banner', '2026.07.29-banner.png'],
    ['requested.webp', 'requested.png'],
  ])(
    'should use the provider default for a suffix that cannot select an output format: %s',
    async (fileName, expectedSavedName) => {
      const mcpServer = createMCPServer()

      const result = await mcpServer.callTool('generate_image', {
        prompt: 'test prompt',
        fileName,
      })

      expect(result.isError).toBe(false)
      const { createGeminiClient } = await import('../../api/geminiClient')
      const imageClient = (createGeminiClient as ReturnType<typeof vi.fn>).mock.results.at(-1)
        ?.value.data
      const imageParams = imageClient.generateImage.mock.calls[0][0]
      expect(imageParams).not.toHaveProperty('preferredOutputFormat')

      const savedPath = vi.mocked(saveImage).mock.calls[0][1]
      expect(savedPath.endsWith(expectedSavedName)).toBe(true)
    }
  )

  it('should omit the format hint when fileName has no extension', async () => {
    const mcpServer = createMCPServer()

    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'requested',
    })

    const { createGeminiClient } = await import('../../api/geminiClient')
    const imageClient = (createGeminiClient as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value
      .data
    expect(result.isError).toBe(false)
    expect(imageClient.generateImage.mock.calls[0][0]).not.toHaveProperty('preferredOutputFormat')
  })

  it('should preserve tool execution errors across the MCP transport boundary', async () => {
    process.env.IMAGE_PROVIDER = 'seedream'
    process.env.ARK_API_KEY = 'test-seedream-api-key'
    process.env.SKIP_PROMPT_ENHANCEMENT = 'true'
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMCPServer().initialize()
    const client = new Client({ name: 'mcp-image-test-client', version: '1.0.0' })

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const result = await client.callTool({
        name: 'generate_image',
        arguments: {
          prompt: 'test prompt',
          fileName: 'seedream-error.png',
          useGoogleSearch: true,
        },
      })

      expect(result.isError).toBe(true)
      expect(result.content).toHaveLength(1)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
