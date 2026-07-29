import { createGeminiClient } from '../api/geminiClient.js'
import { createGeminiTextClient } from '../api/geminiTextClient.js'
import type { ImageApiParams, ImageClient } from '../api/imageClient.js'
import { createOpenAIImageClient } from '../api/openaiImageClient.js'
import { createOpenAITextClient } from '../api/openaiTextClient.js'
import {
  createSeedreamImageClient,
  validateSeedreamCapabilities,
} from '../api/seedreamImageClient.js'
import { createSeedreamTextClient } from '../api/seedreamTextClient.js'
import type { TextClient } from '../api/textClient.js'
import type { ImageProvider } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import type { Config } from '../utils/config.js'

type ImageOptions = Omit<ImageApiParams, 'prompt'>

export interface ImageProviderDefinition {
  readonly promptGeneration: Readonly<{
    maxTokens: number
  }>
  createTextClient(config: Config): TextClient
  createImageClient(config: Config): ImageClient
  validateImageOptions?(options: ImageOptions, config: Config): void
}

function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (!result.success) {
    throw result.error
  }
  return result.data
}

const IMAGE_PROVIDERS = {
  gemini: {
    promptGeneration: { maxTokens: 1000 },
    createTextClient: (config) => unwrap(createGeminiTextClient(config)),
    createImageClient: (config) => unwrap(createGeminiClient(config)),
  },
  openai: {
    promptGeneration: { maxTokens: 1000 },
    createTextClient: (config) => unwrap(createOpenAITextClient(config)),
    createImageClient: (config) => unwrap(createOpenAIImageClient(config)),
  },
  seedream: {
    promptGeneration: { maxTokens: 384 },
    createTextClient: (config) => unwrap(createSeedreamTextClient(config)),
    createImageClient: (config) => unwrap(createSeedreamImageClient(config)),
    validateImageOptions: (options, config) => {
      unwrap(validateSeedreamCapabilities(options, config.imageQuality))
    },
  },
} satisfies Record<ImageProvider, ImageProviderDefinition>

export function getImageProviderDefinition(provider: ImageProvider): ImageProviderDefinition {
  return IMAGE_PROVIDERS[provider]
}
