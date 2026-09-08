import OpenAI, { toFile } from 'openai'
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from 'openai/resources/images'
import type { ImageOutputFormat, ImageQuality } from '../types/mcp.js'
import { ASPECT_RATIO_VALUES } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import {
  DEFAULT_MIME_TYPE,
  getMimeTypeForOutputFormat,
  matchesImageDataMimeType,
  normalizeMimeType,
} from '../utils/mimeUtils.js'
import { extractStatusCode, isNetworkError } from './errorClassification.js'
import type { GeneratedImageResult, ImageApiParams, ImageClient } from './imageClient.js'

type OpenAIImageSize = `${number}x${number}`
type OpenAIImageQuality = 'low' | 'high' | 'max'
// GPT Image 2.5 supports flexible resolutions and max quality, while SDK types
// still enumerate older sizes and quality settings. Keep this compatibility
// boundary local: OpenAIImagesApi accepts SDK requests plus the documented 2.5 variant.
type OpenAIImageGenerateRequest = Omit<ImageGenerateParamsNonStreaming, 'size' | 'quality'> & {
  size: OpenAIImageSize
  quality: OpenAIImageQuality
}
type OpenAIImageEditRequest = Omit<ImageEditParamsNonStreaming, 'size' | 'quality'> & {
  size: OpenAIImageSize
  quality: OpenAIImageQuality
}

interface OpenAIImagesApi {
  generate(
    body: ImageGenerateParamsNonStreaming | OpenAIImageGenerateRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ImagesResponse>
  edit(
    body: ImageEditParamsNonStreaming | OpenAIImageEditRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ImagesResponse>
}
type ImageEditApiParams = ImageApiParams & { inputImage: string }

function mapQuality(quality: ImageQuality): OpenAIImageQuality {
  switch (quality) {
    case 'quality':
      return 'max'
    case 'balanced':
      return 'high'
    case 'fast':
      return 'low'
  }
}

function requestedLongEdge(imageSize: ImageApiParams['imageSize'], ratio: number): number {
  if (imageSize === '4K') {
    return 3840
  }
  if (imageSize === '2K') {
    return 2048
  }
  return ratio === 1 ? 1024 : 1536
}

function mapSize(params: ImageApiParams): OpenAIImageSize {
  const [width = 1, height = 1] = (params.aspectRatio ?? '1:1').split(':').map(Number)
  const ratio = Math.max(width, height) / Math.min(width, height)
  const requestedEdge = requestedLongEdge(params.imageSize, ratio)
  // GPT Image 2.5: 16px increments, at most 3840px per edge and 8,294,400 pixels.
  // Flooring keeps the pixel cap intact even for near-square 4K requests.
  const longEdge = Math.floor(Math.min(requestedEdge, Math.sqrt(8_294_400 * ratio)) / 16) * 16
  const shortEdge = Math.floor(longEdge / ratio / 16) * 16
  return width >= height ? `${longEdge}x${shortEdge}` : `${shortEdge}x${longEdge}`
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

const OPENAI_IMAGE_MODELS = {
  FLARE: 'gpt-image-2.5-flare',
  SUNBURST: 'gpt-image-2.5-sunburst',
} as const

function hasInputImage(params: ImageApiParams): params is ImageEditApiParams {
  return typeof params.inputImage === 'string' && params.inputImage.length > 0
}

export function validateOpenAIOptions(
  params: Pick<ImageApiParams, 'useGoogleSearch' | 'aspectRatio'>
): Result<true, ImageAPIError> {
  if (params.useGoogleSearch) {
    return Err(
      new ImageAPIError(
        'useGoogleSearch is not supported by the OpenAI image provider',
        'Disable useGoogleSearch or use IMAGE_PROVIDER=gemini for Google Search grounding'
      )
    )
  }

  if (params.aspectRatio !== undefined) {
    const [width = 0, height = 0] = params.aspectRatio.split(':').map(Number)
    if (
      !ASPECT_RATIO_VALUES.includes(params.aspectRatio) ||
      Math.max(width, height) / Math.min(width, height) > 3
    ) {
      return Err(
        new ImageAPIError(
          'Unsupported OpenAI image aspect ratio',
          'Use a supported aspect ratio between 1:3 and 3:1'
        )
      )
    }
  }

  return Ok(true)
}

class OpenAIImageClientImpl implements ImageClient {
  constructor(
    private readonly client: OpenAI,
    private readonly defaultQuality: ImageQuality = 'fast'
  ) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, ImageAPIError | NetworkError>> {
    try {
      const optionsResult = validateOpenAIOptions(params)
      if (!optionsResult.success) {
        return optionsResult
      }

      const effectiveQuality = params.quality ?? this.defaultQuality
      const modelName =
        effectiveQuality === 'quality' ? OPENAI_IMAGE_MODELS.SUNBURST : OPENAI_IMAGE_MODELS.FLARE
      const quality = mapQuality(effectiveQuality)
      const size = mapSize(params)
      const outputFormat: ImageOutputFormat = params.preferredOutputFormat ?? 'png'

      const request: OpenAIImageGenerateRequest = {
        model: modelName,
        prompt: params.prompt,
        n: 1,
        output_format: outputFormat,
        quality,
        size,
      }
      const images: OpenAIImagesApi = this.client.images
      const response = hasInputImage(params)
        ? await this.editImage(params, request)
        : await images.generate(request, {
            ...(params.signal && { signal: params.signal }),
          })

      const firstImage = response.data?.[0]
      if (!firstImage?.b64_json) {
        return Err(
          new ImageAPIError('No image data returned from OpenAI image API', {
            provider: 'openai',
            model: modelName,
            stage: 'image_extraction',
            suggestion:
              'Retry the request or verify that the selected model returns base64 image data',
          })
        )
      }

      const imageData = Buffer.from(firstImage.b64_json, 'base64')
      const mimeType = getMimeTypeForOutputFormat(outputFormat)
      if (!matchesImageDataMimeType(imageData, mimeType)) {
        return Err(
          new ImageAPIError('OpenAI image response did not match the requested output format', {
            provider: 'openai',
            model: modelName,
            stage: 'image_response',
            suggestion: 'Retry the request; the provider returned unexpected image bytes',
          })
        )
      }

      return Ok({
        imageData,
        metadata: {
          model: modelName,
          provider: 'openai',
          prompt: params.prompt,
          mimeType,
          timestamp: new Date(),
          inputImageProvided: !!params.inputImage,
          ...(firstImage.revised_prompt && { revisedPrompt: firstImage.revised_prompt }),
        },
      })
    } catch (error) {
      return this.handleError(error, params.prompt)
    }
  }

  private async editImage(
    params: ImageEditApiParams,
    request: OpenAIImageGenerateRequest
  ): Promise<ImagesResponse> {
    const mimeType = normalizeMimeType(params.inputImageMimeType ?? DEFAULT_MIME_TYPE)
    const inputFile = await toFile(
      Buffer.from(params.inputImage, 'base64'),
      `input.${mimeTypeToExtension(mimeType)}`,
      { type: mimeType }
    )

    const images: OpenAIImagesApi = this.client.images
    return await images.edit(
      { ...request, image: inputFile },
      {
        ...(params.signal && { signal: params.signal }),
      }
    )
  }

  private handleError(error: unknown, prompt: string): Result<never, ImageAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (isNetworkError(error)) {
      return Err(
        new NetworkError(
          'Network error during OpenAI image generation',
          'Check your internet connection and try again',
          error instanceof Error ? error : undefined
        )
      )
    }

    return Err(
      new ImageAPIError(
        'Failed to generate image with OpenAI',
        {
          provider: 'openai',
          prompt,
          upstreamMessage: errorMessage,
          suggestion: this.getAPIErrorSuggestion(errorMessage),
        },
        extractStatusCode(error)
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
      return 'Verify your OpenAI organization has access to GPT Image 2.5 and has completed verification (https://platform.openai.com/settings/organization/general)'
    }

    if (lowerMessage.includes('forbidden') || lowerMessage.includes('permission')) {
      return 'Your OpenAI API key does not have permission for this operation or model'
    }

    return 'Check OpenAI API configuration and try again'
  }
}

export function createOpenAIImageClient(config: Config): Result<ImageClient, ImageAPIError> {
  try {
    const client = new OpenAI({
      apiKey: config.openaiApiKey,
    })
    return Ok(new OpenAIImageClientImpl(client, config.imageQuality))
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
