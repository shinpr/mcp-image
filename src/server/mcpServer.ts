/**
 * MCP Server implementation
 * Basic structure of MCP server using @modelcontextprotocol/sdk
 */

// External libraries
import * as path from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'

// Types and interfaces
import type { GenerateImageParams, MCPServerConfig, McpContent } from '../types/mcp'
import type {
  MCPOrchestrationConfig,
  MCPOrchestrationResult,
  OrchestrationStatus,
} from '../types/mcpOrchestrationTypes'
import { DEFAULT_ORCHESTRATION_CONFIG } from '../types/mcpOrchestrationTypes'

import { type BestPracticesEngine, BestPracticesEngineImpl } from '../business/bestPracticesEngine'
// Business logic
import { type FileManager, createFileManager } from '../business/fileManager'
import { type ImageGenerator, createImageGenerator } from '../business/imageGenerator'
import { validateGenerateImageParams } from '../business/inputValidator'
import { type POMLTemplateEngine, POMLTemplateEngineImpl } from '../business/pomlTemplateEngine'
import {
  type OrchestrationOptions,
  type StructuredPromptOrchestrator,
  StructuredPromptOrchestratorImpl,
} from '../business/promptOrchestrator'
import { type ResponseBuilder, createResponseBuilder } from '../business/responseBuilder'

// API clients
import { type GeminiClient, createGeminiClient } from '../api/geminiClient'
import { type GeminiTextClient, createGeminiTextClient } from '../api/geminiTextClient'

// Handlers
import { StructuredPromptHandler } from './handlers/structuredPromptHandler'

// Utilities
import { getConfig } from '../utils/config'
import { Logger } from '../utils/logger'
import { SecurityManager } from '../utils/security'

// Same module
import { ErrorHandler } from './errorHandler'

/**
 * Default MCP server configuration
 */
const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'mcp-image-server',
  version: '0.1.0',
  defaultOutputDir: './output',
}

/**
 * Dependencies for MCPServerImpl
 */
export interface MCPServerDependencies {
  fileManager?: FileManager
  responseBuilder?: ResponseBuilder
  logger?: Logger
  securityManager?: SecurityManager
  createImageGenerator?: (geminiClient: GeminiClient) => ImageGenerator
  geminiTextClient?: GeminiTextClient
  bestPracticesEngine?: BestPracticesEngine
  pomlTemplateEngine?: POMLTemplateEngine
  structuredPromptOrchestrator?: StructuredPromptOrchestrator
  structuredPromptHandler?: StructuredPromptHandler
}

/**
 * MCP server with integrated orchestration
 * Provides AI-powered prompt optimization as standard feature
 */
export class MCPServerImpl {
  private config: MCPServerConfig
  private orchestrationConfig: MCPOrchestrationConfig
  private server: Server | null = null
  private logger: Logger
  private fileManager: FileManager
  private responseBuilder: ResponseBuilder
  private securityManager: SecurityManager
  private createImageGeneratorFn: (geminiClient: GeminiClient) => ImageGenerator
  private structuredPromptHandler: StructuredPromptHandler | null = null
  private geminiTextClient: GeminiTextClient | null = null
  private orchestrator: StructuredPromptOrchestrator | null = null

  constructor(config: Partial<MCPServerConfig> = {}, dependencies: MCPServerDependencies = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.orchestrationConfig = DEFAULT_ORCHESTRATION_CONFIG
    this.logger = dependencies.logger || new Logger()
    this.fileManager = dependencies.fileManager || createFileManager()
    this.responseBuilder = dependencies.responseBuilder || createResponseBuilder()
    this.securityManager = dependencies.securityManager || new SecurityManager()
    this.createImageGeneratorFn = dependencies.createImageGenerator || createImageGenerator

    // Initialize orchestration components if provided
    if (dependencies.structuredPromptHandler) {
      this.structuredPromptHandler = dependencies.structuredPromptHandler
    }
    if (dependencies.geminiTextClient) {
      this.geminiTextClient = dependencies.geminiTextClient
    }
    if (dependencies.structuredPromptOrchestrator) {
      this.orchestrator = dependencies.structuredPromptOrchestrator
    }
  }

  /**
   * Send progress notification to client
   */
  private async sendProgress(
    progressToken: string | number,
    progress: number,
    total?: number,
    message?: string
  ): Promise<void> {
    if (!this.server || !progressToken) return

    try {
      await this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress,
          ...(total !== undefined && { total }),
          ...(message && { message }),
        },
      })

      this.logger.debug('mcp-progress', 'Progress notification sent', {
        progressToken,
        progress,
        total,
        message,
      })
    } catch (error) {
      this.logger.warn('mcp-progress', 'Failed to send progress notification', {
        progressToken,
        error: (error as Error).message,
      })
    }
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
          description: 'Generate image with specified prompt and optional parameters',
          inputSchema: {
            type: 'object' as const,
            properties: {
              prompt: {
                type: 'string' as const,
                description: 'The prompt for image generation',
              },
              fileName: {
                type: 'string' as const,
                description:
                  'Optional file name for the generated image (if not specified, generates an auto-named file in IMAGE_OUTPUT_DIR)',
              },
              inputImagePath: {
                type: 'string' as const,
                description:
                  'Optional absolute path to input image for image editing (must be an absolute path)',
              },
              blendImages: {
                type: 'boolean' as const,
                description:
                  'Enable multi-image blending for combining multiple visual elements naturally. Use when prompt mentions multiple subjects or composite scenes',
              },
              maintainCharacterConsistency: {
                type: 'boolean' as const,
                description:
                  'Maintain character appearance consistency. Enable when generating same character in different poses/scenes',
              },
              useWorldKnowledge: {
                type: 'boolean' as const,
                description:
                  'Use real-world knowledge for accurate context. Enable for historical figures, landmarks, or factual scenarios',
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
  public async callTool(name: string, args: unknown, progressToken?: string | number) {
    try {
      if (name === 'generate_image') {
        return await this.handleGenerateImage(args as GenerateImageParams, progressToken)
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
   * Initialize orchestration components lazily
   */
  private async initializeOrchestrationComponents(): Promise<void> {
    if (this.orchestrator) return // Already initialized

    try {
      const configResult = getConfig()
      if (!configResult.success) {
        throw configResult.error
      }

      // Initialize Gemini Text Client if not provided
      if (!this.geminiTextClient) {
        const geminiTextClientResult = createGeminiTextClient(configResult.data)
        if (!geminiTextClientResult.success) {
          throw geminiTextClientResult.error
        }
        this.geminiTextClient = geminiTextClientResult.data
      }

      // Initialize Best Practices Engine
      const bestPracticesEngine = new BestPracticesEngineImpl()

      // Initialize POML Template Engine
      const pomlTemplateEngine = new POMLTemplateEngineImpl()

      // Initialize Orchestrator
      this.orchestrator = new StructuredPromptOrchestratorImpl(
        this.geminiTextClient,
        bestPracticesEngine,
        pomlTemplateEngine
      )

      // Initialize Structured Prompt Handler
      if (!this.structuredPromptHandler) {
        this.structuredPromptHandler = new StructuredPromptHandler(
          this.orchestrator,
          this.orchestrationConfig,
          { logger: this.logger }
        )
      }

      this.logger.info('mcp-orchestration', 'Orchestration components initialized')
    } catch (error) {
      this.logger.error(
        'mcp-orchestration',
        'Failed to initialize orchestration components',
        error as Error
      )
      throw error
    }
  }

  /**
   * Get orchestration status information
   */
  public getOrchestrationStatus(): OrchestrationStatus {
    if (!this.structuredPromptHandler) {
      return {
        enabled: true,
        mode: this.orchestrationConfig.orchestrationMode,
        statistics: {
          totalAttempts: 0,
          successfulAttempts: 0,
          failedAttempts: 0,
          averageProcessingTime: 0,
        },
      }
    }
    return this.structuredPromptHandler.getOrchestrationStatus()
  }

  /**
   * Image generation tool handler with integrated prompt optimization
   */
  private async handleGenerateImage(params: GenerateImageParams, progressToken?: string | number) {
    // Use ErrorHandler.wrapWithResultType for safe execution
    const result = await ErrorHandler.wrapWithResultType(async () => {
      // Send initial progress notification
      if (progressToken) {
        await this.sendProgress(progressToken, 0, 100, 'Starting prompt optimization...')
      }

      // Step 1: Validate input parameters
      const validationResult = validateGenerateImageParams(params)
      if (!validationResult.success) {
        throw validationResult.error
      }

      if (progressToken) {
        await this.sendProgress(progressToken, 10, 100, 'Input parameters validated')
      }

      // Step 2: Load configuration
      const configResult = getConfig()
      if (!configResult.success) {
        throw configResult.error
      }

      if (progressToken) {
        await this.sendProgress(progressToken, 15, 100, 'Configuration loaded')
      }

      // Step 3: Initialize orchestration components if needed
      await this.initializeOrchestrationComponents()

      if (progressToken) {
        await this.sendProgress(progressToken, 20, 100, 'Optimizing prompt with AI...')
      }

      // Step 4: Apply prompt optimization (always enabled)
      let optimizedPrompt = params.prompt
      let orchestrationResult: MCPOrchestrationResult['orchestrationResult'] | undefined
      let fallbackUsed = false

      if (this.structuredPromptHandler) {
        const orchestrationOptions: OrchestrationOptions = {
          bestPracticesMode: 'complete',
          enablePOML: true,
          // Map feature parameters to orchestration options
          ...(params.maintainCharacterConsistency !== undefined && {
            maintainCharacterConsistency: params.maintainCharacterConsistency,
          }),
          ...(params.blendImages !== undefined && {
            blendImages: params.blendImages,
          }),
          ...(params.useWorldKnowledge !== undefined && {
            useWorldKnowledge: params.useWorldKnowledge,
          }),
        }

        const startTime = Date.now()
        const orchestrationRes = await this.structuredPromptHandler.processStructuredPrompt(
          params.prompt,
          orchestrationOptions,
          this.server || undefined,
          progressToken
        )
        const orchestrationTime = Date.now() - startTime

        if (orchestrationRes.success) {
          optimizedPrompt = orchestrationRes.data.structuredPrompt
          orchestrationResult = orchestrationRes.data

          this.logger.info('mcp-orchestration', 'Prompt optimization successful', {
            originalLength: params.prompt.length,
            optimizedLength: optimizedPrompt.length,
            orchestrationTime,
          })
        } else {
          // Log warning but continue with original prompt (graceful fallback)
          fallbackUsed = true
          this.logger.warn('mcp-orchestration', 'Prompt optimization failed, using original', {
            error: orchestrationRes.error.message,
          })
        }
      }

      if (progressToken) {
        await this.sendProgress(progressToken, 50, 100, 'Initializing image generation client...')
      }

      // Step 5: Initialize Gemini client for image generation
      const geminiClientResult = createGeminiClient(configResult.data)
      if (!geminiClientResult.success) {
        throw geminiClientResult.error
      }

      if (progressToken) {
        await this.sendProgress(progressToken, 55, 100, 'Client initialized')
      }

      const imageGenerator = this.createImageGeneratorFn(geminiClientResult.data)
      const fileManager = this.fileManager
      const responseBuilder = this.responseBuilder

      if (progressToken) {
        await this.sendProgress(progressToken, 60, 100, 'Generating image with optimized prompt...')
      }

      // Step 4: Handle input image if provided
      let inputImageData: string | undefined
      let inputImageMimeType: string | undefined

      if (params.inputImagePath) {
        const fs = await import('node:fs/promises')
        const path = await import('node:path')

        // Read the image file
        const imageBuffer = await fs.readFile(params.inputImagePath)
        inputImageData = imageBuffer.toString('base64')

        // Determine MIME type from extension
        const ext = path.extname(params.inputImagePath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
        }
        inputImageMimeType = mimeTypes[ext] || 'image/jpeg'
      }

      // Step 5: Generate image with all parameters
      const generationResult = await imageGenerator.generateImage({
        prompt: params.prompt,
        ...(inputImageData !== undefined && { inputImage: inputImageData }),
        ...(inputImageMimeType !== undefined && { inputImageMimeType: inputImageMimeType }),
        ...(params.blendImages !== undefined && { blendImages: params.blendImages }),
        ...(params.maintainCharacterConsistency !== undefined && {
          maintainCharacterConsistency: params.maintainCharacterConsistency,
        }),
        ...(params.useWorldKnowledge !== undefined && {
          useWorldKnowledge: params.useWorldKnowledge,
        }),
      })
      if (!generationResult.success) {
        throw generationResult.error
      }

      if (progressToken) {
        await this.sendProgress(progressToken, 90, 100, 'Image generated, saving to file...')
      }

      // Step 8: Save image file to IMAGE_OUTPUT_DIR with specified or auto-generated name
      // Determine file path: use provided fileName or generate one, always in IMAGE_OUTPUT_DIR
      const finalFileName = params.fileName || fileManager.generateFileName()
      const rawOutputPath = path.join(configResult.data.imageOutputDir, finalFileName)

      // Security check: Sanitize output path
      const securityManager = this.securityManager
      const pathSanitizationResult = securityManager.sanitizeFilePath(rawOutputPath)
      if (!pathSanitizationResult.success) {
        throw pathSanitizationResult.error
      }
      const outputPath = pathSanitizationResult.data

      // Always save to file (no more base64 responses)
      const saveResult = await fileManager.saveImage(generationResult.data.imageData, outputPath)
      if (!saveResult.success) {
        throw saveResult.error
      }
      const savedFilePath = saveResult.data

      if (progressToken) {
        await this.sendProgress(progressToken, 95, 100, 'Image saved to file')
      }

      // Step 9: Build structured response with orchestration metadata
      const response = responseBuilder.buildSuccessResponse(generationResult.data, savedFilePath)

      // Add orchestration metadata to response using structuredContent
      const enhancedResponse = {
        ...response,
        structuredContent: {
          ...((response.structuredContent as Record<string, unknown>) || {}),
          metadata: {
            fallbackUsed,
            promptOptimized: !!orchestrationResult,
            ...(orchestrationResult && {
              originalPrompt: params.prompt,
              optimizedPrompt: optimizedPrompt,
              orchestrationDetails: orchestrationResult,
            }),
          },
        },
      }

      if (progressToken) {
        await this.sendProgress(progressToken, 100, 100, 'Image generation completed')
      }

      return enhancedResponse
    }, 'image-generation')

    // Handle the result
    if (result.ok) {
      return result.value
    }

    // Build error response using ResponseBuilder
    const responseBuilder = this.responseBuilder
    const errorResponse = responseBuilder.buildErrorResponse(result.error)

    // Add fallback information even for errors if orchestration was attempted
    if (this.structuredPromptHandler) {
      return {
        ...errorResponse,
        structuredContent: {
          ...((errorResponse.structuredContent as Record<string, unknown>) || {}),
          metadata: {
            fallbackUsed: true,
            promptOptimized: false,
            errorOccurred: true,
          },
        },
      }
    }

    return errorResponse
  }

  /**
   * Enable or configure structured prompt generation
   */
  async enableStructuredPromptGeneration(options?: {
    fallbackBehavior?: 'graceful' | 'retry' | 'fail'
    orchestrationMode?: 'full' | 'essential' | 'minimal'
    progressNotifications?: boolean
  }): Promise<void> {
    if (options) {
      if (options.fallbackBehavior) {
        this.orchestrationConfig = {
          ...this.orchestrationConfig,
          fallbackBehavior: options.fallbackBehavior,
        }
      }
      if (options.orchestrationMode) {
        this.orchestrationConfig = {
          ...this.orchestrationConfig,
          orchestrationMode: options.orchestrationMode,
        }
      }
      if (options.progressNotifications !== undefined) {
        this.orchestrationConfig = {
          ...this.orchestrationConfig,
          progressNotifications: options.progressNotifications,
        }
      }
    }

    // Initialize orchestration components if not already done
    await this.initializeOrchestrationComponents()
  }

  /**
   * Initialize MCP server with tool handlers
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

    // Setup tool handlers
    this.setupHandlers()

    return this.server
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    if (!this.server) {
      throw new Error('Server not initialized')
    }

    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
      return this.getToolsList()
    })

    // Register tool call handler
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<CallToolResult> => {
        const { name, arguments: args } = request.params
        const progressToken = request.params._meta?.progressToken
        const result = await this.callTool(name, args, progressToken)
        // Extract content array from McpToolResponse and preserve structuredContent
        const response: { content: McpContent[]; structuredContent?: { [x: string]: unknown } } = {
          content: result.content,
        }
        if (result.structuredContent) {
          response.structuredContent = result.structuredContent as { [x: string]: unknown }
        }
        return response
      }
    )
  }
}

/**
 * Factory function (for backward compatibility)
 */
export function createMCPServer(
  config: Partial<MCPServerConfig> = {},
  dependencies: MCPServerDependencies = {}
) {
  const mcpServer = new MCPServerImpl(config, dependencies)
  return mcpServer
}
