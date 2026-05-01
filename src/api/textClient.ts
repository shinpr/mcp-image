import type { Result } from '../types/result.js'
import type { GeminiAPIError, ImageAPIError, NetworkError } from '../utils/errors.js'

/**
 * Options for text generation used by the prompt enhancer.
 */
export interface GenerationConfig {
  temperature?: number
  maxTokens?: number
  timeout?: number
  systemInstruction?: string
  inputImage?: string
  inputImageMimeType?: string
  topP?: number
  topK?: number
}

/**
 * Provider-neutral text client for prompt enhancement.
 */
export interface TextClient {
  generateText(
    prompt: string,
    config?: GenerationConfig
  ): Promise<Result<string, GeminiAPIError | ImageAPIError | NetworkError>>

  validateConnection(): Promise<Result<boolean, GeminiAPIError | ImageAPIError | NetworkError>>
}
