/**
 * Test suite for ResponseBuilder
 * Tests structured content response generation for both success and error cases
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { GeneratedImageResult } from '../../api/geminiClient'
import {
  FileOperationError,
  GeminiAPIError,
  InputValidationError,
  NetworkError,
} from '../../utils/errors'
import { type ResponseBuilder, createResponseBuilder } from '../responseBuilder'

describe('ResponseBuilder', () => {
  let responseBuilder: ResponseBuilder

  beforeEach(() => {
    responseBuilder = createResponseBuilder()
  })

  describe('buildSuccessResponse', () => {
    it('should create file URI structured content response when filePath is provided', () => {
      const testImageData = Buffer.from('fake-image-data')
      const generationResult: GeneratedImageResult = {
        imageData: testImageData,
        metadata: {
          model: 'gemini-3.1-flash-image-preview',
          prompt: 'test prompt',
          mimeType: 'image/png',
          timestamp: new Date('2025-08-28T12:00:00Z'),
          inputImageProvided: false,
        },
      }
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

    it('should handle different file extensions for MIME type detection', () => {
      const testImageData = Buffer.from('fake-image-data')
      const generationResult: GeneratedImageResult = {
        imageData: testImageData,
        metadata: {
          model: 'gemini-3.1-flash-image-preview',
          prompt: 'test prompt',
          mimeType: 'image/png',
          timestamp: new Date('2025-08-28T12:00:00Z'),
          inputImageProvided: false,
        },
      }

      // Test JPEG file
      let response = responseBuilder.buildSuccessResponse(generationResult, '/path/to/image.jpg')
      let contentData = JSON.parse(response.content[0].text)
      expect(contentData.resource.mimeType).toBe('image/jpeg')
      expect(contentData.resource.uri).toBe('file:///path/to/image.jpg')

      // Test WEBP file
      response = responseBuilder.buildSuccessResponse(generationResult, '/path/to/image.webp')
      contentData = JSON.parse(response.content[0].text)
      expect(contentData.resource.mimeType).toBe('image/webp')
      expect(contentData.resource.uri).toBe('file:///path/to/image.webp')

      // Test unknown extension (defaults to PNG)
      response = responseBuilder.buildSuccessResponse(generationResult, '/path/to/image.unknown')
      contentData = JSON.parse(response.content[0].text)
      expect(contentData.resource.mimeType).toBe('image/png')
      expect(contentData.resource.uri).toBe('file:///path/to/image.unknown')
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
      const error = new Error('Unknown error') as any

      const response = responseBuilder.buildErrorResponse(error)

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe('UNKNOWN_ERROR')
      expect(errorData.error.message).toContain('Unknown error')
    })
  })
})
