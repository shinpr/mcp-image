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

      expect(result.success).toBe(true)
      const call = vi.mocked(mockGeminiTextClient.generateText).mock.calls[0]
      expect(call[0]).toContain('Character consistency is CRITICAL')
      expect(call[0]).toContain('Apply accurate real-world knowledge')
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
  })
})
