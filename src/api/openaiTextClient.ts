/**
 * OpenAI text client for structured prompt enhancement.
 */

import OpenAI from 'openai'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE, normalizeMimeType } from '../utils/mimeUtils.js'
import { extractStatusCode, isNetworkError } from './errorClassification.js'
import type { GenerationConfig, TextClient } from './textClient.js'

interface OpenAITextResponse {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

class OpenAITextClientImpl implements TextClient {
  private readonly client: OpenAI
  private readonly modelName: string

  constructor(config: Config) {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    })
    this.modelName = config.openaiTextModel
  }

  async generateText(
    prompt: string,
    config: GenerationConfig = {}
  ): Promise<Result<string, ImageAPIError | NetworkError>> {
    const validationResult = this.validatePromptInput(prompt)
    if (!validationResult.success) {
      return validationResult
    }

    const timeout = config.timeout ?? 15000

    try {
      const response = (await this.client.responses.create(
        {
          model: this.modelName,
          input: this.buildInput(prompt, config),
          ...(config.systemInstruction && { instructions: config.systemInstruction }),
          max_output_tokens: config.maxTokens ?? 8192,
          temperature: config.temperature ?? 0.7,
        },
        { signal: AbortSignal.timeout(timeout) }
      )) as OpenAITextResponse

      const responseText = this.extractResponseText(response)
      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from OpenAI text API')
      }

      return Ok(responseText.trim())
    } catch (error) {
      return this.handleError(error, 'text generation')
    }
  }

  async validateConnection(): Promise<Result<boolean, ImageAPIError | NetworkError>> {
    try {
      if (!this.client.responses) {
        return Err(
          new ImageAPIError(
            'Failed to access OpenAI Responses API',
            'Check your OPENAI_API_KEY configuration'
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
      return 'Check OPENAI_TEXT_MODEL and ensure the model is available to your account'
    }

    return 'Check OpenAI API configuration and try again'
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

/**
 * Creates a new OpenAI text client for prompt enhancement.
 */
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
