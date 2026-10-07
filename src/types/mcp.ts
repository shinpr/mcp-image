export const ASPECT_RATIO_VALUES = [
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
] as const

export type AspectRatio = (typeof ASPECT_RATIO_VALUES)[number]

export const IMAGE_SIZE_VALUES = ['1K', '2K', '4K'] as const

export type ImageSize = (typeof IMAGE_SIZE_VALUES)[number]

export type ImageOutputFormat = 'png' | 'jpeg'

export const IMAGE_QUALITY_VALUES = ['fast', 'balanced', 'quality'] as const

export type ImageQuality = (typeof IMAGE_QUALITY_VALUES)[number]

export const IMAGE_PROVIDER_VALUES = ['gemini', 'openai', 'seedream'] as const

export type ImageProvider = (typeof IMAGE_PROVIDER_VALUES)[number]

export const GEMINI_MODELS = {
  FLASH: 'gemini-nano-banana-2.1',
  PRO: 'gemini-3-pro-image',
} as const

export interface GenerateImageParams {
  prompt: string
  fileName?: string
  inputImagePath?: string
  inputImage?: string
  inputImageMimeType?: string
  blendImages?: boolean
  maintainCharacterConsistency?: boolean
  useWorldKnowledge?: boolean
  useGoogleSearch?: boolean
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  purpose?: string
  quality?: ImageQuality
  provider?: ImageProvider
}

export interface MCPServerConfig {
  name: string
  version: string
  defaultOutputDir: string
}

type McpContent = {
  type: 'text'
  text: string
}

export interface McpToolResponse {
  content: McpContent[]
  isError?: boolean
}

export interface ResourceContent {
  type: 'resource'
  resource: {
    uri: string
    name: string
    mimeType: string
  }
  metadata: {
    model: string
    provider?: string
    processingTime: number
    contextMethod: string
    timestamp: string
  }
}
