/**
 * Test suite for ResponseBuilder
 * Tests structured content response generation for both success and error cases
 */

import { describe, expect, it } from 'vitest'
import {
  FileOperationError,
  GeminiAPIError,
  InputValidationError,
  NetworkError,
} from '../../utils/errors'
import type { GenerationResult } from '../imageGenerator'
import { ResponseBuilder } from '../responseBuilder'

describe('ResponseBuilder', () => {
  let responseBuilder: ResponseBuilder

  beforeEach(() => {
    responseBuilder = new ResponseBuilder()
  })

  describe('buildSuccessResponse', () => {
    it('should create structured content response with base64 data URI', () => {
      const testImageData = Buffer.from('fake-image-data')
      const generationResult: GenerationResult = {
        imageData: testImageData,
        metadata: {
          model: 'gemini-2.5-flash-image-preview',
          processingTime: 1250,
          contextMethod: 'prompt_only',
          timestamp: '2025-08-28T12:00:00Z',
        },
      }

      const response = responseBuilder.buildSuccessResponse(generationResult)

      expect(response.isError).toBe(false)
      expect(response.content).toHaveLength(1)
      expect(response.content[0].type).toBe('text')

      const contentData = JSON.parse(response.content[0].text)
      expect(contentData.type).toBe('resource')

      // Verify data URI format
      const expectedBase64 = testImageData.toString('base64')
      expect(contentData.resource.uri).toBe(`data:image/png;base64,${expectedBase64}`)

      // Verify name includes timestamp
      expect(contentData.resource.name).toMatch(/^image-\d+\.png$/)
      expect(contentData.resource.mimeType).toBe('image/png')
      expect(contentData.metadata).toEqual(generationResult.metadata)
    })

    it('should encode large image data correctly', () => {
      // Test with larger image data to ensure proper base64 encoding
      const largeImageData = Buffer.from(new Array(1000).fill('test-data').join(''))
      const generationResult: GenerationResult = {
        imageData: largeImageData,
        metadata: {
          model: 'gemini-2.5-flash-image-preview',
          processingTime: 2000,
          contextMethod: 'url_context',
          timestamp: '2025-08-28T12:00:00Z',
        },
      }

      const response = responseBuilder.buildSuccessResponse(generationResult)
      const contentData = JSON.parse(response.content[0].text)

      // Verify base64 encoding is correct
      const expectedBase64 = largeImageData.toString('base64')
      expect(contentData.resource.uri).toBe(`data:image/png;base64,${expectedBase64}`)
      expect(contentData.resource.mimeType).toBe('image/png')
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
