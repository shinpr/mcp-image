/**
 * Integration tests for TwoStageProcessor with real implementations
 * Tests the actual 2-stage processing workflow
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { BestPracticesEngineImpl } from '../../business/bestPracticesEngine'
import { POMLTemplateEngineImpl } from '../../business/pomlTemplateEngine'
import { StructuredPromptOrchestratorImpl } from '../../business/promptOrchestrator'
import { createSuccessfulGeminiImageClientMock } from '../../tests/mocks/geminiImageClientMock'
import { createSuccessfulGeminiTextClientMock } from '../../tests/mocks/geminiTextClientMock'
import type { ImageGenerationRequest, TwoStageResult } from '../../types/twoStageTypes'
import { TwoStageProcessorFactory, TwoStageProcessorImpl } from '../twoStageProcessor'

describe('TwoStageProcessor Integration Tests - Real Implementation', () => {
  let twoStageProcessor: TwoStageProcessorImpl

  beforeEach(() => {
    // Create real implementations with mocked clients
    const mockTextClient = createSuccessfulGeminiTextClientMock()
    const mockImageClient = createSuccessfulGeminiImageClientMock()

    const bestPracticesEngine = new BestPracticesEngineImpl(mockTextClient)
    const pomlTemplateEngine = new POMLTemplateEngineImpl(mockTextClient)
    const orchestrator = new StructuredPromptOrchestratorImpl(
      mockTextClient,
      bestPracticesEngine,
      pomlTemplateEngine
    )

    twoStageProcessor = new TwoStageProcessorImpl(orchestrator, mockImageClient)
  })

  describe('AC5: Complete 2-stage processing integration', () => {
    it('should successfully execute complete workflow from prompt generation to image generation', async () => {
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

      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.success).toBe(true)
        expect(twoStageResult.originalPrompt).toBe(request.originalPrompt)
        expect(twoStageResult.structuredPrompt).toBeDefined()
        expect(twoStageResult.structuredPrompt.length).toBeGreaterThan(
          request.originalPrompt.length
        )
        expect(twoStageResult.generatedImage).toBeDefined()
        expect(twoStageResult.generatedImage.imageData).toBeInstanceOf(Buffer)
        expect(twoStageResult.processingMetadata).toBeDefined()
        expect(twoStageResult.processingMetadata.totalProcessingTime).toBeGreaterThan(0)
        expect(twoStageResult.processingMetadata.stages).toHaveLength(2)
      }
    })

    it('should preserve orchestration results in final output', async () => {
      const request: ImageGenerationRequest = {
        originalPrompt: 'portrait of a character',
        orchestrationOptions: { enablePOML: true },
      }

      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.orchestrationResult).toBeDefined()
        expect(twoStageResult.orchestrationResult.processingStages).toHaveLength(2)
        expect(twoStageResult.orchestrationResult.appliedStrategies).toHaveLength(2)
        expect(twoStageResult.orchestrationResult.structuredPrompt).toBe(
          twoStageResult.structuredPrompt
        )
      }
    })
  })

  describe('AC6: Parameter optimization with structured prompts', () => {
    it('should optimize parameters based on structured prompt analysis', async () => {
      const baseParams = {
        quality: 'medium' as const,
        aspectRatio: '1:1',
        style: 'natural' as const,
      }

      const structuredPrompt =
        'A cinematic wide-angle landscape shot of snow-capped mountains at golden hour, professional photography, high detail, dramatic lighting'

      const result = await twoStageProcessor.optimizeImageParameters(structuredPrompt, baseParams)

      expect(result.success).toBe(true)
      if (result.success) {
        const optimized = result.data
        // Should adjust for cinematic content
        expect(optimized.aspectRatio).toBe('16:9') // Cinematic aspect ratio
        expect(optimized.quality).toBe('high') // High detail requirement
        expect(optimized.optimizationReasons).toContain('cinematic composition detected')
        expect(optimized.optimizationReasons).toContain(
          'aspect ratio adjusted for cinematic content'
        )
      }
    })

    it('should enable character consistency for character prompts', async () => {
      const baseParams = {
        maintainCharacterConsistency: false,
      }

      const structuredPrompt =
        'Detailed portrait of a character with specific facial features: blue eyes, curly brown hair, gentle smile, wearing a red jacket'

      const result = await twoStageProcessor.optimizeImageParameters(structuredPrompt, baseParams)

      expect(result.success).toBe(true)
      if (result.success) {
        const optimized = result.data
        expect(optimized.maintainCharacterConsistency).toBe(true)
        expect(optimized.optimizationReasons).toContain(
          'character features detected - enabled consistency maintenance'
        )
      }
    })
  })

  describe('BP6: Aspect ratio and composition optimization', () => {
    it('should optimize aspect ratio for portrait content', async () => {
      const request: ImageGenerationRequest = {
        originalPrompt: 'professional headshot portrait of a business executive',
        imageParameters: { aspectRatio: '16:9' }, // Wrong for portrait
      }

      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.optimizedParameters.aspectRatio).toBe('3:4') // Portrait aspect ratio
        expect(twoStageResult.processingMetadata.appliedOptimizations).toContain(
          'aspect ratio optimized for portrait content'
        )
      }
    })

    it('should preserve appropriate aspect ratios', async () => {
      const request: ImageGenerationRequest = {
        originalPrompt: 'wide panoramic view of a mountain range at sunset',
        imageParameters: { aspectRatio: '21:9' }, // Appropriate for panoramic
      }

      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.optimizedParameters.aspectRatio).toBe('21:9') // Should preserve
        expect(twoStageResult.processingMetadata.appliedOptimizations).toContain(
          'aspect ratio preserved - appropriate for content'
        )
      }
    })

    it('should optimize for macro photography requirements', async () => {
      const request: ImageGenerationRequest = {
        originalPrompt:
          'extreme close-up macro shot of a flower petal with morning dew drops, high detail texture',
        imageParameters: { quality: 'low' },
      }

      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        expect(twoStageResult.optimizedParameters.quality).toBe('high') // Macro needs high quality
        expect(twoStageResult.optimizedParameters.style).toBe('enhanced') // Detail enhancement
        expect(twoStageResult.processingMetadata.appliedOptimizations).toContain(
          'macro photography detected - enhanced quality and detail'
        )
      }
    })
  })

  describe('Performance Requirements', () => {
    it('should track processing times accurately', async () => {
      const request: ImageGenerationRequest = {
        originalPrompt: 'performance test prompt',
        orchestrationOptions: { maxProcessingTime: 20000 },
      }

      const startTime = Date.now()
      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)
      const endTime = Date.now()

      expect(result.success).toBe(true)
      if (result.success) {
        const twoStageResult = result.data
        const metadata = twoStageResult.processingMetadata

        // Verify timing data exists
        expect(metadata.totalProcessingTime).toBeGreaterThan(0)
        expect(metadata.promptEnhancementTime).toBeGreaterThan(0)
        expect(metadata.imageGenerationTime).toBeGreaterThan(0)

        // Verify individual stage timing
        expect(metadata.stages).toHaveLength(2)
        const promptStage = metadata.stages.find(
          (s) => s.stageName === 'Structured Prompt Generation'
        )
        const imageStage = metadata.stages.find((s) => s.stageName === 'Image Generation')

        expect(promptStage).toBeDefined()
        expect(imageStage).toBeDefined()
        expect(promptStage?.processingTime).toBeGreaterThan(0)
        expect(imageStage?.processingTime).toBeGreaterThan(0)
      }
    })
  })

  describe('Configuration and Validation', () => {
    it('should validate configuration successfully', async () => {
      const result = await twoStageProcessor.validateConfiguration()

      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('should provide session metadata', async () => {
      const request: ImageGenerationRequest = {
        originalPrompt: 'metadata test prompt',
      }

      const result = await twoStageProcessor.generateImageWithStructuredPrompt(request)

      expect(result.success).toBe(true)
      if (result.success) {
        const sessionId = result.data.processingMetadata.sessionId
        const metadata = twoStageProcessor.getProcessingMetadata(sessionId)

        expect(metadata).toBeDefined()
        expect(metadata?.sessionId).toBe(sessionId)
        expect(metadata?.originalPrompt).toBe(request.originalPrompt)
        expect(metadata?.stages).toBeInstanceOf(Array)
        expect(metadata?.totalProcessingTime).toBeGreaterThan(0)
      }
    })
  })

  describe('Factory Pattern', () => {
    it('should create processor instances through factory', () => {
      const mockTextClient = createSuccessfulGeminiTextClientMock()
      const mockImageClient = createSuccessfulGeminiImageClientMock()

      const bestPracticesEngine = new BestPracticesEngineImpl(mockTextClient)
      const pomlTemplateEngine = new POMLTemplateEngineImpl(mockTextClient)
      const orchestrator = new StructuredPromptOrchestratorImpl(
        mockTextClient,
        bestPracticesEngine,
        pomlTemplateEngine
      )

      const factory = new TwoStageProcessorFactory(orchestrator, mockImageClient)
      const processor = factory.create({
        maxProcessingTime: 15000,
        enableParameterOptimization: true,
      })

      expect(processor).toBeInstanceOf(TwoStageProcessorImpl)
    })
  })
})
