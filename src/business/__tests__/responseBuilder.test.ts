import { describe, expect, it } from 'vitest'
import type { GeneratedImageResult } from '../../api/imageClient'
import {
  FileOperationError,
  GeminiAPIError,
  InputValidationError,
  NetworkError,
} from '../../utils/errors'
import * as responseBuilder from '../responseBuilder'

describe('ResponseBuilder', () => {
  const makeGenerationResult = (mimeType: string): GeneratedImageResult => ({
    imageData: Buffer.from('fake-image-data'),
    metadata: {
      model: 'gemini-3.1-flash-image',
      prompt: 'test prompt',
      mimeType,
      timestamp: new Date('2025-08-28T12:00:00Z'),
      inputImageProvided: false,
    },
  })

  describe('buildSuccessResponse', () => {
    it('should create file URI structured content response when filePath is provided', () => {
      const generationResult = makeGenerationResult('image/png')
      const testFilePath = '/path/to/generated-image.png'

      const response = responseBuilder.buildSuccessResponse(generationResult, testFilePath)

      expect(response.isError).toBe(false)
      expect(response.content).toHaveLength(1)
      expect(response.content[0].type).toBe('text')

      const contentData = JSON.parse(response.content[0].text)
      expect(contentData.type).toBe('resource')
      expect(contentData.resource.uri).toBe('file:///path/to/generated-image.png')
      expect(contentData.resource.name).toBe('generated-image.png')
      expect(contentData.resource.mimeType).toBe('image/png')
      expect(contentData.metadata).toEqual({
        model: generationResult.metadata.model,
        processingTime: 0,
        contextMethod: 'structured_prompt',
        timestamp: generationResult.metadata.timestamp.toISOString(),
      })
    })

    it.each([
      ['image/jpeg', '/path/to/image.jpg', 'image/jpeg'],
      ['image/webp', '/path/to/image.webp', 'image/webp'],
      ['image/png', '/path/to/image.png', 'image/png'],
      ['', '/path/to/image.jpg', 'image/jpeg'],
      ['image/tiff', '/path/to/image.tiff', 'image/png'],
    ])('resolves metadata MIME %s and path %s to %s', (metadataMime, filePath, expectedMime) => {
      const response = responseBuilder.buildSuccessResponse(
        makeGenerationResult(metadataMime),
        filePath
      )
      const contentData = JSON.parse(response.content[0].text)
      expect(contentData.resource.mimeType).toBe(expectedMime)
    })
  })

  describe('buildErrorResponse', () => {
    it('should create error response for InputValidationError', () => {
      const error = new InputValidationError(
        'Invalid prompt provided',
        'Please provide a non-empty prompt'
      )

      const response = responseBuilder.buildErrorResponse(error)

      expect(response.isError).toBe(true)
      expect(response.content).toHaveLength(1)
      expect(response.content[0].type).toBe('text')

      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe('INPUT_VALIDATION_ERROR')
      expect(errorData.error.message).toBe('Invalid prompt provided')
      expect(errorData.error.suggestion).toBe('Please provide a non-empty prompt')
    })

    it('should create error response for FileOperationError', () => {
      const error = new FileOperationError('Failed to save image file')

      const response = responseBuilder.buildErrorResponse(error)

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe('FILE_OPERATION_ERROR')
      expect(errorData.error.message).toBe('Failed to save image file')
      expect(errorData.error.suggestion).toBe(
        'Check file system permissions and available disk space'
      )
    })

    it('should create error response for GeminiAPIError', () => {
      const error = new GeminiAPIError(
        'API quota exceeded',
        'Please try again later or upgrade your API quota'
      )

      const response = responseBuilder.buildErrorResponse(error)

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe('GEMINI_API_ERROR')
      expect(errorData.error.message).toBe('API quota exceeded')
      expect(errorData.error.suggestion).toBe('Please try again later or upgrade your API quota')
    })

    it('should expose allowlisted context fields in details for GeminiAPIError', () => {
      const error = new GeminiAPIError('Failed to generate image with Gemini', {
        provider: 'gemini',
        prompt: 'a photograph of a cat',
        upstreamMessage: 'content policy violation: NSFW request',
        suggestion: 'Rephrase the prompt',
      })

      const response = responseBuilder.buildErrorResponse(error)
      const errorData = JSON.parse(response.content[0].text)

      expect(errorData.error.details.provider).toBe('gemini')
      expect(errorData.error.details.upstreamMessage).toContain('content policy violation')
      expect(errorData.error.details.prompt).toBeUndefined()
    })

    it('should redact API keys from upstreamMessage in details', () => {
      const error = new GeminiAPIError('Failed to generate image with Gemini', {
        provider: 'gemini',
        upstreamMessage: 'Auth failed for OPENAI_API_KEY=sk-proj-ABCDEF123456789',
      })

      const response = responseBuilder.buildErrorResponse(error)
      const errorData = JSON.parse(response.content[0].text)

      expect(errorData.error.details.upstreamMessage).toContain('[REDACTED]')
      expect(errorData.error.details.upstreamMessage).not.toContain('sk-proj-ABCDEF123456789')
    })

    it('should create error response for NetworkError', () => {
      const error = new NetworkError(
        'Network connection failed',
        'Please check your internet connection and try again'
      )

      const response = responseBuilder.buildErrorResponse(error)

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe('NETWORK_ERROR')
      expect(errorData.error.message).toBe('Network connection failed')
      expect(errorData.error.suggestion).toBe('Please check your internet connection and try again')
    })

    it('should handle unknown errors gracefully', () => {
      const error = new Error('Unknown error')

      const response = responseBuilder.buildErrorResponse(error)

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe('UNKNOWN_ERROR')
      expect(errorData.error.message).toContain('Unknown error')
    })

    it('should redact secrets from unknown error messages', () => {
      const secret = 'sk-proj-ABCDEF123456789'
      const response = responseBuilder.buildErrorResponse(
        new Error(`Request failed with OPENAI_API_KEY=${secret}`)
      )

      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.message).toContain('[REDACTED]')
      expect(errorData.error.message).not.toContain(secret)
    })
  })
})
