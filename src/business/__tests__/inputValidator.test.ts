import { describe, expect, it } from 'vitest'
import type { AspectRatio, GenerateImageParams } from '../../types/mcp'
import {
  MAX_IMAGE_SIZE,
  validateBase64Image,
  validateGenerateImageParams,
  validatePrompt,
} from '../inputValidator'

describe('inputValidator', () => {
  describe('validatePrompt', () => {
    it('should return error for empty prompt', () => {
      const emptyPrompt = ''

      const result = validatePrompt(emptyPrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Prompt must be between 1 and 4000 characters')
      }
    })

    it('should return error for prompt exceeding 4000 characters', () => {
      const longPrompt = 'a'.repeat(4001)

      const result = validatePrompt(longPrompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Prompt must be between 1 and 4000 characters')
      }
    })

    it('should return success for prompt at boundary (1 character)', () => {
      const boundaryPrompt = 'a'

      const result = validatePrompt(boundaryPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(boundaryPrompt)
      }
    })

    it('should return success for prompt at boundary (4000 characters)', () => {
      const boundaryPrompt = 'a'.repeat(4000)

      const result = validatePrompt(boundaryPrompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(boundaryPrompt)
      }
    })
  })

  describe('validateBase64Image', () => {
    it('should return success for BMP MIME type', () => {
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      const bmpMimeType = 'image/bmp'

      const result = validateBase64Image(base64Data, bmpMimeType)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeInstanceOf(Buffer)
      }
    })

    it('should return error for invalid base64 format', () => {
      const invalidBase64 = 'not-valid-base64-data!'

      const result = validateBase64Image(invalidBase64)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('Invalid base64 format')
      }
    })

    it('should return success for undefined image data', () => {
      const result = validateBase64Image(undefined)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeUndefined()
      }
    })

    it('should return success for image data at exactly 10MB', () => {
      const boundaryBinaryData = Buffer.alloc(MAX_IMAGE_SIZE, 'a')
      const boundaryBase64 = boundaryBinaryData.toString('base64')

      const result = validateBase64Image(boundaryBase64)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(MAX_IMAGE_SIZE)
      }
    })

    it('should return error for image data exceeding 10MB by one byte', () => {
      const largeBinaryData = Buffer.alloc(MAX_IMAGE_SIZE + 1, 'a')
      const largeBase64 = largeBinaryData.toString('base64')

      const result = validateBase64Image(largeBase64)

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
      const invalidParams: GenerateImageParams = {
        prompt: '',
      }

      const result = validateGenerateImageParams(invalidParams)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Prompt must be between 1 and 4000 characters')
      }
    })

    it('should return success for valid params', () => {
      const validParams: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
      }

      const result = validateGenerateImageParams(validParams)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validParams)
      }
    })

    it('should return error for invalid new feature parameters', () => {
      const invalidParams = {
        prompt: 'Generate a beautiful landscape',
        blendImages: 'true',
      }

      const result = validateGenerateImageParams(invalidParams)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('blendImages must be a boolean value')
      }
    })

    it('should return success for valid new feature parameters', () => {
      const validParams: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
        blendImages: true,
        maintainCharacterConsistency: false,
        useWorldKnowledge: true,
      }

      const result = validateGenerateImageParams(validParams)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validParams)
      }
    })

    it.each([
      ['undefined', undefined],
      ['true', true],
      ['false', false],
    ])('should accept useGoogleSearch when it is %s', (_name, useGoogleSearch) => {
      const params: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
        useGoogleSearch,
      }

      const result = validateGenerateImageParams(params)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(params)
      }
    })

    it.each([
      ['string', 'true'],
      ['number', 1],
      ['null', null],
      ['object', { enabled: true }],
    ])('should reject useGoogleSearch when it is a %s', (_name, useGoogleSearch) => {
      const params = {
        prompt: 'Generate a beautiful landscape',
        useGoogleSearch,
      }

      const result = validateGenerateImageParams(params)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INPUT_VALIDATION_ERROR')
        expect(result.error.message).toContain('useGoogleSearch must be a boolean value')
      }
    })
  })

  describe('validateGenerateImageParams with aspectRatio', () => {
    it('should accept all 14 supported aspect ratios', () => {
      const supportedRatios: AspectRatio[] = [
        '1:1',
        '1:4',
        '1:8',
        '2:3',
        '3:2',
        '3:4',
        '4:1',
        '4:3',
        '4:5',
        '5:4',
        '8:1',
        '9:16',
        '16:9',
        '21:9',
      ]

      for (const ratio of supportedRatios) {
        const result = validateGenerateImageParams({
          prompt: 'test',
          aspectRatio: ratio,
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid aspect ratio "7:3"', () => {
      const invalidParams = {
        prompt: 'test',
        aspectRatio: '7:3',
      }

      const result = validateGenerateImageParams(invalidParams)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Invalid aspect ratio')
        expect(result.error.message).toContain('1:1')
        expect(result.error.message).toContain('21:9')
      }
    })
  })

  describe('validateGenerateImageParams with quality', () => {
    it('should accept all valid quality values', () => {
      const validQualities = ['fast', 'balanced', 'quality'] as const

      for (const quality of validQualities) {
        const result = validateGenerateImageParams({
          prompt: 'test',
          quality,
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid quality value', () => {
      const result = validateGenerateImageParams({
        prompt: 'test',
        quality: 'ultra',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Invalid quality')
        expect(result.error.message).toContain('fast')
        expect(result.error.message).toContain('balanced')
        expect(result.error.message).toContain('quality')
      }
    })
  })

  describe('validateGenerateImageParams with provider', () => {
    it('should accept all valid provider values', () => {
      const validProviders = ['gemini', 'openai', 'seedream'] as const

      for (const provider of validProviders) {
        const result = validateGenerateImageParams({
          prompt: 'test',
          provider,
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid provider value', () => {
      const result = validateGenerateImageParams({
        prompt: 'test',
        provider: 'midjourney',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Invalid provider')
        expect(result.error.message).toContain('gemini')
        expect(result.error.message).toContain('openai')
        expect(result.error.message).toContain('seedream')
      }
    })
  })
})
