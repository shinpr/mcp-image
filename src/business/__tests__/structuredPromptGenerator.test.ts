import { describe, expect, it, vi } from 'vitest'
import type { GeminiTextClient } from '../../api/geminiTextClient'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError } from '../../utils/errors'
import { StructuredPromptGeneratorImpl } from '../structuredPromptGenerator'

describe('StructuredPromptGenerator', () => {
  const mockGeminiTextClient: GeminiTextClient = {
    generateText: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createGenerator(maxTokens = 1000): StructuredPromptGeneratorImpl {
    return new StructuredPromptGeneratorImpl(mockGeminiTextClient, maxTokens)
  }

  describe('generateStructuredPrompt', () => {
    it('should generate structured prompt successfully', async () => {
      const generator = createGenerator()
      const userPrompt = 'A beautiful sunset'
      const structuredPrompt =
        'A beautiful sunset, dramatic cinematic lighting with golden hour warmth, shot with 85mm lens'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok(structuredPrompt))

      const result = await generator.generateStructuredPrompt(userPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(structuredPrompt)
      }
      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 1000 })
      )
    })

    it('uses the configured prompt-generation token limit', async () => {
      const generator = createGenerator(384)
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      await generator.generateStructuredPrompt('A rainy street')

      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 384 })
      )
    })

    it('should handle feature flags correctly', async () => {
      const generator = createGenerator()
      const userPrompt = 'A warrior in the forest'
      const features = {
        maintainCharacterConsistency: true,
        blendImages: false,
        useWorldKnowledge: true,
      }

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('A warrior with detailed character features in the forest')
      )

      const result = await generator.generateStructuredPrompt(userPrompt, { features })

      expect(result.success).toBe(true)
      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining('Character consistency is CRITICAL'),
        expect.any(Object)
      )
      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining('Apply accurate real-world knowledge'),
        expect.any(Object)
      )
      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.not.stringContaining('MUST describe spatial and visual integration'),
        expect.any(Object)
      )
    })

    it('should return error for empty prompt', async () => {
      const generator = createGenerator()

      const result = await generator.generateStructuredPrompt('')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(GeminiAPIError)
        expect(result.error.message).toContain('empty')
      }
    })

    it('should handle Gemini API errors', async () => {
      const generator = createGenerator()
      const userPrompt = 'A test prompt'
      const apiError = new GeminiAPIError('API failed')

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Err(apiError))

      const result = await generator.generateStructuredPrompt(userPrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(apiError)
      }
    })

    it('should include purpose context when purpose is provided', async () => {
      const generator = createGenerator()
      const userPrompt = 'Delicious pasta dish'
      const purpose = 'high-end Italian restaurant menu'

      const structuredPrompt = 'Professional food photography of artfully plated pasta'
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok(structuredPrompt))

      const result = await generator.generateStructuredPrompt(userPrompt, { purpose })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(structuredPrompt)
      }
      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining(`INTENDED USE: ${purpose}`),
        expect.any(Object)
      )
    })

    it('should not include purpose context when purpose is not provided', async () => {
      const generator = createGenerator()
      const userPrompt = 'A simple cat'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('A fluffy cat with soft lighting')
      )

      const result = await generator.generateStructuredPrompt(userPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('A fluffy cat with soft lighting')
      }
      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.not.stringContaining('INTENDED USE:'),
        expect.any(Object)
      )
    })
  })
})
