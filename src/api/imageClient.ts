import type { AspectRatio, ImageOutputFormat, ImageQuality, ImageSize } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import type { GeminiAPIError, ImageAPIError, NetworkError } from '../utils/errors.js'

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

export interface ImageApiParams {
  prompt: string
  signal?: AbortSignal
  inputImage?: string
  inputImageMimeType?: string
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  useGoogleSearch?: boolean
  preferredOutputFormat?: ImageOutputFormat
  quality?: ImageQuality
}

export interface GeneratedImageResult {
  imageData: Buffer
  metadata: ImageGenerationMetadata
}

export interface ImageClient {
  generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | ImageAPIError | NetworkError>>
}
