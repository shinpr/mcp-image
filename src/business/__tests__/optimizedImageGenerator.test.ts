/**
 * Tests for OptimizedImageGenerator - Performance-optimized image generation
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GeminiClient } from '../../api/geminiClient'
import type { UrlContextClient } from '../../api/urlContextClient'

describe('OptimizedImageGenerator', () => {
  let mockGeminiClient: GeminiClient
  let mockUrlContextClient: UrlContextClient

  beforeEach(() => {
    mockGeminiClient = {
      generateImage: vi.fn(),
    } as any

    mockUrlContextClient = {
      processUrls: vi.fn(),
    } as any
  })

  describe('Performance optimization integration', () => {
    test('should reject requests when concurrency limit is reached', async () => {
      // This test should fail - OptimizedImageGenerator doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')
      const { ConcurrencyManager } = await import('../../server/concurrencyManager')

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)
      const concurrencyManager = ConcurrencyManager.getInstance()

      // Manually acquire lock to simulate concurrency limit
      await concurrencyManager.acquireLock()

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
      }

      const result = await generator.generateImage(params)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('CONCURRENCY_ERROR')
        expect(result.error.message).toContain('Server busy')
      }

      // Clean up
      concurrencyManager.releaseLock()
    })

    test('should acquire and release concurrency locks properly', async () => {
      // This test should fail - OptimizedImageGenerator doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      mockGeminiClient.generateImage = vi.fn().mockResolvedValue({
        success: true,
        data: { imageData: Buffer.from('test image') },
      })

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
      }

      const result = await generator.generateImage(params)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.performance).toBeDefined()
      }
    })

    test('should measure performance metrics accurately', async () => {
      // This test should fail - OptimizedImageGenerator doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      mockGeminiClient.generateImage = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return {
          success: true,
          data: { imageData: Buffer.from('test image') },
        }
      })

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
      }

      const result = await generator.generateImage(params)

      expect(result.success).toBe(true)
      if (result.success) {
        const performance = result.data.metadata.performance
        expect(performance).toBeDefined()
        expect(performance.internalProcessingTime).toBeGreaterThan(0)
        expect(performance.totalTime).toBeGreaterThan(performance.internalProcessingTime)
        expect(performance.memoryPeak).toBeGreaterThan(0)
        expect(typeof performance.withinLimits).toBe('boolean')
      }
    })

    test('should log warning when processing time exceeds 2 second limit', async () => {
      // This test should fail - OptimizedImageGenerator doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockGeminiClient.generateImage = vi.fn().mockImplementation(async () => {
        // Simulate slow processing
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          success: true,
          data: { imageData: Buffer.from('test image') },
        }
      })

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt that will take too long to process',
        enableUrlContext: false,
      }

      const result = await generator.generateImage(params)

      expect(result.success).toBe(true)
      if (result.success && !result.data.metadata.performance.withinLimits) {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Processing time exceeded limit')
        )
      }

      consoleSpy.mockRestore()
    })

    test('should perform memory cleanup with garbage collection', async () => {
      // This test should fail - OptimizedImageGenerator doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      const mockGc = vi.fn()
      global.gc = mockGc

      mockGeminiClient.generateImage = vi.fn().mockResolvedValue({
        success: true,
        data: { imageData: Buffer.from('test image') },
      })

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
      }

      await generator.generateImage(params)

      expect(mockGc).toHaveBeenCalled()

      global.gc = undefined
    })

    test('should release concurrency lock even on error', async () => {
      // This test should fail - OptimizedImageGenerator doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      mockGeminiClient.generateImage = vi.fn().mockRejectedValue(new Error('API Error'))

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
      }

      const result = await generator.generateImage(params)

      expect(result.success).toBe(false)

      // Should be able to make another request (lock was released)
      const secondResult = await generator.generateImage(params)
      expect(secondResult.success).toBe(false) // Still fails, but doesn't hang
    })
  })

  describe('Optimized processing methods', () => {
    test('should perform optimized validation with parallel checks', async () => {
      // This test should fail - optimizedValidation method doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Valid test prompt',
        enableUrlContext: false,
        // Don't use inputImagePath to avoid file validation issues
        blendImages: false,
      }

      mockGeminiClient.generateImage = vi.fn().mockResolvedValue({
        success: true,
        data: { imageData: Buffer.from('test image') },
      })

      const result = await generator.generateImage(params)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata.performance.internalProcessingTime).toBeLessThan(2000)
      }
    })

    test('should perform optimized image processing with memory efficiency', async () => {
      // This test should fail - optimizedImageProcessing method doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
      }

      const largeImageData = Buffer.alloc(1024 * 1024) // 1MB
      mockGeminiClient.generateImage = vi.fn().mockResolvedValue({
        success: true,
        data: { imageData: largeImageData },
      })

      const result = await generator.generateImage(params)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageData).toBeDefined()
        expect(result.data.metadata.performance.memoryPeak).toBeGreaterThan(0)
      }
    })

    test('should perform optimized file save operations', async () => {
      // This test should fail - optimizedFileSave method doesn't exist yet
      const { OptimizedImageGenerator } = await import('../imageGenerator')

      const generator = new OptimizedImageGenerator(mockGeminiClient, mockUrlContextClient)

      const params = {
        prompt: 'Test prompt',
        enableUrlContext: false,
        outputPath: './output/test-image.png',
      }

      mockGeminiClient.generateImage = vi.fn().mockResolvedValue({
        success: true,
        data: { imageData: Buffer.from('test image') },
      })

      const result = await generator.generateImage(params)

      expect(result.success).toBe(true)
      if (result.success) {
        const fileOpTime = result.data.metadata.performance.internalProcessingTime
        expect(fileOpTime).toBeLessThan(300) // Should be under 300ms for file operations
      }
    })
  })
})
