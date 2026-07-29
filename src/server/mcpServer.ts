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
import {
  getMimeTypeFromExtension,
  reconcileFileNameExtension,
  resolvePreferredOutputFormat,
  SUPPORTED_EXTENSIONS,
} from '../utils/mimeUtils.js'
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
          description:
            'Generate a new image from a text prompt or edit an existing image using inputImagePath. Saves the result and returns a file resource.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              prompt: {
                type: 'string' as const,
                description:
                  'Describe the image to generate or the edit to apply. Include the subject, context, and visual style; English is recommended for prompt enhancement.',
              },
              fileName: {
                type: 'string' as const,
                description:
                  'Use .png, .jpg, or .jpeg to request that output format from OpenAI or Seedream. Other or absent suffixes use the provider default; the saved filename is corrected to the actual image extension.',
              },
              inputImagePath: {
                type: 'string' as const,
                description:
                  'Provide an absolute path to a source image when editing, creating a variation, or transferring style.',
              },
              blendImages: {
                type: 'boolean' as const,
                description:
                  'Enable when the prompt combines multiple visual elements that need coherent spatial relationships, lighting, or composition.',
              },
              maintainCharacterConsistency: {
                type: 'boolean' as const,
                description:
                  'Enable when the same character must retain a recognizable appearance across poses or scenes.',
              },
              useWorldKnowledge: {
                type: 'boolean' as const,
                description:
                  'Enable when accurate real-world details matter, such as historical figures, landmarks, cultures, or factual settings.',
              },
              useGoogleSearch: {
                type: 'boolean' as const,
                description:
                  'Enable when using Gemini and the image requires current or time-sensitive web information. With OpenAI or Seedream, omit this option or set it to false.',
              },
              aspectRatio: {
                type: 'string' as const,
                description:
                  'Set the requested output aspect ratio. Omit to use the provider default.',
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
                  "Set the requested output size to 1K, 2K, or 4K. Omit to use the selected provider and quality preset's default. With Seedream, use 1K or 2K.",
                enum: ['1K', '2K', '4K'],
              },
              purpose: {
                type: 'string' as const,
                description:
                  "Describe the image's intended use, such as a cookbook cover, social media post, or presentation slide, so prompt enhancement can adapt composition and detail.",
              },
              quality: {
                type: 'string' as const,
                description:
                  'Set only when the user requests a quality level; otherwise omit to use the server default. fast prioritizes speed, balanced trades speed for detail, and quality prioritizes fidelity.',
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

      const sanitizedFileName = params.fileName
        ? this.securityManager.sanitizeFilename(params.fileName)
        : undefined
      const preferredOutputFormat = resolvePreferredOutputFormat(sanitizedFileName)

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
        ...(preferredOutputFormat && { preferredOutputFormat }),
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
      const rawFileName = sanitizedFileName ?? this.fileManager.generateFileName(mimeType)
      const fileName = params.fileName
        ? reconcileFileNameExtension(rawFileName, mimeType)
        : rawFileName
      const requestedExtension = path.extname(rawFileName)
      if (
        sanitizedFileName &&
        fileName !== rawFileName &&
        SUPPORTED_EXTENSIONS.includes(requestedExtension.toLowerCase())
      ) {
        this.logger.warn(
          'mcp-server',
          'Output filename extension corrected to match generated MIME type',
          {
            requestedExtension,
            savedExtension: path.extname(fileName),
            mimeType,
          }
        )
      }
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
          isError: result.isError,
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
