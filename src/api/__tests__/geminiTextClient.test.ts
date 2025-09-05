/**
 * Unit tests for GeminiTextClient - Gemini 2.0 Flash integration
 * Tests public API behaviors only, with external dependencies mocked
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { createGeminiTextClient } from '../geminiTextClient'
import type { GeminiTextClient, PromptOptions } from '../geminiTextClient'

// Mock GoogleGenAI external dependency
const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}))

// Setup default mock behavior
mockGetGenerativeModel.mockReturnValue({
  generateContent: mockGenerateContent,
})

mockGenerateContent.mockImplementation((prompt: string) => {
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

  // Default successful response
  return Promise.resolve({
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
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent,
    })

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
    it('should generate structured prompt with proper response format', async () => {
      const result = await client.generateStructuredPrompt('create a logo')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data).toHaveProperty('text')
        expect(result.data).toHaveProperty('originalPrompt', 'create a logo')
        expect(result.data).toHaveProperty('appliedPractices')
        expect(result.data).toHaveProperty('metadata')
        expect(result.data.metadata).toHaveProperty('model', 'gemini-2.0-flash')
        expect(result.data.metadata).toHaveProperty('enhancementLevel')
        expect(result.data.metadata).toHaveProperty('processingTime')
        expect(typeof result.data.metadata.processingTime).toBe('number')
      }
    })

    it('should handle different enhancement levels', async () => {
      const basicResult = await client.generateStructuredPrompt('test prompt', {
        bestPracticesMode: 'basic',
      })
      const completeResult = await client.generateStructuredPrompt('test prompt', {
        bestPracticesMode: 'complete',
      })

      expect(basicResult.success).toBe(true)
      expect(completeResult.success).toBe(true)

      if (basicResult.success && completeResult.success) {
        expect(basicResult.data.metadata.enhancementLevel).toBe('basic')
        expect(completeResult.data.metadata.enhancementLevel).toBe('complete')
        expect(completeResult.data.appliedPractices.length).toBeGreaterThan(
          basicResult.data.appliedPractices.length
        )
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
      const result = await client.generateStructuredPrompt('network error')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('Network error')
      }
    })

    it('should handle rate limit errors', async () => {
      const result = await client.generateStructuredPrompt('rate limit')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message.toLowerCase()).toContain('rate limit')
      }
    })

    it('should handle quota exceeded scenarios', async () => {
      const result = await client.generateStructuredPrompt('quota')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.suggestion.toLowerCase()).toContain('quota')
      }
    })

    it('should handle service degradation', async () => {
      const result = await client.generateStructuredPrompt('degradation')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message.toLowerCase()).toContain('failed')
        expect(result.error.suggestion).toBeTruthy()
      }
    })
  })
})
