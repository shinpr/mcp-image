import OpenAI from 'openai'
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE, normalizeMimeType } from '../utils/mimeUtils.js'
import { extractStatusCode, isNetworkError } from './errorClassification.js'
import type { GenerationConfig, TextClient } from './textClient.js'

const MODELARK_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
const SEEDREAM_TEXT_MODEL = 'seed-2-0-lite-260428'
const DEFAULT_TEXT_TIMEOUT = 30000

type SeedreamTextRequest = ResponseCreateParamsNonStreaming &
  Readonly<{
    model: typeof SEEDREAM_TEXT_MODEL
    thinking: Readonly<{
      type: 'disabled'
    }>
  }>

class SeedreamTextClientImpl implements TextClient {
  private readonly client: OpenAI

  constructor(config: Config) {
    this.client = new OpenAI({
      apiKey: config.arkApiKey,
      baseURL: MODELARK_BASE_URL,
    })
  }

  async generateText(
    prompt: string,
    config: GenerationConfig = {}
  ): Promise<Result<string, ImageAPIError | NetworkError>> {
    const validationResult = this.validatePromptInput(prompt)
    if (!validationResult.success) {
      return validationResult
    }

    const request: SeedreamTextRequest = {
      model: SEEDREAM_TEXT_MODEL,
      input: this.buildInput(prompt, config),
      ...(config.systemInstruction && { instructions: config.systemInstruction }),
      max_output_tokens: config.maxTokens ?? 8192,
      temperature: config.temperature ?? 0.7,
      top_p: config.topP ?? 0.95,
      thinking: { type: 'disabled' },
    }

    try {
      const response = await this.client.responses.create(request, {
        signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TEXT_TIMEOUT),
      })
      const responseText = response.output_text

      if (!responseText || responseText.trim().length === 0) {
        return Err(
          new ImageAPIError(
            'Failed during Seedream text generation',
            'The text provider returned an empty response'
          )
        )
      }

      return Ok(responseText)
    } catch (error) {
      return this.handleError(error, 'text generation')
    }
  }

  async validateConnection(): Promise<Result<boolean, ImageAPIError | NetworkError>> {
    try {
      if (!this.client.responses) {
        return Err(
          new ImageAPIError(
            'Failed to access Seedream Responses API',
            'Check your ARK_API_KEY configuration'
          )
        )
      }

      return Ok(true)
    } catch (error) {
      return this.handleError(error, 'connection validation')
    }
  }

  private buildInput(prompt: string, config: GenerationConfig) {
    if (!config.inputImage) {
      return prompt
    }

    const mimeType = normalizeMimeType(config.inputImageMimeType ?? DEFAULT_MIME_TYPE)

    return [
      {
        role: 'user' as const,
        content: [
          {
            type: 'input_text' as const,
            text: prompt,
          },
          {
            type: 'input_image' as const,
            image_url: `data:${mimeType};base64,${config.inputImage}`,
            detail: 'auto' as const,
          },
        ],
      },
    ]
  }

  private handleError(error: unknown, stage: string): Result<never, ImageAPIError | NetworkError> {
    if (this.isNetworkFailure(error)) {
      const timedOut = this.isAbortFailure(error)
      return Err(
        new NetworkError(`${timedOut ? 'Timeout' : 'Network error'} during Seedream ${stage}`, {
          provider: 'seedream',
          stage,
          failureType: timedOut ? 'timeout' : 'network',
        })
      )
    }

    const statusCode = extractStatusCode(error)
    return Err(
      new ImageAPIError(
        `Failed during Seedream ${stage}`,
        {
          provider: 'seedream',
          stage,
          ...(statusCode !== undefined && { upstreamStatus: statusCode }),
          suggestion: this.getAPIErrorSuggestion(statusCode),
        },
        statusCode
      )
    )
  }

  private isNetworkFailure(error: unknown): boolean {
    let current = error

    for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
      if (isNetworkError(current) || this.isAbortFailure(current)) {
        return true
      }
      current = Reflect.get(current, 'cause')
    }

    return false
  }

  private isAbortFailure(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.constructor.name === 'APIUserAbortError' ||
        error.message === 'Request was aborted.')
    )
  }

  private getAPIErrorSuggestion(statusCode: number | undefined): string {
    if (statusCode === 401 || statusCode === 403) {
      return 'Check that ARK_API_KEY is valid and can access the pinned Seedream text model'
    }

    if (statusCode === 429) {
      return 'Wait before retrying or check the ModelArk quota for this account'
    }

    if (statusCode !== undefined && statusCode >= 500) {
      return 'The text provider is temporarily unavailable; retry later'
    }

    return 'Check ModelArk text API configuration and try again'
  }

  private validatePromptInput(prompt: string): Result<true, ImageAPIError> {
    if (!prompt || prompt.trim().length === 0) {
      return Err(new ImageAPIError('Empty prompt provided', 'Please provide a non-empty prompt'))
    }

    if (prompt.length > 100000) {
      return Err(new ImageAPIError('Prompt too long', 'Please provide a shorter prompt'))
    }

    return Ok(true)
  }
}

export function createSeedreamTextClient(config: Config): Result<TextClient, ImageAPIError> {
  try {
    return Ok(new SeedreamTextClientImpl(config))
  } catch {
    return Err(
      new ImageAPIError(
        'Failed to initialize Seedream text client',
        'Verify ARK_API_KEY and the installed OpenAI SDK configuration'
      )
    )
  }
}
