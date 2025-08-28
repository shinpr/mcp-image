/**
 * MCP Server implementation
 * Basic structure of MCP server using @modelcontextprotocol/sdk
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { createGeminiClient } from '../api/geminiClient'
import { FileManager } from '../business/fileManager'
import { ImageGenerator } from '../business/imageGenerator'
import { validateGenerateImageParams } from '../business/inputValidator'
import { ResponseBuilder } from '../business/responseBuilder'
import type { GenerateImageParams, MCPServerConfig } from '../types/mcp'
import { getConfig } from '../utils/config'
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
      this.logger.info('image-generation', 'Processing image generation request', {
        promptLength: params.prompt?.length || 0,
        outputPath: params.outputPath,
        inputImagePath: params.inputImagePath,
        outputFormat: params.outputFormat,
      })

      // Step 1: Validate input parameters
      const validationResult = validateGenerateImageParams(params)
      if (!validationResult.success) {
        throw validationResult.error
      }

      // Step 2: Load configuration
      const configResult = getConfig()
      if (!configResult.success) {
        throw configResult.error
      }

      // Step 3: Initialize components
      const geminiClientResult = createGeminiClient(configResult.data)
      if (!geminiClientResult.success) {
        throw geminiClientResult.error
      }

      const imageGenerator = new ImageGenerator(geminiClientResult.data)
      const fileManager = new FileManager()
      const responseBuilder = new ResponseBuilder()

      // Step 4: Generate image
      const generationResult = await imageGenerator.generateImage({
        prompt: params.prompt,
      })
      if (!generationResult.success) {
        throw generationResult.error
      }

      // Step 5: Save image to file
      const outputPath =
        params.outputPath || `${this.config.defaultOutputDir}/${fileManager.generateFileName()}`

      const saveResult = await fileManager.saveImage(generationResult.data.imageData, outputPath)
      if (!saveResult.success) {
        throw saveResult.error
      }

      this.logger.info('image-generation', 'Image generation completed successfully', {
        imagePath: saveResult.data,
        processingTime: generationResult.data.metadata.processingTime,
      })

      // Step 6: Build structured response
      return responseBuilder.buildSuccessResponse(generationResult.data, saveResult.data)
    }, 'image-generation')

    // Handle the result
    if (result.ok) {
      return result.value
    }

    // Build error response using ResponseBuilder
    const responseBuilder = new ResponseBuilder()
    return responseBuilder.buildErrorResponse(result.error)
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
