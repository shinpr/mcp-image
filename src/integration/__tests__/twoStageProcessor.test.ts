/**
 * Integration tests for TwoStageProcessor
 * Tests complete workflow from structured prompt generation to image generation
 * Red phase: Tests designed to fail until proper implementation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeminiClient, GeneratedImageResult } from '../../api/geminiClient'
import type {
  OrchestrationResult,
  StructuredPromptOrchestrator,
} from '../../business/promptOrchestrator'
import { Err, Ok } from '../../types/result'
import type {
  ImageGenerationRequest,
  ImageParameters,
  TwoStageProcessor,
  TwoStageResult,
} from '../../types/twoStageTypes'
import { GeminiAPIError } from '../../utils/errors'

// Mock implementations that will cause tests to fail (Red phase)
const mockStructuredPromptOrchestrator: StructuredPromptOrchestrator = {
  generateStructuredPrompt: vi.fn().mockResolvedValue(Err(new GeminiAPIError('Not implemented'))),
  validateConfiguration: vi.fn().mockResolvedValue(Ok(false)),
  getProcessingMetrics: vi.fn().mockReturnValue({
    totalProcessingTime: 0,
    stageCount: 0,
    successRate: 0,
    failureCount: 1,
    fallbacksUsed: 0,
    timestamp: new Date(),
  }),
}

const mockGeminiImageClient: GeminiClient = {
  generateImage: vi.fn().mockResolvedValue(Err(new GeminiAPIError('Not implemented'))),
}

// Mock TwoStageProcessor that will fail (Red phase)
const mockTwoStageProcessor: TwoStageProcessor = {
  generateImageWithStructuredPrompt: vi
    .fn()
    .mockResolvedValue(Err(new GeminiAPIError('TwoStageProcessor not implemented'))),
  optimizeImageParameters: vi
    .fn()
    .mockResolvedValue(Err(new GeminiAPIError('Parameter optimization not implemented'))),
  getProcessingMetadata: vi.fn().mockReturnValue(undefined),
  validateConfiguration: vi.fn().mockResolvedValue(Ok(false)),
}

describe('TwoStageProcessor Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Test for AC5: Complete 2-stage processing from prompt to high-quality image
  describe('AC5: Complete 2-stage processing integration', () => {
    it('should successfully execute complete workflow from prompt generation to image generation', async () => {
      // Red phase: This should fail because implementation doesn't exist yet
      const request: ImageGenerationRequest = {
        originalPrompt: 'create a beautiful landscape with mountains and rivers',
        orchestrationOptions: {
          enablePOML: true,
          bestPracticesMode: 'complete',
          maxProcessingTime: 20000,
        },
        imageParameters: {
          quality: 'high',
          aspectRatio: '16:9',
        },
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(request)

      // These assertions will fail until proper implementation
      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.success).toBe(true)
        expect(twoStageResult.originalPrompt).toBe(request.originalPrompt)
        expect(twoStageResult.structuredPrompt).toBeDefined()
        expect(twoStageResult.structuredPrompt).not.toBe(request.originalPrompt)
        expect(twoStageResult.generatedImage).toBeDefined()
        expect(twoStageResult.generatedImage.imageData).toBeInstanceOf(Buffer)
        expect(twoStageResult.processingMetadata).toBeDefined()
        expect(twoStageResult.processingMetadata.totalProcessingTime).toBeGreaterThan(0)
      }
    })

    it('should preserve structured prompt enhancement in final result', async () => {
      // Red phase: This should fail
      const request: ImageGenerationRequest = {
        originalPrompt: 'portrait of a person',
        orchestrationOptions: { enablePOML: true },
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.orchestrationResult).toBeDefined()
        expect(twoStageResult.orchestrationResult.processingStages).toHaveLength(2) // POML + Best Practices
        expect(twoStageResult.structuredPrompt).toContain('detailed') // Enhanced prompt should be more detailed
      }
    })
  })

  // Test for AC6: Parameter optimization integration with structured prompts
  describe('AC6: Parameter optimization with structured prompts', () => {
    it('should optimize image parameters based on structured prompt content', async () => {
      // Red phase: This should fail
      const baseParams: ImageParameters = {
        quality: 'medium',
        aspectRatio: '1:1',
        style: 'natural',
      }

      const structuredPrompt =
        'A cinematic wide-angle landscape shot of snow-capped mountains at golden hour, professional photography, high detail, dramatic lighting'

      const result = await mockTwoStageProcessor.optimizeImageParameters(
        structuredPrompt,
        baseParams
      )

      expect(result.success).toBe(true)
      if (result.success) {
        const optimized = result.data
        // Should detect cinematic content and adjust parameters
        expect(optimized.aspectRatio).toBe('16:9') // Wide format for cinematic
        expect(optimized.quality).toBe('high') // High detail requirement
        expect(optimized.optimizationReasons).toContain('cinematic composition detected')
      }
    })

    it('should apply character consistency optimization for portrait prompts', async () => {
      // Red phase: This should fail
      const baseParams: ImageParameters = {
        maintainCharacterConsistency: false,
      }

      const structuredPrompt =
        'Detailed portrait of a character with specific facial features: blue eyes, curly brown hair, gentle smile'

      const result = await mockTwoStageProcessor.optimizeImageParameters(
        structuredPrompt,
        baseParams
      )

      expect(result.success).toBe(true)
      if (result.success) {
        const optimized = result.data
        expect(optimized.maintainCharacterConsistency).toBe(true)
        expect(optimized.optimizationReasons).toContain('character features detected')
      }
    })
  })

  // Test for BP6: Aspect ratio and composition optimization capabilities
  describe('BP6: Aspect ratio and composition optimization', () => {
    it('should optimize aspect ratio based on prompt content type', async () => {
      // Red phase: This should fail
      const portraitRequest: ImageGenerationRequest = {
        originalPrompt: 'headshot portrait of a professional person',
        imageParameters: { aspectRatio: '16:9' }, // Wrong for portrait
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(portraitRequest)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.optimizedParameters.aspectRatio).toBe('3:4') // Portrait aspect ratio
        expect(twoStageResult.processingMetadata.appliedOptimizations).toContain(
          'aspect ratio optimization'
        )
      }
    })

    it('should preserve aspect ratios when explicitly specified and appropriate', async () => {
      // Red phase: This should fail
      const landscapeRequest: ImageGenerationRequest = {
        originalPrompt: 'wide panoramic view of a mountain range',
        imageParameters: { aspectRatio: '21:9' }, // Ultra-wide, appropriate for panoramic
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(landscapeRequest)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.optimizedParameters.aspectRatio).toBe('21:9') // Should preserve
        expect(twoStageResult.processingMetadata.appliedOptimizations).toContain(
          'aspect ratio preserved'
        )
      }
    })

    it('should optimize composition parameters for different content types', async () => {
      // Red phase: This should fail
      const macroRequest: ImageGenerationRequest = {
        originalPrompt: 'extreme close-up of a flower petal with water droplets',
        imageParameters: { quality: 'low' },
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(macroRequest)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.optimizedParameters.quality).toBe('high') // Macro needs high quality
        expect(twoStageResult.optimizedParameters.style).toBe('enhanced') // Detail enhancement
      }
    })
  })

  // Performance testing for +20 second requirement
  describe('Performance Requirements', () => {
    it('should complete full 2-stage processing within performance target', async () => {
      // Red phase: This should fail due to no timing implementation
      const request: ImageGenerationRequest = {
        originalPrompt: 'test performance',
        orchestrationOptions: { maxProcessingTime: 20000 },
      }

      const startTime = Date.now()
      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(request)
      const endTime = Date.now()

      const actualTime = endTime - startTime

      expect(result.success).toBe(true)
      expect(actualTime).toBeLessThan(20000) // 20 second target

      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.processingMetadata.totalProcessingTime).toBeLessThan(20000)
        expect(twoStageResult.processingMetadata.promptEnhancementTime).toBeLessThan(15000) // Stage 1 target
        expect(twoStageResult.processingMetadata.imageGenerationTime).toBeGreaterThan(0)
      }
    })

    it('should track individual stage timing accurately', async () => {
      // Red phase: This should fail
      const request: ImageGenerationRequest = {
        originalPrompt: 'timing test prompt',
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const metadata = result.data.processingMetadata
        expect(metadata.stages).toHaveLength(2) // Prompt generation + Image generation

        const promptStage = metadata.stages.find((s) => s.stageName.includes('Prompt'))
        const imageStage = metadata.stages.find((s) => s.stageName.includes('Image'))

        expect(promptStage).toBeDefined()
        expect(imageStage).toBeDefined()
        expect(promptStage?.processingTime).toBeGreaterThan(0)
        expect(imageStage?.processingTime).toBeGreaterThan(0)
      }
    })
  })

  // Error handling and fallback scenarios
  describe('Error Handling and Fallback', () => {
    it('should handle prompt generation failure with graceful fallback', async () => {
      // Red phase: This should fail
      const request: ImageGenerationRequest = {
        originalPrompt: 'fallback test prompt',
      }

      // Mock prompt generation failure but successful image generation
      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true) // Should succeed via fallback
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.processingMetadata.fallbackUsed).toBe(true)
        expect(twoStageResult.structuredPrompt).toBe(request.originalPrompt) // Fallback to original
      }
    })

    it('should validate configuration before processing', async () => {
      // Red phase: This should fail
      const isValid = await mockTwoStageProcessor.validateConfiguration()

      expect(isValid.success).toBe(true)
      expect(isValid.data).toBe(true)
    })
  })

  // Metadata management testing
  describe('Metadata Management', () => {
    it('should provide comprehensive session metadata', async () => {
      // Red phase: This should fail
      const request: ImageGenerationRequest = {
        originalPrompt: 'metadata test',
      }

      const result = await mockTwoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const sessionId = result.data.processingMetadata.sessionId
        const metadata = mockTwoStageProcessor.getProcessingMetadata(sessionId)

        expect(metadata).toBeDefined()
        expect(metadata?.sessionId).toBe(sessionId)
        expect(metadata?.originalPrompt).toBe(request.originalPrompt)
        expect(metadata?.stages).toBeInstanceOf(Array)
        expect(metadata?.totalProcessingTime).toBeGreaterThan(0)
      }
    })
  })
})
