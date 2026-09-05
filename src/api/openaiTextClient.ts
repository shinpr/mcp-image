import OpenAI from 'openai'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { extractStatusCode, isNetworkError } from './errorClassification.js'
import {
  buildOpenAICompatibleInput,
  validateOpenAICompatiblePrompt,
} from './openaiCompatibleText.js'
import type { GenerationConfig, TextClient } from './textClient.js'

interface OpenAITextResponse {
  output_text?: string
  status?: 'completed' | 'failed' | 'in_progress' | 'cancelled' | 'queued' | 'incomplete'
  incomplete_details?: {
    reason?: 'max_output_tokens' | 'content_filter'
  } | null
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

const OPENAI_TEXT_MODEL = 'gpt-5.4-nano'

class OpenAITextClientImpl implements TextClient {
  private readonly client: OpenAI
  private readonly modelName = OPENAI_TEXT_MODEL

  constructor(config: Config) {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    })
  }

  async generateText(
    prompt: string,
    config: GenerationConfig = {}
  ): Promise<Result<string, ImageAPIError | NetworkError>> {
    const validationResult = validateOpenAICompatiblePrompt(prompt)
    if (!validationResult.success) {
      return validationResult
    }

    const timeout = config.timeout ?? 30000

    try {
      const timeoutSignal = AbortSignal.timeout(timeout)
      const response = (await this.client.responses.create(
        {
          model: this.modelName,
          input: buildOpenAICompatibleInput(prompt, config),
          ...(config.systemInstruction && { instructions: config.systemInstruction }),
          max_output_tokens: config.maxTokens ?? 8192,
          temperature: config.temperature ?? 0.7,
          top_p: config.topP ?? 0.95,
        },
        { signal: config.signal ? AbortSignal.any([config.signal, timeoutSignal]) : timeoutSignal }
      )) as OpenAITextResponse

      if (response.status === 'incomplete') {
        const reason = response.incomplete_details?.reason ?? 'unknown reason'
        return Err(
          new ImageAPIError(`OpenAI text generation response was incomplete: ${reason}`, {
            provider: 'openai',
            stage: 'text generation',
            suggestion: 'Use the original prompt or increase the prompt generation token limit',
          })
        )
      }

      const responseText = this.extractResponseText(response)
      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from OpenAI text API')
      }

      return Ok(responseText.trim())
    } catch (error) {
      return this.handleError(error, 'text generation')
    }
  }

  private extractResponseText(response: OpenAITextResponse): string {
    if (typeof response.output_text === 'string') {
      return response.output_text
    }

    const textParts =
      response.output?.flatMap((item) =>
        item.content
          ?.filter((content) => content.type === 'output_text' && typeof content.text === 'string')
          .map((content) => content.text ?? '')
      ) ?? []

    return textParts.join('')
  }

  private handleError(
    error: unknown,
    context: string
  ): Result<never, ImageAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (isNetworkError(error)) {
      return Err(
        new NetworkError(
          `Network error during OpenAI ${context}`,
          'Check your internet connection and try again'
        )
      )
    }

    return Err(
      new ImageAPIError(
        `Failed during OpenAI ${context}`,
        {
          provider: 'openai',
          stage: context,
          upstreamMessage: errorMessage,
          suggestion: this.getAPIErrorSuggestion(errorMessage),
        },
        extractStatusCode(error)
      )
    )
  }

  private getAPIErrorSuggestion(errorMessage: string): string {
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit')) {
      return 'You have exceeded your OpenAI API quota or rate limit. Wait before retrying or upgrade your plan'
    }

    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('api key')) {
      return 'Check that your OPENAI_API_KEY is valid'
    }

    if (lowerMessage.includes('model') || lowerMessage.includes('not found')) {
      return `Ensure ${OPENAI_TEXT_MODEL} is available to your OpenAI account`
    }

    return 'Check OpenAI API configuration and try again'
  }
}

export function createOpenAITextClient(config: Config): Result<TextClient, ImageAPIError> {
  try {
    return Ok(new OpenAITextClientImpl(config))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Err(
      new ImageAPIError(
        `Failed to initialize OpenAI Text client: ${errorMessage}`,
        'Verify your OPENAI_API_KEY is valid and the openai package is properly installed'
      )
    )
  }
}
