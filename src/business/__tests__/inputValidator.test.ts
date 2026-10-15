import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { GenerateImageParams } from '../../types/mcp'
import { validateGenerateImageParams, validatePrompt } from '../inputValidator'

describe('inputValidator', () => {
  let fixtureDir: string
  let existingImagePath: string
  let unsupportedFilePath: string

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'input-validator-'))
    existingImagePath = join(fixtureDir, 'reference.png')
    unsupportedFilePath = join(fixtureDir, 'notes.txt')
    writeFileSync(existingImagePath, 'png')
    writeFileSync(unsupportedFilePath, 'text')
  })

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  function expectRejection(input: unknown, message: string): void {
    const result = validateGenerateImageParams(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toBe(message)
    }
  }

  describe('validatePrompt', () => {
    it('should return error for empty prompt', () => {
      const result = validatePrompt('')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe(
          'Prompt must be between 1 and 4000 characters. Current length: 0'
        )
      }
    })

    it('should return error for prompt exceeding 4000 characters', () => {
      const result = validatePrompt('a'.repeat(4001))

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe(
          'Prompt must be between 1 and 4000 characters. Current length: 4001'
        )
        expect(result.error.suggestion).toBe('Please shorten your prompt by 1 characters.')
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

    it.each([
      ['whitespace only', '   '],
      ['a number', 123],
      ['missing', undefined],
    ])('should reject a prompt that is %s', (_condition, prompt) => {
      const result = validatePrompt(prompt)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Prompt must be a non-empty string')
      }
    })
  })

  describe('validateGenerateImageParams', () => {
    it('returns every supplied optional parameter unchanged', () => {
      const params: GenerateImageParams = {
        prompt: 'Generate a beautiful landscape',
        fileName: 'landscape.png',
        inputImagePaths: [existingImagePath],
        purpose: 'blog header',
        aspectRatio: '16:9',
        imageSize: '2K',
        quality: 'quality',
        provider: 'seedream',
        blendImages: true,
        maintainCharacterConsistency: false,
        useWorldKnowledge: true,
        useGoogleSearch: false,
      }

      const result = validateGenerateImageParams(params)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(params)
      }
    })

    it.each([
      ['null', null],
      ['an array', [{ prompt: 'test' }]],
      ['a string', 'test'],
    ])('should reject tool arguments that are %s', (_condition, input) => {
      expectRejection(input, 'Tool arguments must be an object')
    })

    it.each([
      ['inputImagePath', '/old/image.png'],
      ['inputImagePath', null],
      ['inputImage', 'base64-data'],
      ['inputImageMimeType', 'image/png'],
    ])('should reject the retired %s field (value %j)', (field, value) => {
      expectRejection(
        { prompt: 'test', [field]: value },
        `${field} is not supported; use inputImagePaths`
      )
    })

    it.each([
      ['fileName', 42],
      ['purpose', { x: 1 }],
      ['imageSize', null],
      ['imageSize', { toString: null }],
      ['aspectRatio', 169],
    ])('should reject a non-string %s (value %j)', (field, value) => {
      expectRejection({ prompt: 'test', [field]: value }, `${field} must be a string`)
    })

    it.each([
      ['a string', 'blendImages', 'true'],
      ['null', 'useGoogleSearch', null],
    ])('should reject a boolean flag given as %s', (_condition, field, value) => {
      expectRejection({ prompt: 'test', [field]: value }, `${field} must be a boolean value`)
    })
  })

  describe('validateGenerateImageParams with inputImagePaths', () => {
    it.each([
      ['null', null],
      ['a string', '/image.png'],
      ['an empty array', []],
      ['17 paths', Array.from({ length: 17 }, () => '/image.png')],
    ])('should reject inputImagePaths given as %s', (_condition, inputImagePaths) => {
      expectRejection(
        { prompt: 'test', inputImagePaths },
        'inputImagePaths must be an array of 1 to 16 image paths'
      )
    })

    it.each([
      ['an empty string', ''],
      ['whitespace only', '   '],
      ['a number', 42],
    ])('should reject a path element that is %s', (_condition, element) => {
      expectRejection(
        { prompt: 'test', inputImagePaths: [element] },
        'Input image 1: path must be a non-empty string'
      )
    })

    it('should reject a relative path', () => {
      expectRejection(
        { prompt: 'test', inputImagePaths: ['relative.png'] },
        'Input image 1: Input image path must be absolute'
      )
    })

    it('should name the position of a missing file after valid ones', () => {
      const missingPath = join(fixtureDir, 'missing.png')

      expectRejection(
        { prompt: 'test', inputImagePaths: [existingImagePath, missingPath] },
        `Input image 2: Input image file not found: ${missingPath}`
      )
    })

    it('should reject an existing file with an unsupported extension', () => {
      expectRejection(
        { prompt: 'test', inputImagePaths: [unsupportedFilePath] },
        'Input image 1: Unsupported image format: .txt. Supported formats: .jpg, .jpeg, .png, .webp, .gif, .bmp'
      )
    })

    it('should accept 16 existing paths', () => {
      const inputImagePaths = Array.from({ length: 16 }, () => existingImagePath)

      const result = validateGenerateImageParams({ prompt: 'test', inputImagePaths })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.inputImagePaths).toEqual(inputImagePaths)
      }
    })
  })

  describe('validateGenerateImageParams with aspectRatio', () => {
    it.each([
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
    ])('should accept aspect ratio %s', (aspectRatio) => {
      const result = validateGenerateImageParams({ prompt: 'test', aspectRatio })

      expect(result.success).toBe(true)
    })

    it.each(['7:3', ''])('should reject invalid aspect ratio "%s"', (aspectRatio) => {
      const result = validateGenerateImageParams({ prompt: 'test', aspectRatio })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe(
          `Invalid aspect ratio: ${aspectRatio}. Supported values: 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9`
        )
      }
    })
  })

  describe('validateGenerateImageParams with imageSize', () => {
    it.each(['1K', '2K', '4K'])('should accept image size %s', (imageSize) => {
      const result = validateGenerateImageParams({ prompt: 'test', imageSize })

      expect(result.success).toBe(true)
    })

    it('should reject an unsupported image size', () => {
      expectRejection({ prompt: 'test', imageSize: '8K' }, 'Invalid image size: 8K')
    })
  })

  describe('validateGenerateImageParams with quality', () => {
    it.each(['fast', 'balanced', 'quality'])('should accept quality %s', (quality) => {
      const result = validateGenerateImageParams({ prompt: 'test', quality })

      expect(result.success).toBe(true)
    })

    it('should reject invalid quality value', () => {
      expectRejection(
        { prompt: 'test', quality: 'ultra' },
        'Invalid quality value: "ultra". Supported values: fast, balanced, quality'
      )
    })
  })

  describe('validateGenerateImageParams with provider', () => {
    it.each(['gemini', 'openai', 'seedream'])('should accept provider %s', (provider) => {
      const result = validateGenerateImageParams({ prompt: 'test', provider })

      expect(result.success).toBe(true)
    })

    it('should reject invalid provider value', () => {
      expectRejection(
        { prompt: 'test', provider: 'midjourney' },
        'Invalid provider value: "midjourney". Supported values: gemini, openai, seedream'
      )
    })
  })
})
