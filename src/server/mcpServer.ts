/**
 * MCP Server implementation
 * Basic structure of MCP server using @modelcontextprotocol/sdk
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { GenerateImageParams, GenerateImageResult, MCPServerConfig } from '../types/mcp'

/**
 * Default MCP server configuration
 */
const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'gemini-image-generator-mcp-server',
  version: '0.1.0',
  defaultOutputDir: './output',
}

/**
 * Basic MCP server structure
 * Simple implementation focusing on testability
 */
export class MCPServerImpl {
  private config: MCPServerConfig
  private server: Server | null = null

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get server instance (for testing)
   */
  public getServerInstance(): Server | null {
    return this.server
  }

  /**
   * Get server information
   */
  public getServerInfo() {
    return {
      name: this.config.name,
      version: this.config.version,
    }
  }

  /**
   * Get list of registered tools
   */
  public getToolsList() {
    return {
      tools: [
        {
          name: 'generate_image',
          description:
            'Generate image using Gemini API with specified prompt and optional parameters',
          inputSchema: {
            type: 'object' as const,
            properties: {
              prompt: {
                type: 'string' as const,
                description: 'The prompt for image generation',
              },
              outputPath: {
                type: 'string' as const,
                description: 'Optional output path for the generated image',
              },
              inputImagePath: {
                type: 'string' as const,
                description: 'Optional input image path for image editing',
              },
              outputFormat: {
                type: 'string' as const,
                enum: ['PNG', 'JPEG', 'WebP'],
                description: 'Output image format',
              },
            },
            required: ['prompt'],
          },
        },
      ],
    }
  }

  /**
   * Tool execution (stub implementation)
   */
  public async callTool(name: string, args: unknown) {
    if (name === 'generate_image') {
      return await this.handleGenerateImage(args as GenerateImageParams)
    }

    throw new Error(`Unknown tool: ${name}`)
  }

  /**
   * Image generation tool handler (stub implementation)
   */
  private async handleGenerateImage(params: GenerateImageParams) {
    // Basic validation
    if (!params.prompt || typeof params.prompt !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Invalid prompt: prompt must be a non-empty string',
            }),
          },
        ],
      }
    }

    // Stub implementation - return success response
    const result: GenerateImageResult = {
      success: true,
      imagePath: `${this.config.defaultOutputDir}/generated-image-${Date.now()}.png`,
      executionTime: 1000, // Fixed value (for testing)
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    }
  }

  /**
   * Initialize MCP server (for future implementation)
   */
  public initialize(): Server {
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    return this.server
  }
}

/**
 * Factory function (for backward compatibility)
 */
export function createMCPServer(config: Partial<MCPServerConfig> = {}) {
  const mcpServer = new MCPServerImpl(config)
  return mcpServer
}
