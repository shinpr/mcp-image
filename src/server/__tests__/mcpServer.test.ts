import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMCPServer, MCPServerImpl } from '../mcpServer'

// Mock the Gemini client for unit tests
vi.mock('../../api/geminiClient', () => {
  return {
    createGeminiClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            imageData: Buffer.from('mock-image-data', 'utf-8'),
            metadata: {
              model: 'gemini-3.1-flash-image-preview',
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

// Mock the OpenAI image client for provider routing tests
vi.mock('../../api/openaiImageClient', () => {
  return {
    createOpenAIImageClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            imageData: Buffer.from('mock-openai-image-data', 'utf-8'),
            metadata: {
              model: 'gpt-image-2',
              provider: 'openai',
              prompt: 'test prompt',
              mimeType: 'image/png',
              timestamp: new Date(),
              inputImageProvided: false,
            },
          },
        }),
      }
      return { success: true, data: mockClient }
    }),
  }
})

// Mock the OpenAI text client for provider routing tests
vi.mock('../../api/openaiTextClient', () => {
  return {
    createOpenAITextClient: vi.fn().mockImplementation(() => {
      const mockClient = {
        generateText: vi.fn().mockResolvedValue({
          success: true,
          data: 'Enhanced OpenAI prompt with professional lighting and composition',
        }),
        validateConnection: vi.fn().mockResolvedValue({
          success: true,
          data: true,
        }),
      }
      return { success: true, data: mockClient }
    }),
  }
})

// Mock the FileManager for unit tests
vi.mock('../../business/fileManager', () => {
  return {
    createFileManager: vi.fn().mockImplementation(() => {
      return {
        saveImage: vi.fn().mockResolvedValue({
          success: true,
          data: './test-output/test-image.png',
        }),
        ensureDirectoryExists: vi.fn().mockReturnValue({
          success: true,
          data: undefined,
        }),
        generateFileName: vi.fn().mockImplementation((mimeType?: string) => {
          if (mimeType === 'image/jpeg') return 'test-image.jpg'
          if (mimeType === 'image/webp') return 'test-image.webp'
          return 'test-image.png'
        }),
      }
    }),
  }
})

// Mock the ImageGenerator for unit tests
vi.mock('../../business/imageGenerator', () => {
  return {
    createImageGenerator: vi.fn().mockImplementation(() => {
      return {
        generateImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            imageData: Buffer.from('mock-image-data', 'utf-8'),
            metadata: {
              model: 'gemini-3.1-flash-image-preview',
              prompt: 'test prompt',
              mimeType: 'image/png',
              timestamp: new Date(),
              inputImageProvided: false,
              processingTime: 1500,
            },
          },
        }),
      }
    }),
  }
})

// Mock the ResponseBuilder for unit tests
vi.mock('../../business/responseBuilder', () => {
  return {
    createResponseBuilder: vi.fn().mockImplementation(() => {
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
                  model: 'gemini-3.1-flash-image-preview',
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
        buildErrorResponse: vi.fn().mockImplementation((error) => {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: {
                    code: error.code || 'INPUT_VALIDATION_ERROR',
                    message:
                      error.message ||
                      'Prompt must be between 1 and 4000 characters. Current length: 0',
                    suggestion:
                      error.suggestion ||
                      'Please provide a descriptive prompt for image generation.',
                  },
                }),
              },
            ],
            isError: true,
          }
        }),
      }
    }),
  }
})

// Mock the InputValidator for unit tests
vi.mock('../../business/inputValidator', async () => {
  const originalModule = await vi.importActual('../../business/inputValidator')
  const { Err, Ok } = await vi.importActual('../../types/result')
  const { InputValidationError } = await vi.importActual('../../utils/errors')

  return {
    ...originalModule,
    validateGenerateImageParams: vi.fn().mockImplementation((args) => {
      if (!args.prompt || args.prompt === '') {
        return Err(
          new InputValidationError(
            'Prompt must be between 1 and 4000 characters. Current length: 0',
            'Please provide a descriptive prompt for image generation.'
          )
        )
      }
      return Ok({
        prompt: args.prompt,
        fileName: args.fileName,
        inputImagePath: args.inputImagePath,
        blendImages: args.blendImages,
        maintainCharacterConsistency: args.maintainCharacterConsistency,
        useWorldKnowledge: args.useWorldKnowledge,
      })
    }),
  }
})

// Basic tests for MCP server startup and tool registration
describe('MCP Server', () => {
  let originalApiKey: string | undefined
  let originalImageProvider: string | undefined
  let originalOpenAIApiKey: string | undefined
  let originalOpenAIImageModel: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up environment for testing
    originalApiKey = process.env.GEMINI_API_KEY
    originalImageProvider = process.env.IMAGE_PROVIDER
    originalOpenAIApiKey = process.env.OPENAI_API_KEY
    originalOpenAIImageModel = process.env.OPENAI_IMAGE_MODEL
    process.env.IMAGE_PROVIDER = undefined
    process.env.GEMINI_API_KEY = 'test-api-key-unit-tests'
    process.env.OPENAI_API_KEY = undefined
    process.env.OPENAI_IMAGE_MODEL = undefined
    process.env.IMAGE_OUTPUT_DIR = './test-output'
  })

  // Restore environment after tests
  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey
    } else {
      process.env.GEMINI_API_KEY = undefined
    }
    process.env.IMAGE_PROVIDER = originalImageProvider
    process.env.OPENAI_API_KEY = originalOpenAIApiKey
    process.env.OPENAI_IMAGE_MODEL = originalOpenAIImageModel
  })
  it('should create MCP server instance', async () => {
    // Arrange & Act
    const mcpServer = createMCPServer()

    // Assert: Verify that server is created successfully
    expect(mcpServer).toBeInstanceOf(MCPServerImpl)
    expect(mcpServer).toBeDefined()

    // Verify that server info is set correctly
    const serverInfo = mcpServer.getServerInfo()
    expect(serverInfo.name).toBe('mcp-image-server')
    expect(serverInfo.version).toBe('0.1.0')
  })

  it('should register generate_image tool', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: Get tool list
    const toolsList = mcpServer.getToolsList()

    // Assert: Verify that generate_image tool is registered
    expect(toolsList.tools).toHaveLength(1)
    expect(toolsList.tools[0].name).toBe('generate_image')
    expect(toolsList.tools[0].description).toContain('Generate image with specified prompt')
    expect(toolsList.tools[0].inputSchema).toBeDefined()

    // Verify basic schema structure
    const schema = toolsList.tools[0].inputSchema
    expect(schema.type).toBe('object')
    expect(schema.properties).toHaveProperty('prompt')
    expect(schema.properties?.prompt).toEqual({
      type: 'string',
      description:
        'The prompt for image generation (English recommended for optimal structured prompt enhancement)',
    })
    expect(schema.properties).toHaveProperty('fileName')
    expect(schema.properties?.fileName).toEqual({
      type: 'string',
      description: 'Custom file name for the output image. Auto-generated if not specified.',
    })
    expect(schema.required).toContain('prompt')
  })

  it('should return file URI when no fileName is specified', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: Execute basic tool request without fileName
    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    // Assert: Verify that file URI is returned in structured format
    expect(result).toBeDefined()
    expect(result.content).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    // Should be structured JSON response
    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('type', 'resource')
    expect(responseData).toHaveProperty('resource')
    expect(responseData.resource.uri).toMatch(/^file:\/\//)
    expect(responseData.resource.name).toBe('test-image.png')
    expect(responseData.resource.mimeType).toBe('image/png')
    expect(responseData).toHaveProperty('metadata')
    expect(responseData.metadata.model).toBe('gemini-3.1-flash-image-preview')
  })

  it('should save to file when fileName is specified', async () => {
    // Arrange
    const mcpServer = createMCPServer()
    const testFileName = 'test-image.png'

    // Act: Execute tool request with fileName
    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: testFileName,
    })

    // Assert: Verify that file URI is returned
    expect(result).toBeDefined()
    expect(result.content).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    // Verify response structure (should be JSON with file URI)
    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('type', 'resource')
    expect(responseData).toHaveProperty('resource')
    expect(responseData.resource.uri).toBe('file://./test-output/test-image.png')
    expect(responseData.resource.name).toBe('test-image.png')
    expect(responseData.resource.mimeType).toBe('image/png')
    expect(responseData).toHaveProperty('metadata')
    expect(responseData.metadata.model).toBe('gemini-3.1-flash-image-preview')
  })

  it('should handle invalid tool request', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: Execute request with invalid tool name
    const result = await mcpServer.callTool('invalid_tool', {})

    // Assert: Verify that structured error is returned
    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    // Verify error structure
    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('error')
    expect(responseData.error.code).toBe('INTERNAL_ERROR')
    expect(responseData.error.message).toContain('Unknown tool: invalid_tool')
    expect(responseData.error.suggestion).toBe('Contact system administrator')
  })

  it('should pass mimeType to generateFileName for auto-generated filenames', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    // Assert: generateFileName should be called with the mimeType from API metadata
    const { createFileManager } = await import('../../business/fileManager')
    const fileManagerInstance = (createFileManager as ReturnType<typeof vi.fn>).mock.results[0]
      .value
    expect(fileManagerInstance.generateFileName).toHaveBeenCalledWith('image/png')
  })

  it('should append extension to user-provided filename without extension via ensureExtension', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'my-photo',
    })

    // Assert: saveImage should be called with a path ending in .png (ensureExtension adds it)
    const { createFileManager } = await import('../../business/fileManager')
    const fileManagerInstance = (createFileManager as ReturnType<typeof vi.fn>).mock.results[0]
      .value
    const saveImageCall = fileManagerInstance.saveImage.mock.calls[0]
    const savedPath = saveImageCall[1] as string
    expect(savedPath).toMatch(/my-photo\.png$/)
  })

  it('should preserve user-provided filename with existing extension', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: 'my-photo.jpg',
    })

    // Assert: saveImage should be called with path preserving the .jpg extension
    const { createFileManager } = await import('../../business/fileManager')
    const fileManagerInstance = (createFileManager as ReturnType<typeof vi.fn>).mock.results[0]
      .value
    const saveImageCall = fileManagerInstance.saveImage.mock.calls[0]
    const savedPath = saveImageCall[1] as string
    expect(savedPath).toMatch(/my-photo\.jpg$/)
  })

  it('should sanitize filename before applying ensureExtension', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: filename with control chars and no extension
    await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
      fileName: '...my-photo\x00',
    })

    // Assert: sanitizeFilename runs first (strips leading dots, null bytes),
    // then ensureExtension adds .png
    const { createFileManager } = await import('../../business/fileManager')
    const fileManagerInstance = (createFileManager as ReturnType<typeof vi.fn>).mock.results[0]
      .value
    const saveImageCall = fileManagerInstance.saveImage.mock.calls[0]
    const savedPath = saveImageCall[1] as string
    // After sanitize: 'my-photo', after ensureExtension: 'my-photo.png'
    expect(savedPath).toMatch(/my-photo\.png$/)
  })

  it('should validate prompt parameter', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: Execute tool with empty prompt
    const result = await mcpServer.callTool('generate_image', {
      prompt: '',
    })

    // Assert: Verify that structured validation error is returned
    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    // Verify error structure
    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('error')
    expect(responseData.error.code).toBe('INPUT_VALIDATION_ERROR')
    expect(responseData.error.message).toContain('1 and 4000 characters')
    expect(responseData.error.suggestion).toContain('descriptive prompt')
  })

  it('should route image generation through OpenAI provider when configured', async () => {
    // Arrange
    process.env.IMAGE_PROVIDER = 'openai'
    process.env.GEMINI_API_KEY = undefined
    process.env.OPENAI_API_KEY = 'test-openai-api-key-unit-tests'
    process.env.OPENAI_IMAGE_MODEL = 'gpt-image-2'
    const mcpServer = createMCPServer()

    // Act
    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    // Assert
    expect(result).toBeDefined()
    expect(result.isError).toBe(false)

    const { createGeminiClient } = await import('../../api/geminiClient')
    const { createOpenAIImageClient } = await import('../../api/openaiImageClient')
    const { createOpenAITextClient } = await import('../../api/openaiTextClient')

    expect(createGeminiClient).not.toHaveBeenCalled()
    expect(createOpenAIImageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        imageProvider: 'openai',
        openaiApiKey: 'test-openai-api-key-unit-tests',
        openaiImageModel: 'gpt-image-2',
      })
    )
    expect(createOpenAITextClient).toHaveBeenCalled()
  })
})

// Test suite for aspectRatio parameter in generate_image tool schema
describe('MCPServer tool schema - aspectRatio', () => {
  it('should include aspectRatio in generate_image schema', () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    const toolsList = mcpServer.getToolsList()
    const generateImageTool = toolsList.tools.find((t) => t.name === 'generate_image')

    // Assert
    expect(generateImageTool).toBeDefined()
    expect(generateImageTool?.inputSchema.properties).toHaveProperty('aspectRatio')
    expect(generateImageTool?.inputSchema.properties?.aspectRatio.type).toBe('string')
  })

  it('should define enum with 14 supported aspect ratios in schema', () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    const toolsList = mcpServer.getToolsList()
    const generateImageTool = toolsList.tools.find((t) => t.name === 'generate_image')
    const aspectRatioEnum = generateImageTool?.inputSchema.properties?.aspectRatio.enum

    // Assert
    expect(aspectRatioEnum).toHaveLength(14)
    expect(aspectRatioEnum).toContain('1:1')
    expect(aspectRatioEnum).toContain('16:9')
    expect(aspectRatioEnum).toContain('21:9')
    expect(aspectRatioEnum).toContain('1:4')
    expect(aspectRatioEnum).toContain('1:8')
    expect(aspectRatioEnum).toContain('4:1')
    expect(aspectRatioEnum).toContain('8:1')
  })

  it('should mark aspectRatio as optional in schema', () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    const toolsList = mcpServer.getToolsList()
    const generateImageTool = toolsList.tools.find((t) => t.name === 'generate_image')

    // Assert
    expect(generateImageTool?.inputSchema.required).toContain('prompt')
    expect(generateImageTool?.inputSchema.required).not.toContain('aspectRatio')
  })
})

// Test suite for quality parameter in generate_image tool schema
describe('MCPServer tool schema - quality', () => {
  it('should include quality parameter in generate_image schema', () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    const toolsList = mcpServer.getToolsList()
    const generateImageTool = toolsList.tools.find((t) => t.name === 'generate_image')

    // Assert
    expect(generateImageTool?.inputSchema.properties).toHaveProperty('quality')
    expect(generateImageTool?.inputSchema.properties?.quality.type).toBe('string')
    expect(generateImageTool?.inputSchema.properties?.quality.enum).toEqual([
      'fast',
      'balanced',
      'quality',
    ])
  })

  it('should mark quality as optional in schema', () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    const toolsList = mcpServer.getToolsList()
    const generateImageTool = toolsList.tools.find((t) => t.name === 'generate_image')

    // Assert
    expect(generateImageTool?.inputSchema.required).toContain('prompt')
    expect(generateImageTool?.inputSchema.required).not.toContain('quality')
  })
})

// Test suite for imageSize parameter in generate_image tool schema
describe('MCPServer tool schema - imageSize', () => {
  it('should define enum with 4 image sizes in schema', () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act
    const toolsList = mcpServer.getToolsList()
    const generateImageTool = toolsList.tools.find((t) => t.name === 'generate_image')
    const imageSizeEnum = generateImageTool?.inputSchema.properties?.imageSize.enum

    // Assert
    expect(imageSizeEnum).toHaveLength(3)
    expect(imageSizeEnum).toContain('1K')
    expect(imageSizeEnum).toContain('2K')
    expect(imageSizeEnum).toContain('4K')
  })
})
