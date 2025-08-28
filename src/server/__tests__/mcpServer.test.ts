import { describe, expect, it } from 'vitest'
import { MCPServerImpl, createMCPServer } from '../mcpServer'

// Basic tests for MCP server startup and tool registration
describe('MCP Server', () => {
  it('should create MCP server instance', async () => {
    // Arrange & Act
    const mcpServer = createMCPServer()

    // Assert: Verify that server is created successfully
    expect(mcpServer).toBeInstanceOf(MCPServerImpl)
    expect(mcpServer).toBeDefined()

    // Verify that server info is set correctly
    const serverInfo = mcpServer.getServerInfo()
    expect(serverInfo.name).toBe('gemini-image-generator-mcp-server')
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
    expect(toolsList.tools[0].description).toContain('Generate image using Gemini API')
    expect(toolsList.tools[0].inputSchema).toBeDefined()

    // Verify basic schema structure
    const schema = toolsList.tools[0].inputSchema
    expect(schema.type).toBe('object')
    expect(schema.properties).toHaveProperty('prompt')
    expect(schema.properties?.prompt).toEqual({
      type: 'string',
      description: 'The prompt for image generation',
    })
    expect(schema.required).toContain('prompt')
  })

  it('should handle basic tool request', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: Execute basic tool request
    const result = await mcpServer.callTool('generate_image', {
      prompt: 'test prompt',
    })

    // Assert: Verify that basic tool request is processed
    expect(result).toBeDefined()
    expect(result.content).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    // Verify response is valid JSON
    const responseData = JSON.parse(result.content[0].text)
    expect(responseData).toHaveProperty('success')
    expect(typeof responseData.success).toBe('boolean')
    expect(responseData.success).toBe(true)
    expect(responseData).toHaveProperty('imagePath')
    expect(responseData).toHaveProperty('executionTime')
  })

  it('should handle invalid tool request', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act & Assert: Verify that error is thrown for invalid tool
    await expect(mcpServer.callTool('invalid_tool', {})).rejects.toThrow(
      'Unknown tool: invalid_tool'
    )
  })

  it('should validate prompt parameter', async () => {
    // Arrange
    const mcpServer = createMCPServer()

    // Act: Execute tool with empty prompt
    const result = await mcpServer.callTool('generate_image', {
      prompt: '',
    })

    // Assert: Verify that validation error is returned
    const responseData = JSON.parse(result.content[0].text)
    expect(responseData.success).toBe(false)
    expect(responseData.error).toContain('Invalid prompt')
  })
})
