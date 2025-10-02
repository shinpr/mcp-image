import { describe, expect, it } from 'vitest'
import type { AspectRatio, GenerateImageParams } from '../../types/mcp'
import { validateBase64Image, validateGenerateImageParams, validatePrompt } from '../inputValidator'

describe('inputValidator', () => {
  describe('validatePrompt', () => {
    it('should return error for empty prompt', () => {
      // Arrange
      const emptyPrompt = ''

      // Act
      const result = validatePrompt(emptyPrompt)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Prompt must be between 1 and 4000 characters')
      }
    })

    it('should return error for prompt exceeding 4000 characters', () => {
      // Arrange
      const longPrompt = 'a'.repeat(4001)

      // Act
      const result = validatePrompt(longPrompt)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Prompt must be between 1 and 4000 characters')
      }
    })

    it('should return success for valid prompt', () => {
      // Arrange
      const validPrompt = 'Generate a beautiful landscape'

      // Act
      const result = validatePrompt(validPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(validPrompt)
      }
    })

    it('should return success for prompt at boundary (1 character)', () => {
      // Arrange
      const boundaryPrompt = 'a'

      // Act
      const result = validatePrompt(boundaryPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(boundaryPrompt)
      }
    })

    it('should return success for prompt at boundary (4000 characters)', () => {
      // Arrange
      const boundaryPrompt = 'a'.repeat(4000)

      // Act
      const result = validatePrompt(boundaryPrompt)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(boundaryPrompt)
      }
    })
  })

  describe('validateBase64Image', () => {
    it('should return success for BMP MIME type', () => {
      // Arrange
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' // 1x1 PNG
      const bmpMimeType = 'image/bmp'

      // Act
      const result = validateBase64Image(base64Data, bmpMimeType)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeInstanceOf(Buffer)
      }
    })

    it('should return error for invalid base64 format', () => {
      // Arrange
      const invalidBase64 = 'not-valid-base64-data!'

      // Act
      const result = validateBase64Image(invalidBase64)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Invalid base64 format')
      }
    })

    it('should return success for undefined image data', () => {
      // Arrange & Act
      const result = validateBase64Image(undefined)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeUndefined()
      }
    })

    it('should return error for image data exceeding 10MB', () => {
      // Arrange - Create a large base64 string (over 10MB when decoded)
      const largeBinaryData = Buffer.alloc(11 * 1024 * 1024, 'a') // 11MB
      const largeBase64 = largeBinaryData.toString('base64')

      // Act
      const result = validateBase64Image(largeBase64)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Image size exceeds')
        expect(result.error.message).toContain('10.0MB')
      }
    })
  })

  describe('validateGenerateImageParams', () => {
    it('should return error for invalid params', () => {
      // Arrange
      const invalidParams: GenerateImageParams = {
        prompt: '', // Invalid empty prompt
      }

      // Act
      const result = validateGenerateImageParams(invalidParams)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Prompt must be between 1 and 4000 characters')
      }
    })

    it('should return success for valid params', () => {
      // Arrange
      const validParams: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
      }

      // Act
      const result = validateGenerateImageParams(validParams)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validParams)
      }
    })

    it('should return error for invalid new feature parameters', () => {
      // Arrange
      const invalidParams: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
        blendImages: 'true' as any, // Invalid: should be boolean
      }

      // Act
      const result = validateGenerateImageParams(invalidParams)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('blendImages must be a boolean value')
      }
    })

    it('should return success for valid new feature parameters', () => {
      // Arrange
      const validParams: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
        blendImages: true,
        maintainCharacterConsistency: false,
        useWorldKnowledge: true,
      }

      // Act
      const result = validateGenerateImageParams(validParams)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validParams)
      }
    })
  })

  describe('validateGenerateImageParams with aspectRatio', () => {
    it('should accept all 10 supported aspect ratios', () => {
      // Arrange
      const supportedRatios: AspectRatio[] = [
        '1:1',
        '2:3',
        '3:2',
        '3:4',
        '4:3',
        '4:5',
        '5:4',
        '9:16',
        '16:9',
        '21:9',
      ]

      // Act & Assert
      for (const ratio of supportedRatios) {
        const result = validateGenerateImageParams({
          prompt: 'test',
          aspectRatio: ratio,
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid aspect ratio "4:1"', () => {
      // Arrange
      const invalidParams: GenerateImageParams = {
        prompt: 'test',
        aspectRatio: '4:1' as AspectRatio, // Type assertion for test
      }

      // Act
      const result = validateGenerateImageParams(invalidParams)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Invalid aspect ratio')
      }
    })

    it('should accept undefined aspectRatio (default)', () => {
      // Arrange
      const validParams: GenerateImageParams = {
        prompt: 'test',
      }

      // Act
      const result = validateGenerateImageParams(validParams)

      // Assert
      expect(result.success).toBe(true)
    })

    it('should include supported values list in validation error message', () => {
      // Arrange
      const invalidParams: GenerateImageParams = {
        prompt: 'test',
        aspectRatio: 'invalid' as AspectRatio,
      }

      // Act
      const result = validateGenerateImageParams(invalidParams)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('1:1')
        expect(result.error.message).toContain('21:9')
      }
    })
  })
})
