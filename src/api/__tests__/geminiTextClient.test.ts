import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import type { GeminiTextClient } from '../geminiTextClient'
import { createGeminiTextClient } from '../geminiTextClient'

const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    }
  },
}))

mockGenerateContent.mockImplementation((params: { contents: string }) => {
  const prompt = typeof params.contents === 'string' ? params.contents : ''

  if (prompt.includes('network error')) {
    throw new Error('ECONNRESET Network error')
  }
  if (prompt.includes('rate limit')) {
    throw new Error('Rate limit exceeded')
  }
  if (prompt.includes('quota')) {
    throw new Error('Quota exceeded')
  }
  if (prompt.includes('degradation')) {
    throw new Error('Service temporarily unavailable')
  }

  return Promise.resolve({
    text: 'Enhanced: test prompt with professional lighting, 85mm lens, dramatic composition',
  })
})

describe('GeminiTextClient', () => {
  let config: Config
  let client: GeminiTextClient

  beforeEach(() => {
    vi.clearAllMocks()

    config = {
      imageProvider: 'gemini',
      geminiApiKey: 'test-api-key',
      openaiApiKey: '',
      imageOutputDir: './test-output',
      skipPromptEnhancement: false,
      imageQuality: 'fast',
    }

    const clientResult = createGeminiTextClient(config)
    if (clientResult.success) {
      client = clientResult.data
    } else {
      throw new Error('Failed to create test client')
    }
  })

  describe('Public API Contract', () => {
    it('should generate text with proper response format', async () => {
      const result = await client.generateText('create a logo')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(typeof result.data).toBe('string')
        expect(result.data).toContain('Enhanced')
        expect(result.data.length).toBeGreaterThan(0)
      }
    })

    it('passes generation configuration to the Gemini SDK', async () => {
      const result = await client.generateText('test prompt', {
        temperature: 0.1,
        maxTokens: 384,
        topP: 0.8,
        topK: 20,
      })

      expect(result.success).toBe(true)
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'test prompt',
          config: expect.objectContaining({
            temperature: 0.1,
            maxOutputTokens: 384,
            topP: 0.8,
            topK: 20,
          }),
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const result = await client.generateText('network error')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('Network error')
      }
    })

    it('should handle rate limit errors', async () => {
      const result = await client.generateText('rate limit')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        const upstream = String(result.error.context?.upstreamMessage ?? '').toLowerCase()
        expect(upstream).toContain('rate limit')
      }
    })

    it('should handle quota exceeded scenarios', async () => {
      const result = await client.generateText('quota')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.suggestion.toLowerCase()).toContain('quota')
      }
    })

    it('should handle service degradation', async () => {
      const result = await client.generateText('degradation')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message.toLowerCase()).toContain('failed')
        expect(result.error.suggestion).toBeTruthy()
      }
    })
  })
})
