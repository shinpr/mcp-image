import { GoogleGenAI } from '@google/genai'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { GeminiAPIError, NetworkError } from '../utils/errors.js'
import { DEFAULT_MIME_TYPE } from '../utils/mimeUtils.js'
import { isNetworkError } from './errorClassification.js'
import { type GenerationConfig, MAX_TEXT_PROMPT_LENGTH, type TextClient } from './textClient.js'

export type GeminiTextClient = TextClient

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.7,
  maxTokens: 8192,
  timeout: 15000,
} as const

interface GeminiAIInstance {
  models: {
    generateContent(params: {
      model: string
      contents:
        | string
        | Array<{
            role?: string
            parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>
          }>
      config?: {
        systemInstruction?: string
        temperature?: number
        maxOutputTokens?: number
        topP?: number
        topK?: number
        thinkingConfig?: {
          thinkingBudget: number
        }
        abortSignal?: AbortSignal
      }
    }): Promise<{
      text: string
      candidates?: Array<{ finishReason?: string }>
      response?: {
        text?: () => string
        candidates?: Array<{
          finishReason?: string
          content: {
            parts: Array<{ text: string }>
          }
        }>
      }
    }>
  }
}

class GeminiTextClientImpl implements GeminiTextClient {
  private readonly modelName = 'gemini-2.5-flash'
  private readonly genai: GeminiAIInstance

  constructor(config: Config) {
    this.genai = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    }) as unknown as GeminiAIInstance
  }

  async generateText(
    prompt: string,
    config: GenerationConfig = {}
  ): Promise<Result<string, GeminiAPIError | NetworkError>> {
    const mergedConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
    }

    const validationResult = this.validatePromptInput(prompt)
    if (!validationResult.success) {
      return validationResult
    }

    try {
      const generatedText = await this.callGeminiAPI(prompt, mergedConfig)
      return Ok(generatedText)
    } catch (error) {
      return this.handleError(error, 'text generation')
    }
  }

  private async callGeminiAPI(prompt: string, config: GenerationConfig): Promise<string> {
    try {
      const timeoutSignal = AbortSignal.timeout(config.timeout || 15000)
      let contents:
        | string
        | Array<{
            role?: string
            parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>
          }>

      if (config.inputImage) {
        contents = [
          {
            parts: [
              {
                inlineData: {
                  data: config.inputImage,
                  mimeType: config.inputImageMimeType ?? DEFAULT_MIME_TYPE,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ]
      } else {
        contents = prompt
      }

      const response = await this.genai.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          ...(config.systemInstruction !== undefined && {
            systemInstruction: config.systemInstruction,
          }),
          temperature: config.temperature || 0.7,
          maxOutputTokens: config.maxTokens || 8192,
          topP: config.topP ?? 0.95,
          topK: config.topK ?? 40,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          abortSignal: config.signal
            ? AbortSignal.any([config.signal, timeoutSignal])
            : timeoutSignal,
        },
      })

      const candidate = response.candidates?.[0] ?? response.response?.candidates?.[0]
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error('Gemini text generation was truncated at the token limit')
      }

      let responseText: string
      if (typeof response.text === 'string') {
        responseText = response.text
      } else if (response.response?.text && typeof response.response.text === 'function') {
        responseText = response.response.text()
      } else if (response.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.response.candidates[0].content.parts[0].text
      } else {
        throw new Error('Unable to extract text from API response')
      }

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from Gemini API')
      }

      return responseText.trim()
    } catch (error) {
      throw new Error(
        `Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private handleError(
    error: unknown,
    context: string
  ): Result<never, GeminiAPIError | NetworkError> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (isNetworkError(error)) {
      return Err(
        new NetworkError(
          `Network error during Gemini ${context}`,
          'Check your internet connection and try again'
        )
      )
    }

    if (this.isAPIError(error)) {
      return Err(
        new GeminiAPIError(`Failed during Gemini ${context}`, {
          provider: 'gemini',
          stage: context,
          upstreamMessage: errorMessage,
          suggestion: this.getAPIErrorSuggestion(errorMessage),
        })
      )
    }

    return Err(
      new GeminiAPIError(`Failed during Gemini ${context}`, {
        provider: 'gemini',
        stage: context,
        upstreamMessage: errorMessage,
        suggestion: 'Check your API configuration and try again',
      })
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

  private validatePromptInput(prompt: string): Result<true, GeminiAPIError> {
    if (!prompt || prompt.trim().length === 0) {
      return Err(
        new GeminiAPIError(
          'Empty prompt provided',
          'Please provide a non-empty prompt for generation'
        )
      )
    }

    if (prompt.length > MAX_TEXT_PROMPT_LENGTH) {
      return Err(
        new GeminiAPIError(
          'Prompt too long',
          `Please provide a shorter prompt (under ${MAX_TEXT_PROMPT_LENGTH.toLocaleString('en-US')} characters)`
        )
      )
    }

    return Ok(true)
  }
}

export function createGeminiTextClient(config: Config): Result<GeminiTextClient, GeminiAPIError> {
  try {
    return Ok(new GeminiTextClientImpl(config))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Err(
      new GeminiAPIError(
        `Failed to initialize Gemini Text client: ${errorMessage}`,
        'Verify your GEMINI_API_KEY is valid and the @google/genai package is properly installed'
      )
    )
  }
}
