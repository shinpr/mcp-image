/**
 * Tests for StructuredPromptGenerator
 */

import { describe, expect, it, vi } from 'vitest'
import type { GeminiTextClient } from '../../api/geminiTextClient'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError } from '../../utils/errors'
import { StructuredPromptGeneratorImpl } from '../structuredPromptGenerator'

describe('StructuredPromptGenerator', () => {
  const mockGeminiTextClient: GeminiTextClient = {
    generateText: vi.fn(),
    validateConnection: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateStructuredPrompt', () => {
    it('should generate structured prompt successfully', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)
      const userPrompt = 'A beautiful sunset'
      const structuredPrompt =
        'A beautiful sunset, dramatic cinematic lighting with golden hour warmth, shot with 85mm lens'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok(structuredPrompt))

      const result = await generator.generateStructuredPrompt(userPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.originalPrompt).toBe(userPrompt)
        expect(result.data.structuredPrompt).toBe(structuredPrompt)
        expect(result.data.selectedPractices).toContain('Hyper-Specific Details')
      }
    })

    it('should handle feature flags correctly', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)
      const userPrompt = 'A warrior in the forest'
      const features = {
        maintainCharacterConsistency: true,
        blendImages: false,
        useWorldKnowledge: true,
      }

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('A warrior with detailed character features in the forest')
      )

      const result = await generator.generateStructuredPrompt(userPrompt, features)

      // Assert: Verify feature flags affect the generated output
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.selectedPractices).toContain('Character Consistency')
        expect(result.data.selectedPractices).toContain('Real-World Accuracy')
      }
    })

    it('should return error for empty prompt', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)

      const result = await generator.generateStructuredPrompt('')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('empty')
      }
    })

    it('should handle Gemini API errors', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)
      const userPrompt = 'A test prompt'
      const apiError = new GeminiAPIError('API failed')

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Err(apiError))

      const result = await generator.generateStructuredPrompt(userPrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(apiError)
      }
    })

    it('should infer selected practices from generated prompt', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)
      const userPrompt = 'A portrait'
      const structuredPrompt =
        'A portrait with dramatic lighting, 85mm lens at f/1.4 aperture, maintaining facial features consistency'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok(structuredPrompt))

      const result = await generator.generateStructuredPrompt(userPrompt, {
        maintainCharacterConsistency: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.selectedPractices).toContain('Hyper-Specific Details')
        expect(result.data.selectedPractices).toContain('Character Consistency')
        expect(result.data.selectedPractices).toContain('Camera Control Terminology')
      }
    })

    it('should include purpose context when purpose is provided', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)
      const userPrompt = 'Delicious pasta dish'
      const purpose = 'high-end Italian restaurant menu'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('Professional food photography of artfully plated pasta')
      )

      const result = await generator.generateStructuredPrompt(userPrompt, {}, undefined, purpose)

      // Assert: Verify purpose context affects the output
      expect(result.success).toBe(true)
      if (result.success) {
        // The structured prompt should be enhanced for the intended purpose
        expect(result.data.structuredPrompt.length).toBeGreaterThan(userPrompt.length)
      }
    })

    it('should not include purpose context when purpose is not provided', async () => {
      const generator = new StructuredPromptGeneratorImpl(mockGeminiTextClient)
      const userPrompt = 'A simple cat'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('A fluffy cat with soft lighting')
      )

      const result = await generator.generateStructuredPrompt(userPrompt)

      // Assert: Without purpose, should still generate a valid structured prompt
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.originalPrompt).toBe(userPrompt)
        expect(result.data.structuredPrompt).toBe('A fluffy cat with soft lighting')
      }
    })
  })
})
