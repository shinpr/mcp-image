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
import { MAX_INPUT_IMAGES, type ReferenceImage } from '../types/image.js'
import type {
  GenerateImageParams,
  ImageOutputFormat,
  ImageProvider,
  MCPServerConfig,
  McpToolResponse,
} from '../types/mcp.js'
import {
  ASPECT_RATIO_VALUES,
  IMAGE_PROVIDER_VALUES,
  IMAGE_QUALITY_VALUES,
  IMAGE_SIZE_VALUES,
} from '../types/mcp.js'
import { unwrapOrThrow } from '../types/result.js'
import { type Config, getConfig, validateProviderCredentials } from '../utils/config.js'
import { InputValidationError, toError } from '../utils/errors.js'
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

function readPackageVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  )
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest) {
    const { version } = manifest
    if (typeof version === 'string') {
      return version
    }
  }
  throw new Error('package.json does not declare a string version')
}

const PACKAGE_VERSION = readPackageVersion()

const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'mcp-image-server',
  version: PACKAGE_VERSION,
  defaultOutputDir: './output',
}

interface ProviderClients {
  imageClient: ImageClient
  structuredPromptGenerator: StructuredPromptGenerator | null
}

type ImageOptions = Omit<ImageApiParams, 'prompt'>

/** Assemble the provider-facing image options from validated request params. */
function buildImageOptions(
  params: GenerateImageParams,
  inputImages: ReferenceImage[],
  preferredOutputFormat: ImageOutputFormat | undefined
): ImageOptions {
  return {
    ...(inputImages.length > 0 && { inputImages }),
    ...(params.aspectRatio && { aspectRatio: params.aspectRatio }),
    ...(params.imageSize && { imageSize: params.imageSize }),
    ...(params.useGoogleSearch !== undefined && { useGoogleSearch: params.useGoogleSearch }),
    ...(preferredOutputFormat && { preferredOutputFormat }),
    ...(params.quality !== undefined && { quality: params.quality }),
  } satisfies ImageOptions
}

/** Project the request's enhancement flags onto the prompt generator's contract. */
function buildFeatureFlags(params: GenerateImageParams): FeatureFlags {
  return {
    ...(params.maintainCharacterConsistency !== undefined && {
      maintainCharacterConsistency: params.maintainCharacterConsistency,
    }),
    ...(params.blendImages !== undefined && { blendImages: params.blendImages }),
    ...(params.useWorldKnowledge !== undefined && { useWorldKnowledge: params.useWorldKnowledge }),
  }
}

/**
 * Decide the saved file name. A caller-supplied name keeps its stem but takes
 * the extension of the image that was actually generated; `corrected` reports
 * whether a supported requested extension was replaced.
 */
function resolveOutputFileName(
  requestedFileName: string | undefined,
  sanitizedFileName: string | undefined,
  mimeType: string
): { fileName: string; requestedExtension: string; corrected: boolean } {
  const rawFileName = sanitizedFileName ?? generateFileName(mimeType)
  const fileName = requestedFileName
    ? reconcileFileNameExtension(rawFileName, mimeType)
    : rawFileName
  const requestedExtension = path.extname(rawFileName)
  return {
    fileName,
    requestedExtension,
    corrected:
      sanitizedFileName !== undefined &&
      fileName !== rawFileName &&
      SUPPORTED_EXTENSIONS.includes(requestedExtension.toLowerCase()),
  }
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

  public getServerInfo(): { name: string; version: string } {
    return {
      name: this.config.name,
      version: this.config.version,
    }
  }

  public getToolsList(): ListToolsResult {
    return {
      tools: [
        {
          name: 'generate_image',
          description:
            'Generate a new image from a text prompt or edit and combine reference images using inputImagePaths. Saves the result and returns a file resource.',
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
              inputImagePaths: {
                type: 'array' as const,
                items: { type: 'string' as const, minLength: 1 },
                minItems: 1,
                maxItems: MAX_INPUT_IMAGES.openai,
                description:
                  'Absolute paths to reference images in prompt order. Use a one-element array for one image. Limits: Gemini 14, OpenAI 16, Seedream 10. Omit for text-only generation.',
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

  public async callTool(
    name: string,
    args: unknown,
    signal?: AbortSignal
  ): Promise<McpToolResponse> {
    try {
      if (name === 'generate_image') {
        return await this.handleGenerateImage(args, signal)
      }
      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      const toolError = toError(error)
      this.logger.error('mcp-server', 'Tool execution failed', toolError)
      return ErrorHandler.handleError(toolError)
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

  /**
   * Send the prompt for enhancement and report the outcome. A failed
   * enhancement is not fatal: the original prompt is used instead.
   */
  private async enhancePrompt(
    generator: StructuredPromptGenerator,
    params: GenerateImageParams,
    context: { inputImages: ReferenceImage[]; signal?: AbortSignal }
  ): Promise<string> {
    const promptResult = await generator.generateStructuredPrompt(params.prompt, {
      features: buildFeatureFlags(params),
      ...(context.inputImages.length > 0 && { inputImages: context.inputImages }),
      ...(params.purpose !== undefined && { purpose: params.purpose }),
      ...(context.signal !== undefined && { signal: context.signal }),
    })
    context.signal?.throwIfAborted()

    if (!promptResult.success) {
      this.logger.warn('mcp-server', 'Using original prompt', {
        error: promptResult.error.message,
      })
      return params.prompt
    }

    this.logger.info('mcp-server', 'Structured prompt generated', {
      originalLength: params.prompt.length,
      structuredLength: promptResult.data.length,
    })
    return promptResult.data
  }

  private async handleGenerateImage(args: unknown, signal?: AbortSignal): Promise<McpToolResponse> {
    const result = await ErrorHandler.wrapWithResultType(
      () => this.generateImage(args, signal),
      'image-generation'
    )

    if (result.success) {
      return result.data
    }

    return buildErrorResponse(result.error)
  }

  /**
   * One image generation, in order: validate, resolve config and provider,
   * load any input image, enhance the prompt, generate, then save. Runs inside
   * the caller's error boundary, so a failed step throws.
   */
  private async generateImage(args: unknown, signal?: AbortSignal): Promise<McpToolResponse> {
    signal?.throwIfAborted()
    const params = unwrapOrThrow(validateGenerateImageParams(args))

    const sanitizedFileName = params.fileName
      ? this.securityManager.sanitizeFilename(params.fileName)
      : undefined
    const preferredOutputFormat = resolvePreferredOutputFormat(sanitizedFileName)

    const config = unwrapOrThrow(getConfig())

    // Reject an unusable output path before anything is sent upstream.
    unwrapOrThrow(
      this.securityManager.sanitizeFilePath(
        path.join(config.imageOutputDir, sanitizedFileName ?? 'image.png')
      )
    )

    const providerName = params.provider ?? config.imageProvider
    unwrapOrThrow(validateProviderCredentials(config, providerName))
    const provider = getImageProviderDefinition(providerName)

    const { imageClient, structuredPromptGenerator } = this.getProviderClients(
      config,
      providerName,
      provider
    )

    const inputPaths = params.inputImagePaths ?? []
    if (inputPaths.length > MAX_INPUT_IMAGES[providerName]) {
      throw new InputValidationError(
        `${providerName} accepts at most ${MAX_INPUT_IMAGES[providerName]} input images`,
        'Reduce the number of paths in inputImagePaths'
      )
    }
    const inputImages: ReferenceImage[] = []
    for (const [index, inputPath] of inputPaths.entries()) {
      signal?.throwIfAborted()
      try {
        const image = await readInputImage(inputPath)
        inputImages.push({ data: image.data.toString('base64'), mimeType: image.mimeType })
      } catch (error) {
        const readError = toError(error)
        readError.message = `Input image ${index + 1}: ${readError.message}`
        throw readError
      }
    }

    const imageOptions = buildImageOptions(params, inputImages, preferredOutputFormat)

    provider.validateImageOptions?.(imageOptions, config)
    signal?.throwIfAborted()

    let structuredPrompt = params.prompt
    if (!config.skipPromptEnhancement && structuredPromptGenerator) {
      structuredPrompt = await this.enhancePrompt(structuredPromptGenerator, params, {
        inputImages,
        ...(signal !== undefined && { signal }),
      })
    } else if (config.skipPromptEnhancement) {
      this.logger.info('mcp-server', 'Prompt enhancement skipped (SKIP_PROMPT_ENHANCEMENT=true)')
    }

    const generationResult = await imageClient.generateImage({
      prompt: structuredPrompt,
      ...imageOptions,
      ...(signal && { signal }),
    })
    signal?.throwIfAborted()

    const generatedImage = unwrapOrThrow(generationResult)
    const mimeType = generatedImage.metadata.mimeType
    const { fileName, requestedExtension, corrected } = resolveOutputFileName(
      params.fileName,
      sanitizedFileName,
      mimeType
    )
    if (corrected) {
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

    const sanitizedPath = unwrapOrThrow(this.securityManager.sanitizeFilePath(outputPath))
    const savedPath = unwrapOrThrow(await saveImage(generatedImage.imageData, sanitizedPath))

    return buildSuccessResponse(generatedImage, savedPath)
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

export function createMCPServer(config: Partial<MCPServerConfig> = {}): MCPServerImpl {
  return new MCPServerImpl(config)
}
