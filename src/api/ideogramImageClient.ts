/**
 * Ideogram API client for Ideogram 4.0 (v4) image generation.
 *
 * Uses the Ideogram HTTP API directly (there is no official Node SDK).
 * The generate endpoint accepts a multipart/form-data request and returns
 * ephemeral image URLs, so the bytes are downloaded before being returned.
 *
 * v4 differs from v3: the prompt field is `text_prompt` (which auto-enables
 * magic-prompt), the image shape is chosen via a fixed `resolution` instead of
 * an `aspect_ratio`, and `rendering_speed=FLASH` is not yet available.
 */

import type { AspectRatio, ImageQuality } from '../types/mcp.js'
import { IDEOGRAM_MODEL } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE, normalizeMimeType } from '../utils/mimeUtils.js'
import { isNetworkError } from './errorClassification.js'
import type { GeneratedImageResult, ImageApiParams, ImageClient } from './imageClient.js'

const IDEOGRAM_GENERATE_URL = 'https://api.ideogram.ai/v1/ideogram-v4/generate'

// FLASH is intentionally excluded: Ideogram v4 returns 400 for it ("coming soon").
type IdeogramRenderingSpeed = 'TURBO' | 'DEFAULT' | 'QUALITY'

type IdeogramResolution =
  | '2048x2048'
  | '2560x1440'
  | '2304x1728'
  | '2496x1664'
  | '1440x2560'
  | '1728x2304'
  | '1664x2496'

type Orientation = 'square' | 'landscape' | 'portrait'

interface IdeogramImageData {
  url?: string
  prompt?: string
  resolution?: string
  is_image_safe?: boolean
  seed?: number
}

interface IdeogramGenerateResponse {
  response_type?: string
  created?: string
  data?: IdeogramImageData[]
}

/**
 * Map the provider-neutral quality presets onto Ideogram rendering speeds.
 * Ideogram trades latency for fidelity, so the presets line up cleanly. FLASH
 * is unavailable on v4, so `fast` maps to the next-fastest speed (TURBO).
 */
function mapRenderingSpeed(quality: ImageQuality): IdeogramRenderingSpeed {
  switch (quality) {
    case 'quality':
      return 'QUALITY'
    case 'balanced':
      return 'DEFAULT'
    case 'fast':
      return 'TURBO'
  }
}

/**
 * Ideogram v4 selects the image shape via a fixed `resolution` rather than an
 * aspect ratio, and every v4 resolution sits around the same ~4 MP. `aspectRatio`
 * therefore only chooses the orientation, while `IMAGE_QUALITY` selects the
 * resolution: higher presets pick the larger v4 resolution available for that
 * orientation. (Square has a single v4 resolution, so the preset has no size
 * effect there.)
 */
const RESOLUTION_BY_ORIENTATION: Record<Orientation, Record<ImageQuality, IdeogramResolution>> = {
  square: {
    fast: '2048x2048',
    balanced: '2048x2048',
    quality: '2048x2048',
  },
  landscape: {
    fast: '2560x1440', // 3.69 MP
    balanced: '2304x1728', // 3.98 MP
    quality: '2496x1664', // 4.15 MP
  },
  portrait: {
    fast: '1440x2560', // 3.69 MP
    balanced: '1728x2304', // 3.98 MP
    quality: '1664x2496', // 4.15 MP
  },
}

function getOrientation(aspectRatio?: AspectRatio): Orientation {
  if (!aspectRatio) {
    return 'square'
  }

  const [widthRaw, heightRaw] = aspectRatio.split(':')
  const width = Number(widthRaw)
  const height = Number(heightRaw)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) {
    return 'square'
  }

  return width > height ? 'landscape' : 'portrait'
}

function mapResolution(
  aspectRatio: AspectRatio | undefined,
  quality: ImageQuality
): IdeogramResolution {
  return RESOLUTION_BY_ORIENTATION[getOrientation(aspectRatio)][quality]
}

function validateIdeogramOptions(params: ImageApiParams): Result<true, ImageAPIError> {
  if (params.useGoogleSearch) {
    return Err(
      new ImageAPIError(
        'useGoogleSearch is not supported by the Ideogram image provider',
        'Disable useGoogleSearch or use IMAGE_PROVIDER=gemini for Google Search grounding'
      )
    )
  }

  if (typeof params.inputImage === 'string' && params.inputImage.length > 0) {
    return Err(
      new ImageAPIError(
        'Image-to-image editing is not supported by the Ideogram image provider',
        'Remove the input image or use IMAGE_PROVIDER=gemini or IMAGE_PROVIDER=openai for image editing'
      )
    )
  }

  return Ok(true)
}

class IdeogramImageClientImpl implements ImageClient {
  private readonly modelName = IDEOGRAM_MODEL

  constructor(
    private readonly apiKey: string,
    private readonly defaultQuality: ImageQuality = 'fast'
  ) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, ImageAPIError | NetworkError>> {
    try {
      const optionsResult = validateIdeogramOptions(params)
      if (!optionsResult.success) {
        return optionsResult
      }

      const quality = params.quality ?? this.defaultQuality

      const formData = new FormData()
      // v4 uses `text_prompt`; supplying it auto-enables Ideogram's magic-prompt.
      formData.append('text_prompt', params.prompt)
      // IMAGE_QUALITY drives both the rendering speed and the resolution; the
      // aspect ratio only chooses the orientation.
      formData.append('rendering_speed', mapRenderingSpeed(quality))
      formData.append('resolution', mapResolution(params.aspectRatio, quality))

      const response = await fetch(IDEOGRAM_GENERATE_URL, {
        method: 'POST',
        headers: { 'Api-Key': this.apiKey },
        body: formData,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        return this.handleApiError(response.status, errorBody, params.prompt)
      }

      const payload = (await response.json()) as IdeogramGenerateResponse
      const firstImage = payload.data?.[0]
      if (!firstImage?.url) {
        return Err(
          new ImageAPIError('No image data returned from Ideogram API', {
            provider: 'ideogram',
            model: this.modelName,
            stage: 'image_extraction',
            suggestion:
              'Retry the request or verify that the prompt was not rejected by safety filters',
          })
        )
      }

      const imageResponse = await fetch(firstImage.url)
      if (!imageResponse.ok) {
        return Err(
          new ImageAPIError(
            `Failed to download generated image from Ideogram (status ${imageResponse.status})`,
            {
              provider: 'ideogram',
              model: this.modelName,
              stage: 'image_download',
              suggestion:
                'Ideogram image URLs are ephemeral. Retry the request to obtain a fresh image URL',
            },
            imageResponse.status
          )
        )
      }

      const arrayBuffer = await imageResponse.arrayBuffer()
      const imageData = Buffer.from(arrayBuffer)
      const contentType = imageResponse.headers.get('content-type')
      const mimeType = contentType
        ? normalizeMimeType(contentType.split(';')[0]?.trim() ?? DEFAULT_MIME_TYPE)
        : DEFAULT_MIME_TYPE

      return Ok({
        imageData,
        metadata: {
          model: this.modelName,
          provider: 'ideogram',
          prompt: params.prompt,
          mimeType,
          timestamp: new Date(),
          inputImageProvided: false,
          ...(firstImage.prompt &&
            firstImage.prompt !== params.prompt && { revisedPrompt: firstImage.prompt }),
        },
      })
    } catch (error) {
      return this.handleError(error, params.prompt)
    }
  }

  private handleApiError(
    status: number,
    body: string,
    prompt: string
  ): Result<never, ImageAPIError> {
    return Err(
      new ImageAPIError(
        `Ideogram image generation failed with status ${status}`,
        {
          provider: 'ideogram',
          prompt,
          upstreamMessage: body,
          suggestion: this.getAPIErrorSuggestion(status),
        },
        status
      )
    )
  }

  private handleError(error: unknown, prompt: string): Result<never, ImageAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (isNetworkError(error)) {
      return Err(
        new NetworkError(
          'Network error during Ideogram image generation',
          'Check your internet connection and try again',
          error instanceof Error ? error : undefined
        )
      )
    }

    return Err(
      new ImageAPIError('Failed to generate image with Ideogram', {
        provider: 'ideogram',
        prompt,
        upstreamMessage: errorMessage,
        suggestion: 'Check Ideogram API configuration and try again',
      })
    )
  }

  private getAPIErrorSuggestion(status: number): string {
    if (status === 401 || status === 403) {
      return 'Check that your IDEOGRAM_API_KEY is valid and has image generation permissions'
    }
    if (status === 429) {
      return 'You have exceeded your Ideogram API rate limit or quota. Wait before retrying'
    }
    if (status === 400 || status === 422) {
      return 'Check the prompt and request parameters against the Ideogram API specification'
    }
    if (status >= 500) {
      return 'The Ideogram service is temporarily unavailable. Please retry after a few moments'
    }
    return 'Check Ideogram API configuration and retry the request'
  }
}

/**
 * Creates a new Ideogram image client.
 */
export function createIdeogramImageClient(config: Config): Result<ImageClient, ImageAPIError> {
  if (!config.ideogramApiKey || config.ideogramApiKey.trim().length === 0) {
    return Err(
      new ImageAPIError(
        'Failed to initialize Ideogram image client: IDEOGRAM_API_KEY is not configured',
        'Set the IDEOGRAM_API_KEY environment variable with your Ideogram API key'
      )
    )
  }

  return Ok(new IdeogramImageClientImpl(config.ideogramApiKey, config.imageQuality))
}
