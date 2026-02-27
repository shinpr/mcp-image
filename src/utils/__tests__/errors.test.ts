/**
 * Tests for GeminiAPIError suggestion getter
 * Verifies model name references in suggestion text for multi-model support
 */

import { describe, expect, it } from 'vitest'
import { GeminiAPIError } from '../errors'

describe('GeminiAPIError', () => {
  describe('suggestion getter', () => {
    it('should reference both models when message contains model/access/permission keywords', () => {
      // Arrange
      const error = new GeminiAPIError('Model not found or access denied')

      // Act
      const suggestion = error.suggestion

      // Assert - should mention both models
      expect(suggestion).toContain('gemini-3.1-flash-image-preview')
      expect(suggestion).toContain('gemini-3-pro-image-preview')
    })

    it('should not contain only a single hardcoded model name for model-related errors', () => {
      // Arrange
      const error = new GeminiAPIError('Permission denied for model access')

      // Act
      const suggestion = error.suggestion

      // Assert - suggestion should reference both models, not just one
      expect(suggestion).toMatch(/gemini-3\.1-flash-image-preview/)
      expect(suggestion).toMatch(/gemini-3-pro-image-preview/)
    })

    it('should use custom suggestion when provided', () => {
      // Arrange
      const customSuggestion = 'Custom suggestion text'
      const error = new GeminiAPIError('Some error', customSuggestion)

      // Act & Assert
      expect(error.suggestion).toBe(customSuggestion)
    })
  })
})
