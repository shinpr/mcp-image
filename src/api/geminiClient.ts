import type { GenerateContentConfig, GenerateContentParameters, ImageConfig } from '@google/genai'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { ImageQuality } from '../types/mcp.js'
import { GEMINI_MODELS } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { GeminiAPIError, type ImageAPIError, NetworkError } from '../utils/errors.js'
import { extractStatusCode, isNetworkError } from './errorClassification.js'
import { interpretGeminiImageResponse } from './geminiImageResponse.js'
import { buildGeminiContents, validateGeminiRequestSize } from './geminiRequest.js'
import type {
  GeneratedImageResult,
  ImageApiParams,
  ImageClient,
  ImageGenerationMetadata,
} from './imageClient.js'
import { validateInputImages } from './inputImages.js'

interface GeminiClientInstance {
  models: {
    // Request is typed against the SDK contract so misplaced parameters (e.g.
    // tools nested under config) are caught at compile time. The response is
    // validated at runtime by `interpretGeminiImageResponse`, so it stays
    // intentionally `unknown`.
    generateContent(params: GenerateContentParameters): Promise<unknown>
  }
}

const THINKING_LEVEL_BY_QUALITY: Partial<Record<ImageQuality, ThinkingLevel>> = {
  fast: ThinkingLevel.MEDIUM,
  balanced: ThinkingLevel.HIGH,
}

class GeminiClientImpl implements ImageClient {
  constructor(
    private readonly genai: GeminiClientInstance,
    private readonly defaultQuality: ImageQuality = 'fast'
  ) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | ImageAPIError | NetworkError>> {
    try {
      const inputResult = validateInputImages('gemini', params.inputImages)
      if (!inputResult.success) {
        return inputResult
      }
      const requestContent = buildGeminiContents(params.prompt, params.inputImages)

      const effectiveQuality = params.quality ?? this.defaultQuality

      const modelName = effectiveQuality === 'quality' ? GEMINI_MODELS.PRO : GEMINI_MODELS.FLASH
      const thinkingLevel = THINKING_LEVEL_BY_QUALITY[effectiveQuality]

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
        ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }),
        // Google Search grounding (web + image search) must live under config.tools;
        // a top-level `tools` field is not part of the generateContent contract.
        ...(params.useGoogleSearch && {
          tools: [{ googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } } }],
        }),
      }

      const sizeResult = validateGeminiRequestSize(requestContent, config)
      if (!sizeResult.success) {
        return sizeResult
      }
      const rawResponse = await this.genai.models.generateContent({
        model: modelName,
        contents: requestContent,
        config,
      })

      const interpreted = interpretGeminiImageResponse(rawResponse)
      if (!interpreted.success) {
        return Err(interpreted.error)
      }
      const { imageData, mimeType, modelVersion, responseId } = interpreted.data

      const metadata: ImageGenerationMetadata = {
        model: modelName,
        prompt: params.prompt,
        mimeType,
        timestamp: new Date(),
        inputImageProvided: (params.inputImages?.length ?? 0) > 0,
        ...(modelVersion && { modelVersion }),
        ...(responseId && { responseId }),
      }

      return Ok({
        imageData,
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
    const genai: GeminiClientInstance = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    })
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
