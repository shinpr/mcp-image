import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { ImageApiParams, ImageClient } from '../api/imageClient.js'
import { generateFileName, readInputImage, saveImage } from '../business/fileManager.js'
import { validateGenerateImageParams } from '../business/inputValidator.js'
import { buildErrorResponse, buildSuccessResponse } from '../business/responseBuilder.js'
import {
  createStructuredPromptGenerator,
  type FeatureFlags,
  type StructuredPromptGenerator,
} from '../business/structuredPromptGenerator.js'
import type { ImageProvider, MCPServerConfig } from '../types/mcp.js'
import {
  ASPECT_RATIO_VALUES,
  IMAGE_PROVIDER_VALUES,
  IMAGE_QUALITY_VALUES,
  IMAGE_SIZE_VALUES,
} from '../types/mcp.js'

import { type Config, getConfig, validateProviderCredentials } from '../utils/config.js'
import { Logger } from '../utils/logger.js'
import {
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

const PACKAGE_VERSION = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version

const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'mcp-image-server',
  version: PACKAGE_VERSION,
  defaultOutputDir: './output',
}

interface ProviderClients {
  imageClient: ImageClient
  structuredPromptGenerator: StructuredPromptGenerator | null
}

export class MCPServerImpl {
  private config: MCPServerConfig
  private server: Server | null = null
  private logger: Logger
  private securityManager: SecurityManager
  private clientsByProvider = new Map<ImageProvider, ProviderClients>()

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger()
    this.securityManager = new SecurityManager()
  }

  public getServerInfo() {
    return {
      name: this.config.name,
      version: this.config.version,
    }
  }

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
                  'Set the requested output aspect ratio. Omit to use the provider default. OpenAI does not support 1:4, 1:8, 4:1, or 8:1.',
                enum: [...ASPECT_RATIO_VALUES],
              },
              imageSize: {
                type: 'string' as const,
                description:
                  "Set the requested output size to 1K, 2K, or 4K. Omit to use the selected provider and quality preset's default. With Seedream, use 1K or 2K.",
                enum: [...IMAGE_SIZE_VALUES],
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
                enum: [...IMAGE_QUALITY_VALUES],
              },
              provider: {
                type: 'string' as const,
                description:
                  'Set only when the user requests a specific image provider; otherwise omit to use the server default. The provider must have its API key configured on the server.',
                enum: [...IMAGE_PROVIDER_VALUES],
              },
            },
            required: ['prompt'],
          },
        },
      ],
    }
  }

  public async callTool(name: string, args: unknown, signal?: AbortSignal) {
    try {
      if (name === 'generate_image') {
        return await this.handleGenerateImage(args, signal)
      }
      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      this.logger.error('mcp-server', 'Tool execution failed', error as Error)
      return ErrorHandler.handleError(error as Error)
    }
  }

  /**
   * Initialize provider clients lazily, cached per provider so that requests
   * alternating between providers do not reuse another provider's clients.
   */
  private getProviderClients(
    config: Config,
    providerName: ImageProvider,
    provider: ImageProviderDefinition
  ): ProviderClients {
    const cached = this.clientsByProvider.get(providerName)
    if (cached && (config.skipPromptEnhancement || cached.structuredPromptGenerator)) {
      return cached
    }

    const structuredPromptGenerator = config.skipPromptEnhancement
      ? null
      : createStructuredPromptGenerator(
          provider.createTextClient(config),
          provider.promptGeneration.maxTokens
        )

    const clients: ProviderClients = {
      imageClient: cached?.imageClient ?? provider.createImageClient(config),
      structuredPromptGenerator,
    }
    this.clientsByProvider.set(providerName, clients)

    this.logger.info('mcp-server', 'Image provider clients initialized', {
      provider: providerName,
      promptEnhancement: !config.skipPromptEnhancement,
    })

    return clients
  }

  private async handleGenerateImage(args: unknown, signal?: AbortSignal) {
    const result = await ErrorHandler.wrapWithResultType(async () => {
      signal?.throwIfAborted()
      const validationResult = validateGenerateImageParams(args)
      if (!validationResult.success) {
        throw validationResult.error
      }
      const params = validationResult.data

      const sanitizedFileName = params.fileName
        ? this.securityManager.sanitizeFilename(params.fileName)
        : undefined
      const preferredOutputFormat = resolvePreferredOutputFormat(sanitizedFileName)

      const configResult = getConfig()
      if (!configResult.success) {
        throw configResult.error
      }
      const config = configResult.data

      const outputPreflight = this.securityManager.sanitizeFilePath(
        path.join(config.imageOutputDir, sanitizedFileName ?? 'image.png')
      )
      if (!outputPreflight.success) {
        throw outputPreflight.error
      }

      const providerName = params.provider ?? config.imageProvider
      const credentialsResult = validateProviderCredentials(config, providerName)
      if (!credentialsResult.success) {
        throw credentialsResult.error
      }
      const provider = getImageProviderDefinition(providerName)

      const { imageClient, structuredPromptGenerator } = this.getProviderClients(
        config,
        providerName,
        provider
      )

      let inputImageData: string | undefined
      let inputImageMimeType: string | undefined
      if (params.inputImagePath) {
        const inputImage = await readInputImage(params.inputImagePath)
        inputImageData = inputImage.data.toString('base64')
        inputImageMimeType = inputImage.mimeType
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
      signal?.throwIfAborted()

      let structuredPrompt = params.prompt
      if (!config.skipPromptEnhancement && structuredPromptGenerator) {
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
        const promptResult = await structuredPromptGenerator.generateStructuredPrompt(
          params.prompt,
          features,
          inputImageData,
          params.purpose,
          inputImageMimeType,
          signal
        )
        signal?.throwIfAborted()

        if (promptResult.success) {
          structuredPrompt = promptResult.data

          this.logger.info('mcp-server', 'Structured prompt generated', {
            originalLength: params.prompt.length,
            structuredLength: structuredPrompt.length,
          })
        } else {
          this.logger.warn('mcp-server', 'Using original prompt', {
            error: promptResult.error.message,
          })
        }
      } else if (config.skipPromptEnhancement) {
        this.logger.info('mcp-server', 'Prompt enhancement skipped (SKIP_PROMPT_ENHANCEMENT=true)')
      }

      const generationResult = await imageClient.generateImage({
        prompt: structuredPrompt,
        ...imageOptions,
        ...(signal && { signal }),
      })
      signal?.throwIfAborted()

      if (!generationResult.success) {
        throw generationResult.error
      }

      const mimeType = generationResult.data.metadata.mimeType
      const rawFileName = sanitizedFileName ?? generateFileName(mimeType)
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

      const saveResult = await saveImage(generationResult.data.imageData, sanitizedPath.data)
      if (!saveResult.success) {
        throw saveResult.error
      }

      return buildSuccessResponse(generationResult.data, saveResult.data)
    }, 'image-generation')

    if (result.success) {
      return result.data
    }

    return buildErrorResponse(result.error)
  }

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

    this.setupHandlers()

    return this.server
  }

  private setupHandlers(): void {
    if (!this.server) {
      throw new Error('Server not initialized')
    }

    this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
      return this.getToolsList()
    })

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, { signal }): Promise<CallToolResult> => {
        const { name, arguments: args } = request.params
        const result = await this.callTool(name, args, signal)
        const response: CallToolResult = {
          content: result.content,
          isError: result.isError,
        }
        return response
      }
    )
  }
}

export function createMCPServer(config: Partial<MCPServerConfig> = {}) {
  return new MCPServerImpl(config)
}
