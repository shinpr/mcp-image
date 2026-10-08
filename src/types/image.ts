import type { ImageProvider } from './mcp.js'

export interface ReferenceImage {
  data: string
  mimeType: string
}

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
export const MAX_INPUT_IMAGES = {
  gemini: 14,
  openai: 16,
  seedream: 10,
} as const satisfies Record<ImageProvider, number>
