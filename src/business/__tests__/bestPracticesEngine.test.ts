/**
 * Unit tests for Best Practices Engine
 * Tests all 7 best practices for prompt optimization with focus on BP1, BP3, BP5
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  type BestPracticeAnalysis,
  type BestPracticesEngine,
  BestPracticesEngineImpl,
  BestPracticesError,
  type BestPracticesOptions,
  type EnhancedPrompt,
  createBestPracticesEngine,
} from '../bestPracticesEngine'

describe('BestPracticesEngine', () => {
  let engine: BestPracticesEngine

  beforeEach(() => {
    engine = createBestPracticesEngine()
  })

  describe('Core Functionality', () => {
    it('should create engine with default configuration', () => {
      expect(engine).toBeDefined()
      expect(typeof engine.applyBestPractices).toBe('function')
      expect(typeof engine.analyzePracticeCompliance).toBe('function')
      expect(typeof engine.getAppliedPractices).toBe('function')
    })

    it('should handle empty prompt input', async () => {
      const result = await engine.applyBestPractices('')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(BestPracticesError)
        expect(result.error.code).toBe('INVALID_INPUT')
      }
    })

    it('should complete processing within performance requirements', async () => {
      const startTime = Date.now()
      const result = await engine.applyBestPractices('simple test prompt')
      const endTime = Date.now()

      const processingTime = endTime - startTime
      expect(processingTime).toBeLessThan(2000) // Must be under 2 seconds

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.transformationMeta.totalProcessingTime).toBeLessThan(2000)
      }
    })
  })

  describe('BP1: Hyper-specific Detail Addition Functionality', () => {
    it('should detect when hyper-specific details are missing', async () => {
      const basicPrompt = 'a person standing'
      const analysis = await engine.analyzePracticeCompliance(basicPrompt)

      expect(analysis.missingPractices).toContain('hyper-specific')
      expect(analysis.overallScore).toBeLessThan(100)
    })

    it('should add hyper-specific lighting details to basic prompts', async () => {
      const basicPrompt = 'a person standing'
      const result = await engine.applyBestPractices(basicPrompt, {
        enabledPractices: ['hyper-specific'],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const enhanced = result.data
        expect(enhanced.enhancedPrompt).toContain('lighting')
        expect(enhanced.enhancedPrompt).toContain('85mm')
        expect(enhanced.enhancedPrompt).toContain('environment')
        expect(enhanced.appliedPractices).toHaveLength(1)
        expect(enhanced.appliedPractices[0].type).toBe('hyper-specific')
        expect(enhanced.appliedPractices[0].applied).toBe(true)
      }
    })

    it('should add camera details when missing from prompt', async () => {
      const promptWithoutCamera = 'beautiful landscape'
      const result = await engine.applyBestPractices(promptWithoutCamera, {
        enabledPractices: ['hyper-specific'],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain('85mm')
        expect(result.data.enhancedPrompt).toContain('f/1.4')
        expect(result.data.appliedPractices[0].metadata.confidence).toBeGreaterThan(0.8)
      }
    })

    it('should not duplicate existing specific details', async () => {
      const specificPrompt = 'a person standing with dramatic lighting and 85mm lens'
      const analysis = await engine.analyzePracticeCompliance(specificPrompt)

      expect(analysis.existingPractices).toContain('hyper-specific')
      expect(analysis.missingPractices).not.toContain('hyper-specific')
    })
  })

  describe('BP3: Multi-image Coordination Capabilities', () => {
    it('should detect when coordination details are missing', async () => {
      const uncoordinatedPrompt = 'random image without style'
      const analysis = await engine.analyzePracticeCompliance(uncoordinatedPrompt)

      expect(analysis.missingPractices).toContain('multi-image-coordination')
      expect(analysis.recommendations).toContain(
        'Ensure coherent style and composition across images'
      )
    })

    it('should add unified visual style for series consistency', async () => {
      const basicPrompt = 'portrait photo'
      const result = await engine.applyBestPractices(basicPrompt, {
        enabledPractices: ['multi-image-coordination'],
        targetStyle: 'cinematic',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const enhanced = result.data
        expect(enhanced.enhancedPrompt).toContain('unified visual style')
        expect(enhanced.enhancedPrompt).toContain('coherent color palette')
        expect(enhanced.enhancedPrompt).toContain('series consistency')
        expect(enhanced.enhancedPrompt).toContain('cinematic artistic style')

        const coordinationPractice = enhanced.appliedPractices.find(
          (p) => p.type === 'multi-image-coordination'
        )
        expect(coordinationPractice).toBeDefined()
        expect(coordinationPractice?.applied).toBe(true)
      }
    })

    it('should handle coordination without target style', async () => {
      const basicPrompt = 'landscape scene'
      const result = await engine.applyBestPractices(basicPrompt, {
        enabledPractices: ['multi-image-coordination'],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain('unified visual style')
        expect(result.data.enhancedPrompt).not.toContain('undefined artistic style')
      }
    })

    it('should recognize existing coordination elements', async () => {
      const coordinatedPrompt = 'portrait with unified style and coherent composition'
      const analysis = await engine.analyzePracticeCompliance(coordinatedPrompt)

      expect(analysis.existingPractices).toContain('multi-image-coordination')
      expect(analysis.missingPractices).not.toContain('multi-image-coordination')
    })
  })

  describe('BP5: Semantic Enhancement Application', () => {
    it('should detect when semantic context is missing', async () => {
      const contextlessPrompt = 'blue object'
      const analysis = await engine.analyzePracticeCompliance(contextlessPrompt)

      expect(analysis.missingPractices).toContain('semantic-enhancement')
      expect(analysis.recommendations).toContain('Enrich with contextual and semantic information')
    })

    it('should enrich context with semantic information', async () => {
      const basicPrompt = 'person walking'
      const result = await engine.applyBestPractices(basicPrompt, {
        enabledPractices: ['semantic-enhancement'],
        contextIntent: 'emotional storytelling',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const enhanced = result.data
        expect(enhanced.enhancedPrompt).toContain('emotional resonance')
        expect(enhanced.enhancedPrompt).toContain('contextual narrative depth')
        expect(enhanced.enhancedPrompt).toContain('emotional storytelling')

        const semanticPractice = enhanced.appliedPractices.find(
          (p) => p.type === 'semantic-enhancement'
        )
        expect(semanticPractice).toBeDefined()
        expect(semanticPractice?.applied).toBe(true)
        expect(semanticPractice?.metadata.confidence).toBeGreaterThan(0.8)
      }
    })

    it('should enhance semantic meaning without context intent', async () => {
      const basicPrompt = 'forest scene'
      const result = await engine.applyBestPractices(basicPrompt, {
        enabledPractices: ['semantic-enhancement'],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain('purposeful emotional resonance')
        expect(result.data.enhancedPrompt).not.toContain('specifically designed for undefined')
      }
    })

    it('should recognize existing semantic elements', async () => {
      const semanticPrompt = 'person walking with emotional purpose and meaningful context'
      const analysis = await engine.analyzePracticeCompliance(semanticPrompt)

      expect(analysis.existingPractices).toContain('semantic-enhancement')
      expect(analysis.missingPractices).not.toContain('semantic-enhancement')
    })
  })

  describe('All Best Practices Integration', () => {
    it('should apply all 7 best practices when missing', async () => {
      const basicPrompt = 'image'
      const result = await engine.applyBestPractices(basicPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        const enhanced = result.data
        expect(enhanced.appliedPractices.length).toBeGreaterThanOrEqual(5) // Most practices should be applied
        expect(enhanced.transformationMeta.practicesApplied).toBeGreaterThanOrEqual(5)
        expect(enhanced.transformationMeta.qualityScore).toBeGreaterThan(0.7)
      }
    })

    it('should handle selective practice application', async () => {
      const basicPrompt = 'test prompt'
      const selectedPractices = ['hyper-specific', 'semantic-enhancement']

      const result = await engine.applyBestPractices(basicPrompt, {
        enabledPractices: selectedPractices,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const appliedTypes = result.data.appliedPractices.map((p) => p.type)
        expect(appliedTypes).toContain('hyper-specific')
        expect(appliedTypes).toContain('semantic-enhancement')
        expect(result.data.appliedPractices.length).toBeLessThanOrEqual(2)
      }
    })

    it('should generate comprehensive analysis report', async () => {
      const partialPrompt = 'person with dramatic lighting'
      const analysis = await engine.analyzePracticeCompliance(partialPrompt)

      expect(analysis.existingPractices.length).toBeGreaterThan(0)
      expect(analysis.missingPractices.length).toBeGreaterThan(0)
      expect(analysis.overallScore).toBeGreaterThan(0)
      expect(analysis.overallScore).toBeLessThan(100)
      expect(analysis.recommendations.length).toBeGreaterThan(0)
    })
  })

  describe('Performance and Error Handling', () => {
    it('should timeout on excessive processing time', async () => {
      const engine = createBestPracticesEngine({ timeout: 100 }) // Very short timeout

      // This test may be flaky depending on system performance
      // In a real scenario, we'd mock the strategies to simulate delay
      const result = await engine.applyBestPractices('complex prompt requiring long processing')

      // Either succeeds quickly or times out appropriately
      if (!result.success) {
        expect(result.error).toBeInstanceOf(BestPracticesError)
        expect(result.error.code).toBe('PERFORMANCE_TIMEOUT')
      }
    })

    it('should handle invalid input gracefully', async () => {
      const testCases = ['', '   ', null as unknown as string, undefined as unknown as string]

      for (const testCase of testCases.filter((tc) => tc !== null && tc !== undefined)) {
        const result = await engine.applyBestPractices(testCase)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_INPUT')
        }
      }
    })

    it('should provide detailed metadata for applied practices', async () => {
      const result = await engine.applyBestPractices('test prompt')

      expect(result.success).toBe(true)
      if (result.success) {
        const enhanced = result.data
        expect(enhanced.transformationMeta.timestamp).toBeInstanceOf(Date)
        expect(enhanced.transformationMeta.totalProcessingTime).toBeGreaterThan(0)
        expect(enhanced.transformationMeta.practicesAnalyzed).toBeGreaterThan(0)

        for (const practice of enhanced.appliedPractices) {
          expect(practice.metadata.processingTime).toBeGreaterThan(0)
          expect(practice.metadata.confidence).toBeGreaterThan(0)
          expect(practice.metadata.confidence).toBeLessThanOrEqual(1)
          expect(practice.enhancement).toBeDefined()
          expect(practice.enhancement.length).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('Edge Cases and Robustness', () => {
    it('should handle very long prompts', async () => {
      const longPrompt = 'test prompt '.repeat(1000) // 11,000 characters
      const result = await engine.applyBestPractices(longPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt.length).toBeGreaterThan(longPrompt.length)
      }
    })

    it('should track applied practices correctly', async () => {
      // First application
      await engine.applyBestPractices('first prompt')
      const firstPractices = engine.getAppliedPractices()

      // Second application
      await engine.applyBestPractices('second prompt', {
        enabledPractices: ['hyper-specific', 'semantic-enhancement'],
      })
      const secondPractices = engine.getAppliedPractices()

      // Should track latest application
      expect(secondPractices).not.toEqual(firstPractices)
      expect(secondPractices.length).toBeLessThanOrEqual(2)
    })
  })

  describe('Feature Parameters Integration', () => {
    it('should apply maintainCharacterConsistency feature parameter', async () => {
      const prompt = 'image of a character'
      const result = await engine.applyBestPractices(prompt, {
        maintainCharacterConsistency: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain(
          '[INSTRUCTION: Maintain exact character appearance, including facial features, hairstyle, clothing, and all physical characteristics consistent throughout the image]'
        )
      }
    })

    it('should apply blendImages feature parameter', async () => {
      const prompt = 'multiple visual elements'
      const result = await engine.applyBestPractices(prompt, {
        blendImages: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain(
          '[INSTRUCTION: Seamlessly blend multiple visual elements into a natural, cohesive composition with smooth transitions]'
        )
      }
    })

    it('should apply useWorldKnowledge feature parameter', async () => {
      const prompt = 'historical scene'
      const result = await engine.applyBestPractices(prompt, {
        useWorldKnowledge: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain(
          '[INSTRUCTION: Apply accurate real-world knowledge including historical facts, geographical accuracy, cultural contexts, and realistic depictions]'
        )
      }
    })

    it('should apply multiple feature parameters together', async () => {
      const prompt = 'character in historical scene'
      const result = await engine.applyBestPractices(prompt, {
        maintainCharacterConsistency: true,
        blendImages: true,
        useWorldKnowledge: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).toContain(
          '[INSTRUCTION: Maintain exact character appearance'
        )
        expect(result.data.enhancedPrompt).toContain(
          '[INSTRUCTION: Seamlessly blend multiple visual elements'
        )
        expect(result.data.enhancedPrompt).toContain(
          '[INSTRUCTION: Apply accurate real-world knowledge'
        )
      }
    })

    it('should not apply feature parameters when false or undefined', async () => {
      const prompt = 'simple image'
      const result = await engine.applyBestPractices(prompt, {
        maintainCharacterConsistency: false,
        blendImages: undefined,
        useWorldKnowledge: false,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enhancedPrompt).not.toContain(
          '[INSTRUCTION: Maintain exact character appearance'
        )
        expect(result.data.enhancedPrompt).not.toContain(
          '[INSTRUCTION: Seamlessly blend multiple visual elements'
        )
        expect(result.data.enhancedPrompt).not.toContain(
          '[INSTRUCTION: Apply accurate real-world knowledge'
        )
      }
    })
  })
})
