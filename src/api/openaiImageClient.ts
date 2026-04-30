/**
 * OpenAI API client for GPT Image generation and editing.
 */

import OpenAI, { toFile } from 'openai'
import type { ImageQuality } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE, normalizeMimeType } from '../utils/mimeUtils.js'
import type { GeneratedImageResult, ImageApiParams, ImageClient } from './imageClient.js'

type OpenAIImageSize = '1024x1024' | '1536x1024' | '1024x1536'
type OpenAIImageQuality = 'low' | 'medium' | 'high'
type OpenAIOutputFormat = 'png'

interface OpenAIImageResponse {
  data?: Array<{
    b64_json?: string
    revised_prompt?: string
    url?: string
  }>
}

interface ErrorWithCode extends Error {
  code?: string
  status?: number
}

function mapQuality(quality: ImageQuality): OpenAIImageQuality {
  switch (quality) {
    case 'quality':
      return 'high'
    case 'balanced':
      return 'medium'
    case 'fast':
      return 'low'
  }
}

function mapSize(params: ImageApiParams): OpenAIImageSize {
  if (!params.aspectRatio) {
    return '1024x1024'
  }

  const [widthRaw, heightRaw] = params.aspectRatio.split(':')
  const width = Number(widthRaw)
  const height = Number(heightRaw)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) {
    return '1024x1024'
  }

  return width > height ? '1536x1024' : '1024x1536'
}

function mimeTypeToExtension(mimeType: string): string {
  switch (normalizeMimeType(mimeType)) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'png'
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const networkErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
    return networkErrorCodes.some(
      (code) => error.message.includes(code) || (error as ErrorWithCode).code === code
    )
  }
  return false
}

class OpenAIImageClientImpl implements ImageClient {
  private readonly outputFormat: OpenAIOutputFormat = 'png'

  constructor(
    private readonly client: OpenAI,
    private readonly modelName: string,
    private readonly defaultQuality: ImageQuality = 'fast'
  ) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, ImageAPIError | NetworkError>> {
    try {
      const quality = mapQuality(params.quality ?? this.defaultQuality)
      const size = mapSize(params)

      const response = params.inputImage
        ? await this.editImage(params, quality, size)
        : await this.createImage(params, quality, size)

      const firstImage = response.data?.[0]
      if (!firstImage?.b64_json) {
        return Err(
          new ImageAPIError('No image data returned from OpenAI image API', {
            provider: 'openai',
            model: this.modelName,
            stage: 'image_extraction',
            suggestion:
              'Retry the request or verify that the selected model returns base64 image data',
          })
        )
      }

      return Ok({
        imageData: Buffer.from(firstImage.b64_json, 'base64'),
        metadata: {
          model: this.modelName,
          provider: 'openai',
          prompt: params.prompt,
          mimeType: `image/${this.outputFormat}`,
          timestamp: new Date(),
          inputImageProvided: !!params.inputImage,
          ...(firstImage.revised_prompt && { revisedPrompt: firstImage.revised_prompt }),
        },
      })
    } catch (error) {
      return this.handleError(error, params.prompt)
    }
  }

  private async createImage(
    params: ImageApiParams,
    quality: OpenAIImageQuality,
    size: OpenAIImageSize
  ): Promise<OpenAIImageResponse> {
    return (await this.client.images.generate({
      model: this.modelName,
      prompt: params.prompt,
      n: 1,
      output_format: this.outputFormat,
      quality,
      size,
    })) as OpenAIImageResponse
  }

  private async editImage(
    params: ImageApiParams,
    quality: OpenAIImageQuality,
    size: OpenAIImageSize
  ): Promise<OpenAIImageResponse> {
    const mimeType = normalizeMimeType(params.inputImageMimeType ?? DEFAULT_MIME_TYPE)
    const inputFile = await toFile(
      Buffer.from(params.inputImage ?? '', 'base64'),
      `input.${mimeTypeToExtension(mimeType)}`,
      { type: mimeType }
    )

    return (await this.client.images.edit({
      model: this.modelName,
      prompt: params.prompt,
      image: inputFile,
      n: 1,
      output_format: this.outputFormat,
      quality,
      size,
    })) as OpenAIImageResponse
  }

  private handleError(error: unknown, prompt: string): Result<never, ImageAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (isNetworkError(error)) {
      return Err(
        new NetworkError(
          `Network error during OpenAI image generation: ${errorMessage}`,
          'Check your internet connection and try again',
          error instanceof Error ? error : undefined
        )
      )
    }

    return Err(
      new ImageAPIError(
        `Failed to generate image with OpenAI for prompt "${prompt}": ${errorMessage}`,
        this.getAPIErrorSuggestion(errorMessage),
        this.extractStatusCode(error)
      )
    )
  }

  private getAPIErrorSuggestion(errorMessage: string): string {
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit')) {
      return 'You have exceeded your OpenAI API quota or rate limit. Wait before retrying or upgrade your plan'
    }

    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('api key')) {
      return 'Check that your OPENAI_API_KEY is valid and has image generation permissions'
    }

    if (lowerMessage.includes('model') || lowerMessage.includes('not found')) {
      return 'Check OPENAI_IMAGE_MODEL. Use gpt-image-2, or another model available to your account'
    }

    if (lowerMessage.includes('forbidden') || lowerMessage.includes('permission')) {
      return 'Your OpenAI API key does not have permission for this operation or model'
    }

    return 'Check OpenAI API configuration and try again'
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'status' in error) {
      return typeof error.status === 'number' ? error.status : undefined
    }
    return undefined
  }
}

/**
 * Creates a new OpenAI image client.
 */
export function createOpenAIImageClient(config: Config): Result<ImageClient, ImageAPIError> {
  try {
    const client = new OpenAI({
      apiKey: config.openaiApiKey,
    })
    return Ok(new OpenAIImageClientImpl(client, config.openaiImageModel, config.imageQuality))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Err(
      new ImageAPIError(
        `Failed to initialize OpenAI image client: ${errorMessage}`,
        'Verify your OPENAI_API_KEY is valid and the openai package is properly installed'
      )
    )
  }
}
