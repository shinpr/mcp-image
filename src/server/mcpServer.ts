/**
 * MCP Server implementation
 * Basic structure of MCP server using @modelcontextprotocol/sdk
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { GenerateImageParams, GenerateImageResult, MCPServerConfig } from '../types/mcp'
import { InputValidationError } from '../utils/errors'
import { Logger } from '../utils/logger'
import { ErrorHandler } from './errorHandler'

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
  private logger: Logger

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger()
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
   * Tool execution with unified error handling
   */
  public async callTool(name: string, args: unknown) {
    try {
      this.logger.info('mcp-server', `Tool called: ${name}`, { toolName: name, args })

      if (name === 'generate_image') {
        return await this.handleGenerateImage(args as GenerateImageParams)
      }

      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      this.logger.error('mcp-server', 'Tool execution failed', error as Error, {
        toolName: name,
        args,
      })
      return ErrorHandler.handleError(error as Error)
    }
  }

  /**
   * Image generation tool handler with proper error handling
   */
  private async handleGenerateImage(params: GenerateImageParams) {
    // Use ErrorHandler.wrapWithResultType for safe execution
    const result = await ErrorHandler.wrapWithResultType(async () => {
      // Basic validation with proper error handling
      if (typeof params.prompt !== 'string') {
        throw new InputValidationError(
          'Invalid prompt: prompt must be a string',
          'Please provide a valid string prompt for image generation'
        )
      }

      if (params.prompt.trim().length === 0) {
        throw new InputValidationError(
          'Empty prompt provided',
          'Prompt must contain at least 1 character'
        )
      }

      this.logger.info('image-generation', 'Processing image generation request', {
        promptLength: params.prompt.length,
        outputPath: params.outputPath,
        inputImagePath: params.inputImagePath,
        outputFormat: params.outputFormat,
      })

      // Stub implementation - return success response
      const generationResult: GenerateImageResult = {
        success: true,
        imagePath: `${this.config.defaultOutputDir}/generated-image-${Date.now()}.png`,
        executionTime: 1000, // Fixed value (for testing)
      }

      this.logger.info('image-generation', 'Image generation completed successfully', {
        imagePath: generationResult.imagePath,
        executionTime: generationResult.executionTime,
      })

      return generationResult
    }, 'image-generation')

    // Handle the result
    if (result.ok) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.value),
          },
        ],
        isError: false,
      }
    }
    // Error is already logged by ErrorHandler.wrapWithResultType
    return ErrorHandler.handleError(result.error)
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
