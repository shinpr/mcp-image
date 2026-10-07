import { describe, expect, it } from 'vitest'
import { GeminiAPIError } from '../errors'

describe('GeminiAPIError', () => {
  describe('suggestion getter', () => {
    it('should reference both models when message contains model/access/permission keywords', () => {
      const error = new GeminiAPIError('Model not found or access denied')

      const suggestion = error.suggestion

      expect(suggestion).toContain('gemini-nano-banana-2.1')
      expect(suggestion).toContain('gemini-3-pro-image')
    })

    it('should use custom suggestion when provided', () => {
      const customSuggestion = 'Custom suggestion text'
      const error = new GeminiAPIError('Some error', customSuggestion)

      expect(error.suggestion).toBe(customSuggestion)
    })
  })
})
