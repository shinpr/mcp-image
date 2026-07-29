/**
 * MCP Server implementation
 * Simplified architecture with direct Gemini integration
 */

import { constants as fsConstants } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { ImageApiParams, ImageClient } from '../api/imageClient.js'
import type { TextClient } from '../api/textClient.js'
// Business logic
import { createFileManager, type FileManager } from '../business/fileManager.js'
import { MAX_IMAGE_SIZE, validateGenerateImageParams } from '../business/inputValidator.js'
import { createResponseBuilder, type ResponseBuilder } from '../business/responseBuilder.js'
import {
  createStructuredPromptGenerator,
  type FeatureFlags,
  type StructuredPromptGenerator,
} from '../business/structuredPromptGenerator.js'
// Types
import type { GenerateImageParams, MCPServerConfig } from '../types/mcp.js'

// Utilities
import { type Config, getConfig } from '../utils/config.js'
import { InputValidationError } from '../utils/errors.js'
import { Logger } from '../utils/logger.js'
import { ensureExtension, getMimeTypeFromExtension } from '../utils/mimeUtils.js'
import { SecurityManager } from '../utils/security.js'
import { ErrorHandler } from './errorHandler.js'
import {
  getImageProviderDefinition,
  type ImageProviderDefinition,
} from './imageProviderRegistry.js'

/**
 * Default MCP server configuration
 */
const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'mcp-image-server',
  version: '0.1.0',
  defaultOutputDir: './output',
}

const INPUT_IMAGE_OPEN_FLAGS =
  fsConstants.O_RDONLY |
  (typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0) |
  (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)

function createInputImageSizeError(actualSize: number): InputValidationError {
  const sizeInMB = (actualSize / (1024 * 1024)).toFixed(1)
  const limitInMB = (MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(1)
  return new InputValidationError(
    `Image size exceeds ${limitInMB}MB limit. Current size: ${sizeInMB}MB`,
    `Please compress your image or reduce its resolution to stay below ${limitInMB}MB`
  )
}

async function readInputImageWithinLimit(filePath: string): Promise<Buffer> {
  const fileHandle = await fs.open(filePath, INPUT_IMAGE_OPEN_FLAGS)

  try {
    const stats = await fileHandle.stat()
    if (!stats.isFile()) {
      throw new InputValidationError(
        'Input image must be a regular file',
        'Please provide a path to a regular PNG, JPEG, or WebP image file'
      )
    }
    if (stats.size > MAX_IMAGE_SIZE) {
      throw createInputImageSizeError(stats.size)
    }

    const boundedBuffer = Buffer.alloc(MAX_IMAGE_SIZE + 1)
    let observedBytes = 0

    while (observedBytes < boundedBuffer.length) {
      const readLength = Math.min(64 * 1024, boundedBuffer.length - observedBytes)
      const { bytesRead } = await fileHandle.read(boundedBuffer, observedBytes, readLength, null)
      if (bytesRead === 0) {
        break
      }

      observedBytes += bytesRead
      if (observedBytes > MAX_IMAGE_SIZE) {
        throw createInputImageSizeError(observedBytes)
      }
    }

    return boundedBuffer.subarray(0, observedBytes)
  } finally {
    await fileHandle.close()
  }
}

/**
 * Simplified MCP server
 */
export class MCPServerImpl {
  private config: MCPServerConfig
  private server: Server | null = null
  private logger: Logger
  private fileManager: FileManager
  private responseBuilder: ResponseBuilder
  private securityManager: SecurityManager
  private structuredPromptGenerator: StructuredPromptGenerator | null = null
  private textClient: TextClient | null = null
  private imageClient: ImageClient | null = null

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger()
    this.fileManager = createFileManager()
    this.responseBuilder = createResponseBuilder()
    this.securityManager = new SecurityManager()
  }

  /**
   * Get server info
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
                description:
                  'The prompt for image generation (English recommended for optimal structured prompt enhancement)',
              },
              fileName: {
                type: 'string' as const,
                description:
                  'Custom file name for the output image. Auto-generated if not specified.',
              },
              inputImagePath: {
                type: 'string' as const,
                description:
                  'Optional absolute path to source image for image-to-image generation. Use when generating variations, style transfers, or similar images based on an existing image (must be an absolute path)',
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
              useGoogleSearch: {
                type: 'boolean' as const,
                description:
                  "Enable Google Search grounding to access real-time web information for factually accurate image generation. Use when prompt requires current or time-sensitive data that may have changed since the model's knowledge cutoff. Leave disabled for creative, fictional, historical, or timeless content.",
              },
              aspectRatio: {
                type: 'string' as const,
                description: 'Aspect ratio for the generated image',
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
              imageSize: {
                type: 'string' as const,
                description:
                  'Image resolution for high-quality output. Specify "1K", "2K", or "4K" when you need specific resolution. Leave unspecified for standard quality.',
                enum: ['1K', '2K', '4K'],
              },
              purpose: {
                type: 'string' as const,
                description:
                  'Intended use for the image (e.g., cookbook cover, social media post, presentation slide). Influences lighting, composition, and detail level to match the context.',
              },
              quality: {
                type: 'string' as const,
                description:
                  'Quality preset controlling speed/fidelity tradeoff. Only specify when the user explicitly requests a specific quality level; omit to use the server\'s configured default. "fast": best for drafts and rapid iteration. "balanced": better detail and coherence, moderate latency. "quality": highest fidelity, use for final deliverables where quality matters most.',
                enum: ['fast', 'balanced', 'quality'],
              },
            },
            required: ['prompt'],
          },
        },
      ],
    }
  }

  /**
   * Tool execution
   */
  public async callTool(name: string, args: unknown) {
    try {
      if (name === 'generate_image') {
        return await this.handleGenerateImage(args as GenerateImageParams)
      }
      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      this.logger.error('mcp-server', 'Tool execution failed', error as Error)
      return ErrorHandler.handleError(error as Error)
    }
  }

  /**
   * Initialize provider clients lazily.
   */
  private async initializeClients(
    config: Config,
    provider: ImageProviderDefinition
  ): Promise<void> {
    if (this.imageClient && (config.skipPromptEnhancement || this.structuredPromptGenerator)) {
      return
    }

    // Initialize Text Client for prompt generation when enhancement is enabled.
    if (!config.skipPromptEnhancement && !this.textClient) {
      this.textClient = provider.createTextClient(config)
    }

    // Initialize Structured Prompt Generator
    if (!config.skipPromptEnhancement && this.textClient && !this.structuredPromptGenerator) {
      this.structuredPromptGenerator = createStructuredPromptGenerator(
        this.textClient,
        provider.promptGeneration.maxTokens
      )
    }

    // Initialize image generation client.
    if (!this.imageClient) {
      this.imageClient = provider.createImageClient(config)
    }

    this.logger.info('mcp-server', 'Image provider clients initialized', {
      provider: config.imageProvider,
      promptEnhancement: !config.skipPromptEnhancement,
    })
  }

  /**
   * Simplified image generation handler
   */
  private async handleGenerateImage(params: GenerateImageParams) {
    const result = await ErrorHandler.wrapWithResultType(async () => {
      // Validate input
      const validationResult = validateGenerateImageParams(params)
      if (!validationResult.success) {
        throw validationResult.error
      }

      // Get configuration
      const configResult = getConfig()
      if (!configResult.success) {
        throw configResult.error
      }
      const config = configResult.data
      const provider = getImageProviderDefinition(config.imageProvider)

      // Initialize clients
      await this.initializeClients(config, provider)

      // Handle input image if provided
      let inputImageData: string | undefined
      let inputImageMimeType: string | undefined
      if (params.inputImagePath) {
        const sanitizedInputPath = this.securityManager.sanitizeInputFilePath(params.inputImagePath)
        if (!sanitizedInputPath.success) {
          throw sanitizedInputPath.error
        }
        const extensionCheck = this.securityManager.validateImageFile(sanitizedInputPath.data)
        if (!extensionCheck.success) {
          throw extensionCheck.error
        }
        const imageBuffer = await readInputImageWithinLimit(sanitizedInputPath.data)
        inputImageData = imageBuffer.toString('base64')
        inputImageMimeType = getMimeTypeFromExtension(path.extname(sanitizedInputPath.data))
      }

      const imageOptions = {
        ...(inputImageData && { inputImage: inputImageData }),
        ...(inputImageMimeType && { inputImageMimeType }),
        ...(params.aspectRatio && { aspectRatio: params.aspectRatio }),
        ...(params.imageSize && { imageSize: params.imageSize }),
        ...(params.useGoogleSearch !== undefined && {
          useGoogleSearch: params.useGoogleSearch,
        }),
        ...(params.quality !== undefined && { quality: params.quality }),
      } satisfies Omit<ImageApiParams, 'prompt'>

      provider.validateImageOptions?.(imageOptions, config)

      // Generate structured prompt (unless skipped)
      let structuredPrompt = params.prompt
      if (!config.skipPromptEnhancement && this.structuredPromptGenerator) {
        const features: FeatureFlags = {}
        if (params.maintainCharacterConsistency !== undefined) {
          features.maintainCharacterConsistency = params.maintainCharacterConsistency
        }
        if (params.blendImages !== undefined) {
          features.blendImages = params.blendImages
        }
        if (params.useWorldKnowledge !== undefined) {
          features.useWorldKnowledge = params.useWorldKnowledge
        }
        if (params.useGoogleSearch !== undefined) {
          features.useGoogleSearch = params.useGoogleSearch
        }

        const promptResult = await this.structuredPromptGenerator.generateStructuredPrompt(
          params.prompt,
          features,
          inputImageData,
          params.purpose,
          inputImageMimeType
        )

        if (promptResult.success) {
          structuredPrompt = promptResult.data.structuredPrompt

          this.logger.info('mcp-server', 'Structured prompt generated', {
            originalLength: params.prompt.length,
            structuredLength: structuredPrompt.length,
            selectedPractices: promptResult.data.selectedPractices,
          })
        } else {
          this.logger.warn('mcp-server', 'Using original prompt', {
            error: promptResult.error.message,
          })
        }
      } else if (config.skipPromptEnhancement) {
        this.logger.info('mcp-server', 'Prompt enhancement skipped (SKIP_PROMPT_ENHANCEMENT=true)')
      }

      // Generate image using selected provider.
      if (!this.imageClient) {
        throw new Error('Image client not initialized')
      }

      const generationResult = await this.imageClient.generateImage({
        prompt: structuredPrompt,
        ...imageOptions,
      })

      if (!generationResult.success) {
        throw generationResult.error
      }

      // Save image file
      const mimeType = generationResult.data.metadata.mimeType
      const rawFileName = params.fileName
        ? this.securityManager.sanitizeFilename(params.fileName)
        : this.fileManager.generateFileName(mimeType)
      const fileName = params.fileName ? ensureExtension(rawFileName, mimeType) : rawFileName
      const outputPath = path.join(config.imageOutputDir, fileName)

      const sanitizedPath = this.securityManager.sanitizeFilePath(outputPath)
      if (!sanitizedPath.success) {
        throw sanitizedPath.error
      }

      const saveResult = await this.fileManager.saveImage(
        generationResult.data.imageData,
        sanitizedPath.data
      )
      if (!saveResult.success) {
        throw saveResult.error
      }

      // Build response
      return this.responseBuilder.buildSuccessResponse(generationResult.data, saveResult.data)
    }, 'image-generation')

    if (result.ok) {
      return result.value
    }

    return this.responseBuilder.buildErrorResponse(result.error)
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
        const result = await this.callTool(name, args)
        const response: CallToolResult = {
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
 * Factory function to create MCP server
 */
export function createMCPServer(config: Partial<MCPServerConfig> = {}) {
  return new MCPServerImpl(config)
}
