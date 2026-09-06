import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { GeminiAPIError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE, normalizeMimeType } from '../utils/mimeUtils.js'

/**
 * Image payload extracted from a validated Gemini response.
 *
 * Interpreting the response is kept separate from issuing the request so the
 * mapping from an untrusted `unknown` payload to either image bytes or a
 * classified `GeminiAPIError` can be read and exercised on its own.
 */
export interface GeminiImagePayload {
  imageData: Buffer
  mimeType: string
  modelVersion?: string
  responseId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Some SDK versions wrap the payload in a `response` property. Only an object
 * is unwrapped; any other value is treated as the payload itself.
 */
function unwrapResponsePayload(rawResponse: unknown): unknown {
  if (isRecord(rawResponse) && isRecord(rawResponse['response'])) {
    return rawResponse['response']
  }
  return rawResponse
}

function hasBlockReason(payload: Record<string, unknown>): boolean {
  const feedback = payload['promptFeedback']
  return isRecord(feedback) && typeof feedback['blockReason'] === 'string'
}

function isImagePayload(payload: unknown): payload is Record<string, unknown> {
  if (!isRecord(payload)) {
    return false
  }
  return Array.isArray(payload['candidates']) || hasBlockReason(payload)
}

/**
 * Disclosure policy for one property of an error payload. Returns the
 * replacement text when the value must not be disclosed, or `undefined` when
 * the value may be traversed normally.
 */
function redactEntry(key: string, value: unknown): string | undefined {
  if (/apikey|token|secret|password|credential/i.test(key)) {
    return '[REDACTED]'
  }
  if (key === 'data' && typeof value === 'string' && value.length > 100) {
    return `[base64 data, length: ${value.length}]`
  }
  return undefined
}

/** Long strings are reported by length only, so payload text is never echoed. */
function elideLongString(value: unknown): unknown {
  return typeof value === 'string' && value.length > 100
    ? `[string length: ${value.length}]`
    : value
}

/**
 * Reduce an arbitrary payload to a shape safe to attach to an error context:
 * bounded depth, bounded array length, redacted credentials and elided blobs.
 */
function analyzeResponseStructure(obj: unknown): Record<string, unknown> {
  if (!isRecord(obj)) {
    return { type: typeof obj, value: obj }
  }

  const seen = new WeakSet()

  const sanitize = (value: unknown, depth = 0): unknown => {
    if (depth > 3) {
      return '[max depth]'
    }
    if (value === null || value === undefined) {
      return value
    }
    if (typeof value !== 'object') {
      return elideLongString(value)
    }
    if (seen.has(value)) {
      return '[circular]'
    }
    seen.add(value)

    if (Array.isArray(value)) {
      return value.slice(0, 3).map((entry) => sanitize(entry, depth + 1))
    }

    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      result[key] = redactEntry(key, entry) ?? sanitize(entry, depth + 1)
    }
    return result
  }

  const sanitized = sanitize(obj)
  return isRecord(sanitized) ? sanitized : { type: typeof obj }
}

function formatHarmCategory(category: string): string {
  return category
    .replace('HARM_CATEGORY_', '')
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

function formatSafetyRatings(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .map((rating) => {
      const category = isRecord(rating) ? readString(rating, 'category') : undefined
      const blocked = isRecord(rating) && rating['blocked'] ? 'BLOCKED' : 'ALLOWED'
      return `${formatHarmCategory(category ?? '')} (${blocked})`
    })
    .join(', ')
}

function upstreamErrorFrom(rawResponse: unknown): GeminiAPIError | undefined {
  if (!isRecord(rawResponse) || !isRecord(rawResponse['error'])) {
    return undefined
  }
  const error = rawResponse['error']
  const status = error['status']
  return new GeminiAPIError('Gemini API returned an error response', {
    provider: 'gemini',
    stage: 'api_error',
    upstreamMessage: readString(error, 'message') ?? 'Unknown error',
    statusCode: typeof status === 'number' ? status : undefined,
    rawErrorCode: error['code'],
    rawDetails: error['details'] || analyzeResponseStructure(rawResponse),
  })
}

function blockedPromptError(payload: Record<string, unknown>): GeminiAPIError | undefined {
  const feedback = payload['promptFeedback']
  if (!isRecord(feedback)) {
    return undefined
  }
  const blockReason = feedback['blockReason']

  if (blockReason === 'SAFETY') {
    return new GeminiAPIError('Image generation blocked for safety reasons', {
      stage: 'prompt_analysis',
      blockReason,
      suggestion: 'Rephrase your prompt to avoid potentially sensitive content',
    })
  }

  if (blockReason === 'OTHER' || blockReason === 'PROHIBITED_CONTENT') {
    return new GeminiAPIError('Image generation blocked due to prohibited content', {
      stage: 'prompt_analysis',
      blockReason,
      suggestion: 'Remove any prohibited content from your prompt and try again',
    })
  }

  return undefined
}

function stoppedGenerationError(candidate: Record<string, unknown>): GeminiAPIError | undefined {
  const finishReason = readString(candidate, 'finishReason')
  if (!finishReason) {
    return undefined
  }

  if (finishReason === 'IMAGE_SAFETY') {
    return new GeminiAPIError('Image generation stopped for safety reasons', {
      finishReason,
      stage: 'generation_stopped',
      suggestion: 'Modify your prompt to avoid potentially sensitive content',
      safetyRatings: formatSafetyRatings(candidate['safetyRatings']),
    })
  }

  if (finishReason === 'MAX_TOKENS') {
    return new GeminiAPIError('Maximum token limit reached during generation', {
      finishReason,
      stage: 'generation_stopped',
      suggestion: 'Try using a shorter or simpler prompt',
    })
  }

  return undefined
}

interface ContentPart {
  inlineData?: { data: string; mimeType?: string }
  text?: string
}

function readContentParts(candidate: Record<string, unknown>): ContentPart[] | undefined {
  const content = candidate['content']
  if (!isRecord(content) || !Array.isArray(content['parts'])) {
    return undefined
  }
  return content['parts'].map((part): ContentPart => {
    if (!isRecord(part)) {
      return {}
    }
    const inlineData = part['inlineData']
    const data = isRecord(inlineData) ? readString(inlineData, 'data') : undefined
    const mimeType = isRecord(inlineData) ? readString(inlineData, 'mimeType') : undefined
    const text = readString(part, 'text')
    const contentPart: ContentPart = {}
    if (data !== undefined) {
      contentPart.inlineData = mimeType === undefined ? { data } : { data, mimeType }
    }
    if (text !== undefined) {
      contentPart.text = text
    }
    return contentPart
  })
}

/**
 * An upstream `error` object is reported as such; anything else is reported as
 * an unrecognized response shape.
 */
function invalidPayloadError(rawResponse: unknown): GeminiAPIError {
  return (
    upstreamErrorFrom(rawResponse) ??
    new GeminiAPIError('Invalid response structure from Gemini API', {
      message: 'The API returned an unexpected response format',
      responseStructure: analyzeResponseStructure(rawResponse),
      stage: 'response_validation',
      suggestion: 'Check if the API endpoint or model configuration is correct',
    })
  )
}

/**
 * Convert an untrusted Gemini `generateContent` result into image bytes or a
 * classified error. Only sanitized details reach the error context.
 */
export function interpretGeminiImageResponse(
  rawResponse: unknown
): Result<GeminiImagePayload, GeminiAPIError> {
  const payload = unwrapResponsePayload(rawResponse)

  if (!isImagePayload(payload)) {
    return Err(invalidPayloadError(rawResponse))
  }

  const blockedError = blockedPromptError(payload)
  if (blockedError) {
    return Err(blockedError)
  }

  const candidates = payload['candidates']
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return Err(
      new GeminiAPIError('No image generated: Content may have been filtered', {
        stage: 'generation',
        candidatesCount: 0,
        suggestion: 'Try rephrasing your prompt to avoid potentially sensitive content',
      })
    )
  }

  const candidate = candidates[0]
  const parts = isRecord(candidate) ? readContentParts(candidate) : undefined
  if (!isRecord(candidate) || !parts) {
    return Err(
      new GeminiAPIError('No valid content in response', {
        stage: 'candidate_extraction',
        suggestion: 'The API response was incomplete. Please try again',
      })
    )
  }

  const stoppedError = stoppedGenerationError(candidate)
  if (stoppedError) {
    return Err(stoppedError)
  }

  if (parts.length === 0) {
    return Err(
      new GeminiAPIError('No content parts in response', {
        stage: 'content_extraction',
        suggestion: 'The generation was incomplete. Please try again',
      })
    )
  }

  const imagePart = parts.find((part) => part.inlineData?.data)
  if (!imagePart?.inlineData) {
    const textPart = parts.find((part) => part.text)
    return Err(
      new GeminiAPIError('Image generation failed due to content filtering', {
        reason: textPart?.text || 'Image generation failed',
        stage: 'image_extraction',
        suggestion:
          'The prompt was blocked by safety filters. Try rephrasing your prompt to avoid potentially sensitive content.',
      })
    )
  }

  const imageData = Buffer.from(imagePart.inlineData.data, 'base64')
  if (imageData.length === 0) {
    return Err(
      new GeminiAPIError('Gemini returned empty image data', {
        provider: 'gemini',
        stage: 'image_extraction',
        suggestion: 'Retry the request; the provider returned no image bytes',
      })
    )
  }

  const modelVersion = readString(payload, 'modelVersion')
  const responseId = readString(payload, 'responseId')
  const result: GeminiImagePayload = {
    imageData,
    mimeType: normalizeMimeType(imagePart.inlineData.mimeType || DEFAULT_MIME_TYPE),
  }
  if (modelVersion !== undefined) {
    result.modelVersion = modelVersion
  }
  if (responseId !== undefined) {
    result.responseId = responseId
  }
  return Ok(result)
}
