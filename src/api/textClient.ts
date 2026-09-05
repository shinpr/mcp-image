import type { Result } from '../types/result.js'
import type { GeminiAPIError, ImageAPIError, NetworkError } from '../utils/errors.js'

export const MAX_TEXT_PROMPT_LENGTH = 100_000

export interface GenerationConfig {
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  timeout?: number
  systemInstruction?: string
  inputImage?: string
  inputImageMimeType?: string
  topP?: number
  topK?: number
}

export interface TextClient {
  generateText(
    prompt: string,
    config?: GenerationConfig
  ): Promise<Result<string, GeminiAPIError | ImageAPIError | NetworkError>>
}
