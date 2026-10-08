import { describe, expect, it } from 'vitest'
import { MAX_INPUT_IMAGES } from '../../types/image.js'
import { validateInputImages } from '../inputImages.js'

describe('reference image preflight', () => {
  it.each(['gemini', 'openai', 'seedream'] as const)(
    'accepts the %s count limit and rejects one more',
    (provider) => {
      const images = Array.from({ length: MAX_INPUT_IMAGES[provider] }, () => ({
        data: 'aW1hZ2U=',
        mimeType: 'image/png',
      }))
      expect(validateInputImages(provider, images).success).toBe(true)
      expect(
        validateInputImages(provider, [...images, { data: 'aW1hZ2U=', mimeType: 'image/png' }])
          .success
      ).toBe(false)
    }
  )

  it.each(['gemini', 'openai', 'seedream'] as const)(
    'identifies an unsupported second reference for %s',
    (provider) => {
      const result = validateInputImages(provider, [
        { data: 'aW1hZ2U=', mimeType: 'image/png' },
        { data: 'aW1hZ2U=', mimeType: 'image/gif' },
      ])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Input image 2')
      }
    }
  )

  it('supports WebP only for Gemini and OpenAI', () => {
    const images = [{ data: 'aW1hZ2U=', mimeType: 'image/webp' }]
    expect(validateInputImages('gemini', images).success).toBe(true)
    expect(validateInputImages('openai', images).success).toBe(true)
    expect(validateInputImages('seedream', images).success).toBe(false)
  })
})
