import type { AspectRatio, ImageQuality, ImageSize } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import type { GeminiAPIError, ImageAPIError, NetworkError } from '../utils/errors.js'

/**
 * Provider-neutral metadata for generated images.
 */
export interface ImageGenerationMetadata {
  model: string
  prompt: string
  mimeType: string
  timestamp: Date
  inputImageProvided: boolean
  provider?: string
  modelVersion?: string
  responseId?: string
  revisedPrompt?: string
}

/**
 * Provider-neutral image generation/editing parameters.
 */
export interface ImageApiParams {
  prompt: string
  inputImage?: string
  inputImageMimeType?: string
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  useGoogleSearch?: boolean
  quality?: ImageQuality
}

/**
 * Result of image generation.
 */
export interface GeneratedImageResult {
  imageData: Buffer
  metadata: ImageGenerationMetadata
}

/**
 * Provider-neutral image client.
 */
export interface ImageClient {
  generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | ImageAPIError | NetworkError>>
}
