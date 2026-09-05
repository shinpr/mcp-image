import type {
  Content,
  GenerateContentConfig,
  GenerateContentParameters,
  ImageConfig,
} from '@google/genai'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { ImageQuality } from '../types/mcp.js'
import { GEMINI_MODELS } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { GeminiAPIError, NetworkError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE, normalizeMimeType } from '../utils/mimeUtils.js'
import { extractStatusCode, isNetworkError } from './errorClassification.js'
import type {
  GeneratedImageResult,
  ImageApiParams,
  ImageClient,
  ImageGenerationMetadata,
} from './imageClient.js'

interface ContentPart {
  inlineData?: {
    data: string
    mimeType: string
  }
  text?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: ContentPart[]
    }
    finishReason?: string
  }>
  modelVersion?: string
  responseId?: string
  sdkHttpResponse?: unknown
  usageMetadata?: unknown
}

interface GeminiClientInstance {
  models: {
    // Request is typed against the SDK contract so misplaced parameters (e.g.
    // tools nested under config) are caught at compile time. The response is
    // validated at runtime with type guards, so it stays intentionally `unknown`.
    generateContent(params: GenerateContentParameters): Promise<unknown>
  }
}

function analyzeResponseStructure(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') {
    return { type: typeof obj, value: obj }
  }

  const seen = new WeakSet()

  const sanitize = (value: unknown, depth = 0): unknown => {
    if (depth > 3) return '[max depth]'

    if (value === null || value === undefined) return value
    if (typeof value !== 'object')
      return typeof value === 'string' && value.length > 100
        ? `[string length: ${value.length}]`
        : value

    if (seen.has(value)) return '[circular]'
    seen.add(value)

    if (Array.isArray(value)) {
      return value.slice(0, 3).map((v) => sanitize(v, depth + 1))
    }

    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(record)) {
      if (/apikey|token|secret|password|credential/i.test(key)) {
        result[key] = '[REDACTED]'
      } else if (key === 'data' && typeof val === 'string' && val.length > 100) {
        result[key] = `[base64 data, length: ${val.length}]`
      } else {
        result[key] = sanitize(val, depth + 1)
      }
    }

    return result
  }

  return sanitize(obj) as Record<string, unknown>
}

function isGeminiResponse(obj: unknown): obj is GeminiResponse {
  if (!obj || typeof obj !== 'object') return false
  const response = obj as Record<string, unknown>

  if ('response' in response && response['response'] && typeof response['response'] === 'object') {
    return isGeminiResponse(response['response'])
  }

  const feedback = response['promptFeedback']
  return (
    Array.isArray(response['candidates']) ||
    (typeof feedback === 'object' &&
      feedback !== null &&
      'blockReason' in feedback &&
      typeof feedback.blockReason === 'string')
  )
}

class GeminiClientImpl implements ImageClient {
  constructor(
    private readonly genai: GeminiClientInstance,
    private readonly defaultQuality: ImageQuality = 'fast'
  ) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | NetworkError>> {
    try {
      const requestContent: Content[] = []

      if (params.inputImage) {
        requestContent.push({
          parts: [
            {
              inlineData: {
                data: params.inputImage,
                mimeType: params.inputImageMimeType ?? DEFAULT_MIME_TYPE,
              },
            },
            {
              text: params.prompt,
            },
          ],
        })
      } else {
        requestContent.push({
          parts: [
            {
              text: params.prompt,
            },
          ],
        })
      }

      const effectiveQuality = params.quality ?? this.defaultQuality

      const modelName = effectiveQuality === 'quality' ? GEMINI_MODELS.PRO : GEMINI_MODELS.FLASH

      const imageConfig: ImageConfig = {}
      if (params.aspectRatio) {
        imageConfig.aspectRatio = params.aspectRatio
      }
      if (params.imageSize) {
        imageConfig.imageSize = params.imageSize
      }

      const config: GenerateContentConfig = {
        ...(params.signal && { abortSignal: params.signal }),
        ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
        responseModalities: ['IMAGE'],
        ...(effectiveQuality === 'balanced' && {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        }),
        // Google Search grounding (web + image search) must live under config.tools;
        // a top-level `tools` field is not part of the generateContent contract.
        ...(params.useGoogleSearch && {
          tools: [{ googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } } }],
        }),
      }

      const rawResponse = await this.genai.models.generateContent({
        model: modelName,
        contents: requestContent,
        config,
      })

      if (!isGeminiResponse(rawResponse)) {
        const responseStructure = analyzeResponseStructure(rawResponse)

        const asRecord = rawResponse as Record<string, unknown>
        if (asRecord['error']) {
          const error = asRecord['error'] as Record<string, unknown>
          return Err(
            new GeminiAPIError('Gemini API returned an error response', {
              provider: 'gemini',
              stage: 'api_error',
              upstreamMessage:
                typeof error['message'] === 'string' ? error['message'] : 'Unknown error',
              statusCode: typeof error['status'] === 'number' ? error['status'] : undefined,
              rawErrorCode: error['code'],
              rawDetails: error['details'] || responseStructure,
            })
          )
        }

        return Err(
          new GeminiAPIError('Invalid response structure from Gemini API', {
            message: 'The API returned an unexpected response format',
            responseStructure: responseStructure,
            stage: 'response_validation',
            suggestion: 'Check if the API endpoint or model configuration is correct',
          })
        )
      }

      const responseData = (rawResponse as Record<string, unknown>)['response']
        ? ((rawResponse as Record<string, unknown>)['response'] as GeminiResponse)
        : (rawResponse as GeminiResponse)

      const responseAsRecord = responseData as Record<string, unknown>
      if (responseAsRecord['promptFeedback']) {
        const promptFeedback = responseAsRecord['promptFeedback'] as Record<string, unknown>
        if (promptFeedback['blockReason'] === 'SAFETY') {
          return Err(
            new GeminiAPIError('Image generation blocked for safety reasons', {
              stage: 'prompt_analysis',
              blockReason: promptFeedback['blockReason'],
              suggestion: 'Rephrase your prompt to avoid potentially sensitive content',
            })
          )
        }
        if (
          promptFeedback['blockReason'] === 'OTHER' ||
          promptFeedback['blockReason'] === 'PROHIBITED_CONTENT'
        ) {
          return Err(
            new GeminiAPIError('Image generation blocked due to prohibited content', {
              stage: 'prompt_analysis',
              blockReason: promptFeedback['blockReason'],
              suggestion: 'Remove any prohibited content from your prompt and try again',
            })
          )
        }
      }

      if (!responseData.candidates || responseData.candidates.length === 0) {
        return Err(
          new GeminiAPIError('No image generated: Content may have been filtered', {
            stage: 'generation',
            candidatesCount: 0,
            suggestion: 'Try rephrasing your prompt to avoid potentially sensitive content',
          })
        )
      }

      const candidate = responseData.candidates[0]
      if (!candidate?.content?.parts) {
        return Err(
          new GeminiAPIError('No valid content in response', {
            stage: 'candidate_extraction',
            suggestion: 'The API response was incomplete. Please try again',
          })
        )
      }

      const parts = candidate.content.parts

      if (candidate.finishReason) {
        const finishReason = candidate.finishReason

        if (finishReason === 'IMAGE_SAFETY') {
          return Err(
            new GeminiAPIError('Image generation stopped for safety reasons', {
              finishReason,
              stage: 'generation_stopped',
              suggestion: 'Modify your prompt to avoid potentially sensitive content',
              safetyRatings: (candidate as Record<string, unknown>)['safetyRatings']
                ? (
                    (candidate as Record<string, unknown>)['safetyRatings'] as Record<
                      string,
                      unknown
                    >[]
                  )
                    ?.map((rating: Record<string, unknown>) => {
                      const category = (rating['category'] as string)
                        .replace('HARM_CATEGORY_', '')
                        .split('_')
                        .map((word: string) => word.charAt(0) + word.slice(1).toLowerCase())
                        .join(' ')
                      return `${category} (${rating['blocked'] ? 'BLOCKED' : 'ALLOWED'})`
                    })
                    .join(', ')
                : undefined,
            })
          )
        }

        if (finishReason === 'MAX_TOKENS') {
          return Err(
            new GeminiAPIError('Maximum token limit reached during generation', {
              finishReason,
              stage: 'generation_stopped',
              suggestion: 'Try using a shorter or simpler prompt',
            })
          )
        }
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
      const textPart = parts.find((part) => part.text)

      if (!imagePart?.inlineData) {
        const errorMessage = textPart?.text || 'Image generation failed'

        return Err(
          new GeminiAPIError('Image generation failed due to content filtering', {
            reason: errorMessage,
            stage: 'image_extraction',
            suggestion:
              'The prompt was blocked by safety filters. Try rephrasing your prompt to avoid potentially sensitive content.',
          })
        )
      }

      const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
      if (imageBuffer.length === 0) {
        return Err(
          new GeminiAPIError('Gemini returned empty image data', {
            provider: 'gemini',
            stage: 'image_extraction',
            suggestion: 'Retry the request; the provider returned no image bytes',
          })
        )
      }
      const mimeType = normalizeMimeType(imagePart.inlineData.mimeType || DEFAULT_MIME_TYPE)

      const metadata: ImageGenerationMetadata = {
        model: modelName,
        prompt: params.prompt,
        mimeType,
        timestamp: new Date(),
        inputImageProvided: !!params.inputImage,
        ...(responseData.modelVersion && { modelVersion: responseData.modelVersion }),
        ...(responseData.responseId && { responseId: responseData.responseId }),
      }

      return Ok({
        imageData: imageBuffer,
        metadata,
      })
    } catch (error) {
      return this.handleError(error, params.prompt)
    }
  }

  private handleError(
    error: unknown,
    prompt: string
  ): Result<never, GeminiAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (isNetworkError(error)) {
      return Err(
        new NetworkError(
          'Network error during Gemini image generation',
          'Check your internet connection and try again',
          error instanceof Error ? error : undefined
        )
      )
    }

    if (this.isAPIError(error)) {
      return Err(
        new GeminiAPIError(
          'Failed to generate image with Gemini',
          {
            provider: 'gemini',
            prompt,
            upstreamMessage: errorMessage,
            suggestion: this.getAPIErrorSuggestion(errorMessage),
          },
          extractStatusCode(error)
        )
      )
    }

    return Err(
      new GeminiAPIError(
        'Failed to generate image with Gemini',
        {
          provider: 'gemini',
          prompt,
          upstreamMessage: errorMessage,
          suggestion:
            'Check your API key, quota, and prompt validity. Try again with a different prompt',
        },
        extractStatusCode(error)
      )
    )
  }

  private isAPIError(error: unknown): boolean {
    if (error instanceof Error) {
      const apiErrorKeywords = ['quota', 'rate limit', 'unauthorized', 'forbidden', 'api key']
      return apiErrorKeywords.some((keyword) => error.message.toLowerCase().includes(keyword))
    }
    return false
  }

  private getAPIErrorSuggestion(errorMessage: string): string {
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit')) {
      return 'You have exceeded your API quota or rate limit. Wait before making more requests or upgrade your plan'
    }

    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('api key')) {
      return 'Check that your GEMINI_API_KEY is valid and has the necessary permissions'
    }

    if (lowerMessage.includes('forbidden')) {
      return 'Your API key does not have permission for this operation'
    }

    return 'Check your API configuration and try again'
  }
}

export function createGeminiClient(config: Config): Result<ImageClient, GeminiAPIError> {
  try {
    const genai = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    }) as unknown as GeminiClientInstance
    return Ok(new GeminiClientImpl(genai, config.imageQuality))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Err(
      new GeminiAPIError(
        `Failed to initialize Gemini client: ${errorMessage}`,
        'Verify your GEMINI_API_KEY is valid and the @google/genai package is properly installed'
      )
    )
  }
}
