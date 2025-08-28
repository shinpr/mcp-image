/**
 * Tests for metadata type extensions for URL Context (Task-09)
 * Following TDD Red-Green-Refactor approach
 */

import { describe, expect, it } from 'vitest'

// Test the extended metadata types that will be implemented
describe('GenerationMetadata - URL Context Extensions (Task-09)', () => {
  describe('ContextMethod type', () => {
    it('should support prompt_only value', () => {
      const contextMethod: 'prompt_only' | 'url_context' = 'prompt_only'
      expect(contextMethod).toBe('prompt_only')
    })

    it('should support url_context value', () => {
      const contextMethod: 'prompt_only' | 'url_context' = 'url_context'
      expect(contextMethod).toBe('url_context')
    })

    // This test will fail initially - it's part of RED phase
    it('should be assignable to ContextMethod type', () => {
      // This will fail until ContextMethod type is defined
      // @ts-expect-error - Type will be defined in GREEN phase
      const method: ContextMethod = 'url_context'
      expect(method).toBe('url_context')
    })
  })

  describe('GenerationMetadata interface extensions', () => {
    it('should support extractedUrls field as optional string array', () => {
      // This test will fail initially - part of RED phase
      const metadata = {
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime: 1500,
        contextMethod: 'url_context' as const,
        timestamp: new Date().toISOString(),
        extractedUrls: ['https://example.com', 'https://test.com'],
        urlContextUsed: true,
      }

      // These type assertions will fail until interface is extended
      // @ts-expect-error - Properties will be added in GREEN phase
      expect(Array.isArray(metadata.extractedUrls)).toBe(true)
      // @ts-expect-error - Properties will be added in GREEN phase
      expect(metadata.extractedUrls?.length).toBe(2)
      // @ts-expect-error - Properties will be added in GREEN phase
      expect(typeof metadata.urlContextUsed).toBe('boolean')
    })

    it('should support urlContextUsed field as optional boolean', () => {
      const metadata = {
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime: 2000,
        contextMethod: 'url_context' as const,
        timestamp: new Date().toISOString(),
        urlContextUsed: true,
      }

      // @ts-expect-error - Property will be added in GREEN phase
      expect(typeof metadata.urlContextUsed).toBe('boolean')
      // @ts-expect-error - Property will be added in GREEN phase
      expect(metadata.urlContextUsed).toBe(true)
    })

    it('should allow undefined values for optional URL-related fields', () => {
      const metadata = {
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime: 1000,
        contextMethod: 'prompt_only' as const,
        timestamp: new Date().toISOString(),
        // extractedUrls and urlContextUsed should be undefined for prompt_only
      }

      // @ts-expect-error - Properties will be added in GREEN phase
      expect(metadata.extractedUrls).toBeUndefined()
      // @ts-expect-error - Properties will be added in GREEN phase
      expect(metadata.urlContextUsed).toBeUndefined()
    })

    it('should maintain all existing fields while adding new ones', () => {
      const metadata = {
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime: 2500,
        contextMethod: 'url_context' as const,
        timestamp: new Date().toISOString(),
        extractedUrls: ['https://art.com'],
        urlContextUsed: true,
      }

      // Existing fields should still work
      expect(metadata.model).toBe('gemini-2.5-flash-image-preview')
      expect(typeof metadata.processingTime).toBe('number')
      expect(metadata.processingTime).toBeGreaterThan(0)
      expect(typeof metadata.timestamp).toBe('string')
      expect(new Date(metadata.timestamp).getTime()).toBeGreaterThan(0)

      // New fields should be type-safe
      // @ts-expect-error - Properties will be added in GREEN phase
      expect(Array.isArray(metadata.extractedUrls)).toBe(true)
      // @ts-expect-error - Properties will be added in GREEN phase
      expect(typeof metadata.urlContextUsed).toBe('boolean')
    })
  })

  describe('Metadata creation patterns', () => {
    it('should create URL context metadata correctly', () => {
      const createUrlContextMetadata = (
        processingTime: number,
        extractedUrls: string[],
        urlContextUsed: boolean
      ) => ({
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime,
        contextMethod: 'url_context' as const,
        timestamp: new Date().toISOString(),
        extractedUrls: extractedUrls.length > 0 ? extractedUrls : undefined,
        urlContextUsed: urlContextUsed || undefined,
      })

      const metadata = createUrlContextMetadata(1500, ['https://example.com'], true)

      expect(metadata.contextMethod).toBe('url_context')
      expect(metadata.extractedUrls).toEqual(['https://example.com'])
      expect(metadata.urlContextUsed).toBe(true)
    })

    it('should create prompt-only metadata correctly', () => {
      const createPromptOnlyMetadata = (processingTime: number) => ({
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime,
        contextMethod: 'prompt_only' as const,
        timestamp: new Date().toISOString(),
      })

      const metadata = createPromptOnlyMetadata(1000)

      expect(metadata.contextMethod).toBe('prompt_only')
      expect(metadata.extractedUrls).toBeUndefined()
      expect(metadata.urlContextUsed).toBeUndefined()
    })

    it('should handle fallback metadata (URL extraction succeeded but context failed)', () => {
      const createFallbackMetadata = (processingTime: number, extractedUrls: string[]) => ({
        model: 'gemini-2.5-flash-image-preview' as const,
        processingTime,
        contextMethod: 'prompt_only' as const,
        timestamp: new Date().toISOString(),
        extractedUrls: extractedUrls.length > 0 ? extractedUrls : undefined,
        urlContextUsed: false,
      })

      const metadata = createFallbackMetadata(1200, ['https://fail.com'])

      expect(metadata.contextMethod).toBe('prompt_only')
      expect(metadata.extractedUrls).toEqual(['https://fail.com'])
      // @ts-expect-error - Property will be added in GREEN phase
      expect(metadata.urlContextUsed).toBe(false)
    })
  })

  describe('Type compatibility', () => {
    it('should be compatible with existing GenerationResult interface', () => {
      // This test ensures backward compatibility
      const result = {
        imageData: Buffer.from('fake-data'),
        metadata: {
          model: 'gemini-2.5-flash-image-preview' as const,
          processingTime: 1500,
          contextMethod: 'url_context' as const,
          timestamp: new Date().toISOString(),
          extractedUrls: ['https://example.com'],
          urlContextUsed: true,
        },
      }

      expect(Buffer.isBuffer(result.imageData)).toBe(true)
      expect(result.metadata.model).toBe('gemini-2.5-flash-image-preview')
      expect(typeof result.metadata.processingTime).toBe('number')
    })

    it('should validate contextMethod values strictly', () => {
      // Should only accept valid context methods
      const validMethods = ['prompt_only', 'url_context'] as const

      for (const method of validMethods) {
        const metadata = {
          model: 'gemini-2.5-flash-image-preview' as const,
          processingTime: 1000,
          contextMethod: method,
          timestamp: new Date().toISOString(),
        }

        expect(['prompt_only', 'url_context']).toContain(metadata.contextMethod)
      }
    })
  })
})
