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
    it('returns the enhanced description preceded by the image-model discipline', async () => {
      const generator = createGenerator()
      const userPrompt = 'A beautiful sunset'
      const structuredPrompt =
        'A beautiful sunset, dramatic cinematic lighting with golden hour warmth, shot with 85mm lens'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok(structuredPrompt))

      const result = await generator.generateStructuredPrompt(userPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(
          `Draw the image this prompt describes. Its purpose sets the overall direction; everything it specifies stays as specified; anything you add only completes the picture and never works against the above. When it quotes text, the quoted text is all the text in the image.\n\n${structuredPrompt}`
        )
      }
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

    it('includes guidance only for enabled feature flags', async () => {
      const generator = createGenerator()
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      const result = await generator.generateStructuredPrompt('A warrior in the forest', {
        features: {
          maintainCharacterConsistency: true,
          blendImages: false,
          useWorldKnowledge: true,
        },
      })

      expect(result.success).toBe(true)
      const [request] = vi.mocked(mockGeminiTextClient.generateText).mock.calls[0] ?? []
      expect(request).toContain('Character consistency:')
      expect(request).toContain('World knowledge:')
      expect(request).not.toContain('Blending:')
    })

    it('sends the user request verbatim inside the enhancement request', async () => {
      const generator = createGenerator()
      const userPrompt = "a poster for next Friday's study session, theme: intro to generative AI"
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      await generator.generateStructuredPrompt(userPrompt)

      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining(userPrompt),
        expect.any(Object)
      )
    })

    it('sends input images with input-image guidance to the enhancer', async () => {
      const generator = createGenerator()
      const image = { data: 'aGVsbG8=', mimeType: 'image/png' }
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      await generator.generateStructuredPrompt('Draw her in this style', {
        inputImages: [image, image],
      })

      const [, config] = vi.mocked(mockGeminiTextClient.generateText).mock.calls[0] ?? []
      expect(config).toEqual(
        expect.objectContaining({
          systemInstruction: expect.stringContaining('Image 1'),
          inputImages: [image, image],
        })
      )
    })

    it('omits input-image guidance when no images are given', async () => {
      const generator = createGenerator()
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      await generator.generateStructuredPrompt('A simple cat')

      const [, config] = vi.mocked(mockGeminiTextClient.generateText).mock.calls[0] ?? []
      expect(config?.systemInstruction).not.toContain('Image 1')
      expect(config).not.toHaveProperty('inputImages')
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

    it('offers the material for every kind of image when no category is given', async () => {
      const generator = createGenerator()
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      await generator.generateStructuredPrompt('A sales dashboard')

      const [, config] = vi.mocked(mockGeminiTextClient.generateText).mock.calls[0] ?? []
      expect(config?.systemInstruction).toContain('For a photograph:')
      expect(config?.systemInstruction).toContain('For an app or web interface screen:')
      expect(config?.systemInstruction).toContain('For a pattern or texture:')
    })

    it('limits the material to the given category', async () => {
      const generator = createGenerator()
      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(Ok('Enhanced prompt'))

      await generator.generateStructuredPrompt('A sales dashboard', { category: 'ui-screen' })

      const [, config] = vi.mocked(mockGeminiTextClient.generateText).mock.calls[0] ?? []
      expect(config?.systemInstruction).toContain('The image is an app or web interface screen')
      expect(config?.systemInstruction).not.toContain('For a photograph:')
      expect(config?.systemInstruction).not.toContain('Photography:')
    })

    it('should include purpose context when purpose is provided', async () => {
      const generator = createGenerator()
      const userPrompt = 'Delicious pasta dish'
      const purpose = 'high-end Italian restaurant menu'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('Professional food photography of artfully plated pasta')
      )

      await generator.generateStructuredPrompt(userPrompt, { purpose })

      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining(`Intended use: ${purpose}`),
        expect.any(Object)
      )
    })

    it('should not include purpose context when purpose is not provided', async () => {
      const generator = createGenerator()
      const userPrompt = 'A simple cat'

      vi.mocked(mockGeminiTextClient.generateText).mockResolvedValue(
        Ok('A fluffy cat with soft lighting')
      )

      await generator.generateStructuredPrompt(userPrompt)

      expect(mockGeminiTextClient.generateText).toHaveBeenCalledWith(
        expect.not.stringContaining('Intended use:'),
        expect.any(Object)
      )
    })
  })
})
