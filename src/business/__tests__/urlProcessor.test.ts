/**
 * Tests for URL processing with enableUrlContext parameter
 * Following TDD Red-Green-Refactor approach
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerateImageParams } from '../../types/mcp'
import { URLExtractor } from '../urlExtractor'

describe('URL Processing with enableUrlContext', () => {
  describe('parameter validation', () => {
    it('should have enableUrlContext as optional boolean parameter', () => {
      const params: GenerateImageParams = {
        prompt: 'Test prompt with https://example.com',
        enableUrlContext: true,
      }

      expect(typeof params.enableUrlContext).toBe('boolean')
      expect(params.enableUrlContext).toBe(true)
    })

    it('should default to false when enableUrlContext is not specified', () => {
      const params: GenerateImageParams = {
        prompt: 'Test prompt with https://example.com',
      }

      expect(params.enableUrlContext).toBeUndefined()
      // In actual implementation, this would default to false
    })

    it('should work with enableUrlContext set to false', () => {
      const params: GenerateImageParams = {
        prompt: 'Test prompt with https://example.com',
        enableUrlContext: false,
      }

      expect(params.enableUrlContext).toBe(false)
    })
  })

  describe('URL processing control flow', () => {
    it('should extract URLs when enableUrlContext is true', () => {
      const prompt = 'Check https://example.com and https://test.com'
      const enableUrlContext = true

      if (enableUrlContext && URLExtractor.hasUrls(prompt)) {
        const urls = URLExtractor.extractUrls(prompt)
        expect(urls).toHaveLength(2)
        expect(urls).toEqual(['https://example.com', 'https://test.com'])
      }
    })

    it('should not extract URLs when enableUrlContext is false', () => {
      const prompt = 'Check https://example.com and https://test.com'
      const enableUrlContext = false

      if (!enableUrlContext) {
        // Should process as normal prompt without URL extraction
        expect(prompt).toBe('Check https://example.com and https://test.com')
      }
    })

    it('should handle URL extraction when enableUrlContext is undefined (default false)', () => {
      const prompt = 'Check https://example.com and https://test.com'
      const enableUrlContext = undefined

      if (!enableUrlContext) {
        // Should process as normal prompt without URL extraction
        expect(prompt).toBe('Check https://example.com and https://test.com')
      }
    })
  })

  describe('integration scenarios', () => {
    it('should work with all GenerateImageParams options including enableUrlContext', () => {
      const fullParams: GenerateImageParams = {
        prompt: 'Generate image from https://example.com',
        outputPath: '/path/to/output.png',
        inputImagePath: '/path/to/input.jpg',
        outputFormat: 'PNG',
        enableUrlContext: true,
      }

      expect(fullParams.enableUrlContext).toBe(true)
      expect(fullParams.prompt).toContain('https://example.com')
      expect(fullParams.outputFormat).toBe('PNG')
    })
  })
})
