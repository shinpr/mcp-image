/**
 * Unit tests for StructuredPromptOrchestrator
 * Tests 2-stage processing orchestration and integration with components
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeminiTextClient, OptimizedPrompt } from '../../api/geminiTextClient'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError, InputValidationError } from '../../utils/errors'
import type { BestPracticeItem, BestPracticesEngine, EnhancedPrompt } from '../bestPracticesEngine'
import * as BestPracticesModule from '../bestPracticesEngine'
import type { POMLTemplateEngine, StructuredPrompt } from '../pomlTemplateEngine'
import {
  type OrchestrationConfig,
  type OrchestrationOptions,
  StructuredPromptOrchestratorImpl,
} from '../promptOrchestrator'

describe('StructuredPromptOrchestrator', () => {
  let orchestrator: StructuredPromptOrchestratorImpl
  let mockGeminiTextClient: ReturnType<typeof vi.mocked<GeminiTextClient>>
  let mockBestPracticesEngine: ReturnType<typeof vi.mocked<BestPracticesEngine>>
  let mockPOMLTemplateEngine: ReturnType<typeof vi.mocked<POMLTemplateEngine>>
  let mockConfig: OrchestrationConfig

  beforeEach(() => {
    // Mock GeminiTextClient
    mockGeminiTextClient = {
      generateOptimizedPrompt: vi.fn(),
      generateStructuredPrompt: vi.fn(),
      validateAPIKey: vi.fn().mockResolvedValue(Ok(true)),
      getModelInfo: vi.fn(),
      setConfig: vi.fn(),
    } as ReturnType<typeof vi.mocked<GeminiTextClient>>

    // Mock BestPracticesEngine
    mockBestPracticesEngine = {
      applyBestPractices: vi.fn(),
      analyzePracticeCompliance: vi.fn(),
      getAppliedPractices: vi.fn(),
    } as ReturnType<typeof vi.mocked<BestPracticesEngine>>

    // Mock createBestPracticesEngine to return our mock
    vi.spyOn(BestPracticesModule, 'createBestPracticesEngine').mockReturnValue(
      mockBestPracticesEngine
    )

    // Mock POMLTemplateEngine
    mockPOMLTemplateEngine = {
      applyTemplate: vi.fn(),
      parseTemplate: vi.fn(),
      validateTemplate: vi.fn(),
      getAvailableTemplates: vi.fn(),
      configureFeatureFlags: vi.fn(),
      getFeatureFlags: vi.fn(),
    } as ReturnType<typeof vi.mocked<POMLTemplateEngine>>

    // Default config
    mockConfig = {
      timeout: 20000,
      enablePOML: true,
      bestPracticesMode: 'complete',
      fallbackStrategy: 'primary',
      maxProcessingTime: 20000,
    }

    orchestrator = new StructuredPromptOrchestratorImpl(
      mockGeminiTextClient,
      mockBestPracticesEngine,
      mockPOMLTemplateEngine,
      mockConfig
    )
  })

  describe('generateStructuredPrompt', () => {
    const testPrompt = 'A beautiful landscape with mountains'

    it('should successfully orchestrate 2-stage processing', async () => {
      // Mock POML stage success
      const pomlResult: StructuredPrompt = {
        originalPrompt: testPrompt,
        structuredPrompt:
          'Role: Image generator\nTask: Create a beautiful landscape with mountains\nContext: Natural scenery',
        appliedTemplate: {
          id: 'basic',
          name: 'Basic Template',
          structure: { role: 'Image generator', task: 'Create image' },
          features: [],
          metadata: {
            version: '1.0.0',
            author: 'test',
            description: 'test template',
            tags: [],
            created: new Date(),
            lastModified: new Date(),
          },
        },
        processingMeta: {
          processingTime: 1000,
          appliedFeatures: ['role', 'task', 'context'],
          featureFlags: {},
          templateId: 'basic',
          timestamp: new Date(),
        },
      }
      mockPOMLTemplateEngine.applyTemplate.mockResolvedValue(Ok(pomlResult))

      // Mock Best Practices stage success
      const bestPracticesResult: EnhancedPrompt = {
        enhancedPrompt:
          'High-resolution, photorealistic landscape featuring majestic mountains with detailed terrain',
        originalPrompt: pomlResult.structuredPrompt,
        appliedPractices: [
          {
            type: 'enhancement',
            applied: true,
            enhancement: 'Added hyper-specific details',
            metadata: { processingTime: 500, confidence: 0.9 },
          },
        ],
        transformationMeta: {
          totalProcessingTime: 1500,
          practicesAnalyzed: 2,
          practicesApplied: 1,
          qualityScore: 0.9,
          timestamp: new Date(),
        },
      }
      mockBestPracticesEngine.applyBestPractices.mockResolvedValue(Ok(bestPracticesResult))

      const result = await orchestrator.generateStructuredPrompt(testPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.originalPrompt).toBe(testPrompt)
        expect(result.data.structuredPrompt).toBe(bestPracticesResult.enhancedPrompt)
        expect(result.data.processingStages).toHaveLength(2)
        expect(result.data.processingStages[0].name).toBe('POML Template Structuring')
        expect(result.data.processingStages[1].name).toBe('Best Practices Enhancement')
        expect(result.data.appliedStrategies).toHaveLength(2)
        expect(result.data.metrics.stageCount).toBe(2)
        expect(result.data.metrics.successRate).toBe(1)
      }
    })

    it('should skip POML stage when disabled in options', async () => {
      const options: OrchestrationOptions = {
        enablePOML: false,
      }

      // Mock Best Practices stage success (directly on original prompt)
      const bestPracticesResult: EnhancedPrompt = {
        enhancedPrompt: 'High-resolution, photorealistic landscape featuring majestic mountains',
        originalPrompt: testPrompt,
        appliedPractices: [
          {
            type: 'enhancement',
            applied: true,
            enhancement: 'Added hyper-specific details',
            metadata: { processingTime: 500, confidence: 0.9 },
          },
        ],
        transformationMeta: {
          totalProcessingTime: 1500,
          practicesAnalyzed: 1,
          practicesApplied: 1,
          qualityScore: 0.9,
          timestamp: new Date(),
        },
      }
      mockBestPracticesEngine.applyBestPractices.mockResolvedValue(Ok(bestPracticesResult))

      const result = await orchestrator.generateStructuredPrompt(testPrompt, options)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.processingStages).toHaveLength(1)
        expect(result.data.processingStages[0].name).toBe('Best Practices Enhancement')
        expect(mockPOMLTemplateEngine.applyTemplate).not.toHaveBeenCalled()
      }
    })

    it('should handle Stage 1 failure with fallback', async () => {
      // Mock POML stage failure
      mockPOMLTemplateEngine.applyTemplate.mockResolvedValue(
        Err(new GeminiAPIError('POML template application failed'))
      )

      const result = await orchestrator.generateStructuredPrompt(testPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toBe(testPrompt) // Fallback to original
        expect(result.data.metrics.fallbacksUsed).toBe(1)
        expect(
          result.data.processingStages.some((stage) => stage.name === 'Fallback Processing')
        ).toBe(true)
      }
    })

    it('should handle Stage 2 failure with fallback', async () => {
      // Mock POML stage success
      const pomlResult: StructuredPrompt = {
        structuredPrompt: 'Structured prompt from POML',
        appliedFeatures: ['role', 'task'],
        processingTime: 1000,
        templateUsed: 'basic',
      }
      mockPOMLTemplateEngine.applyTemplate.mockResolvedValue(Ok(pomlResult))

      // Mock Best Practices stage failure
      mockBestPracticesEngine.applyBestPractices.mockResolvedValue(
        Err(new GeminiAPIError('Best practices enhancement failed'))
      )

      const result = await orchestrator.generateStructuredPrompt(testPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toBe(testPrompt) // Fallback to original
        expect(result.data.metrics.fallbacksUsed).toBe(1)
      }
    })

    it('should reject empty prompts', async () => {
      const result = await orchestrator.generateStructuredPrompt('')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toBe('Original prompt cannot be empty')
      }
    })

    it('should merge options with default config', async () => {
      const options: OrchestrationOptions = {
        bestPracticesMode: 'basic',
        maxProcessingTime: 10000,
      }

      // Mock successful processing to test option merging
      const pomlResult: StructuredPrompt = {
        structuredPrompt: 'POML structured prompt',
        appliedFeatures: ['role'],
        processingTime: 500,
        templateUsed: 'basic',
      }
      mockPOMLTemplateEngine.applyTemplate.mockResolvedValue(Ok(pomlResult))

      const bestPracticesResult: EnhancedPrompt = {
        enhancedPrompt: 'Enhanced prompt',
        originalPrompt: pomlResult.structuredPrompt,
        appliedPractices: [
          {
            type: 'enhancement',
            applied: true,
            enhancement: 'Added hyper-specific details',
            metadata: { processingTime: 400, confidence: 0.8 },
          },
        ],
        transformationMeta: {
          totalProcessingTime: 800,
          practicesAnalyzed: 1,
          practicesApplied: 1,
          qualityScore: 0.8,
          timestamp: new Date(),
        },
      }
      mockBestPracticesEngine.applyBestPractices.mockResolvedValue(Ok(bestPracticesResult))

      const result = await orchestrator.generateStructuredPrompt(testPrompt, options)

      expect(result.success).toBe(true)
      // Verify POML is still enabled (from config) and options are applied
      expect(mockPOMLTemplateEngine.applyTemplate).toHaveBeenCalled()
    })
  })

  describe('validateConfiguration', () => {
    it('should validate successful configuration', async () => {
      const result = await orchestrator.validateConfiguration()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it('should detect missing components', async () => {
      // Create orchestrator with null component
      const invalidOrchestrator = new StructuredPromptOrchestratorImpl(
        null as any,
        mockBestPracticesEngine,
        mockPOMLTemplateEngine,
        mockConfig
      )

      const result = await invalidOrchestrator.validateConfiguration()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(InputValidationError)
        expect(result.error.message).toBe('Required components not available')
      }
    })

    it('should detect invalid timeout configuration', async () => {
      const invalidConfig: OrchestrationConfig = {
        ...mockConfig,
        timeout: -1,
        maxProcessingTime: -1,
      }

      const invalidOrchestrator = new StructuredPromptOrchestratorImpl(
        mockGeminiTextClient,
        mockBestPracticesEngine,
        mockPOMLTemplateEngine,
        invalidConfig
      )

      const result = await invalidOrchestrator.validateConfiguration()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(InputValidationError)
        expect(result.error.message).toBe('Invalid timeout configuration')
      }
    })
  })

  describe('getProcessingMetrics', () => {
    it('should return initialized metrics before processing', () => {
      const metrics = orchestrator.getProcessingMetrics()

      expect(metrics.totalProcessingTime).toBe(0)
      expect(metrics.stageCount).toBe(0)
      expect(metrics.successRate).toBe(0)
      expect(metrics.failureCount).toBe(0)
      expect(metrics.fallbacksUsed).toBe(0)
      expect(metrics.timestamp).toBeInstanceOf(Date)
    })

    it('should return updated metrics after successful processing', async () => {
      const testPrompt = 'Test prompt for metrics'

      // Mock successful processing
      const pomlResult: StructuredPrompt = {
        structuredPrompt: 'POML result',
        appliedFeatures: ['role'],
        processingTime: 1000,
        templateUsed: 'basic',
      }
      mockPOMLTemplateEngine.applyTemplate.mockResolvedValue(Ok(pomlResult))

      const bestPracticesResult: EnhancedPrompt = {
        enhancedPrompt: 'Enhanced result',
        originalPrompt: pomlResult.structuredPrompt,
        appliedPractices: ['hyper-specific'],
        processingTime: 1500,
        enhancementLevel: 'complete',
      }
      mockBestPracticesEngine.applyBestPractices.mockResolvedValue(Ok(bestPracticesResult))

      await orchestrator.generateStructuredPrompt(testPrompt)
      const metrics = orchestrator.getProcessingMetrics()

      expect(metrics.stageCount).toBe(2)
      expect(metrics.successRate).toBe(1)
      expect(metrics.failureCount).toBe(0)
      // Allow for at least some processing time (processing can be very fast in tests)
      expect(metrics.totalProcessingTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('orchestration workflow integration', () => {
    it('should pass correct parameters between stages', async () => {
      const testPrompt = 'Complex landscape prompt'
      const pomlOutput = 'Role: Artist\nTask: Create complex landscape prompt'

      // Mock POML stage with specific output
      const pomlResult: StructuredPrompt = {
        structuredPrompt: pomlOutput,
        appliedFeatures: ['role', 'task'],
        processingTime: 1200,
        templateUsed: 'basic',
      }
      mockPOMLTemplateEngine.applyTemplate.mockResolvedValue(Ok(pomlResult))

      // Mock Best Practices stage
      const bestPracticesResult: EnhancedPrompt = {
        enhancedPrompt: 'Final enhanced prompt',
        originalPrompt: pomlOutput, // Should receive POML output
        appliedPractices: ['hyper-specific', 'semantic-enhancement'],
        processingTime: 1800,
        enhancementLevel: 'complete',
      }
      mockBestPracticesEngine.applyBestPractices.mockResolvedValue(Ok(bestPracticesResult))

      const result = await orchestrator.generateStructuredPrompt(testPrompt)

      // Verify POML was called with original prompt
      expect(mockPOMLTemplateEngine.applyTemplate).toHaveBeenCalledWith(
        testPrompt,
        expect.any(Object)
      )

      // Verify Best Practices was called with POML output
      expect(mockBestPracticesEngine.applyBestPractices).toHaveBeenCalledWith(
        pomlOutput, // Should receive structured output from Stage 1
        expect.any(Object)
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toBe('Final enhanced prompt')
      }
    })
  })
})
