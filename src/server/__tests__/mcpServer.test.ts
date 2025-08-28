import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPServerImpl, createMCPServer } from '../mcpServer'

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
              model: 'gemini-2.5-flash-image-preview',
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

// Mock the FileManager for unit tests
vi.mock('../../business/fileManager', () => {
  return {
    FileManager: vi.fn().mockImplementation(() => {
      return {
        saveImage: vi.fn().mockResolvedValue({
          success: true,
          data: './test-output/test-image.png',
        }),
        ensureDirectoryExists: vi.fn().mockReturnValue({
          success: true,
          data: undefined,
        }),
        generateFileName: vi.fn().mockReturnValue('test-image.png'),
      }
    }),
  }
})

// Basic tests for MCP server startup and tool registration
describe('MCP Server', () => {
  let originalApiKey: string | undefined

  beforeEach(() => {
    // Set up environment for testing
    originalApiKey = process.env.GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'test-api-key-unit-tests'
    process.env.IMAGE_OUTPUT_DIR = './test-output'
  })

  // Restore environment after tests
  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey
    } else {
      process.env.GEMINI_API_KEY = undefined
    }
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
      description: 'The prompt for image generation',
    })
    expect(schema.properties).toHaveProperty('fileName')
    expect(schema.properties?.fileName).toEqual({
      type: 'string',
      description:
        'Optional file name for the generated image (if not specified, generates an auto-named file in IMAGE_OUTPUT_DIR)',
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
    expect(responseData.metadata.model).toBe('gemini-2.5-flash-image-preview')
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
    expect(responseData.metadata.model).toBe('gemini-2.5-flash-image-preview')
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
})
