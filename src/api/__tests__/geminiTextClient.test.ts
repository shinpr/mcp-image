/**
 * Unit tests for GeminiTextClient - Gemini 2.0 Flash integration
 * Tests public API behaviors only, with external dependencies mocked
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { createGeminiTextClient } from '../geminiTextClient'
import type { GeminiTextClient, GenerationConfig } from '../geminiTextClient'

// Mock GoogleGenAI external dependency
const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}))

mockGenerateContent.mockImplementation((params: { contents: string }) => {
  const prompt = typeof params.contents === 'string' ? params.contents : ''

  // Handle error scenarios based on prompt content
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

  // Default successful response matching the API v1.17.0+ structure
  return Promise.resolve({
    text: 'Enhanced: test prompt with professional lighting, 85mm lens, dramatic composition',
    response: {
      text: () =>
        'Enhanced: test prompt with professional lighting, 85mm lens, dramatic composition',
    },
  })
})

describe('GeminiTextClient', () => {
  let config: Config
  let client: GeminiTextClient

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    config = {
      geminiApiKey: 'test-api-key',
      imageOutputDir: './test-output',
      apiTimeout: 30000,
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

    it('should handle different generation configurations', async () => {
      const lowTempResult = await client.generateText('test prompt', {
        temperature: 0.1,
      })
      const highTempResult = await client.generateText('test prompt', {
        temperature: 0.9,
      })

      expect(lowTempResult.success).toBe(true)
      expect(highTempResult.success).toBe(true)

      if (lowTempResult.success && highTempResult.success) {
        expect(typeof lowTempResult.data).toBe('string')
        expect(typeof highTempResult.data).toBe('string')
      }
    })

    it('should validate connection successfully', async () => {
      const result = await client.validateConnection()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
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
        expect(result.error.message.toLowerCase()).toContain('rate limit')
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
