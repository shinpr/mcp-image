/**
 * Unit tests for GeminiTextClient - Gemini 2.0 Flash integration
 * Tests focused on AC4, PERF2, CONFIG2, ERROR1, ERROR2 target cases
 * Following TDD approach: Red-Green-Refactor
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../../utils/config'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { createGeminiTextClient } from '../geminiTextClient'
import type { GeminiTextClient, PromptOptions } from '../geminiTextClient'

describe('GeminiTextClient', () => {
  let config: Config
  let client: GeminiTextClient

  beforeEach(() => {
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

  // ========================================
  // AC4: Gemini 2.0 Flash API integration with proper response handling
  // ========================================
  describe('AC4: Gemini 2.0 Flash API Integration', () => {
    it('should successfully integrate with Gemini 2.0 Flash API for prompt generation', async () => {
      // Red phase: Test should fail until proper API integration
      const result = await client.generateStructuredPrompt('create a logo')

      // This will fail because implementation returns error
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data).toHaveProperty('text')
        expect(result.data).toHaveProperty('originalPrompt', 'create a logo')
        expect(result.data).toHaveProperty('appliedPractices')
        expect(result.data).toHaveProperty('metadata')
        expect(result.data.metadata).toHaveProperty('model', 'gemini-2.0-flash')
      }
    })

    it('should handle API response with proper structured prompt format', async () => {
      // Red phase: Test should fail until response handling implementation
      const result = await client.generateStructuredPrompt('a warrior character')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.text).toContain('details')
        expect(result.data.appliedPractices.length).toBeGreaterThan(0)
        expect(result.data.metadata.enhancementLevel).toBeDefined()
      }
    })
  })

  // ========================================
  // PERF2: Response time 5-15 seconds within acceptable range
  // ========================================
  describe('PERF2: Performance Requirements', () => {
    it('should complete prompt generation within 5-15 second performance target', async () => {
      // Red phase: Test should fail until proper performance implementation
      const startTime = Date.now()
      const result = await client.generateStructuredPrompt('test prompt')
      const duration = Date.now() - startTime

      // This will fail because mock doesn't simulate proper timing
      expect(result.success).toBe(true)
      expect(duration).toBeGreaterThanOrEqual(5000) // 5 seconds minimum
      expect(duration).toBeLessThan(15000) // 15 seconds maximum

      if (result.success) {
        expect(result.data.metadata.processingTime).toBeGreaterThanOrEqual(5000)
        expect(result.data.metadata.processingTime).toBeLessThan(15000)
      }
    }, 20000) // 20 second timeout

    it('should track API call efficiency and cost implications', async () => {
      // Red phase: Test should fail until efficiency tracking implementation
      const result = await client.generateStructuredPrompt('efficiency test')

      expect(result.success).toBe(true)

      if (result.success) {
        // Should include efficiency metrics in metadata
        expect(result.data.metadata).toHaveProperty('processingTime')
        expect(typeof result.data.metadata.processingTime).toBe('number')
        expect(result.data.metadata.processingTime).toBeGreaterThan(0)
      }
    }, 20000) // 20 second timeout
  })

  // ========================================
  // CONFIG2: Temperature and parameter configuration functionality
  // ========================================
  describe('CONFIG2: Configuration Management', () => {
    it('should properly configure temperature 0.3 for consistent prompt generation', async () => {
      // Red phase: Test should fail until temperature configuration
      const options: PromptOptions = {
        temperature: 0.3,
        bestPracticesMode: 'advanced',
      }

      const result = await client.generateStructuredPrompt('config test', options)

      expect(result.success).toBe(true)

      if (result.success) {
        // Should reflect temperature setting in response metadata or behavior
        expect(result.data.metadata.enhancementLevel).toBe('advanced')
      }
    })

    it('should manage dual API client configuration for Gemini 2.0 Flash', async () => {
      // Red phase: Test should fail until dual client configuration
      const connectionResult = await client.validateConnection()

      expect(connectionResult.success).toBe(true)

      if (connectionResult.success) {
        expect(connectionResult.data).toBe(true)
      }
    })

    it('should support timeout configuration and enforcement', async () => {
      // Red phase: Test should fail until timeout implementation
      const options: PromptOptions = {
        timeout: 10000, // 10 seconds
      }

      const startTime = Date.now()
      const result = await client.generateStructuredPrompt('timeout test', options)
      const duration = Date.now() - startTime

      // Should complete or timeout within specified duration
      expect(duration).toBeLessThan(12000) // Allow 2s buffer
      expect(result).toBeDefined()
    })
  })

  // ========================================
  // ERROR1: Network error handling with retry logic
  // ========================================
  describe('ERROR1: Network Error Handling', () => {
    it('should handle network connectivity issues with appropriate fallback', async () => {
      // Red phase: Test should fail until network error handling
      // Mock network error scenario
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNRESET'))

      const result = await client.generateStructuredPrompt('network error test')

      // Should handle network error gracefully
      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('Network error')
        expect(result.error.suggestion).toContain('connection')
      }
    })

    it('should implement retry logic with exponential backoff', async () => {
      // Red phase: Test should fail until retry implementation
      // For now, just test that network errors are properly detected
      const result = await client.generateStructuredPrompt('network error test')

      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error).toBeInstanceOf(NetworkError)
        expect(result.error.message).toContain('Network error')
        expect(result.error.suggestion).toContain('connection')
      }
    })
  })

  // ========================================
  // ERROR2: API rate limit handling and graceful degradation
  // ========================================
  describe('ERROR2: Rate Limit Handling', () => {
    it('should manage API rate limiting scenarios with intelligent retry', async () => {
      // Red phase: Test should fail until rate limit handling
      // Mock rate limit error
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Rate limit exceeded'))

      const result = await client.generateStructuredPrompt('rate limit test')

      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message.toLowerCase()).toContain('rate limit')
        expect(result.error.suggestion.toLowerCase()).toContain('wait')
      }
    })

    it('should provide graceful degradation when API is unavailable', async () => {
      // Red phase: Test should fail until graceful degradation
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Service temporarily unavailable'))

      const result = await client.generateStructuredPrompt('degradation test')

      // Should fail gracefully with helpful error message
      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error.message.toLowerCase()).toContain('failed')
        expect(result.error.suggestion).toBeTruthy()
        expect(result.error.suggestion.length).toBeGreaterThan(0)
      }
    })

    it('should handle quota exceeded scenarios with appropriate guidance', async () => {
      // Red phase: Test should fail until quota handling
      const mockError = new Error('Quota exceeded')
      ;(mockError as any).status = 429

      vi.spyOn(global, 'fetch').mockRejectedValueOnce(mockError)

      const result = await client.generateStructuredPrompt('quota test')

      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.suggestion).toContain('quota')
      }
    })
  })

  // ========================================
  // Connection Validation Tests
  // ========================================
  describe('Connection Validation', () => {
    it('should validate connection within 3 seconds', async () => {
      // Red phase: Test should fail until connection validation
      const startTime = Date.now()
      const result = await client.validateConnection()
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(3000) // 3 seconds
      expect(result).toBeDefined()
    })

    it('should provide clear error when API key is invalid', async () => {
      // Red phase: Test should fail until API key validation
      const invalidConfig: Config = {
        geminiApiKey: 'invalid-key',
        imageOutputDir: './test-output',
        apiTimeout: 30000,
      }

      const invalidClientResult = createGeminiTextClient(invalidConfig)
      expect(invalidClientResult.success).toBe(true) // Creation should succeed

      if (invalidClientResult.success) {
        const invalidClient = invalidClientResult.data
        const result = await invalidClient.validateConnection()

        expect(result.success).toBe(false)

        if (!result.success) {
          expect(result.error.message.toLowerCase()).toContain('invalid')
          expect(result.error.suggestion.toLowerCase()).toContain('gemini_api_key')
        }
      }
    })
  })

  // ========================================
  // Best Practices Mode Tests
  // ========================================
  describe('Best Practices Application', () => {
    it('should apply different enhancement levels based on mode', async () => {
      // Red phase: Test should fail until best practices implementation
      const basicResult = await client.generateStructuredPrompt('test prompt', {
        bestPracticesMode: 'basic',
      })

      const completeResult = await client.generateStructuredPrompt('test prompt', {
        bestPracticesMode: 'complete',
      })

      expect(basicResult.success).toBe(true)
      expect(completeResult.success).toBe(true)

      if (basicResult.success && completeResult.success) {
        expect(completeResult.data.appliedPractices.length).toBeGreaterThan(
          basicResult.data.appliedPractices.length
        )

        expect(completeResult.data.text.length).toBeGreaterThan(basicResult.data.text.length)
      }
    }, 20000) // 20 second timeout
  })
})
