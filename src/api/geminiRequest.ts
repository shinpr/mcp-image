import type { Content, GenerateContentConfig } from '@google/genai'
import type { ReferenceImage } from '../types/image.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { GeminiAPIError } from '../utils/errors.js'

const MAX_INLINE_REQUEST_BYTES = 20_000_000

export function buildGeminiContents(prompt: string, images: ReferenceImage[] = []): Content[] {
  return [
    {
      role: 'user',
      parts: [...images.map((image) => ({ inlineData: image })), { text: prompt }],
    },
  ]
}

/** Include the SDK's wire envelope, not just decoded image bytes. */
export function validateGeminiRequestSize(
  contents: Content[],
  config: GenerateContentConfig
): Result<void, GeminiAPIError> {
  const generationConfig = { ...config }
  delete generationConfig.abortSignal
  delete generationConfig.systemInstruction
  delete generationConfig.tools
  const request = {
    contents,
    generationConfig,
    ...(config.systemInstruction !== undefined && {
      systemInstruction:
        typeof config.systemInstruction === 'string'
          ? { role: 'user', parts: [{ text: config.systemInstruction }] }
          : config.systemInstruction,
    }),
    ...(config.tools !== undefined && { tools: config.tools }),
  }
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') >= MAX_INLINE_REQUEST_BYTES) {
    return Err(
      new GeminiAPIError(
        'Gemini inline request must be smaller than 20 MB',
        'Reduce reference image sizes or the number of images'
      )
    )
  }
  return Ok(undefined)
}
